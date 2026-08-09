/**
 * Outbox worker — drains pending upload/delete/bundle jobs from SQLite
 * and pushes them to the server using the existing api/upload.ts flow.
 *
 * Call drainOutbox() whenever a sync is triggered.
 * It is safe to call concurrently — a guard flag prevents double-runs.
 */

import { uploadFile, uploadBlob } from '../api/upload';
import { logPerf } from '../utils/perfLog';
import { truncateNameForLog } from '../utils/helpers';
import { deleteFileById } from '../api/files';
import { createBundle } from '../api/bundles';
import {
  getPendingJobs,
  removeJob,
  incrementRetry,
  type OutboxPayload,
} from '../db/outbox';
import type { OutboxRow } from '../db/schema';
import { markFileSynced, markBundleSynced, resolveChildIdsForBundle } from '../db/fileRepo';
import { migrateListThumbCache } from '../utils/listThumbCache';

const MAX_RETRIES = 5;

/** Uploads before deletes before create_bundle so child server ids exist when resolving. */
function sortOutboxJobs(jobs: OutboxRow[]): OutboxRow[] {
  const opRank = (op: string) => {
    if (op === 'upload_file' || op === 'upload_blob') return 0;
    if (op === 'delete') return 1;
    if (op === 'create_bundle') return 2;
    return 9;
  };
  return [...jobs].sort((a, b) => {
    const d = opRank(a.op) - opRank(b.op);
    return d !== 0 ? d : a.created_at - b.created_at;
  });
}

/** Exponential backoff delay in ms for a given retry count. */
function backoffMs(retries: number): number {
  return Math.min(1000 * 2 ** retries, 30_000); // max 30s
}

let _draining = false;

/**
 * Process all pending outbox jobs.
 * Each job is attempted once per call; if it fails the retry counter
 * increments and it will be re-tried on the next call.
 * Jobs that exceed MAX_RETRIES are removed from the queue (except create_bundle,
 * which may legitimately wait a long time for child uploads).
 */
export async function drainOutbox(): Promise<void> {
  if (_draining) return;
  _draining = true;
  const drainStarted = Date.now();
  try {
    const jobs = sortOutboxJobs(await getPendingJobs());
    for (const job of jobs) {
      // Parse payload first — needed to exempt create_bundle from the retry cap.
      let payload: OutboxPayload;
      try {
        payload = JSON.parse(job.payload) as OutboxPayload;
      } catch {
        console.warn(`[outbox] Job ${job.id} has invalid payload — removing`);
        await removeJob(job.id);
        continue;
      }

      // create_bundle must never be permanently abandoned — children may still be
      // uploading or waiting for a connection. All other ops respect MAX_RETRIES.
      if (job.retries >= MAX_RETRIES && payload.op !== 'create_bundle') {
        // Remove dead jobs so every sync does not re-log the same warning forever.
        await removeJob(job.id);
        continue;
      }

      // Apply backoff: skip jobs that were retried too recently.
      const ageMs = Date.now() - job.created_at;
      const minAge = job.retries > 0 ? backoffMs(job.retries - 1) : 0;
      if (ageMs < minAge) continue;

      const jobLabel =
        payload.op === 'upload_file' || payload.op === 'upload_blob'
          ? truncateNameForLog((payload as any).name, 6)
          : payload.op === 'delete'
            ? `del id…${String((payload as any).serverId ?? '').slice(-6)}`
            : payload.op === 'create_bundle'
              ? 'create_linq'
              : String(job.op);
      const jobStarted = Date.now();
      try {
        await processJob(payload);
        await removeJob(job.id);
        if (__DEV__) {
          logPerf('outbox', `${payload.op} ok · ${jobLabel}`, jobStarted);
        }
      } catch (err) {
        const msg = String((err as any)?.message ?? err);
        if (
          payload.op === 'create_bundle' &&
          msg.includes('child not synced yet')
        ) {
          console.warn(
            `[outbox] ${payload.op} · waiting on child uploads · job#${job.id} · ${jobLabel}`
          );
          continue;
        }
        console.warn(
          `[outbox] ${payload.op} failed · ${jobLabel} · job#${job.id} · ${Date.now() - jobStarted}ms:`,
          (err as any)?.message ?? err
        );
        await incrementRetry(job.id);
      }
    }
    if (__DEV__ && jobs.length > 0) {
      logPerf('outbox', `drain ${jobs.length} job(s)`, drainStarted);
    }
  } finally {
    _draining = false;
  }
}

async function processJob(payload: OutboxPayload): Promise<void> {
  switch (payload.op) {
    case 'upload_file': {
      const { localId, fileUri, name } = payload;
      const { serverFileId } = await uploadFile(fileUri, name);
      // The `url` returned by uploadFile is the presigned PUT URL (write-only).
      // Storing it as the display URL would cause PDFs/images to show garbage.
      // Pass null so the local file:// path stays as the display URL until
      // pullAndMerge fetches the correct presigned GET URL from the server.
      await markFileSynced(localId, serverFileId, undefined);
      if (serverFileId && serverFileId !== localId) {
        await migrateListThumbCache(localId, serverFileId).catch(() => undefined);
      }
      break;
    }

    case 'upload_blob': {
      const { localId, content, name } = payload;
      const blob = new Blob([content], { type: 'text/markdown' });
      const { serverFileId } = await uploadBlob(blob, name);
      // Same as above: don't store the PUT presigned URL.
      await markFileSynced(localId, serverFileId, undefined);
      break;
    }

    case 'delete': {
      const { serverId } = payload;
      // Ignore opt- ids that were never synced — nothing to delete on server
      if (String(serverId).startsWith('opt-')) return;
      try {
        await deleteFileById(serverId);
      } catch (e) {
        const msg = String((e as any)?.message ?? e);
        // Already deleted elsewhere (e.g. web) — treat as success so job completes.
        if (/\b404\b/i.test(msg) || /not\s*found/i.test(msg)) return;
        throw e;
      }
      break;
    }

    case 'create_bundle': {
      const { localBundleId, childLocalIds } = payload;
      // Resolve opt-… ids to server ids via SQLite client_id after child uploads finish
      const realIds = await resolveChildIdsForBundle(childLocalIds);
      if (realIds.length < 2) {
        throw new Error('create_bundle: not enough child ids');
      }
      const result = await createBundle(realIds);
      if (!result?.okay) throw new Error(result?.message ?? 'createBundle failed');
      const serverBundleId = result?.data?.bundle?.id;
      if (serverBundleId) {
        await markBundleSynced(localBundleId, serverBundleId, realIds);
      } else {
        await markBundleSynced(localBundleId, undefined, realIds);
      }
      break;
    }

    default:
      console.warn(`[outbox] Unknown op: ${(payload as any).op}`);
  }
}

/**
 * Outbox queue — persisted in SQLite so pending uploads survive app kills.
 *
 * Ops:
 *   upload_file   — pick a binary file by URI and upload to S3
 *   upload_blob   — upload text/note content as a Blob
 *   delete        — delete a file by server id
 *   create_bundle — call /files/connect with resolved child ids
 */

import { getDb } from './index';
import type { OutboxRow } from './schema';

export type OutboxOp = 'upload_file' | 'upload_blob' | 'delete' | 'create_bundle' | 'add_to_bundle' | 'remove_from_bundle' | 'rename_bundle' | 'rename_file';

export type OutboxPayload =
  | { op: 'upload_file'; localId: string; fileUri: string; name: string }
  | { op: 'upload_blob'; localId: string; content: string; name: string }
  | { op: 'delete'; serverId: string }
  | { op: 'create_bundle'; localBundleId: string; childLocalIds: string[] }
  | { op: 'add_to_bundle'; bundleId: string; childLocalIds: string[] }
  | { op: 'remove_from_bundle'; bundleId: string; childLocalIds: string[] }
  | { op: 'rename_bundle'; bundleId: string; name: string }
  | { op: 'rename_file'; fileId: string; name: string };

/** Add a job to the outbox. Returns the new row id. */
export async function enqueue(payload: OutboxPayload): Promise<number> {
  const db = getDb();
  const result = await db.runAsync(
    'INSERT INTO outbox (op, payload, retries, created_at) VALUES (?, ?, 0, ?)',
    [payload.op, JSON.stringify(payload), Date.now()]
  );
  return result.lastInsertRowId;
}

/** Fetch all pending jobs ordered by creation time (oldest first). */
export async function getPendingJobs(): Promise<OutboxRow[]> {
  const db = getDb();
  return db.getAllAsync<OutboxRow>(
    'SELECT * FROM outbox ORDER BY created_at ASC'
  );
}

/** Remove a job after it completes successfully. */
export async function removeJob(id: number): Promise<void> {
  const db = getDb();
  await db.runAsync('DELETE FROM outbox WHERE id = ?', [id]);
}

/** Increment retry counter. Jobs with retries >= MAX_RETRIES are skipped by the worker. */
export async function incrementRetry(id: number): Promise<void> {
  const db = getDb();
  await db.runAsync('UPDATE outbox SET retries = retries + 1 WHERE id = ?', [id]);
}

/** How many pending jobs are in the queue. */
export async function pendingCount(): Promise<number> {
  const db = getDb();
  const row = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM outbox');
  return row?.c ?? 0;
}

/** Clear the entire outbox (call on logout). */
export async function clearOutbox(): Promise<void> {
  const db = getDb();
  await db.runAsync('DELETE FROM outbox');
}

/**
 * Cancel all pending outbox jobs that reference a given local id.
 * Used when the user deletes an opt- item before it was ever synced —
 * prevents orphaned upload / create_bundle jobs from running after deletion.
 */
export async function cancelJobsForId(localId: string): Promise<void> {
  const db = getDb();
  const jobs = await getPendingJobs();
  for (const job of jobs) {
    let p: OutboxPayload;
    try {
      p = JSON.parse(job.payload) as OutboxPayload;
    } catch {
      continue;
    }
    let shouldCancel = false;
    switch (p.op) {
      case 'upload_file':
      case 'upload_blob':
        shouldCancel = p.localId === localId;
        break;
      case 'create_bundle':
        shouldCancel =
          p.localBundleId === localId || (p.childLocalIds ?? []).includes(localId);
        break;
      case 'add_to_bundle':
        shouldCancel =
          p.bundleId === localId || (p.childLocalIds ?? []).includes(localId);
        break;
      case 'remove_from_bundle':
        shouldCancel =
          p.bundleId === localId || (p.childLocalIds ?? []).includes(localId);
        break;
      case 'rename_bundle':
        shouldCancel = p.bundleId === localId;
        break;
      case 'rename_file':
        shouldCancel = p.fileId === localId;
        break;
      case 'delete':
        shouldCancel = p.serverId === localId;
        break;
    }
    if (shouldCancel) {
      await db.runAsync('DELETE FROM outbox WHERE id = ?', [job.id]);
    }
  }
}

/** File and bundle ids referenced by pending jobs — used to avoid purging rows still in flight. */
export async function getOutboxReferencedIds(): Promise<{
  fileIds: Set<string>;
  bundleIds: Set<string>;
}> {
  // Keep in sync with sync/outboxWorker.ts MAX_RETRIES.
  // Jobs at/above this limit are intentionally not processed by the worker.
  const MAX_RETRIES = 5;
  const fileIds = new Set<string>();
  const bundleIds = new Set<string>();
  const jobs = await getPendingJobs();
  for (const job of jobs) {
    // Do not block pullSync purge decisions with permanently skipped jobs.
    if (job.retries >= MAX_RETRIES) continue;
    let p: OutboxPayload;
    try {
      p = JSON.parse(job.payload) as OutboxPayload;
    } catch {
      continue;
    }
    switch (p.op) {
      case 'upload_file':
      case 'upload_blob':
        fileIds.add(String(p.localId));
        break;
      case 'delete':
        fileIds.add(String(p.serverId));
        break;
      case 'create_bundle':
        bundleIds.add(String(p.localBundleId));
        for (const c of p.childLocalIds ?? []) fileIds.add(String(c));
        break;
      case 'add_to_bundle':
        bundleIds.add(String(p.bundleId));
        for (const c of p.childLocalIds ?? []) fileIds.add(String(c));
        break;
      case 'remove_from_bundle':
        bundleIds.add(String(p.bundleId));
        for (const c of p.childLocalIds ?? []) fileIds.add(String(c));
        break;
      case 'rename_bundle':
        bundleIds.add(String(p.bundleId));
        break;
      case 'rename_file':
        fileIds.add(String(p.fileId));
        break;
      default:
        break;
    }
  }
  return { fileIds, bundleIds };
}

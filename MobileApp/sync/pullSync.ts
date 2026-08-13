/**
 * Pull sync — fetch the server file list and merge it into SQLite.
 *
 * This replaces the AsyncStorage saveCachedFiles / loadCachedFiles pattern.
 * It does NOT do bundle enrichment (fetching child content) — that still
 * happens in App.tsx via separateBundlesAndFiles after the list is loaded,
 * so enrichment logic is unchanged.
 *
 * Returns { files, bundles } shaped like what App.tsx expects for React state.
 */

import * as filesApi from '../api/files';
import * as bundlesApi from '../api/bundles';
import {
  upsertFile,
  upsertBundle,
  purgeFile,
  purgeBundle,
  getAllFiles,
  getAllBundles,
} from '../db/fileRepo';
import type { LocalFile, LocalBundle } from '../db/fileRepo';
import { getOutboxReferencedIds } from '../db/outbox';
import { colorFromCategory, categoryFromExt } from '../utils/fileHelpers';
import { deriveLinqTitleFromFiles } from '../utils/helpers';

/**
 * Disable time-based purge grace so web deletions reflect on mobile immediately.
 * We rely on outbox-referenced-id protection (pending upload/delete/bundle jobs)
 * instead of a broad time window that can hide real server-side deletes.
 */
const PURGE_GRACE_MS = 0;

const isLinqType = (t: string) => {
  const lower = String(t ?? '').toLowerCase();
  return lower === 'link' || lower === 'bundle' || lower === 'linq';
};

const isGenericLinqName = (name: unknown) => {
  const n = String(name ?? '').trim().toLowerCase();
  return !n || n === 'linq' || n === 'bundle' || n === 'link';
};

async function concurrentMap<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  limit = 4
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await fn(items[idx]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, Math.max(1, items.length)) }, worker)
  );
  return results;
}

/**
 * Pull the full file list from the server and merge into SQLite.
 * - Server rows win over local clean rows.
 * - Dirty local rows (offline edits) are preserved.
 * - Returns the merged list split into files and bundles for React state.
 */
export async function pullAndMerge(): Promise<{
  files: LocalFile[];
  bundles: LocalBundle[];
  raw: any[];
  /** Server ids that are new or have changed server timestamp since last pull. */
  changedFileIds: string[];
}> {
  // 1. Fetch from server (cast to any[] — server may return extra fields beyond UiFile)
  const raw = await filesApi.getAll() as any[];

  // Snapshot current file timestamps before applying server upserts.
  const localFilesBefore = await getAllFiles();
  const localById = new Map(localFilesBefore.map((f) => [String(f.id), f]));
  const localBundlesBefore = await getAllBundles();
  const localBundleById = new Map(localBundlesBefore.map((b) => [String(b.id), b]));
  const rawById = new Map(raw.map((r: any) => [String(r?.id ?? ''), r]));
  const changedFileIds = new Set<string>();

  // 2. Track server ids so we can detect server-side deletes
  const serverIds = new Set(raw.map((r: any) => String(r.id)));

  // 3. Backfill linq child ids only when the list payload omitted them.
  // GET /api/files now embeds bundledFileIds for linqs (one SQL join), so this
  // N+1 path is a fallback for older servers / partial rows.
  const linqRows = raw.filter((item: any) => {
    if (!isLinqType(item?.type)) return false;
    return !Array.isArray(item?.bundledFileIds);
  });
  if (linqRows.length > 0) {
    await concurrentMap(
      linqRows,
      async (item: any) => {
        const id = String(item?.id ?? "").trim();
        if (!id) return;
        try {
          const contents = await bundlesApi.getContents(id);
          const ids = Array.isArray(contents?.bundledFileIds)
            ? contents.bundledFileIds.map((x: any) => String(x)).filter(Boolean)
            : [];
          const urls = Array.isArray(contents?.bundledUrls)
            ? contents.bundledUrls.map((x: any) => String(x)).filter(Boolean)
            : [];
          if (ids.length > 0) item.bundledFileIds = ids;
          if (urls.length > 0) item.bundledUrls = urls;
        } catch {
          const previousIds = localBundleById.get(id)?.bundledFileIds ?? [];
          if (previousIds.length > 0) item.bundledFileIds = previousIds;
        }
      },
      4
    );
  }

  // 4. Upsert each server row into SQLite (server wins unless local dirty)
  for (const item of raw) {
    const id = String(item.id ?? '');
    if (!id) continue;

    // Prefer server type field (determines link/note/image correctly);
    // fall back to contentType for MIME strings like "image/jpeg".
    const cat = categoryFromExt(item.type ?? item.contentType ?? '');

    if (isLinqType(item.type)) {
      const serverName = String(item.name ?? '').trim();
      let bundleName = serverName || 'linq';
      if (isGenericLinqName(serverName)) {
        const childIds: string[] = Array.isArray(item.bundledFileIds)
          ? item.bundledFileIds.map((x: any) => String(x))
          : [];
        const childRows = childIds
          .map((cid) => rawById.get(cid) ?? localById.get(cid))
          .filter(Boolean);
        const derived = deriveLinqTitleFromFiles(
          childRows.map((row: any) => ({
            name: row?.name,
            type: row?.type,
            contentType: row?.contentType ?? row?.content_type ?? null,
          }))
        );
        if (!isGenericLinqName(derived)) {
          bundleName = derived;
        } else {
          const previousName = String(localBundleById.get(id)?.name ?? '').trim();
          if (!isGenericLinqName(previousName)) {
            bundleName = previousName;
          }
        }
      }
      await upsertBundle({
        id,
        name: bundleName,
        type: item.type ?? 'Link',
        content_type: item.contentType ?? null,
        created_at: item.createdAt ?? null,
        creator: item.creator ?? null,
        url: item.url ?? null,
        child_ids: JSON.stringify(item.bundledFileIds ?? []),
        dirty: 0,
        deleted: 0,
        synced_at: Date.now(),
      });
    } else {
      const prev = localById.get(id);
      const prevTs = String(prev?.createdAt ?? '');
      const nextTs = String(item.createdAt ?? '');
      if (!prev || prevTs !== nextTs) {
        changedFileIds.add(id);
      }
      await upsertFile({
        id,
        name: item.name ?? 'Untitled',
        type: cat,
        content_type: item.contentType ?? item.type ?? null,
        created_at: item.createdAt ?? null,
        creator: item.creator ?? null,
        url: item.url ?? null,
        dirty: 0,
        deleted: 0,
        synced_at: Date.now(),
      });
    }
  }

  // 5. Soft-purge any local clean rows that are no longer on the server
  //    (i.e., deleted on another device or via web app).
  //    We only purge non-dirty rows — dirty ones are pending outbox uploads.
  const withColors = (items: LocalFile[]) =>
    items.map((f) => ({
      ...f,
      typeColor: colorFromCategory(f.type),
    }));

  const localFiles = await getAllFiles();
  const localBundles = await getAllBundles();

  const { fileIds: outboxFileIds, bundleIds: outboxBundleIds } =
    await getOutboxReferencedIds();
  const now = Date.now();

  for (const f of localFiles) {
    // Skip legacy opt- placeholders and pending client-UUID uploads
    if (String(f.id).startsWith('opt-') || f.dirty === 1) {
      continue;
    }
    if (outboxFileIds.has(String(f.id))) continue;
    const syncedAt = typeof f.synced_at === 'number' ? f.synced_at : 0;
    if (syncedAt && now - syncedAt < PURGE_GRACE_MS) continue;
    // If a non-optimistic id is absent from the server and not referenced by outbox,
    // remove it even if dirty got stuck. Outbox protection is the real source of truth.
    if (!serverIds.has(f.id)) {
      await purgeFile(f.id);
    }
  }
  for (const b of localBundles) {
    if (String(b.id).startsWith('opt-') || b.dirty === 1) {
      continue;
    }
    if (outboxBundleIds.has(String(b.id))) continue;
    const bSynced = typeof b.synced_at === 'number' ? b.synced_at : 0;
    if (bSynced && now - bSynced < PURGE_GRACE_MS) continue;
    // Same rule for linq rows: server absence + no outbox reference means stale local row.
    if (!serverIds.has(b.id)) {
      await purgeBundle(b.id);
    }
  }

  // 6. Re-read from SQLite (source of truth after merge)
  const mergedFiles = await getAllFiles();
  const mergedBundles = await getAllBundles();

  return {
    files: withColors(mergedFiles) as LocalFile[],
    bundles: withColors(mergedBundles) as LocalBundle[],
    raw,
    changedFileIds: Array.from(changedFileIds),
  };
}

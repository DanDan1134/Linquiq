/**
 * File and bundle repository.
 *
 * All persistence for the file list and bundles goes through these functions.
 * They replace the AsyncStorage `loadCachedFiles` / `saveCachedFiles` pattern.
 */

import { getDb } from './index';
import type { FileRow, BundleRow } from './schema';
import { track } from '../utils/perfLog';

// ── UiFile shape (matches what App.tsx uses) ──────────────────────────────

export type LocalFile = {
  id: string;
  name: string;
  type: string;
  typeColor?: string;
  contentType?: string;
  createdAt?: string;
  creator?: string;
  url?: string | null;
  content?: string | null;
  local_uri?: string | null;
  dirty?: number;
  /** Unix ms from SQLite — used to avoid purge races right after sync */
  synced_at?: number | null;
  /** 'pending' | 'downloaded' | 'failed' | 'skipped' */
  download_status?: string;
};

export type LocalBundle = LocalFile & {
  files?: LocalFile[];
  bundledFileIds?: string[];
  bundledUrls?: string[];
  children?: any;
};

// ── Helpers ──────────────────────────────────────────────────────────────

function rowToFile(row: FileRow): LocalFile {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    contentType: row.content_type ?? undefined,
    createdAt: row.created_at ?? undefined,
    creator: row.creator ?? undefined,
    url: row.url ?? null,
    content: row.content ?? null,
    local_uri: row.local_uri ?? null,
    dirty: row.dirty,
    synced_at: row.synced_at ?? null,
    download_status: row.download_status ?? 'pending',
  };
}

function rowToBundle(row: BundleRow): LocalBundle {
  let childIds: string[] = [];
  try { childIds = JSON.parse(row.child_ids || '[]'); } catch {}
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    contentType: row.content_type ?? undefined,
    createdAt: row.created_at ?? undefined,
    creator: row.creator ?? undefined,
    url: row.url ?? null,
    content: row.content ?? null,
    dirty: row.dirty,
    synced_at: row.synced_at ?? null,
    bundledFileIds: childIds,
    files: [],
  };
}

// ── Files ────────────────────────────────────────────────────────────────

/** Return all non-deleted files from SQLite. */
export async function getAllFiles(): Promise<LocalFile[]> {
  const db = getDb();
  const t = track('READ FILES');
  const rows = await db.getAllAsync<FileRow>(
    'SELECT * FROM files WHERE deleted = 0 ORDER BY created_at DESC'
  );
  const files = rows.map(rowToFile);
  t.done(`${files.length} rows`);
  return files;
}

/** Return one file by id (including soft-deleted). */
export async function getFileById(id: string): Promise<LocalFile | null> {
  const db = getDb();
  const row = await db.getFirstAsync<FileRow>(
    'SELECT * FROM files WHERE id = ?',
    [id]
  );
  return row ? rowToFile(row) : null;
}

/**
 * Insert or replace a file row.
 * If the existing row is dirty (local changes not yet synced),
 * the server version does NOT overwrite `content`, `url`, or `dirty`
 * unless `forceServerWin` is true.
 */
export async function upsertFile(
  file: Partial<FileRow> & { id: string },
  forceServerWin = false
): Promise<void> {
  const db = getDb();

  // Check existing row metadata so ordering remains stable after resync.
  const existing = await db.getFirstAsync<
    Pick<
      FileRow,
      | 'dirty'
      | 'created_at'
      | 'client_id'
      | 'url'
      | 'content'
      | 'local_uri'
      | 'download_status'
      | 'bundle_ids'
    >
  >(
    'SELECT dirty, created_at, client_id, url, content, local_uri, download_status, bundle_ids FROM files WHERE id = ?',
    [file.id]
  );
  const isDirty = (existing?.dirty ?? 0) === 1;
  // Preserve local created_at once a row exists (especially offline opt- uploads
  // that later get server ids), so list order doesn't jump after pull sync.
  const createdAtToWrite = existing?.created_at ?? file.created_at ?? null;

  if (isDirty && !forceServerWin) {
    // Keep local content/url; only update non-content metadata from server
    await db.runAsync(
      `UPDATE files SET
        name = COALESCE(?, name),
        type = COALESCE(?, type),
        content_type = COALESCE(?, content_type),
        created_at = COALESCE(?, created_at),
        creator = COALESCE(?, creator),
        synced_at = ?
       WHERE id = ?`,
      [
        file.name ?? null,
        file.type ?? null,
        file.content_type ?? null,
        createdAtToWrite,
        file.creator ?? null,
        Date.now(),
        file.id,
      ]
    );
    return;
  }

  // Keep client_id after id→server upgrade so pull sync + create_bundle outbox can still resolve opt-… ids.
  const clientId =
    file.client_id !== undefined && file.client_id !== null
      ? file.client_id
      : String(file.id).startsWith('opt-')
        ? file.id
        : existing?.client_id ?? null;

  const urlToWrite = file.url ?? existing?.url ?? null;
  const contentToWrite = file.content ?? existing?.content ?? null;
  const localUriToWrite = file.local_uri ?? existing?.local_uri ?? null;
  const bundleIdsToWrite = file.bundle_ids ?? existing?.bundle_ids ?? '[]';
  const downloadStatusToWrite =
    file.download_status ??
    existing?.download_status ??
    // If we have local content or a local file URI, treat row as already downloaded.
    ((contentToWrite || localUriToWrite) ? 'downloaded' : 'pending');

  await db.runAsync(
    `INSERT OR REPLACE INTO files
       (id, name, type, content_type, created_at, creator, url, content, local_uri, client_id, bundle_ids, dirty, deleted, synced_at, download_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      file.id,
      file.name ?? 'Untitled',
      file.type ?? '',
      file.content_type ?? null,
      createdAtToWrite,
      file.creator ?? null,
      urlToWrite,
      contentToWrite,
      localUriToWrite,
      clientId,
      bundleIdsToWrite,
      file.dirty ?? 0,
      file.deleted ?? 0,
      file.synced_at ?? null,
      downloadStatusToWrite,
    ]
  );
}

/** Mark a file as having unsynced local changes. */
export async function markFileDirty(id: string): Promise<void> {
  const db = getDb();
  await db.runAsync('UPDATE files SET dirty = 1 WHERE id = ?', [id]);
}

/**
 * When a file’s id changes from opt-… to a server id, every Linq row still listing the
 * old id must be updated or bundle.files resolution (bundledFileIds → fileMap) breaks.
 */
async function rewriteChildIdInAllBundles(
  db: ReturnType<typeof getDb>,
  oldId: string,
  newId: string
): Promise<void> {
  const o = String(oldId).trim();
  const n = String(newId).trim();
  if (!o || !n || o === n) return;

  const rows = await db.getAllAsync<{ id: string; child_ids: string | null }>(
    'SELECT id, child_ids FROM bundles WHERE deleted = 0'
  );
  for (const row of rows) {
    let ids: string[] = [];
    try {
      ids = JSON.parse(row.child_ids || '[]');
    } catch {
      continue;
    }
    if (!Array.isArray(ids)) continue;
    let changed = false;
    const next = ids.map((id) => {
      if (String(id) === o) {
        changed = true;
        return n;
      }
      return id;
    });
    if (changed) {
      await db.runAsync('UPDATE bundles SET child_ids = ? WHERE id = ?', [
        JSON.stringify(next),
        row.id,
      ]);
    }
  }
}

/** Mark a file as synced. Optionally replace a temp opt- id with the real server id. */
export async function markFileSynced(
  localId: string,
  serverId?: string,
  serverUrl?: string
): Promise<void> {
  const db = getDb();
  if (serverId && serverId !== localId) {
    // Replace optimistic id with real one; keep client_id so outbox can resolve create_bundle children
    await db.runAsync(
      `UPDATE files SET id = ?, dirty = 0, synced_at = ?, url = COALESCE(?, url),
         client_id = COALESCE(client_id, ?) WHERE id = ?`,
      [serverId, Date.now(), serverUrl ?? null, localId, localId]
    );
    await rewriteChildIdInAllBundles(db, localId, serverId);
  } else {
    await db.runAsync(
      `UPDATE files SET dirty = 0, synced_at = ?, url = COALESCE(?, url) WHERE id = ?`,
      [Date.now(), serverUrl ?? null, localId]
    );
  }
}

/** Soft-delete a file (marks deleted=1). */
export async function deleteFile(id: string): Promise<void> {
  const db = getDb();
  await db.runAsync('UPDATE files SET deleted = 1, dirty = 0 WHERE id = ?', [id]);
}

/** Hard-delete a file row (after server confirms deletion). */
export async function purgeFile(id: string): Promise<void> {
  const db = getDb();
  await db.runAsync('DELETE FROM files WHERE id = ?', [id]);
}

/** Update the local content (note body) and url for a file. */
export async function updateFileContent(
  id: string,
  content: string | null,
  url?: string | null
): Promise<void> {
  const db = getDb();
  await db.runAsync(
    'UPDATE files SET content = ?, url = COALESCE(?, url), download_status = ? WHERE id = ?',
    [content ?? null, url ?? null, content ? 'downloaded' : 'pending', id]
  );
}

/**
 * Persist a local filesystem path for a downloaded binary file.
 * Sets download_status = 'downloaded'.
 */
export async function updateLocalUri(id: string, localUri: string): Promise<void> {
  const db = getDb();
  await db.runAsync(
    'UPDATE files SET local_uri = ?, download_status = ? WHERE id = ?',
    [localUri, 'downloaded', id]
  );
}

/** Mark a file's download as failed so the worker can retry later. */
export async function markDownloadFailed(id: string): Promise<void> {
  const db = getDb();
  await db.runAsync(
    "UPDATE files SET download_status = 'failed' WHERE id = ?",
    [id]
  );
}

/** Mark a file as skipped for auto-download (e.g. video too large). */
export async function markDownloadSkipped(id: string): Promise<void> {
  const db = getDb();
  await db.runAsync(
    "UPDATE files SET download_status = 'skipped' WHERE id = ?",
    [id]
  );
}

/**
 * Return server-synced files that still need their content / binary downloaded.
 * Excludes pending local uploads, already-downloaded, skipped, and Linqs.
 */
export async function getFilesNeedingDownload(): Promise<LocalFile[]> {
  const db = getDb();
  const rows = await db.getAllAsync<FileRow>(
    `SELECT * FROM files
      WHERE deleted = 0
        AND dirty = 0
        AND (
          download_status = 'pending'
          OR download_status = 'failed'
          OR (download_status = 'skipped' AND lower(type) = 'video')
        )
        AND local_uri IS NULL
        AND id NOT LIKE 'opt-%'
      ORDER BY created_at DESC`,
  );
  return rows.map(rowToFile);
}

/**
 * Map a client-side file id (opt-…, pending UUID, or synced server id) to the current
 * server row id stored in SQLite. Returns null if the row is still local-only.
 */
export async function resolveSyncedFileId(
  clientOrServerId: string
): Promise<string | null> {
  const sid = String(clientOrServerId).trim();
  if (!sid) return null;

  const db = getDb();
  const syncedId = (
    row: { id: string; dirty: number; synced_at: number | null } | null
  ): string | null => {
    if (!row?.id) return null;
    if (String(row.id).startsWith('opt-')) return null;
    if (row.dirty === 1 && !row.synced_at) return null;
    return row.id;
  };

  if (sid.startsWith('opt-')) {
    const fileRow = await db.getFirstAsync<{
      id: string;
      dirty: number;
      synced_at: number | null;
    }>('SELECT id, dirty, synced_at FROM files WHERE client_id = ? OR id = ?', [
      sid,
      sid,
    ]);
    const fromFile = syncedId(fileRow);
    if (fromFile) return fromFile;

    const bundleRow = await db.getFirstAsync<{
      id: string;
      dirty: number;
      synced_at: number | null;
    }>('SELECT id, dirty, synced_at FROM bundles WHERE id = ?', [sid]);
    return syncedId(bundleRow);
  }

  const fileRow = await db.getFirstAsync<{
    id: string;
    dirty: number;
    synced_at: number | null;
  }>('SELECT id, dirty, synced_at FROM files WHERE id = ?', [sid]);
  if (fileRow) return syncedId(fileRow);

  // Nested linqs live in `bundles`, not `files`. Returning an unsynced linq id
  // made /files/connect 403 (not owned) instead of waiting for upload.
  const bundleRow = await db.getFirstAsync<{
    id: string;
    dirty: number;
    synced_at: number | null;
  }>('SELECT id, dirty, synced_at FROM bundles WHERE id = ?', [sid]);
  if (bundleRow) return syncedId(bundleRow);

  return sid;
}

/** Resolve all child ids for create_bundle after uploads have assigned server ids. */
export async function resolveChildIdsForBundle(
  childIds: string[]
): Promise<string[]> {
  const out: string[] = [];
  for (const c of childIds) {
    const resolved = await resolveSyncedFileId(c);
    if (!resolved) {
      throw new Error(`create_bundle: child not synced yet: ${c}`);
    }
    out.push(resolved);
  }
  return out;
}

// ── Bundles ──────────────────────────────────────────────────────────────

/** Return one bundle by id, or null. */
export async function getBundleById(id: string): Promise<LocalBundle | null> {
  const db = getDb();
  const row = await db.getFirstAsync<BundleRow>(
    'SELECT * FROM bundles WHERE id = ? AND deleted = 0',
    [String(id)]
  );
  return row ? rowToBundle(row) : null;
}

/** Return all non-deleted bundles (linqs) from SQLite. */
export async function getAllBundles(): Promise<LocalBundle[]> {
  const db = getDb();
  const t = track('READ LINQS');
  const rows = await db.getAllAsync<BundleRow>(
    'SELECT * FROM bundles WHERE deleted = 0 ORDER BY created_at DESC'
  );
  const bundles = rows.map(rowToBundle);
  t.done(`${bundles.length} rows`);
  return bundles;
}

/** Insert or replace a bundle row (server wins unless dirty). */
export async function upsertBundle(
  bundle: Partial<BundleRow> & { id: string },
  forceServerWin = false
): Promise<void> {
  const db = getDb();

  const existing = await db.getFirstAsync<Pick<BundleRow, 'dirty' | 'created_at' | 'child_ids'>>(
    'SELECT dirty, created_at, child_ids FROM bundles WHERE id = ?',
    [bundle.id]
  );
  const isDirty = (existing?.dirty ?? 0) === 1;
  const createdAtToWrite = existing?.created_at ?? bundle.created_at ?? null;
  const childIdsToWrite = bundle.child_ids ?? existing?.child_ids ?? '[]';

  if (isDirty && !forceServerWin) {
    await db.runAsync(
      `UPDATE bundles SET
        name = COALESCE(?, name),
        type = COALESCE(?, type),
        content_type = COALESCE(?, content_type),
        created_at = COALESCE(?, created_at),
        creator = COALESCE(?, creator),
        synced_at = ?
       WHERE id = ?`,
      [
        bundle.name ?? null,
        bundle.type ?? null,
        bundle.content_type ?? null,
        createdAtToWrite,
        bundle.creator ?? null,
        Date.now(),
        bundle.id,
      ]
    );
    return;
  }

  await db.runAsync(
    `INSERT OR REPLACE INTO bundles
       (id, name, type, content_type, created_at, creator, url, content, child_ids, dirty, deleted, synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      bundle.id,
      bundle.name ?? 'linq',
      bundle.type ?? 'Link',
      bundle.content_type ?? null,
      createdAtToWrite,
      bundle.creator ?? null,
      bundle.url ?? null,
      bundle.content ?? null,
      childIdsToWrite,
      bundle.dirty ?? 0,
      bundle.deleted ?? 0,
      bundle.synced_at ?? null,
    ]
  );
}

export async function markBundleDirty(id: string): Promise<void> {
  const db = getDb();
  await db.runAsync('UPDATE bundles SET dirty = 1 WHERE id = ?', [id]);
}

/** Update only file name (local rename before/after sync). */
export async function updateFileName(id: string, name: string): Promise<void> {
  const db = getDb();
  await db.runAsync('UPDATE files SET name = ? WHERE id = ?', [name, id]);
}

/** Update only bundle name (used for mobile-only Linq title backfill). */
export async function updateBundleName(id: string, name: string): Promise<void> {
  const db = getDb();
  await db.runAsync('UPDATE bundles SET name = ? WHERE id = ?', [name, id]);
}

/** Persist a bundle's child ids so linqs can be reconstructed fully offline. */
export async function updateBundleChildIds(id: string, childIds: string[]): Promise<void> {
  const ids = childIds.map((x) => String(x).trim()).filter(Boolean);
  const db = getDb();
  await db.runAsync('UPDATE bundles SET child_ids = ? WHERE id = ?', [
    JSON.stringify(ids),
    id,
  ]);
}

export async function markBundleSynced(
  localId: string,
  serverId?: string,
  /** Server file ids for children — persisted so merges match server bundledFileIds. */
  resolvedChildIds?: string[]
): Promise<void> {
  const db = getDb();
  const childJson =
    resolvedChildIds && resolvedChildIds.length > 0
      ? JSON.stringify(resolvedChildIds)
      : null;

  if (serverId && serverId !== localId) {
    if (childJson) {
      await db.runAsync(
        'UPDATE bundles SET id = ?, dirty = 0, synced_at = ?, child_ids = ? WHERE id = ?',
        [serverId, Date.now(), childJson, localId]
      );
    } else {
      await db.runAsync(
        'UPDATE bundles SET id = ?, dirty = 0, synced_at = ? WHERE id = ?',
        [serverId, Date.now(), localId]
      );
    }
  } else {
    if (childJson) {
      await db.runAsync(
        'UPDATE bundles SET dirty = 0, synced_at = ?, child_ids = ? WHERE id = ?',
        [Date.now(), childJson, localId]
      );
    } else {
      await db.runAsync(
        'UPDATE bundles SET dirty = 0, synced_at = ? WHERE id = ?',
        [Date.now(), localId]
      );
    }
  }
}

export async function deleteBundle(id: string): Promise<void> {
  const db = getDb();
  await db.runAsync('UPDATE bundles SET deleted = 1, dirty = 0 WHERE id = ?', [id]);
}

export async function purgeBundle(id: string): Promise<void> {
  const db = getDb();
  await db.runAsync('DELETE FROM bundles WHERE id = ?', [id]);
}

// ── Wipe on logout ────────────────────────────────────────────────────────

/** Clear all rows from all tables (call on logout). */
export async function clearAllLocalData(): Promise<void> {
  const db = getDb();
  await db.execAsync('DELETE FROM files; DELETE FROM bundles; DELETE FROM outbox;');
}

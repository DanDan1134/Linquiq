/**
 * saveLocal — offline-first write helper used by every save/upload handler.
 *
 * Steps:
 *  1. For binaries: copy the ephemeral source URI to a persistent path inside
 *     documentDirectory so the outbox worker can still read it after app restarts.
 *  2. Upsert a SQLite row (dirty=1) so the item appears in the local list instantly.
 *  3. Enqueue the appropriate outbox job — the worker uploads to S3 when online.
 *
 * Returns { localId, localUri } so the caller can build an optimistic UI row.
 */

// SDK 54+: default `expo-file-system` stubs legacy methods and throws.
// Real implementations live under `expo-file-system/legacy`.
import * as FileSystem from 'expo-file-system/legacy';
import { upsertFile } from '../db/fileRepo';
import { enqueue } from '../db/outbox';
import { colorFromCategory } from '../utils/fileHelpers';
import { persistListThumbnailFromFile } from '../utils/listThumbCache';

export type SaveLocalOpts = {
  /** Stable local id — use the format `opt-${Date.now()}` or similar. */
  localId: string;
  /** Display name (including extension for binaries). */
  name: string;
  /** Category string: "Note" | "Image" | "Audio" | "Video" | "PDF" | "File" */
  type: string;
  /** Short extension without dot, e.g. "txt" "mp3" "jpg" */
  contentType?: string;
  /** Note body text — stored directly in SQLite content column. */
  content?: string;
  /** Ephemeral URI from picker / camera / recorder. Must be provided for binaries. */
  sourceUri?: string;
  /** Extension WITH dot for the destination file, e.g. ".jpg" ".mp3". Required when sourceUri is provided. */
  destExt?: string;
  /** Who created this (email). */
  creator?: string;
};

export type SaveLocalResult = {
  localId: string;
  /** Persistent file:// path on device, or null for text-only notes. */
  localUri: string | null;
};

/**
 * Persistent directory for offline binary files.
 * documentDirectory is never cleared by the OS (unlike cacheDirectory).
 */
const OFFLINE_DIR = `${FileSystem.documentDirectory}linquiq_offline/`;

async function ensureOfflineDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(OFFLINE_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(OFFLINE_DIR, { intermediates: true });
  }
}

export async function saveLocal(opts: SaveLocalOpts): Promise<SaveLocalResult> {
  const {
    localId,
    name,
    type,
    contentType,
    content,
    sourceUri,
    destExt,
    creator,
  } = opts;

  let localUri: string | null = null;

  // ── 1. Copy binary to persistent storage ──────────────────────────────────
  if (sourceUri) {
    await ensureOfflineDir();
    const ext = destExt ?? '.bin';
    const destPath = `${OFFLINE_DIR}${localId}${ext}`;
    await FileSystem.copyAsync({ from: sourceUri, to: destPath });
    localUri = destPath;

    if (String(type).toLowerCase() === 'image') {
      void persistListThumbnailFromFile(destPath, localId).catch(() => undefined);
    }
  }

  // ── 2. Persist metadata to SQLite ─────────────────────────────────────────
  await upsertFile({
    id: localId,
    name,
    type,
    content_type: contentType ?? null,
    created_at: new Date().toISOString(),
    creator: creator ?? null,
    url: localUri,           // local path used as url until server syncs
    content: content ?? null,
    local_uri: localUri,
    dirty: 1,
    deleted: 0,
  }, true); // forceServerWin=true on insert (row is brand new, no conflict)

  // ── 3. Enqueue outbox job ──────────────────────────────────────────────────
  if (content !== undefined && !sourceUri) {
    // Text / note — upload as blob
    await enqueue({ op: 'upload_blob', localId, content, name });
  } else if (localUri) {
    // Binary — upload from persistent local path
    await enqueue({ op: 'upload_file', localId, fileUri: localUri, name });
  }

  return { localId, localUri };
}

/**
 * Build an optimistic UI file row from a saveLocal result.
 * Pass this directly into setUserFiles((prev) => [optimisticRow(…), ...prev]).
 */
export function optimisticRow(opts: {
  localId: string;
  name: string;
  type: string;
  contentType?: string;
  localUri?: string | null;
  content?: string | null;
  creator?: string;
}): Record<string, unknown> {
  const { localId, name, type, contentType, localUri, content, creator } = opts;
  return {
    id: localId,
    name,
    type,
    typeColor: colorFromCategory(type),
    contentType,
    createdAt: new Date().toISOString(),
    creator: creator ?? '',
    // Use local file path as url so images/audio display while offline
    url: localUri ?? null,
    local_uri: localUri ?? null,
    content: content ?? undefined,
    dirty: 1,
  };
}

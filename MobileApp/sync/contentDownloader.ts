/**
 * contentDownloader — offline-first content caching.
 *
 * Goal: after every online pull, make sure every file's content is stored on
 * device so it can be opened with zero network access.
 *
 * Strategy by file type:
 *   Note / txt / md  → fetch text from presigned URL → SQLite `content` column
 *   Image            → download binary → documentDirectory/linquiq_cache/
 *   Audio / Voice    → download binary → documentDirectory/linquiq_cache/
 *   PDF              → download binary → documentDirectory/linquiq_cache/
 *   Video            → download binary → documentDirectory/linquiq_cache/
 *   Other File       → download if under MAX_AUTO_BYTES
 *
 * Files already on disk (local_uri set) are left untouched.
 */

import * as FileSystem from 'expo-file-system/legacy';
import * as filesApi from '../api/files';
import { logPerf } from '../utils/perfLog';
import { persistListThumbnailFromFile } from '../utils/listThumbCache';
import {
  getFilesNeedingDownload,
  getFileById,
  updateLocalUri,
  updateFileContent,
  markDownloadFailed,
  markDownloadSkipped,
  type LocalFile,
} from '../db/fileRepo';
import { LIST_THUMB_CACHE_DIR } from '../utils/listThumbCache';

// ── Constants ─────────────────────────────────────────────────────────────────

const CACHE_DIR = `${FileSystem.documentDirectory}linquiq_cache/`;

/** Binaries larger than this are not auto-downloaded (user must go online). */
const MAX_AUTO_BYTES = 75 * 1024 * 1024; // 75 MB

/** How many files to download in parallel. */
const CONCURRENCY = 6;

// ── Internals ──────────────────────────────────────────────────────────────────

let _running = false;
/** If true, the current run will repeat after finishing (another caller requested while busy). */
let _pendingRerun = false;

async function ensureCacheDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(CACHE_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
  }
}

function isNoteType(file: LocalFile): boolean {
  const t = String(file.type ?? '').toLowerCase();
  const ct = String(file.contentType ?? '').toLowerCase();
  const n = String(file.name ?? '').toLowerCase();
  return (
    t === 'note' ||
    ct === 'txt' || ct === 'md' || ct === 'text' ||
    ct === 'text/plain' || ct === 'text/markdown' ||
    /\.(txt|md|text)$/.test(n)
  );
}

/** Best-guess extension for the cache filename. */
function guessExt(file: LocalFile): string {
  const ctRaw = String(file.contentType ?? '').toLowerCase().trim();
  const ct = ctRaw.replace(/^\./, '');
  if (ct) {
    const mappedMime: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/jpg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'image/heic': '.heic',
      'image/heif': '.heif',
      'audio/mpeg': '.mp3',
      'audio/mp3': '.mp3',
      'audio/mp4': '.m4a',
      'audio/x-m4a': '.m4a',
      'audio/wav': '.wav',
      'audio/aac': '.aac',
      'audio/ogg': '.ogg',
      'video/mp4': '.mp4',
      'video/quicktime': '.mov',
      'application/pdf': '.pdf',
      'application/msword': '.doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
      'text/plain': '.txt',
      'text/markdown': '.md',
    };
    if (mappedMime[ct]) return mappedMime[ct];
    if (!ct.includes('/')) return `.${ct}`;
  }
  const t = String(file.type ?? '').toLowerCase();
  if (t === 'image') return '.jpg';
  if (t === 'audio') return '.m4a';
  if (t === 'pdf') return '.pdf';
  if (t === 'video') return '.mp4';
  return '.bin';
}

function isImageRow(file: LocalFile): boolean {
  const t = String(file.type ?? '').toLowerCase();
  if (t === 'image') return true;
  const ct = String(file.contentType ?? '').toLowerCase();
  if (ct.includes('image')) return true;
  const n = String(file.name ?? '').toLowerCase();
  return /\.(jpe?g|png|gif|webp|heic|bmp)$/i.test(n);
}

async function processFile(
  file: LocalFile,
  urlHint?: string | null
): Promise<void> {
  const id = file.id;

  let presignedUrl: string | null =
    urlHint && String(urlHint).trim() !== "" ? String(urlHint).trim() : null;
  if (!presignedUrl) {
    try {
      const meta = await filesApi.getById(id);
      presignedUrl = meta?.url ?? null;
    } catch {
      await markDownloadFailed(id);
      return;
    }
  }

  if (!presignedUrl) {
    await markDownloadFailed(id);
    return;
  }

  if (isNoteType(file)) {
    // ── Notes: store text in SQLite content column ─────────────────────────
    try {
      const text = await filesApi.getNoteContent(presignedUrl);
      if (text) {
        await updateFileContent(id, text);
      } else {
        await markDownloadFailed(id);
      }
    } catch {
      await markDownloadFailed(id);
    }
    return;
  }

  // ── Binaries: download to local filesystem ─────────────────────────────────
  await ensureCacheDir();
  const ext = guessExt(file);
  const localPath = `${CACHE_DIR}${id}${ext}`;

  try {
    // Check if the file already landed on disk from a previous partial run
    const existing = await FileSystem.getInfoAsync(localPath);
    if (existing.exists && (existing as any).size > 0) {
      await updateLocalUri(id, localPath);
      if (isImageRow(file)) {
        void persistListThumbnailFromFile(localPath, id).catch(() => undefined);
      }
      return;
    }

    // Check content-length before downloading (HEAD-like via getInfoAsync on presigned URL)
    // expo-file-system doesn't expose HEAD natively, so we rely on MAX_AUTO_BYTES at download time.
    const downloadResult = await FileSystem.downloadAsync(presignedUrl, localPath, {});

    if (downloadResult.status === 200) {
      const info = await FileSystem.getInfoAsync(localPath);
      const size = (info as any).size ?? 0;
      if (size > MAX_AUTO_BYTES) {
        // Too large — delete and mark skipped
        await FileSystem.deleteAsync(localPath, { idempotent: true });
        await markDownloadSkipped(id);
      } else {
        await updateLocalUri(id, localPath);
        if (isImageRow(file)) {
          void persistListThumbnailFromFile(localPath, id).catch(() => undefined);
        }
      }
    } else {
      await markDownloadFailed(id);
    }
  } catch {
    await markDownloadFailed(id);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Download content for every file that hasn't been cached yet.
 * Concurrent calls coalesce: if a run is in progress, another request sets a flag
 * so the queue is scanned again after the current pass (e.g. post-pull new rows).
 * Designed to run in the background after a successful pullAndMerge.
 *
 * @param onProgress  Optional callback (downloadedCount, totalCount).
 */
export async function downloadPendingContent(
  onProgress?: (done: number, total: number) => void
): Promise<void> {
  if (_running) {
    _pendingRerun = true;
    return;
  }
  _running = true;
  try {
    do {
      _pendingRerun = false;
      const batchStarted = Date.now();
      const files = await getFilesNeedingDownload();
      const total = files.length;
      if (total === 0) continue;

      let done = 0;
      // One batch presign for the whole pending set, then download in parallel.
      let urlMap: Record<string, string> = {};
      try {
        urlMap = await filesApi.getUrlsByIds(files.map((f) => f.id));
      } catch {
        urlMap = {};
      }
      for (let i = 0; i < files.length; i += CONCURRENCY) {
        const batch = files.slice(i, i + CONCURRENCY);
        await Promise.allSettled(
          batch.map((f) => processFile(f, urlMap[String(f.id)] ?? null))
        );
        done += batch.length;
        onProgress?.(Math.min(done, total), total);
      }
      if (__DEV__) {
        logPerf('cache', `downloaded ${total} pending file(s) to device`, batchStarted);
      }
    } while (_pendingRerun);
  } finally {
    _running = false;
  }
}

/**
 * Delete all cached binaries from the filesystem (call on logout).
 * SQLite rows are wiped separately by clearAllLocalData.
 */
export async function clearDownloadCache(): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(CACHE_DIR);
    if (info.exists) {
      await FileSystem.deleteAsync(CACHE_DIR, { idempotent: true });
    }
    const thumbInfo = await FileSystem.getInfoAsync(LIST_THUMB_CACHE_DIR);
    if (thumbInfo.exists) {
      await FileSystem.deleteAsync(LIST_THUMB_CACHE_DIR, { idempotent: true });
    }
  } catch (e) {
    console.warn('[contentDownloader] clearDownloadCache failed:', e);
  }
}

/**
 * Ensure one file is cached locally (local_uri/content) before opening.
 * Returns the latest SQLite row after any download attempt.
 */
export async function ensureFileDownloaded(id: string): Promise<LocalFile | null> {
  const row = await getFileById(id);
  if (!row) return null;

  const hasLocalBinary =
    row.local_uri != null && String(row.local_uri).trim().length > 0;
  const hasInlineText =
    row.content != null && String(row.content).trim().length > 0;
  if (hasLocalBinary || hasInlineText) return row;

  await processFile(row);
  return getFileById(id);
}

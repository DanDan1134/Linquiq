/**
 * On-disk list thumbnails (FileCard grid). Separate from full binaries in linquiq_cache/.
 * Filenames: `{fileId}{ext}` — must migrate when opt-… id becomes a server UUID.
 */

import * as FileSystem from 'expo-file-system/legacy';
import { logSafeWarn } from './safeLog';

export const LIST_THUMB_CACHE_DIR = `${FileSystem.documentDirectory}linquiq_thumb_cache/`;

const KNOWN_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic'] as const;

/**
 * Android Image / expo-image often reject bare absolute paths; RN iOS may accept them.
 * Ensures sandbox files under `/data/...` become `file:///data/...`.
 */
export function normalizeImageUri(raw: string | undefined | null): string {
  const s = String(raw ?? '').trim();
  if (!s) return s;
  if (s.startsWith('file:')) return s;
  if (/^https?:\/\//i.test(s)) return s;
  if (
    s.startsWith('content:') ||
    s.startsWith('asset:') ||
    s.startsWith('ph://') ||
    s.startsWith('assets-library:')
  ) {
    return s;
  }
  if (s.startsWith('/')) return `file://${s}`;
  return s;
}

export async function ensureListThumbCacheDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(LIST_THUMB_CACHE_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(LIST_THUMB_CACHE_DIR, { intermediates: true });
  }
}

/**
 * fileId → cached thumbnail filename, built from one directory read.
 *
 * Without this every image row probed the filesystem once per known extension,
 * so a screen of 20 photos cost ~120 native calls before the first paint.
 */
let thumbIndex: Map<string, string> | null = null;
let thumbIndexLoad: Promise<Map<string, string>> | null = null;

async function loadThumbIndex(): Promise<Map<string, string>> {
  const index = new Map<string, string>();
  try {
    const dirInfo = await FileSystem.getInfoAsync(LIST_THUMB_CACHE_DIR);
    if (dirInfo.exists) {
      const names = await FileSystem.readDirectoryAsync(LIST_THUMB_CACHE_DIR);
      for (const fileName of names) {
        const dot = fileName.lastIndexOf('.');
        const id = dot > 0 ? fileName.slice(0, dot) : fileName;
        if (id) index.set(id, fileName);
      }
    }
  } catch {
    /* treat an unreadable cache dir as empty */
  }
  thumbIndex = index;
  return index;
}

/** Path of this file's cached list thumbnail, or undefined when not cached. */
export async function findCachedListThumb(
  fileId: string
): Promise<string | undefined> {
  const id = String(fileId ?? '').trim();
  if (!id) return undefined;
  let index = thumbIndex;
  if (!index) {
    thumbIndexLoad = thumbIndexLoad ?? loadThumbIndex();
    index = await thumbIndexLoad;
    thumbIndexLoad = null;
  }
  const name = index.get(id);
  return name ? `${LIST_THUMB_CACHE_DIR}${name}` : undefined;
}

/** Record a newly written thumbnail so the next lookup hits the in-memory index. */
export function noteCachedListThumb(fileId: string, path: string): void {
  const id = String(fileId ?? '').trim();
  if (!id || !thumbIndex) return;
  const fileName = path.slice(path.lastIndexOf('/') + 1);
  if (fileName) thumbIndex.set(id, fileName);
}

/** Drop the index (logout / cache clear) so it is rebuilt on next use. */
export function resetListThumbIndex(): void {
  thumbIndex = null;
  thumbIndexLoad = null;
}

const LIST_THUMB_MAX_EDGE_PX = 200;

/**
 * Build a small JPEG list thumbnail from an on-device image file (full-res upload path or cache path).
 * Stored as `{LIST_THUMB_CACHE_DIR}{fileId}.jpg` — FileCard prefers this over HTTPS presigned URLs.
 * Does not use S3; survives until logout / clearDownloadCache.
 */
export async function persistListThumbnailFromFile(
  sourceUri: string,
  fileId: string
): Promise<void> {
  const id = String(fileId ?? '').trim();
  const src = String(sourceUri ?? '').trim();
  if (!id || !src) return;

  await ensureListThumbCacheDir();
  const dest = `${LIST_THUMB_CACHE_DIR}${id}.jpg`;

  try {
    const existing = await FileSystem.getInfoAsync(dest);
    const sz = existing.exists ? (existing as { size?: number }).size : 0;
    if (typeof sz === 'number' && sz > 0) return;
  } catch {
    /* write anyway */
  }

  try {
    const { manipulateAsync, SaveFormat } = await import('expo-image-manipulator');
    const result = await manipulateAsync(
      src,
      [{ resize: { width: LIST_THUMB_MAX_EDGE_PX } }],
      { compress: 0.85, format: SaveFormat.JPEG }
    );
    await FileSystem.copyAsync({ from: result.uri, to: dest });
    noteCachedListThumb(id, dest);
  } catch (e) {
    logSafeWarn('[listThumbCache] persistListThumbnailFromFile failed', e);
  }
}

/** After upload syncs opt-… → real id, move any cached row thumb so FileCard can find it by server id. */
export async function migrateListThumbCache(oldId: string, newId: string): Promise<void> {
  const o = String(oldId ?? '').trim();
  const n = String(newId ?? '').trim();
  if (!o || !n || o === n) return;

  const dirInfo = await FileSystem.getInfoAsync(LIST_THUMB_CACHE_DIR);
  if (!dirInfo.exists) return;

  for (const ext of KNOWN_EXTS) {
    const from = `${LIST_THUMB_CACHE_DIR}${o}${ext}`;
    const to = `${LIST_THUMB_CACHE_DIR}${n}${ext}`;
    try {
      const fi = await FileSystem.getInfoAsync(from);
      if (!fi.exists || (fi as { size?: number }).size === 0) continue;
      const dest = await FileSystem.getInfoAsync(to);
      if (dest.exists) return;
      await FileSystem.moveAsync({ from, to });
      noteCachedListThumb(n, to);
      return;
    } catch {
      /* try next ext */
    }
  }
}

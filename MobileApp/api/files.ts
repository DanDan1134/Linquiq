import { apiGet, apiPost, apiPatch, apiDelete } from './client';
import { dedupe } from '../utils/inflight';
import { getCachedUrl, setCachedUrl } from '../utils/urlCache';
import { logSafeWarn } from '../utils/safeLog';

type ServerFileRow = {
  id?: string;
  file_id?: string;
  creator_id?: string;
  creator_email?: string;
  createdAt?: string;
  type?: string;
  name?: string;
  description?: string | null;
  /** Presigned GET when the list endpoint includes it (often omitted — see FileCard bootstrap). */
  url?: string | null;
  /** Present on linq/list rows from GET /api/files — avoids per-linq getContents. */
  bundledFileIds?: string[] | null;
};

export type UiFile = {
  id: string;            // server UUID
  name: string;
  type: string;
  contentType?: string;
  createdAt?: string;
  creator?: string;
  url?: string | null;
  bundledFileIds?: string[];
};

function mapServerRow(row: ServerFileRow): UiFile {
  const id = String(row.id ?? '');
  const rawUrl = row.url != null ? String(row.url).trim() : '';
  const bundled = Array.isArray(row.bundledFileIds)
    ? row.bundledFileIds.map((x) => String(x).trim()).filter(Boolean)
    : undefined;
  return {
    id,
    name: row.name ?? 'Untitled',
    type: String(row.type ?? '').toLowerCase(),
    contentType: row.type,
    createdAt: row.createdAt,
    creator: row.creator_email ?? row.creator_id ?? '',
    url: rawUrl.length > 0 ? rawUrl : null,
    ...(bundled ? { bundledFileIds: bundled } : {}),
  };
}

/** Fetch all files for the current user */
export async function getAll(): Promise<UiFile[]> {
  const payload = await apiGet<{ data?: ServerFileRow[] }>(`/files`);
  const rows = payload?.data ?? [];
  return rows.map(mapServerRow);
}

/** Fresh presigned URL for a file (UUID) — cached in-memory (5 min TTL) + deduped. */
export async function getById(id: string): Promise<{ url: string; type?: string; name?: string }> {
  // Legacy optimistic IDs (opt-...) are local placeholders with no server record yet.
  // Pending client UUIDs may 404 until verify completes — callers should skip dirty rows.
  if (String(id).startsWith('opt-')) {
    throw new Error(`getById: skipping optimistic id ${id}`);
  }

  // Serve from cache when still fresh
  const cached = getCachedUrl(id);
  if (cached) return { url: cached.url, type: cached.type, name: cached.name };

  // Deduplicate concurrent callers waiting for the same id
  return dedupe(`getById:${id}`, async () => {
    const payload = await apiGet<any>(`/files/url/${id}`);
    const url = payload?.url ?? null;
    const type = payload?.type ?? undefined;
    const name = payload?.name ?? undefined;
    if (!url) throw new Error('No preview URL returned by /api/files/url/:id');
    setCachedUrl(id, { url, type, name });
    return { url, type, name };
  });
}

/**
 * Batch-presign GET URLs for many file ids (POST /api/files/urls).
 * Populates the same in-memory url cache used by getById.
 */
export async function getUrlsByIds(
  ids: string[]
): Promise<Record<string, string>> {
  const unique = [
    ...new Set(
      ids.map((id) => String(id ?? "").trim()).filter((id) => id && !id.startsWith("opt-"))
    ),
  ];
  if (unique.length === 0) return {};

  const fromCache: Record<string, string> = {};
  const missing: string[] = [];
  for (const id of unique) {
    const cached = getCachedUrl(id);
    if (cached?.url) fromCache[id] = cached.url;
    else missing.push(id);
  }
  if (missing.length === 0) return fromCache;

  const CHUNK = 40;
  const urls: Record<string, string> = { ...fromCache };
  for (let i = 0; i < missing.length; i += CHUNK) {
    const chunk = missing.slice(i, i + CHUNK);
    try {
      const payload = await apiPost<{ urls?: Record<string, string> }>(`/files/urls`, {
        ids: chunk,
      });
      const map = payload?.urls ?? {};
      for (const [id, url] of Object.entries(map)) {
        const clean = String(url ?? "").trim();
        if (!clean) continue;
        urls[id] = clean;
        setCachedUrl(id, { url: clean });
      }
    } catch (e) {
      logSafeWarn("[files] batch urls failed; callers may fall back to getById", e);
    }
  }
  return urls;
}

/**
 * Delete many by server UUID. Calls DELETE /api/files/:id per id (same as web and
 * deleteFileById). The old /api/file/delete batch route is not available on production.
 */
export async function deleteFiles(fileIds: string[]): Promise<{ okay: boolean }> {
  const ids = fileIds.map((x) => String(x).trim()).filter(Boolean);
  if (!ids.length) return { okay: true };
  const results = await Promise.allSettled(ids.map((id) => deleteFileById(id)));
  const failed = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
  if (failed.length === ids.length) {
    throw failed[0]?.reason ?? new Error("deleteFiles: all deletes failed");
  }
  return { okay: true };
}

/** PATCH /api/files/:id — rename a file or linq. */
export async function renameFile(
  fileId: string,
  name: string
): Promise<{ okay: boolean; name: string }> {
  const id = encodeURIComponent(String(fileId).trim());
  const next = String(name ?? "").trim();
  if (!id) throw new Error("Missing file id");
  if (!next) throw new Error("Missing name");
  return apiPatch<{ okay: boolean; name: string }>(`/files/${id}`, { name: next });
}
export async function deleteFileById(
  fileId: string
): Promise<{ okay: boolean; message?: string }> {
  const id = encodeURIComponent(String(fileId).trim());
  if (!id) throw new Error("Missing file id");
  return apiDelete<{ okay: boolean; message?: string }>(`/files/${id}`);
}

export type SearchHitFile = ServerFileRow & Record<string, unknown>;

export type SearchHitRow = {
  file: SearchHitFile;
  matchedIn: "name" | "content" | "linked-content";
  snippet: string | null;
  matchedChildName?: string;
};

/** GET /api/files/search?q=… — Bearer auth via api client (same as list/upload). */
export async function searchFiles(query: string): Promise<SearchHitRow[]> {
  const q = query.trim();
  if (!q) return [];
  const path = `/files/search?q=${encodeURIComponent(q)}`;
  const payload = await apiGet<{ data?: SearchHitRow[] }>(path);
  return Array.isArray(payload?.data) ? payload.data : [];
}

/** Fetch note content from a presigned URL */
export async function getNoteContent(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (res.ok) return await res.text();
    return null;
  } catch (err) {
    logSafeWarn('Failed to fetch note content', err);
    return null;
  }
}

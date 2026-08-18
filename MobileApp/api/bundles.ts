import { categoryFromExt, colorFromCategory } from '../utils/fileHelpers';
import * as filesApi from './files';
import { apiGet, apiPost, apiDelete } from './client';
import { dedupe } from '../utils/inflight';
import { isShareableEntryId } from '../utils/helpers';
import { idForLog, logSafeWarn } from '../utils/safeLog';

export async function createBundle(
  serverIds: string[],
  name?: string,
  /** Client-generated UUID — server stores this id so preview URL is stable offline. */
  bundleId?: string
): Promise<{
  okay: boolean
  message: string
  data: { bundle: any; links: any[] }
}> {
  const body: Record<string, unknown> = {
    file_ids: serverIds ?? [],
    name: String(name ?? "").trim() || "Untitled linq",
  };
  const clientId = String(bundleId ?? "").trim();
  if (clientId && isShareableEntryId(clientId)) {
    body.bundle_id = clientId;
  }
  return apiPost(`/files/connect`, body) as any
}

export async function addFilesToBundle(
  bundleId: string,
  fileIds: string[]
): Promise<{ message?: string }> {
  const id = String(bundleId ?? "").trim();
  const ids = (fileIds ?? []).map((x) => String(x).trim()).filter(Boolean);
  if (!id || ids.length === 0) return { message: "noop" };
  return apiPost(`/files/link`, {
    links: ids.map((file_to) => ({ file_from: id, file_to })),
  }) as any;
}

/** DELETE /api/files/link — remove children from a linq without deleting files. */
export async function removeFilesFromBundle(
  bundleId: string,
  fileIds: string[]
): Promise<{ okay?: boolean; message?: string }> {
  const id = String(bundleId ?? "").trim();
  const ids = (fileIds ?? []).map((x) => String(x).trim()).filter(Boolean);
  if (!id || ids.length === 0) return { okay: true, message: "noop" };
  return apiDelete(`/files/link`, {
    links: ids.map((file_to) => ({ file_from: id, file_to })),
  }) as any;
}

type FilesBundleResponse = {
  message: string;
  Parent: { id: string; type: string; [k: string]: unknown };
  Linked: Array<{
    url?: string | null;
    data: {
      id?: string | null;
      file_id?: string | null;
      type?: string | null;
      name?: string | null;
      creator_email?: string | null;
      createdAt?: string | null;
      [k: string]: unknown;
    };
  }>;
};

// ── getContents short-TTL cache ────────────────────────────────────────────
// Prevents double network calls when list refresh and modal open both request
// the same bundle within a short window (typically <90s).
// dedupe handles concurrent callers; this cache handles sequential callers.
type ContentsEntry = {
  data: { children?: any[]; files?: any[]; bundledFileIds?: string[]; bundledUrls?: string[] };
  cachedAt: number;
};
const contentsCache = new Map<string, ContentsEntry>();
const CONTENTS_TTL_MS = 90_000; // 90 seconds

function getCachedContents(bundleId: string): ContentsEntry['data'] | null {
  const entry = contentsCache.get(bundleId);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > CONTENTS_TTL_MS) {
    contentsCache.delete(bundleId);
    return null;
  }
  return entry.data;
}

/** Clear the entire getContents cache (call on logout). */
export function clearBundleContentsCache(): void {
  contentsCache.clear();
}

/** Invalidate a single bundle entry (call after mutation). */
export function invalidateBundleContentsCache(bundleId: string): void {
  contentsCache.delete(bundleId);
}

export function getContents(bundleId: string): Promise<{
  children?: any[];
  files?: any[];
  bundledFileIds?: string[];
  bundledUrls?: string[];
}> {
  // Return cached result if still fresh (avoids sequential double-fetch between
  // separateBundlesAndFiles and openBundleDetail quick prefetch / Phase B)
  const cached = getCachedContents(bundleId);
  if (cached) return Promise.resolve(cached);

  // Deduplicate concurrent callers for the same bundle (e.g. enrichment + modal open racing)
  return dedupe(`getContents:${bundleId}`, async () => {
  try {
    const resp = await apiGet<FilesBundleResponse>(`/files/${bundleId}`);

    const children = Array.isArray(resp?.Linked) ? resp.Linked : [];

    const bundledFileIds = children
      .map((c: any) =>
        String(
          c?.data?.id ??
          c?.data?.file_id ??
          c?.id ??
          c?.file_id ??
          ''
        ).trim()
      )
      .filter(Boolean);

    const bundledUrls = children
      .map((c: any) =>
        c?.url ??
        c?.data?.url ??
        c?.fileUrl ??
        c?.file_url ??
        c?.metadata?.url ??
        null
      )
      .filter(Boolean) as string[];

    // Maintain prior shape to avoid downstream changes:
    const result = { children, files: children, bundledFileIds, bundledUrls };
    contentsCache.set(bundleId, { data: result, cachedAt: Date.now() });
    return result;
  } catch (err) {
    logSafeWarn(`getContents id${idForLog(bundleId)} failed`, err);
    return {};
  }
  }); // end dedupe
}

// Data-aware helpers
const pick = (child: any, ...keys: string[]) => {
  for (const k of keys) {
    if (child?.data?.[k] != null) return child.data[k]; // prefer child.data.k
    if (child?.[k] != null) return child[k];            // fallback: child.k
  }
  return undefined;
};

const asId = (x: any) =>
  String(x?.data?.id ?? x?.id ?? x?.fileId ?? x?.file_id ?? x?.data_id ?? '').trim();

const asUrl = (x: any) =>
  x?.metadata?.url ??
  x?.url ??
  x?.fileUrl ??
  x?.file_url ??
  x?.data?.url ??    // include data.url
  null;

const decodeHtmlEntities = (s?: string | null) => {
  if (!s) return '';
  return s
    // double-encoded
    .replace(/&amp;quot;/g, '"')
    .replace(/&amp;#39;/g, "'")
    .replace(/&amp;lt;/g, '<')
    .replace(/&amp;gt;/g, '>')
    .replace(/&amp;amp;/g, '&')
    // single-encoded
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
};

/** Full, nested loader — string IDs and URL normalization */
export async function getNestedContents(bundleId: string, maxDepth = 1): Promise<{
  files: any[];
  bundledFileIds: string[];
  bundledUrls: string[];
}> {
  try {
    const base = await getContents(bundleId);
    if (!base.children || base.children.length === 0) {
      return { files: [], bundledFileIds: [], bundledUrls: [] };
    }

    const files = await Promise.all(
      base.children.map(async (child: any) => {
        const inferNestedItemIds = (node: any): string[] => {
          const out = new Set<string>();
          const pushId = (v: any) => {
            const id = String(v ?? '').trim();
            if (id) out.add(id);
          };
          const fromDirectIds = [
            ...(Array.isArray(node?.bundledFileIds) ? node.bundledFileIds : []),
            ...(Array.isArray(node?.data?.bundledFileIds) ? node.data.bundledFileIds : []),
            ...(Array.isArray(node?.children?.item_id) ? node.children.item_id : []),
            ...(Array.isArray(node?.data?.children?.item_id) ? node.data.children.item_id : []),
          ];
          fromDirectIds.forEach(pushId);

          const childArrays = [
            ...(Array.isArray(node?.children) ? node.children : []),
            ...(Array.isArray(node?.data?.children) ? node.data.children : []),
          ];
          childArrays.forEach((c: any) => pushId(asId(c)));
          return Array.from(out);
        };

        // Read type from data.* first
        const cat = categoryFromExt(pick(child, 'type'));
        const childId = asId(child) || undefined;

        // URL from any possible location + decode entities
        let fileUrl = decodeHtmlEntities(asUrl(child) ?? '');

        // Prefer fresh presigned URL for media
        if ((cat === 'PDF' || cat === 'Image') && childId) {
          try {
            const meta = await filesApi.getById(childId);
            if (meta?.url) {
              fileUrl = meta.url;
              // If backend converted type (e.g., HEIC->JPEG), sync back
              if (meta.type && meta.type !== pick(child, 'type')) {
                child.type = meta.type;
              }
            }
          } catch (e) {
            logSafeWarn(`getById id${idForLog(childId)} failed`, e);
          }
        }

        const childType = String(pick(child, 'type') ?? '').toLowerCase();
        const isNestedBundle = childType === 'bundle' || childType === 'link' || cat === 'Link';

        // The fields that were blank before – read from child.data.*
        const rawName = pick(child, 'name');
        const name = String(rawName ?? '').trim() || 'Untitled';

        const createdAt =
          String(pick(child, 'createdAt') ?? pick(child, 'created_at') ?? '') || '';

        const creator =
          String(
            pick(child, 'creator_email') ??
            pick(child, 'creator_username') ??
            pick(child, 'creator') ??
            ''
          ) || 'Unknown';

        // Notes: optionally fetch text
        let content: string | null = null;
        if (cat === 'Note' && fileUrl) {
          try {
            content = await filesApi.getNoteContent(fileUrl);
          } catch {}
        }

        // Nested recursion is depth-limited to avoid expensive full-tree hydration.
        let nestedFiles: any[] = [];
        let nestedBundledFileIds: string[] = [];
        let nestedBundledUrls: string[] = [];
        if (isNestedBundle && childId && maxDepth > 0) {
          const nested = await getNestedContents(childId, maxDepth - 1);
          nestedFiles = nested.files ?? [];
          nestedBundledFileIds = nested.bundledFileIds ?? [];
          nestedBundledUrls = nested.bundledUrls ?? [];
        }
        if (isNestedBundle && nestedBundledFileIds.length === 0) {
          nestedBundledFileIds = inferNestedItemIds(child);
        }
        const nestedCount = nestedFiles.length || nestedBundledFileIds.length;

        const cleanedName = (name === 'Bundle' || name === 'bundle') ? 'linq' : name;

        return {
          id: childId,                           // UUID string
          name: cleanedName,
          type: isNestedBundle ? 'Link' : cat,
          typeColor: isNestedBundle ? colorFromCategory('link') : colorFromCategory(cat),
          url: fileUrl,
          contentType: pick(child, 'type') ?? undefined,
          createdAt,                             // now filled
          creator,                               // now filled
          content: content ?? (isNestedBundle ? `linq containing ${nestedCount} file(s)` : undefined),
          ...(isNestedBundle && {
            files: nestedFiles,
            bundledFileIds: nestedBundledFileIds,
            bundledUrls: nestedBundledUrls,
            children: child?.children ?? { item_id: [] },
          }),
        };
      })
    );


    return {
      files,
      bundledFileIds: base.bundledFileIds ?? [],
      bundledUrls: base.bundledUrls ?? [],
    };
  } catch (err) {
    logSafeWarn(`nested bundle contents id${idForLog(bundleId)} failed`, err);
    return { files: [], bundledFileIds: [], bundledUrls: [] };
  }
}

/**
 * In-memory presigned URL cache keyed by file UUID.
 *
 * Presigned S3 URLs expire (usually 15 min – 1 hr depending on server config).
 * We use a conservative 5-minute TTL so we never serve an expired URL while
 * still saving a round-trip on the common case of reopening the same file.
 *
 * Max 300 entries; evicts the oldest when at capacity.
 */

const ENTRY_TTL_MS = 5 * 60 * 1_000; // 5 minutes
const MAX_ENTRIES = 300;

export type UrlEntry = {
  url: string;
  type?: string;
  name?: string;
  cachedAt: number;
};

const cache = new Map<string, UrlEntry>();

/** Return a cached entry if it exists and hasn't expired, otherwise null. */
export function getCachedUrl(fileId: string): UrlEntry | null {
  const e = cache.get(fileId);
  if (!e) return null;
  if (Date.now() - e.cachedAt > ENTRY_TTL_MS) {
    cache.delete(fileId);
    return null;
  }
  return e;
}

/** Store (or refresh) a URL entry. Evicts the oldest entry if at capacity. */
export function setCachedUrl(
  fileId: string,
  data: { url: string; type?: string; name?: string }
): void {
  if (cache.size >= MAX_ENTRIES && !cache.has(fileId)) {
    // Evict the single oldest entry
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [k, v] of cache) {
      if (v.cachedAt < oldestTime) {
        oldestTime = v.cachedAt;
        oldestKey = k;
      }
    }
    if (oldestKey) cache.delete(oldestKey);
  }
  cache.set(fileId, { ...data, cachedAt: Date.now() });
}

/** Remove a single entry (call after a known mutation, e.g. file replaced). */
export function invalidateCachedUrl(fileId: string): void {
  cache.delete(fileId);
}

/** Wipe the entire cache (call on logout). */
export function clearUrlCache(): void {
  cache.clear();
}

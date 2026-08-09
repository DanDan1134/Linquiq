/**
 * In-flight request deduplication.
 *
 * When multiple callers request the same key concurrently, only the first
 * actually kicks off the async work.  All subsequent callers receive the
 * same Promise so a single network round-trip satisfies everyone.
 *
 * Key conventions used across the app:
 *   "getById:<uuid>"
 *   "getContents:<bundleId>"
 *   "preview:<bundleId>"
 *   "noteContent:<fileId>"
 */

const inflight = new Map<string, Promise<any>>();

/**
 * If a Promise for `key` is already in-flight, return it.
 * Otherwise execute `fn`, store its Promise while it runs, then remove it.
 */
export function dedupe<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;

  const p = fn().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

/** Force-clear a single key (e.g. after an error you want to retry). */
export function clearInflight(key: string): void {
  inflight.delete(key);
}

/** Clear all in-flight entries (e.g. on logout). */
export function clearAllInflight(): void {
  inflight.clear();
}

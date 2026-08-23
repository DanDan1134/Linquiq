/**
 * Must be the canonical host. `linquiq.com` answers every /api call with a 308 to
 * `www.linquiq.com`, and iOS URLSession drops `Authorization` across that origin
 * change — so the retried request arrives unauthenticated and the API returns 401.
 */
export const API_BASE = "https://www.linquiq.com"; // Production (no trailing slash)

/** Ceiling for any single API call so a stalled request can't wedge sync forever. */
const REQUEST_TIMEOUT_MS = 30_000;

// ---- Token getter ----
let getTokenFn: (opts?: any) => Promise<string | null> = async () => null;
export function setTokenGetter(fn: typeof getTokenFn) {
  getTokenFn = fn;
  cachedAuth = null;
}

export function clearTokenCache() {
  cachedAuth = null;
}

/** Reuse JWT briefly during sync bursts to avoid Clerk round-trips per N+1 call. */
const TOKEN_CACHE_TTL_MS = 10_000;
let cachedAuth: { jwt: string; at: number } | null = null;

/** Clerk's getToken can stay pending indefinitely after a sign-out/sign-in cycle. */
const TOKEN_TIMEOUT_MS = 15_000;

/**
 * Race a promise against a timer without leaking the loser.
 * An uncleared `reject()` after getToken wins becomes an unhandled rejection
 * in Expo Go and kills the JS runtime mid-sync.
 */
async function raceWithTimeout<T>(
  work: Promise<T>,
  ms: number,
  label: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms / 1000}s`)),
      ms
    );
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
    work.catch(() => undefined);
  }
}

async function authHeader(): Promise<Record<string, string>> {
  const now = Date.now();
  if (cachedAuth && now - cachedAuth.at < TOKEN_CACHE_TTL_MS) {
    return { Authorization: `Bearer ${cachedAuth.jwt}` };
  }
  // Fresh token when cache misses — avoids stale/empty sessions after Clerk domain/key changes.
  const jwt = await raceWithTimeout(
    Promise.resolve(getTokenFn?.({ skipCache: true }) ?? null),
    TOKEN_TIMEOUT_MS,
    "Clerk getToken"
  );
  if (!jwt) {
    cachedAuth = null;
    console.warn(
      "[api] no Clerk session token — sign out and sign in again, and confirm mobile publishable key matches Vercel CLERK keys"
    );
    return {};
  }
  cachedAuth = { jwt, at: now };
  return { Authorization: `Bearer ${jwt}` };
}

// ---- URL helpers ----
const API_PREFIX = "/api";
function ensureLeadingSlash(path: string) {
  return path.startsWith("/") ? path : `/${path}`;
}
function buildApiUrl(path: string) {
  const p = ensureLeadingSlash(path);
  // If caller already passed /api/..., don't double-prefix
  return p.startsWith(API_PREFIX) ? `${API_BASE}${p}` : `${API_BASE}${API_PREFIX}${p}`;
}
function buildSiteUrl(path: string) {
  return `${API_BASE}${ensureLeadingSlash(path)}`;
}

function parseJsonOrThrow(path: string, status: number, text: string): any {
  const trimmed = text.trimStart();
  if (!trimmed) {
    throw new Error(`${path} failed: ${status} (empty body)`);
  }
  // HTML (Clerk redirect / Next error page) starts with < — never treat as JSON.
  if (trimmed.startsWith("<")) {
    throw new Error(
      `${path} returned HTML instead of JSON (${status}). ` +
        `API_BASE=${API_BASE}. Usually auth failed (Clerk keys on phone must match Vercel) ` +
        `or the API redirected to a web page.`
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${path} failed: ${status} invalid JSON: ${text.slice(0, 120)}`);
  }
}

/**
 * One authenticated API call, body included, under a single timeout.
 * Reading the body is inside the timeout too — a stalled response stream is just
 * as capable of freezing sync as a stalled request.
 */
async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = {
    ...(await authHeader()),
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (!headers.Authorization) {
    throw new Error(
      `${path} failed: no Clerk token (not signed in, or tokenCache empty after key/domain change — sign out and sign in)`
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const url = buildApiUrl(path);
    const res = await fetch(url, { ...init, headers, signal: controller.signal });
    const text = await res.text().catch(() => "");

    // A redirect that survives to here means fetch changed origin; iOS will have
    // dropped Authorization on the way, so report the real cause instead of "401".
    const finalUrl = String((res as { url?: string }).url ?? "");
    if (finalUrl && !finalUrl.startsWith(API_BASE)) {
      throw new Error(
        `${path} was redirected from ${API_BASE} to ${finalUrl} — auth headers are lost across origins. Point API_BASE at the canonical host.`
      );
    }
    if (!res.ok) {
      throw new Error(`${path} failed: ${res.status} ${text.slice(0, 200)}`);
    }
    return parseJsonOrThrow(path, res.status, text) as T;
  } catch (err) {
    if ((err as { name?: string })?.name === "AbortError") {
      throw new Error(`${path} timed out after ${REQUEST_TIMEOUT_MS / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ---- JSON helpers (API) ----
export async function apiGet<T>(path: string): Promise<T> {
  return requestJson<T>(path);
}
export async function apiPost<T>(path: string, payload: unknown): Promise<T> {
  return requestJson<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
export async function apiPatch<T>(path: string, payload: unknown): Promise<T> {
  return requestJson<T>(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
export async function apiDelete<T>(path: string, payload?: unknown): Promise<T> {
  return requestJson<T>(path, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: payload ? JSON.stringify(payload) : undefined,
  });
}

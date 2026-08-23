export const API_BASE = "https://linquiq.com"; // Production (no trailing slash)

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

async function authHeader(): Promise<Record<string, string>> {
  const now = Date.now();
  if (cachedAuth && now - cachedAuth.at < TOKEN_CACHE_TTL_MS) {
    return { Authorization: `Bearer ${cachedAuth.jwt}` };
  }
  // Fresh token when cache misses — avoids stale/empty sessions after Clerk domain/key changes.
  const jwt = await getTokenFn?.({ skipCache: true });
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

async function fetchApi(path: string, init?: RequestInit): Promise<Response> {
  const headers = {
    ...(await authHeader()),
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (!headers.Authorization) {
    throw new Error(
      `${path} failed: no Clerk token (not signed in, or tokenCache empty after key/domain change — sign out and sign in)`
    );
  }
  return fetch(buildApiUrl(path), { ...init, headers });
}

// ---- JSON helpers (API) ----
export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetchApi(path);
  const text = await res.text().catch(() => "");
  if (!res.ok) throw new Error(`${path} failed: ${res.status} ${text.slice(0, 200)}`);
  return parseJsonOrThrow(path, res.status, text) as T;
}
export async function apiPost<T>(path: string, payload: unknown): Promise<T> {
  const res = await fetchApi(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await res.text().catch(() => "");
  if (!res.ok) throw new Error(`${path} failed: ${res.status} ${text.slice(0, 200)}`);
  return parseJsonOrThrow(path, res.status, text) as T;
}
export async function apiPatch<T>(path: string, payload: unknown): Promise<T> {
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetchApi(path, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await res.text().catch(() => "");
    if (!res.ok) throw new Error(`${path} failed: ${res.status} ${text.slice(0, 200)}`);
    return parseJsonOrThrow(path, res.status, text) as T;
  } finally {
    clearTimeout(to);
  }
}
export async function apiDelete<T>(path: string, payload?: unknown): Promise<T> {
  const res = await fetchApi(path, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const text = await res.text().catch(() => "");
  if (!res.ok) throw new Error(`${path} failed: ${res.status} ${text.slice(0, 200)}`);
  return parseJsonOrThrow(path, res.status, text) as T;
}

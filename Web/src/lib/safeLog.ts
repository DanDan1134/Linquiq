/** Safe logging helpers — avoid leaking ids, keys, tokens, or full error objects. */

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 200);
  return String(error ?? "unknown").slice(0, 200);
}

/** Last n chars of an id for log correlation without exposing full UUIDs. */
export function idForLog(id: unknown, n = 6): string {
  const s = String(id ?? "").trim();
  if (!s) return "?";
  if (s.length <= n) return "…";
  return `…${s.slice(-n)}`;
}

export function logSafeWarn(context: string, error?: unknown): void {
  if (error === undefined) {
    console.warn(`[${context}]`);
    return;
  }
  console.warn(`[${context}] ${errorMessage(error)}`);
}

export function logSafeError(context: string, error?: unknown): void {
  logSafeWarn(context, error);
}

export function devLog(...args: unknown[]): void {
  if (process.env.NODE_ENV === "development") {
    console.log(...args);
  }
}

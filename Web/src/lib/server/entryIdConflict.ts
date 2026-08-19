/** Thrown when a client-supplied entry UUID belongs to another user. */
export class EntryIdConflictError extends Error {
  constructor() {
    super("ENTRY_ID_CONFLICT");
    this.name = "EntryIdConflictError";
  }
}

export function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: string }).code;
  if (code === "23505") return true;
  const msg = err instanceof Error ? err.message.toLowerCase() : "";
  return msg.includes("unique") || msg.includes("duplicate");
}

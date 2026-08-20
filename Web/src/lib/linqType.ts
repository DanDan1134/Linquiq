/** Canonical DB / API type for a linq (linked collection). */
export const LINQ_TYPE = "linq" as const;

/** Default display + stored name when the user leaves a linq unnamed. */
export const DEFAULT_LINQ_NAME = "linq" as const;

const ENTRY_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Postgres `entries.id` is uuid — skip the query instead of throwing. */
export function isEntryUuid(id: unknown): boolean {
  return ENTRY_UUID_RE.test(String(id ?? "").trim());
}

/** Legacy rows may still be stored as Link or bundle. */
export function isLinqType(type: unknown): boolean {
  const t = String(type ?? "").toLowerCase();
  return t === "linq" || t === "link" || t === "bundle";
}

/** Placeholder names that should display as the default linq title. */
export function isGenericLinqName(name: unknown): boolean {
  const n = String(name ?? "").trim().toLowerCase();
  return (
    !n ||
    n === "linq" ||
    n === "link" ||
    n === "bundle" ||
    n === "untitled linq"
  );
}

/** Legacy auto titles like "3 items · pdf, note". */
export function looksLikeAutoDerivedLinqTitle(name: unknown): boolean {
  const n = String(name ?? "").trim();
  return /^\d+\s+items?\s*(·|$)/i.test(n);
}

/** Stored + displayed linq title: user name, else {@link DEFAULT_LINQ_NAME}. */
export function resolveLinqDisplayName(name: unknown): string {
  const trimmed = String(name ?? "").trim().slice(0, 80);
  if (
    !trimmed ||
    isGenericLinqName(trimmed) ||
    looksLikeAutoDerivedLinqTitle(trimmed)
  ) {
    return DEFAULT_LINQ_NAME;
  }
  return trimmed;
}

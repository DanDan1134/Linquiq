/** Same-origin file bytes. Browser address bar never shows the S3 URL. */
export function privateFileSrc(fileId?: string | null): string | undefined {
  const id = String(fileId ?? "").trim();
  if (!id) return undefined;
  return `/api/files/content/${encodeURIComponent(id)}`;
}

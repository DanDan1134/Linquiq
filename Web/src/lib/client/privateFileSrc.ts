/** Same-origin file bytes. Browser address bar never shows the S3 URL. */
export function privateFileSrc(fileId?: string | null): string | null {
  const id = String(fileId ?? "").trim();
  if (!id) return null;
  return `/api/files/content/${encodeURIComponent(id)}`;
}

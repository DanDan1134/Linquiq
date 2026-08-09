export const MAX_UPLOAD_COUNT = 10;
export const MAX_FILE_BYTES = 50 * 1024 * 1024;

export const ALLOWED_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "mp4",
  "webm",
  "ogg",
  "mp3",
  "wav",
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "pptx",
  "txt",
  "text",
  "md",
]);

/** True when count is an integer in 1..MAX_UPLOAD_COUNT. */
export function isValidUploadCount(count: unknown): count is number {
  if (typeof count === "string") {
    if (!/^\d+$/.test(count.trim())) return false;
    const n = parseInt(count, 10);
    return Number.isInteger(n) && n >= 1 && n <= MAX_UPLOAD_COUNT;
  }
  return typeof count === "number" && Number.isInteger(count) && count >= 1 && count <= MAX_UPLOAD_COUNT;
}

/** Extension from a basename (no path). Empty if none. */
export function getFileExtension(fileName: string): string {
  const base = fileName.split(/[/\\]/).pop() ?? fileName;
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return "";
  return base.slice(dot + 1).toLowerCase();
}

/** Reject path traversal, empty names, and disallowed extensions. */
export function isAllowedFileName(fileName: string): boolean {
  if (typeof fileName !== "string" || fileName.trim() === "") return false;
  if (fileName.includes("..") || fileName.includes("/") || fileName.includes("\\")) {
    return false;
  }
  const ext = getFileExtension(fileName);
  return ext !== "" && ALLOWED_EXTENSIONS.has(ext);
}

export function isAllowedFileSize(bytes: number | undefined | null): boolean {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return false;
  return bytes <= MAX_FILE_BYTES;
}

export const MAX_UPLOAD_COUNT = 10;
export const MAX_FILE_BYTES = 50 * 1024 * 1024;
/** Max chars kept from text files for search extracts. */
export const SEARCH_EXTRACT_MAX_CHARS = 64 * 1024;
/** Max search query length. */
export const MAX_SEARCH_QUERY_CHARS = 100;

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

/** Canonical MIME for each allowed extension (used when signing PUTs). */
export const EXTENSION_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  mp4: "video/mp4",
  webm: "video/webm",
  ogg: "audio/ogg",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
  text: "text/plain",
  md: "text/markdown",
};

/** Alternate MIME types clients may send that still match the extension. */
const EXTENSION_MIME_ALIASES: Record<string, string[]> = {
  jpg: ["image/jpeg", "image/jpg"],
  jpeg: ["image/jpeg", "image/jpg"],
  png: ["image/png"],
  gif: ["image/gif"],
  webp: ["image/webp"],
  mp4: ["video/mp4"],
  webm: ["video/webm"],
  ogg: ["audio/ogg", "video/ogg", "application/ogg"],
  mp3: ["audio/mpeg", "audio/mp3"],
  wav: ["audio/wav", "audio/x-wav", "audio/wave"],
  pdf: ["application/pdf"],
  doc: ["application/msword"],
  docx: [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  xls: ["application/vnd.ms-excel"],
  xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  pptx: [
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ],
  txt: ["text/plain"],
  text: ["text/plain"],
  md: ["text/markdown", "text/x-markdown", "text/plain"],
};

/** True when count is an integer in 1..MAX_UPLOAD_COUNT. */
export function isValidUploadCount(count: unknown): count is number {
  if (typeof count === "string") {
    if (!/^\d+$/.test(count.trim())) return false;
    const n = parseInt(count, 10);
    return Number.isInteger(n) && n >= 1 && n <= MAX_UPLOAD_COUNT;
  }
  return (
    typeof count === "number" &&
    Number.isInteger(count) &&
    count >= 1 &&
    count <= MAX_UPLOAD_COUNT
  );
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
  if (
    fileName.includes("..") ||
    fileName.includes("/") ||
    fileName.includes("\\")
  ) {
    return false;
  }
  const ext = getFileExtension(fileName);
  return ext !== "" && ALLOWED_EXTENSIONS.has(ext);
}

export function isAllowedFileSize(bytes: number | undefined | null): boolean {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return false;
  return bytes <= MAX_FILE_BYTES;
}

export function normalizeMimeType(contentType: string | null | undefined): string {
  const raw = String(contentType ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  return raw;
}

/** Canonical MIME for an allowed filename, or null if extension is unknown. */
export function mimeForFileName(fileName: string): string | null {
  const ext = getFileExtension(fileName);
  return EXTENSION_TO_MIME[ext] ?? null;
}

/** True when Content-Type is allowed for this filename's extension. */
export function isContentTypeAllowedForFileName(
  fileName: string,
  contentType: string | null | undefined
): boolean {
  const ext = getFileExtension(fileName);
  if (!ALLOWED_EXTENSIONS.has(ext)) return false;
  const mime = normalizeMimeType(contentType);
  if (!mime || mime === "application/octet-stream" || mime === "text/html") {
    return false;
  }
  const allowed = EXTENSION_MIME_ALIASES[ext] ?? [];
  return allowed.includes(mime);
}

export type UploadFileMeta = {
  fileName: string;
  contentType: string;
  contentLength: number;
};

/** Validate one upload descriptor before issuing a presigned PUT. */
export function validateUploadMeta(meta: unknown): UploadFileMeta {
  if (!meta || typeof meta !== "object") {
    throw new Error("INVALID_UPLOAD_META");
  }
  const row = meta as Record<string, unknown>;
  const fileName = String(row.fileName ?? "").trim();
  const contentType = normalizeMimeType(String(row.contentType ?? ""));
  const contentLength = Number(row.contentLength);

  if (!isAllowedFileName(fileName)) {
    throw new Error("INVALID_FILE_NAME");
  }
  if (!Number.isFinite(contentLength) || !Number.isInteger(contentLength)) {
    throw new Error("INVALID_CONTENT_LENGTH");
  }
  if (!isAllowedFileSize(contentLength)) {
    throw new Error("FILE_TOO_LARGE");
  }
  if (!isContentTypeAllowedForFileName(fileName, contentType)) {
    throw new Error("INVALID_CONTENT_TYPE");
  }

  // Prefer canonical MIME for signing so client/server headers match.
  const canonical = mimeForFileName(fileName)!;
  return {
    fileName,
    contentType: canonical,
    contentLength,
  };
}

/**
 * Magic-byte check for high-risk types. Returns true when the buffer matches
 * the expected format for the extension, or when no magic check applies.
 */
export function matchesMagicBytes(
  fileName: string,
  header: Uint8Array | null | undefined
): boolean {
  const ext = getFileExtension(fileName);
  if (!header || header.length === 0) {
    // Only enforce magic where we can sniff; missing header fails closed for sniffable types.
    return !["pdf", "jpg", "jpeg", "png", "gif", "webp"].includes(ext);
  }

  const startsWith = (bytes: number[]) =>
    bytes.every((b, i) => header[i] === b);

  const asAscii = (start: number, len: number) =>
    String.fromCharCode(...header.slice(start, start + len));

  switch (ext) {
    case "pdf":
      return asAscii(0, 4) === "%PDF";
    case "jpg":
    case "jpeg":
      return startsWith([0xff, 0xd8, 0xff]);
    case "png":
      return startsWith([0x89, 0x50, 0x4e, 0x47]);
    case "gif":
      return asAscii(0, 4) === "GIF8";
    case "webp":
      return asAscii(0, 4) === "RIFF" && asAscii(8, 4) === "WEBP";
    default:
      return true;
  }
}

export function isTextSearchableExtension(ext: string): boolean {
  return ext === "txt" || ext === "text" || ext === "md";
}

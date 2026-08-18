// File extension sets for categorization
import { logSafeWarn } from "./safeLog";
const IMG_EXT = new Set(["jpg", "jpeg", "png", "gif", "bmp", "webp", "heic", "heif"]);
const AUD_EXT = new Set(["mp3", "m4a", "aac", "wav", "ogg", "caf"]);
const VID_EXT = new Set(["mp4", "mov", "webm", "m4v", "avi", "wmv"]);

/**
 * Categorizes a file based on its server type string or file extension.
 * Accepts backend type values ("link", "bundle", "linq", "note", "image", …)
 * as well as plain file extensions ("jpg", "mp3", "pdf", …).
 * Never match "link"/"bundle"/"linq" as a substring — only exact match.
 */
export function categoryFromExt(ext?: string): string {
  const e = (ext || "").toLowerCase().trim();
  // Linq / bundle types — exact match only
  if (e === "link" || e === "bundle" || e === "linq") return "Link";
  // Explicit backend note type
  if (e === "note") return "Note";
  if (IMG_EXT.has(e) || e === "image") return "Image";
  if (AUD_EXT.has(e) || e === "audio" || e === "recording") return "Audio";
  if (VID_EXT.has(e) || e === "video") return "Video";
  if (e === "pdf") return "PDF";
  if (e === "md" || e === "txt" || e === "rtf") return "Note";
  return e || "File";
}

/**
 * Gets the color associated with a file category
 */
export function colorFromCategory(cat: string): string {
  switch (cat) {
    case "Image":
      return "blue";
    case "Audio":
      return "red";
    case "Video":
      return "orange";
    case "Note":
      return "green";
    case "PDF":
      return "yellow";
    case "File":
      return "yellow";
    case "Link":
      return "button-border-color"; // #d7827e
    default:
      return "yellow"; // Default to yellow for File
  }
}

/**
 * Determines media type (audio/video) from extension
 */
export function mediaTypeFromExt(ext?: string): "audio" | "video" | undefined {
  const e = (ext || "").toLowerCase();
  if (VID_EXT.has(e)) return "video";
  if (AUD_EXT.has(e)) return "audio";
  return undefined;
}

/**
 * Extracts file extension from URI
 */
export function pickExtensionFromUri(uri: string, fallback: string): string {
  try {
    const m = uri.split("?")[0].match(/\.([a-zA-Z0-9]+)$/);
    return m ? `.${m[1].toLowerCase()}` : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Gets a default filename based on file type
 * @param isUploadedAudio - If true, returns "Audio" instead of "Voice Memo" for audio files
 */
export function getDefaultFileName(
  fileType: "note" | "image" | "photo" | "audio" | "video" | "document",
  extension: string,
  isUploadedAudio: boolean = false
): string {
  const ext = extension.startsWith(".") ? extension : `.${extension}`;
  
  switch (fileType) {
    case "note":
      return `Note${ext}`;
    case "image":
      return `Image${ext}`;
    case "photo":
      return `Photo${ext}`;
    case "audio":
      // Use "Audio" for uploaded audio files, "Voice Memo" for recorded ones
      return isUploadedAudio ? `Audio${ext}` : `Voice Memo${ext}`;
    case "video":
      return `Video${ext}`;
    case "document":
      return `Document${ext}`; // Documents keep original name, this is a fallback
    default:
      return `File${ext}`;
  }
}

/**
 * Checks if a file extension is an audio file
 */
export function isAudioExtension(ext: string): boolean {
  const e = ext.toLowerCase().replace(/^\./, ""); // Remove leading dot if present
  return AUD_EXT.has(e);
}

export type HeicHints = { mimeType?: string | null; fileName?: string | null };

/**
 * True when the asset is HEIC/HEIF (by MIME, filename, URI path, or extension).
 * Library URIs often omit `.heic` in the path — use picker `mimeType` / `fileName` when available.
 */
export function isHeicSource(uri: string, hints?: HeicHints): boolean {
  const mime = String(hints?.mimeType ?? "").toLowerCase();
  if (mime.includes("heic") || mime.includes("heif")) return true;
  const name = String(hints?.fileName ?? "").toLowerCase();
  if (/\.hei[cf]$/i.test(name)) return true;
  const ext = pickExtensionFromUri(uri, "").toLowerCase();
  if (ext === ".heic" || ext === ".heif") return true;
  const u = uri.toLowerCase();
  if (u.includes(".heic") || u.includes(".heif")) return true;
  return false;
}

/**
 * Converts HEIC/HEIF to JPEG for PC/web compatibility and to avoid upload OOM (blob fallback).
 * Caps max width to reduce native decode memory on large photos.
 */
export async function convertHeicToJpeg(
  uri: string,
  hints?: HeicHints
): Promise<string> {
  if (!isHeicSource(uri, hints)) {
    return uri;
  }
  try {
    const { manipulateAsync, SaveFormat } = await import("expo-image-manipulator");
    const opts = { compress: 0.88, format: SaveFormat.JPEG };
    try {
      const out = await manipulateAsync(
        uri,
        [{ resize: { width: 4096 } }],
        opts
      );
      return out.uri;
    } catch {
      const out = await manipulateAsync(uri, [], opts);
      return out.uri;
    }
  } catch (error) {
    logSafeWarn("Failed to convert HEIC/HEIF to JPEG, using original", error);
    return uri;
  }
}

/** `.jpg` name for uploads when the source was HEIC/HEIF. */
export function jpgNameFromHeicUploadName(suggestedName: string): string {
  const trimmed = suggestedName.trim();
  const withoutHeic = trimmed.replace(/\.hei[cf]$/i, "");
  const stem = withoutHeic.includes(".")
    ? withoutHeic.replace(/\.[^/.]+$/, "")
    : withoutHeic;
  const safe = stem.trim() || "Image";
  return `${safe}.jpg`;
}


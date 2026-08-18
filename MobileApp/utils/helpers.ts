/**
 * Helper Functions
 *
 * Utility functions used throughout the app:
 * - getTypeColor: Maps file type strings to Tailwind CSS color classes
 * - copyToClipboard: Copies text to clipboard; parent shows "Copied!" for 2s via setCopyPressed
 */
import { categoryFromExt } from "./fileHelpers";
import { API_BASE } from "../api/client";
import * as Crypto from "expo-crypto";
import { logSafeWarn } from "./safeLog";

/** Shown when offline with no on-device copy for image/PDF inline preview (iOS + Android). */
export const OFFLINE_PREVIEW_MESSAGE = "Can't view in offline mode";

/** @deprecated Use OFFLINE_PREVIEW_MESSAGE */
export const OFFLINE_IOS_PREVIEW_MESSAGE = OFFLINE_PREVIEW_MESSAGE;

/** True when image/PDF preview must be blocked (offline, no local file). */
export function isOfflineImageOrPdfPreviewBlocked(
  isOnline: boolean,
  localUri: string | undefined,
  isImagePreview: boolean,
  isPdfPreview: boolean
): boolean {
  if (isOnline) return false;
  if (localUri && String(localUri).trim() !== "") return false;
  return isImagePreview || isPdfPreview;
}

/** Postgres / shareable entry id shape (UUID). */
const SHAREABLE_ENTRY_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** New offline file id — same UUID the server will store, so preview URL matches. */
export function newLocalFileId(): string {
  return Crypto.randomUUID();
}

/** True when id can be used in `/preview/{id}` (real UUID, not legacy `opt-…`). */
export function isShareableEntryId(fileId?: string | null): boolean {
  return SHAREABLE_ENTRY_ID_RE.test(String(fileId ?? "").trim());
}

/** Legacy offline placeholder ids (`opt-…`, `opt-linq-…`). */
export function isLegacyOptId(fileId?: string | null): boolean {
  return String(fileId ?? "").startsWith("opt-");
}

/**
 * Shareable preview URL. Same string offline and online once the id is a UUID.
 * Empty for legacy `opt-` placeholders (no stable server id yet).
 */
export function getFilePreviewUrl(fileId?: string | null): string {
  const id = String(fileId ?? "").trim();
  if (!isShareableEntryId(id)) return "";
  return `${API_BASE}/preview/${id}`;
}

/**
 * True when a URI is the website HTML preview page (`/preview/{id}`), not binary media.
 * RN Image / PDF WebView cannot render that Clerk-auth page.
 */
export function isSitePreviewUrl(uri?: string | null): boolean {
  const u = String(uri ?? "").trim();
  if (!u) return false;
  try {
    const path = u.split("?")[0].toLowerCase();
    return /\/preview\/[^/]+\/?$/.test(path);
  } catch {
    return false;
  }
}

/**
 * Clickable only when the entry is synced and the device is online.
 * Pending uploads still show the URL as plain text via getFilePreviewUrlLabel.
 */
export function isFilePreviewUrlLive(
  fileId?: string | null,
  opts?: {
    /** Pending local upload (dirty / not yet verified). */
    pending?: boolean;
    dirty?: number | boolean;
    isOnline?: boolean;
  }
): boolean {
  if (!isShareableEntryId(fileId)) return false;
  if (opts?.pending === true) return false;
  if (opts?.dirty === 1 || opts?.dirty === true) return false;
  if (opts?.isOnline === false) return false;
  return true;
}

/**
 * Shareable preview URL for display/copy. Same as getFilePreviewUrl — only real
 * UUIDs, never legacy `opt-…` placeholders.
 */
export function getFilePreviewUrlLabel(fileId?: string | null): string {
  return getFilePreviewUrl(fileId);
}
/**
 * Maps file type color strings to Tailwind CSS color classes
 * 
 * Color to File Type Mapping:
 * - "button-border-color" -> Link/Bundle file type
 * - "green" -> Note file type (.md, .txt, .rtf)
 * - "orange" -> Video file type (.mp4, .mov, .webm, etc.)
 * - "red" -> Audio file type (.mp3, .m4a, .wav, etc.)
 * - "blue" -> Image file type (.jpg, .png, .gif, etc.)
 * - "yellow" -> PDF file type or generic File type
 * - default -> Black (fallback for unknown types)
 */
export const getTypeColor = (color: string) => {
  switch (color) {
    // Button Border Color - Used for Link/Bundle file type
    case "button-border-color":
      return "bg-button-outline";
    // Green - Used for Note file type (.md, .txt, .rtf)
    case "green":
      return "bg-green-500";
    // Orange - Used for Video file type (.mp4, .mov, .webm, etc.)
    case "orange":
      return "bg-orange-500";
    // Red - Used for Audio file type (.mp3, .m4a, .wav, etc.)
    case "red":
      return "bg-red-500";
    // Blue - Used for Image file type (.jpg, .png, .gif, etc.)
    case "blue":
      return "bg-blue-500";
    // Yellow - Used for PDF file type or generic File type
    case "yellow":
      return "bg-yellow-500";
    // Default — show yellow (same as "Other/generic file") instead of black.
    // This covers missing or unrecognised typeColor values so dots are never invisible.
    default:
      return "bg-yellow-500";
  }
};

/** Horizontal gap after Copy / before Expand (keeps adjacent buttons' real boxes apart). */
export const HEADER_ACTION_SEPARATOR = 14;

/** Extra gap between fullscreen/expand and the close (×) control. */
export const HEADER_EXPAND_TO_CLOSE_GAP = 20;

/**
 * Apple HIG / Material minimum comfortable touch target (44pt iOS / 48dp Android).
 * Buttons should meet this with their real drawn size — no hitSlop. hitSlop can
 * overlap a neighbor's slop zone, or go stale after RN's Modal-stacking touch bug,
 * both of which make taps miss or land on the wrong control.
 */
export const MIN_TOUCH_SIZE = 52;

const COPY_SUCCESS_FEEDBACK_MS = 2000;

/** Copies URL to clipboard; on success toggles `setCopyPressed(true)` so UI can show "Copied!" for 2s. */
export const copyToClipboard = (
  url: string,
  setCopyPressed: (pressed: boolean) => void
) => {
  try {
    const { Clipboard } = require("react-native");
    Clipboard.setString(url);
    setCopyPressed(true);
    setTimeout(() => setCopyPressed(false), COPY_SUCCESS_FEEDBACK_MS);
  } catch (err) {
    logSafeWarn("Failed to copy to clipboard", err);
    setCopyPressed(false);
  }
};

// Function to format a Date object to a string in the format "MM/DD/YYYY HH:MM AM/PM"
export const formatDateTime = (date: Date): string => {
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  const year = date.getFullYear();
  
  let hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  hours = hours ? hours : 12; // the hour '0' should be '12'
  const formattedHours = hours.toString().padStart(2, "0");
  
  return `${month}/${day}/${year} ${formattedHours}:${minutes}${ampm}`;
};

/**
 * Linq detail "Created:" line — e.g. `5/3/2026, 11:09:35 AM` (en-US).
 * Falls back to `date` string when `createdAt` is missing or invalid.
 */
export function formatLinqCreatedDisplay(
  createdAt?: string | number | Date | null,
  dateFallback?: string | null
): string {
  if (createdAt != null && createdAt !== "") {
    const d = new Date(createdAt);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleString("en-US", {
        month: "numeric",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      });
    }
  }
  return String(dateFallback ?? "").trim();
}

const _iso = (createdAt: unknown): string => {
  if (createdAt == null || createdAt === "") return "";
  const d = new Date(createdAt as string | number | Date);
  return !Number.isNaN(d.getTime()) ? d.toISOString() : "";
};

/** Parsed linq metadata for UI rows or plain-text blocks. */
export type LinqDetailFields = {
  fileId: string;
  created: string;
  utc: string;
  creator: string;
};

export function getLinqDetailFields(params: {
  id?: string | null;
  createdAt?: string | number | Date | null;
  date?: string | null;
  creator?: string | null;
}): LinqDetailFields {
  return {
    fileId: String(params.id ?? "").trim(),
    created: formatLinqCreatedDisplay(params.createdAt, params.date),
    utc: _iso(params.createdAt),
    creator: String(params.creator ?? "").trim(),
  };
}

/**
 * Four-line linq header block (BundleModal top + FileDetailModal linq rows).
 *
 * ```
 * File ID: …
 * Created: …
 * UTC: …
 * Creator: …
 * ```
 */
export function formatLinqDetailBlock(params: {
  id?: string | null;
  createdAt?: string | number | Date | null;
  date?: string | null;
  creator?: string | null;
}): string {
  const f = getLinqDetailFields(params);
  const urlLine = getFilePreviewUrl(params.id)
    ? `URL: ${getFilePreviewUrl(params.id)}`
    : getFilePreviewUrlLabel(params.id)
      ? `URL: ${getFilePreviewUrlLabel(params.id)}`
      : "";
  return [
    `File ID: ${f.fileId}`,
    urlLine,
    `Created: ${f.created}`,
    `UTC: ${f.utc}`,
    `Creator: ${f.creator}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Strip HTML tags and collapse all whitespace to single space (for search) */
export const stripHtml = (html: string | null | undefined): string => {
  if (html == null || typeof html !== "string") return "";
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
};

/** Strip HTML but preserve newlines for display (e.g. notes in Linqs) */
export const stripHtmlPreserveNewlines = (html: string | null | undefined): string => {
  if (html == null || typeof html !== "string") return "";
  let s = html;
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<\/p>\s*<p[^>]*>/gi, "\n\n");
  s = s.replace(/<\/div>\s*<div[^>]*>/gi, "\n\n");
  s = s.replace(/<\/p>/gi, "\n");
  s = s.replace(/<\/div>/gi, "\n");
  s = s.replace(/<[^>]*>/g, "");
  s = s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
  return s.trim();
};

/** Characters unsafe in filenames on common platforms */
const FILENAME_FORBIDDEN = /[\\/:*?"<>|]/g;

/** Plain text from note body for naming: strip HTML, collapse whitespace (Linquiq web–style). */
export function plainTextForNoteFileName(raw: string | null | undefined): string {
  if (raw == null || typeof raw !== "string") return "";
  return stripHtml(raw).replace(/\s+/g, " ").trim();
}

const NOTE_FILENAME_BASE_MAX_LEN = 18;

/**
 * Base name for stored note file (no extension). First ~18 chars of plain text, sanitized.
 * Empty → "Untitled Note". Matches web TextEditor save behavior in spirit.
 */
export function deriveNoteStorageBaseName(body: string | null | undefined): string {
  const plain = plainTextForNoteFileName(body ?? "");
  if (!plain) return "Untitled Note";
  let base = plain.slice(0, NOTE_FILENAME_BASE_MAX_LEN);
  base = base.replace(FILENAME_FORBIDDEN, "-").trim();
  return base || "Untitled Note";
}

/** Full upload filename, e.g. `My first words.txt` (web uses .txt for notes). */
export function deriveNoteUploadFileName(body: string | null | undefined): string {
  return `${deriveNoteStorageBaseName(body)}.txt`;
}

/** Types where a `.txt` name does not mean “note” (e.g. Linq/bundle title). */
const NOTE_STRIP_BLOCKED_TYPES =
  /^(link|bundle|linq|image|pdf|video|audio|recording)$/i;

/** Whether this row should use note-style display (hide .txt / .md / .text suffix). */
export function isLikelyNoteFile(
  name: string | null | undefined,
  type?: string | null,
  contentType?: string | null
): boolean {
  const t = (type ?? "").toLowerCase();
  if (t === "note" || t.includes("note")) return true;
  if (NOTE_STRIP_BLOCKED_TYPES.test(t)) return false;

  const ct = (contentType ?? "").toLowerCase();
  if (ct === "txt" || ct === "md" || ct === "text" || ct.includes("note")) return true;
  const n = (name ?? "").toLowerCase();
  return /\.(txt|md|text)$/.test(n);
}

/**
 * List / header label: Linq rename + strip note extensions (matches web getDisplayFileName).
 */
export function getDisplayFileNameForUi(
  name: string | null | undefined,
  type?: string | null,
  contentType?: string | null
): string {
  const n = String(name ?? "");
  if (n === "Bundle" || n === "bundle" || n === "Linq" || n.toLowerCase() === "linq")
    return "linq";
  if (isLikelyNoteFile(n, type, contentType)) {
    const stripped = n.replace(/\.(txt|md|text)$/i, "").trim();
    return stripped || n;
  }
  return n;
}

/**
 * Auto title for Linqs using child file count (+ types for small Linqs).
 * The type badge/icon shown next to the name already marks it as a Linq,
 * so the title itself doesn't repeat "linq" — just the useful part.
 * Examples: "1 item · note", "3 items · image, pdf", "6 items"
 */
export function deriveLinqTitleFromFiles(
  files: Array<{ name?: string | null; type?: string | null; contentType?: string | null }> | null | undefined
): string {
  const MAX_LINQ_TITLE_CHARS = 34;
  // Above this many children, a type list would need a "+N" tail anyway —
  // simpler and neater to just show the count.
  const MAX_TYPES_SHOWN = 3;
  const list = Array.isArray(files) ? files : [];
  const labels = list
    .map((f) => {
      const t = String(f?.type ?? "").trim().toLowerCase();
      if (t === "link" || t === "bundle" || t === "linq") return "linq";

      const cat = categoryFromExt(f?.type ?? f?.contentType ?? "");
      const c = String(cat ?? "").toLowerCase();
      if (c === "note" || c === "pdf" || c === "image" || c === "audio" || c === "video") {
        return c;
      }
      if (c === "link") return "linq";
      return "file";
    })
    .map((s) => String(s).trim())
    .filter(Boolean);

  const total = labels.length;
  if (!total) return "linq";

  const countLabel = `${total} item${total === 1 ? "" : "s"}`;

  if (total <= MAX_TYPES_SHOWN) {
    const uniqueLabels: string[] = [];
    for (const label of labels) {
      if (!uniqueLabels.includes(label)) uniqueLabels.push(label);
    }
    // Graceful fallback: if the full unique-type list doesn't fit, drop
    // labels from the end one at a time rather than dropping the whole list.
    for (let shown = uniqueLabels.length; shown >= 1; shown -= 1) {
      const withTypes = `${countLabel} · ${uniqueLabels.slice(0, shown).join(", ")}`;
      if (withTypes.length <= MAX_LINQ_TITLE_CHARS) return withTypes;
    }
  }

  return countLabel;
}

/** Shorten names in console output (default: first 6 chars + ellipsis). */
export function truncateNameForLog(
  name: string | null | undefined,
  maxChars = 6
): string {
  const s = String(name ?? "").trim();
  if (!s) return "—";
  if (s.length <= maxChars) return s;
  return `${s.slice(0, maxChars)}…`;
}

/** Same tone as DOCX / missing preview in FileDetailModal — use for Linq children not ready yet, etc. */
export function previewFixingMessage(fileLabel: string): string {
  const label = String(fileLabel ?? "").trim() || "this file";
  return `Cant preview "${label}" at the moment, currently fixing this! :)`;
}

/** Keep user-edited child row fields (e.g. rename) when background hydration refreshes URLs. */
export function mergePreservedChildFileRows(
  incoming: any[] | undefined,
  previous: any[] | undefined,
  fields: Array<"name"> = ["name"]
): any[] {
  if (!Array.isArray(incoming)) return [];
  if (!Array.isArray(previous) || previous.length === 0) return incoming;
  const prevById = new Map(
    previous.map((f) => [String(f?.id ?? ""), f]).filter(([id]) => id)
  );
  return incoming.map((row) => {
    const prev = prevById.get(String(row?.id ?? ""));
    if (!prev) return row;
    let out = row;
    for (const field of fields) {
      const nextVal = prev[field];
      if (nextVal != null && nextVal !== row[field]) {
        if (out === row) out = { ...row };
        out[field] = nextVal;
      }
    }
    return out;
  });
}
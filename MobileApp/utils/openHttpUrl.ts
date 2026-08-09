import { Alert, Linking, Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as WebBrowser from "expo-web-browser";

/** FLAG_GRANT_READ_URI_PERMISSION — lets the target app read a file URI we hand off. */
const FLAG_GRANT_READ_URI_PERMISSION = 1;

function guessMimeTypeFromUri(uri: string): string | undefined {
  const path = uri.split("?")[0].split("#")[0].toLowerCase();
  if (path.endsWith(".docx"))
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (path.endsWith(".doc")) return "application/msword";
  if (path.endsWith(".pdf")) return "application/pdf";
  if (path.endsWith(".txt") || path.endsWith(".md")) return "text/plain";
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
  if (path.endsWith(".webp")) return "image/webp";
  if (path.endsWith(".gif")) return "image/gif";
  if (path.endsWith(".mp3")) return "audio/mpeg";
  if (path.endsWith(".m4a")) return "audio/mp4";
  if (path.endsWith(".wav")) return "audio/wav";
  if (path.endsWith(".mp4")) return "video/mp4";
  if (path.endsWith(".mov")) return "video/quicktime";
  return undefined;
}

/**
 * If the app has a bare absolute path (no scheme), normalize to file:// so Linking / intents work.
 */
function normalizeFileCandidate(raw: string): string {
  const s = String(raw ?? "").trim();
  if (!s) return s;
  if (s.startsWith("file:")) return s;
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith("/")) return `file://${s}`;
  return s;
}

function extensionFromSource(urlOrPath: string): string {
  const clean = String(urlOrPath).split("?")[0].split("#")[0];
  const match = clean.match(/\.([A-Za-z0-9]{1,10})$/);
  if (!match) return "";
  return `.${match[1].toLowerCase()}`;
}

function extensionFromContentType(contentType?: string): string {
  const c = String(contentType ?? "").toLowerCase().trim();
  if (!c) return "";
  const map: Record<string, string> = {
    "application/pdf": ".pdf",
    "application/msword": ".doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      ".docx",
  };
  if (map[c]) return map[c];
  if (!c.includes("/")) return c.startsWith(".") ? c : `.${c}`;
  return "";
}

function mimeFromContentType(contentType?: string): string | undefined {
  const ct = String(contentType ?? "").trim().toLowerCase();
  if (!ct) return undefined;
  if (ct === "pdf") return "application/pdf";
  if (ct === "doc") return "application/msword";
  if (ct === "docx") {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (ct.includes("/")) return ct;
  return undefined;
}

async function tryOpenLocalFile(
  fileUri: string,
  preferredMime?: string
): Promise<boolean> {
  const mime = preferredMime || guessMimeTypeFromUri(fileUri);

  if (Platform.OS === "android") {
    try {
      const IntentLauncher = await import("expo-intent-launcher");
      const data =
        fileUri.startsWith("file://")
          ? await FileSystem.getContentUriAsync(fileUri)
          : fileUri;
      await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
        data,
        type: mime,
        flags: FLAG_GRANT_READ_URI_PERMISSION,
      });
      return true;
    } catch (e) {
      console.warn("[openHttpUrl] Android VIEW content intent failed:", e);
      try {
        const IntentLauncher = await import("expo-intent-launcher");
        await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
          data: fileUri,
          type: mime,
          flags: FLAG_GRANT_READ_URI_PERMISSION,
        });
        return true;
      } catch (fallbackError) {
        console.warn("[openHttpUrl] Android VIEW file intent failed:", fallbackError);
      }
    }
  }

  try {
    await Linking.openURL(fileUri);
    return true;
  } catch (e) {
    console.warn("[openHttpUrl] Linking.openURL(file) failed:", e);
  }

  return false;
}

export async function openDocumentFromLocalOrDownload(opts: {
  sourceUri: string | null | undefined;
  fileName?: string;
  contentType?: string;
}): Promise<void> {
  const source = normalizeFileCandidate(String(opts.sourceUri ?? "").trim());
  if (!source) {
    Alert.alert("File not ready", "This document does not have a valid URL yet.");
    return;
  }

  let localPath = source;
  const mimeHint =
    mimeFromContentType(opts.contentType) ||
    guessMimeTypeFromUri(String(opts.fileName ?? "")) ||
    guessMimeTypeFromUri(source) ||
    "application/pdf";
  if (/^https?:\/\//i.test(source)) {
    const ext =
      extensionFromSource(source) ||
      extensionFromSource(opts.fileName ?? "") ||
      extensionFromContentType(opts.contentType) ||
      ".pdf";
    const fileStem = String(opts.fileName ?? "document")
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
      .replace(/\.[A-Za-z0-9]{1,10}$/i, "")
      .slice(0, 80) || "document";
    const baseDir =
      FileSystem.cacheDirectory || FileSystem.documentDirectory || "";
    if (!baseDir) {
      Alert.alert("Couldn't open file", "Local storage is unavailable.");
      return;
    }
    const outPath = `${baseDir}linquiq_open/${fileStem}_${Date.now()}${ext}`;
    try {
      await FileSystem.makeDirectoryAsync(`${baseDir}linquiq_open`, {
        intermediates: true,
      });
    } catch {
      // ignore: may already exist
    }
    const download = await FileSystem.downloadAsync(source, outPath);
    if (download.status !== 200) {
      Alert.alert("Couldn't open file", `Download failed (${download.status}).`);
      return;
    }
    localPath = download.uri || outPath;
  }

  const ok = await tryOpenLocalFile(localPath, mimeHint);
  if (!ok) {
    Alert.alert(
      "Couldn't open file",
      "No installed app can open this document. Install a PDF/document app and try again."
    );
  }
}

/** Opens http(s) links in the system browser when possible, otherwise in-app Safari/Chrome; file:// uses the OS handler. */
export async function openHttpUrl(url: string | null | undefined): Promise<void> {
  const u = normalizeFileCandidate(String(url ?? "").trim());
  if (!u) {
    Alert.alert("Link not ready", "There's nothing to open yet.");
    return;
  }

  if (u.startsWith("file:") || u.startsWith("content:")) {
    const ok = await tryOpenLocalFile(u);
    if (!ok) {
      Alert.alert(
        "Couldn't open file",
        "No app could open this file from its saved location. If you're on Android, install a PDF/file viewer such as Google Drive, Adobe Acrobat, Word, or Google Docs."
      );
    }
    return;
  }

  if (!/^https?:\/\//i.test(u)) {
    Alert.alert(
      "Can't open in browser",
      "This item only has a local file path. After it syncs to the server, use the preview link (https) instead."
    );
    return;
  }

  try {
    await Linking.openURL(u);
    return;
  } catch (e) {
    console.warn("Linking.openURL failed, trying in-app browser", e);
  }
  try {
    await WebBrowser.openBrowserAsync(u);
  } catch (e2) {
    console.error(e2);
    Alert.alert(
      "Couldn't open link",
      "Copy the URL and paste it into your browser."
    );
  }
}

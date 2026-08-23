import { logSafeError, logSafeWarn } from "./safeLog";
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
      logSafeWarn("[openHttpUrl] Android VIEW content intent failed", e);
      try {
        const IntentLauncher = await import("expo-intent-launcher");
        await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
          data: fileUri,
          type: mime,
          flags: FLAG_GRANT_READ_URI_PERMISSION,
        });
        return true;
      } catch (fallbackError) {
        logSafeWarn("[openHttpUrl] Android VIEW file intent failed", fallbackError);
      }
    }
  }

  try {
    await Linking.openURL(fileUri);
    return true;
  } catch (e) {
    logSafeWarn("[openHttpUrl] Linking.openURL(file) failed", e);
  }

  return false;
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
    logSafeWarn("Linking.openURL failed, trying in-app browser", e);
  }
  try {
    await WebBrowser.openBrowserAsync(u);
  } catch (e2) {
    logSafeError("openHttpUrl fallback failed", e2);
    Alert.alert(
      "Couldn't open link",
      "Copy the URL and paste it into your browser."
    );
  }
}

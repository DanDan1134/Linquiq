import { Platform } from "react-native";

/**
 * PDF WebView origins. HTTPS only, plus file:// on iOS for offline local PDFs.
 * Do not allow http:// (mixed-content / Wi-Fi injection).
 */
export function pdfOriginWhitelist(uri: string): string[] {
  const u = String(uri ?? "").trim().toLowerCase();
  if (Platform.OS === "ios" && u.startsWith("file:")) {
    return ["https://*", "file://*"];
  }
  return ["https://*"];
}

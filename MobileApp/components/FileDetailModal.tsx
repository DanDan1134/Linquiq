import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import Slider from "@react-native-community/slider";

import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Image,
  Platform,
  Alert,
  Dimensions,
  StyleSheet,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { FontAwesomeIcon } from "@fortawesome/react-native-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { Audio, AVPlaybackStatus } from "expo-av";
import { useVideoPlayer, VideoView } from "expo-video";
import {
  getDisplayFileNameForUi,
  getFilePreviewUrl,
  isSitePreviewUrl,
  isOfflineImageOrPdfPreviewBlocked,
  previewFixingMessage,
  formatLinqCreatedDisplay,
} from "../utils/helpers";
import { PreviewFallbackBanner } from "./PreviewFallbackBanner";
import { OfflinePreviewNotice } from "./OfflinePreviewNotice";
import { CollapsibleFileDetails } from "./LinqMetadataSection";
import "../global.css";
import { openDocumentFromLocalOrDownload } from "../utils/openHttpUrl";
import { FullscreenImageOverlay } from "./FullscreenImageOverlay";
import { useNetInfo } from "@react-native-community/netinfo";

type FileDetailModalProps = {
  isVisible: boolean;
  selectedFile: any;
  onClose: () => void;
  getTypeColor: (color: string) => string;
  /** Presigned file URL (same as BundleModal) — used on Android so PDF WebView gets https, not blank file:// */
  fetchUrl?: (fileId: string) => Promise<string | null>;
  /** When true, open directly in fullscreen (e.g. linq child). Back from fullscreen dismisses to the linq, not compact preview. */
  startFullscreen?: boolean;
  /**
   * Render as an absolute-fill overlay inside the parent's own <Modal> instead of
   * mounting a second native Modal. Stacking two RN Modals on iOS leaves the outer
   * Modal's touch handler broken after the inner one closes (buttons go dead/offset
   * everywhere until the app restarts) — see BundleModal's nested usage.
   */
  hostedInModal?: boolean;
};

// Strip HTML to plain text and preserve line breaks (web app uses <p>, <br>, etc.)
function stripHtml(html: string): string {
  if (typeof html !== "string") return "";
  let s = html;
  // Convert line/paragraph breaks to newlines before stripping tags
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<\/p>\s*<p[^>]*>/gi, "\n\n");
  s = s.replace(/<\/div>\s*<div[^>]*>/gi, "\n\n");
  s = s.replace(/<\/p>/gi, "\n");
  s = s.replace(/<\/div>/gi, "\n");
  s = s.replace(/<[^>]*>/g, "");
  // Decode common entities
  s = s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
  return s.trim();
}

// Small text viewer (used for .txt and .md); match BundleModal linq note card (gray panel)
const TextFileViewer = ({ text }: { text: string }) => (
  <View className="bg-gray-600 rounded-lg p-3 w-full">
    <Text
      className="text-white text-sm leading-5 whitespace-pre-line"
      selectable
    >
      {text}
    </Text>
  </View>
);

// Isolated video component so its hook usage is safe
function InlineVideo({
  fileUrl,
  height = 220,
}: {
  fileUrl: string;
  height?: number;
}) {
  const player = useVideoPlayer(fileUrl, (p) => {
    p.loop = false;
  });
  return (
    <VideoView
      style={{ width: "100%", height, borderRadius: 12 }}
      player={player}
      allowsPictureInPicture
      contentFit="contain"
    />
  );
}

export const FileDetailModal: React.FC<FileDetailModalProps> = ({
  isVisible,
  selectedFile,
  onClose,
  getTypeColor,
  fetchUrl,
  startFullscreen = false,
  hostedInModal = false,
}) => {
  // ⚠️ Do NOT return before hooks; decide rendering after hooks run.
  const hidden = !isVisible || !selectedFile;

  const localUri =
    selectedFile?.local_uri && String(selectedFile.local_uri).trim() !== ""
      ? String(selectedFile.local_uri)
      : undefined;
  const rawFileUrl = localUri || selectedFile?.url;
  // Never feed the HTML /preview/{id} page into Image / PDF WebView.
  const fileUrl: string | undefined =
    rawFileUrl && !isSitePreviewUrl(rawFileUrl) ? rawFileUrl : undefined;
  const previewUrl = getFilePreviewUrl(selectedFile?.id) || undefined;
  /** Prefer direct media URL / local_uri. Site preview is share-only, not for RN media. */
  const [hydratedRemoteUrl, setHydratedRemoteUrl] = useState<string | undefined>(
    undefined
  );
  const displayMediaUri: string | undefined = (() => {
    const primary = fileUrl && String(fileUrl).trim() !== "" ? fileUrl : undefined;
    if (primary) return primary;
    const hydrated =
      hydratedRemoteUrl && String(hydratedRemoteUrl).trim() !== ""
        ? hydratedRemoteUrl
        : undefined;
    return hydrated && !isSitePreviewUrl(hydrated) ? hydrated : undefined;
  })();

  const typeLabel = (selectedFile?.type ?? "").toString().toLowerCase();
  const bundleLikeRow =
    typeLabel === "link" ||
    typeLabel === "bundle" ||
    typeLabel === "linq";
  const headerTitle = bundleLikeRow
    ? getDisplayFileNameForUi(
        selectedFile?.name,
        selectedFile?.type,
        selectedFile?.contentType
      )
    : String(selectedFile?.type ?? "File");

  // Derive extension hints (use displayMediaUri so extension works with preview-only URLs)
  const urlExt = (() => {
    try {
      return (displayMediaUri ?? "").split("?")[0].split(".").pop()?.toLowerCase();
    } catch {
      return "";
    }
  })();

  const nameLower = String(selectedFile?.name ?? "").toLowerCase();
  const serverExt = (selectedFile?.contentType ?? urlExt ?? "").toLowerCase();
  const mediaType = (selectedFile?.mediaType ?? "").toLowerCase();
  const filePathLower = String(displayMediaUri ?? "").split("?")[0].toLowerCase();
  const isPdfLike =
    typeLabel.includes("pdf") ||
    serverExt === "pdf" ||
    serverExt === "application/pdf" ||
    /\.pdf$/i.test(nameLower) ||
    /\.pdf$/i.test(filePathLower);

  // Preview detectors (type-based so we can hydrate a URL before displayMediaUri exists)
  const isImageLike =
    typeLabel.includes("image") ||
    ["png", "jpg", "jpeg", "gif", "bmp", "webp", "heic"].includes(serverExt) ||
    /\.(png|jpg|jpeg|gif|bmp|webp|heic)$/i.test(nameLower) ||
    /\.(png|jpe?g|gif|bmp|webp|heic)$/i.test(filePathLower);

  const isImagePreview = Boolean(isImageLike);

  const isAudioPreview = Boolean(
    displayMediaUri &&
      (mediaType === "audio" ||
        typeLabel.includes("audio") ||
        typeLabel.includes("recording") ||
        ["m4a", "mp3", "wav", "aac", "caf", "ogg"].includes(serverExt))
  );

  const isVideoPreview = Boolean(
    displayMediaUri &&
      !isAudioPreview &&
      (mediaType === "video" ||
        typeLabel.includes("video") ||
        ["mp4", "mov", "m4v", "avi", "wmv", "webm"].includes(serverExt))
  );

  /** Note body already on the row (offline-first saves) — no S3 URL yet */
  const inlineBody =
    selectedFile?.content != null &&
    typeof selectedFile?.content === "string" &&
    String(selectedFile?.content).trim() !== "";

  const isTextPreview = Boolean(
    !isPdfLike &&
      ((fileUrl && serverExt === "txt") ||
        (inlineBody &&
          (serverExt === "txt" ||
            typeLabel.includes("note") ||
            typeLabel === "note" ||
            /\.txt$/i.test(nameLower))))
  );
  const isMarkdownPreview = Boolean(
    !isPdfLike &&
      ((fileUrl && serverExt === "md") ||
        (inlineBody && (serverExt === "md" || /\.md$/i.test(nameLower))))
  );
  const isPdfPreview = Boolean(isPdfLike);

  const isDocPreview = Boolean(
    serverExt === "doc" ||
      serverExt === "docx" ||
      /\.docx?$/i.test(nameLower) ||
      serverExt === "application/msword" ||
      serverExt ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  );
  const isDocumentLike = isPdfLike || isDocPreview;
  // ---- Text / Markdown content (inline body or fetch from URL) ----
  const [textContent, setTextContent] = useState<string | null>(null);
  const [loadingText, setLoadingText] = useState(false);

  useEffect(() => {
    if (!isVisible) {
      setTextContent(null);
      return;
    }

    // Offline / local note: show `content` without network fetch
    if (inlineBody && (isTextPreview || isMarkdownPreview)) {
      setLoadingText(false);
      setTextContent(stripHtml(String(selectedFile?.content)));
      return;
    }

    if (!(isTextPreview || isMarkdownPreview)) {
      setTextContent(null);
      return;
    }

    if (!fileUrl) {
      setTextContent(null);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        setLoadingText(true);
        const res = await fetch(fileUrl);
        const txt = await res.text();
        if (!cancelled) setTextContent(stripHtml(txt));
      } catch {
        if (!cancelled) setTextContent("");
      } finally {
        if (!cancelled) setLoadingText(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    isVisible,
    fileUrl,
    inlineBody,
    isTextPreview,
    isMarkdownPreview,
    selectedFile?.content,
    nameLower,
  ]);

  // ---- Audio (expo-av) ----
  // Use the same audio implementation as BundleModal to respect device sound settings
  const [audioSound, setAudioSound] = useState<Audio.Sound | null>(null);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  const [audioProgressMs, setAudioProgressMs] = useState(0);
  const [audioTotalMs, setAudioTotalMs] = useState(0);
  const isDraggingRef = useRef(false);
  
  // Cleanup audio when modal closes or file changes
  useEffect(() => {
    return () => {
      if (audioSound) {
        audioSound.unloadAsync().catch(() => undefined);
        setAudioSound(null);
      }
    };
  }, [audioSound]);

  // Reset audio when file changes (important for newly uploaded files)
  // Reset when file ID or URL changes to ensure we're playing the correct file
  useEffect(() => {
    if (audioSound) {
      audioSound.unloadAsync().catch(() => undefined);
      setAudioSound(null);
      setIsAudioPlaying(false);
      setAudioProgressMs(0);
      setAudioTotalMs(0);
    }
  }, [selectedFile?.id, displayMediaUri]); // Reset when file ID or resolved media URI changes

  useEffect(() => {
    if (!isVisible || !isAudioPreview) {
      if (audioSound) {
        audioSound.pauseAsync().catch(() => undefined);
        setIsAudioPlaying(false);
      }
    }
  }, [isVisible, isAudioPreview, audioSound]);

  const handleAudioToggle = async () => {
    if (!displayMediaUri || isAudioLoading) return;

    try {
      setIsAudioLoading(true);

      if (!audioSound) {
        // Create new audio sound
        const { sound, status } = await Audio.Sound.createAsync({
          uri: displayMediaUri,
        });
        if (status.isLoaded) {
          setAudioTotalMs(status.durationMillis ?? 0);
          setAudioProgressMs(status.positionMillis ?? 0);
        }

        sound.setOnPlaybackStatusUpdate((status: AVPlaybackStatus) => {
          if (!status.isLoaded) return;

          // Only update progress if user is not dragging the slider
          if (!isDraggingRef.current && "positionMillis" in status) {
            setAudioProgressMs(status.positionMillis ?? 0);
          }

          if (
            "durationMillis" in status &&
            typeof status.durationMillis === "number"
          ) {
            setAudioTotalMs(status.durationMillis ?? 0);
          }

          if ("isPlaying" in status) {
            setIsAudioPlaying(status.isPlaying ?? false);
          }

          if ((status as any).didJustFinish) {
            setIsAudioPlaying(false);
            sound.setPositionAsync(0).catch(() => undefined);
            setAudioProgressMs(0);
          }
        });

        setAudioSound(sound);
        await sound.playAsync();
        setIsAudioPlaying(true);
      } else {
        // Toggle existing audio sound
        const status = await audioSound.getStatusAsync();
        if (status.isLoaded && status.isPlaying) {
          await audioSound.pauseAsync();
          setIsAudioPlaying(false);
        } else {
          // If at the end, restart from beginning
          if (
            status.isLoaded &&
            status.durationMillis &&
            status.positionMillis
          ) {
            const isAtEnd =
              Math.abs(status.durationMillis - status.positionMillis) < 100;
            if (isAtEnd) {
              await audioSound.setPositionAsync(0);
              setAudioProgressMs(0);
            }
          }
          await audioSound.playAsync();
          setIsAudioPlaying(true);
        }
      }
    } catch (err) {
      console.error("Failed to toggle audio playback", err);
      Alert.alert("Error", "Failed to play this audio file.");
    } finally {
      setIsAudioLoading(false);
    }
  };

  const handleSliderValueChange = (_valueMs: number) => {
    setAudioProgressMs(_valueMs);
  };

  const handleSliderSlidingStart = () => {
    isDraggingRef.current = true;
  };

  const handleSliderSlidingComplete = async (valueMs: number) => {
    isDraggingRef.current = false;
    if (!audioSound) return;
    try {
      await audioSound.setPositionAsync(valueMs);
      setAudioProgressMs(valueMs);
    } catch (err) {
      console.error("Failed to seek audio", err);
    }
  };

  const formatDuration = (durationMs?: number) => {
    if (!durationMs || durationMs <= 0) return "0:00";
    const totalSeconds = Math.round(durationMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  // --- PDF WebView config (simple & robust) ---
  const [pdfError, setPdfError] = useState<string | null>(null);
  /** Android: presigned https for WebView; `null` = still resolving (local file:// only). */
  const [androidPdfResolvedUri, setAndroidPdfResolvedUri] = useState<string | null>(
    null
  );
  const [fullscreenImageUri, setFullscreenImageUri] = useState<string | null>(null);
  const netInfo = useNetInfo();
  const isOnline = netInfo.isConnected !== false;

  // Hydrate a presigned media URL when openFileDetail could not supply one.
  useEffect(() => {
    if (!isVisible) {
      setHydratedRemoteUrl(undefined);
      return;
    }
    setHydratedRemoteUrl(undefined);
    if (fileUrl) return;
    if (!fetchUrl) return;
    const id = String(selectedFile?.id ?? "").trim();
    if (!id || id.startsWith("opt-")) return;
    if (!isOnline) return;

    let cancelled = false;
    void fetchUrl(id)
      .then((remote) => {
        if (cancelled) return;
        const u = String(remote ?? "").trim();
        if (u && !isSitePreviewUrl(u)) setHydratedRemoteUrl(u);
      })
      .catch(() => {
        /* non-fatal — fallback banner handles missing media */
      });
    return () => {
      cancelled = true;
    };
  }, [isVisible, fileUrl, selectedFile?.id, fetchUrl, isOnline]);
  /** Image preview: avoid a blank tile while decoding or on failure. */
  const [imagePreviewStatus, setImagePreviewStatus] = useState<
    "loading" | "ready" | "error"
  >("loading");
  /**
   * User toggled fullscreen vs compact. When `undefined`, use props so the first paint
   * after open matches `startFullscreen` (no compact flash before useLayoutEffect).
   */
  const [fullscreenOverride, setFullscreenOverride] = useState<boolean | undefined>(
    undefined
  );
  const insets = useSafeAreaInsets();

  // Standalone host uses a real fullScreen Modal (no transparent sheet). Nested
  // host (Bundle) keeps the existing startFullscreen / override behavior.
  const contentFullscreen = !hostedInModal
    ? true
    : fullscreenOverride !== undefined
      ? fullscreenOverride
      : Boolean(isVisible && startFullscreen);

  useEffect(() => {
    if (!isVisible) setFullscreenImageUri(null);
  }, [isVisible, selectedFile?.id]);

  useEffect(() => {
    if (!isVisible || !isImagePreview) return;
    setImagePreviewStatus("loading");
  }, [isVisible, isImagePreview, selectedFile?.id, displayMediaUri]);

  useEffect(() => {
    if (!isVisible) setFullscreenOverride(undefined);
  }, [isVisible]);

  useLayoutEffect(() => {
    if (!isVisible || !isPdfPreview || !displayMediaUri) {
      setAndroidPdfResolvedUri(null);
      return;
    }
    if (Platform.OS !== "android") {
      setAndroidPdfResolvedUri(null);
      return;
    }
    const id = String(selectedFile?.id ?? "").trim();
    if (!id || id.startsWith("opt-") || Number(selectedFile?.dirty) === 1) {
      setAndroidPdfResolvedUri(null);
      return;
    }

    // Remote PDF: WebView loads https directly (Drive viewer embed often blanks for S3).
    if (/^https?:\/\//i.test(displayMediaUri)) {
      setAndroidPdfResolvedUri(displayMediaUri);
      return;
    }

    if (!fetchUrl) {
      setAndroidPdfResolvedUri(displayMediaUri);
      return;
    }

    setAndroidPdfResolvedUri(null);
    let cancelled = false;
    void fetchUrl(id)
      .then((remote) => {
        if (cancelled) return;
        const u = String(remote ?? "").trim();
        if (u && /^https?:\/\//i.test(u)) setAndroidPdfResolvedUri(u);
        else setAndroidPdfResolvedUri(displayMediaUri);
      })
      .catch(() => {
        if (!cancelled) setAndroidPdfResolvedUri(displayMediaUri);
      });
    return () => {
      cancelled = true;
    };
  }, [isVisible, isPdfPreview, displayMediaUri, selectedFile?.id, fetchUrl]);

  const needsAndroidPresignedPdf =
    Platform.OS === "android" &&
    isPdfPreview &&
    isOnline &&
    Boolean(displayMediaUri) &&
    Boolean(fetchUrl) &&
    !/^https?:\/\//i.test(String(displayMediaUri));

  const pdfUriForWebView =
    !isPdfPreview || !displayMediaUri
      ? undefined
      : Platform.OS === "android" && !!localUri && !isOnline
        ? undefined
      : Platform.OS !== "android"
        ? displayMediaUri
        : !needsAndroidPresignedPdf
          ? displayMediaUri
          : androidPdfResolvedUri !== null
            ? androidPdfResolvedUri
            : undefined;

  const displayFileName =
    getDisplayFileNameForUi(
      selectedFile?.name,
      selectedFile?.type,
      selectedFile?.contentType
    ).trim() || "this file";

  const winH = Dimensions.get("window").height;
  const largePreview = contentFullscreen;
  // Compact (non-fullscreen) previews stay small so the sheet fits neatly on screen.
  const videoPreviewHeight = largePreview ? Math.round(winH * 0.5) : 200;
  const pdfPreviewHeight = largePreview ? Math.round(winH * 0.66) : 360;
  const imagePreviewHeight = largePreview
    ? Math.min(Math.round(winH * 0.56), 620)
    : Math.round(winH * 0.26);

  const canOpenDocument =
    Boolean(localUri) ||
    (isOnline && Boolean(fileUrl || selectedFile?.url || previewUrl));

  const showHeaderViewEntry =
    !contentFullscreen &&
    Boolean(previewUrl || selectedFile?.url || fileUrl);

  const offlineImageOrPdfBlocked = isOfflineImageOrPdfPreviewBlocked(
    isOnline,
    localUri,
    isImagePreview,
    isPdfPreview
  );

  const headerActionIconColor = "#F9FAFB";

  const handleOpenDocument = async () => {
    if (!isDocumentLike) return;
    const sourceUri = String(localUri ?? fileUrl ?? selectedFile?.url ?? previewUrl ?? "").trim();
    if (!sourceUri) {
      Alert.alert("File not ready", "This document is still loading.");
      return;
    }
    await openDocumentFromLocalOrDownload({
      sourceUri,
      fileName: displayFileName,
      contentType: String(selectedFile?.contentType ?? ""),
    });
  };

  // Nested View overlay can unmount when closed. Standalone Modal must stay
  // mounted with visible={false} so iOS hit-testing is not left offset.
  if (hostedInModal && hidden) return null;
  if (!selectedFile) return null;

  /** Collapsed line: the two facts worth scanning without opening details. */
  const detailsSummary = [
    bundleLikeRow ? "linq" : String(selectedFile?.type ?? "File"),
    formatLinqCreatedDisplay(selectedFile?.createdAt, selectedFile?.date),
  ]
    .filter((part) => String(part ?? "").trim())
    .join("  ·  ");

  const metadataSection = (
    <CollapsibleFileDetails
      summary={detailsSummary}
      displayName={
        bundleLikeRow
          ? undefined
          : getDisplayFileNameForUi(
              selectedFile.name,
              selectedFile.type,
              selectedFile.contentType
            )
      }
      id={selectedFile.id}
      createdAt={selectedFile.createdAt}
      date={selectedFile.date}
      creator={selectedFile.creator}
      dirty={selectedFile.dirty}
      isOnline={isOnline}
    />
  );

  const overlay = (
    <View
      style={[
        hostedInModal
          ? { ...StyleSheet.absoluteFillObject, zIndex: 50, elevation: 50 }
          : { flex: 1 },
        { backgroundColor: "rgba(0,0,0,0.75)" },
        contentFullscreen
          ? { paddingBottom: insets.bottom }
          : { justifyContent: "center", alignItems: "center" },
      ]}
    >
      <View
        className={`bg-background ${contentFullscreen ? "" : "rounded-lg mx-4 w-11/12"}`}
        style={
          contentFullscreen
            ? { flex: 1, width: "100%", maxHeight: "100%" }
            : { maxHeight: "72%" }
        }
      >
        {/* Header: title, one action, nothing else */}
        <View
          className="flex-row items-center border-b border-gray-600"
          style={{
            paddingTop: contentFullscreen ? Math.max(insets.top, 8) + 4 : 10,
            paddingBottom: 8,
            paddingHorizontal: 10,
          }}
        >
          <View className="flex-row items-center flex-1 mx-1" style={{ minWidth: 0 }}>
            <View
              className={`w-2.5 h-2.5 rounded-full ${getTypeColor(selectedFile.typeColor)} mr-2.5`}
            />
            <Text
              className="text-white text-lg font-semibold"
              numberOfLines={1}
              style={{ flexShrink: 1 }}
            >
              {headerTitle}
            </Text>
          </View>

          {/* Always the same X, same slot, same size — never swaps icon or side
              based on fullscreen state, so the button never appears to move. */}
          <TouchableOpacity
            onPress={() => {
              if (!contentFullscreen) {
                onClose();
                return;
              }
              if (startFullscreen || !hostedInModal) {
                onClose();
                return;
              }
              setFullscreenOverride(false);
            }}
            style={styles.headerButton}
            accessibilityLabel={
              !contentFullscreen
                ? "Close file details"
                : startFullscreen
                  ? "Back to linq"
                  : !hostedInModal
                    ? "Close file details"
                    : "Back to file preview"
            }
            accessibilityRole="button"
          >
            <FontAwesomeIcon icon={faXmark} size={20} color="white" />
          </TouchableOpacity>
        </View>

        {/* Body */}
        <ScrollView
          style={contentFullscreen ? { flex: 1 } : undefined}
          contentContainerStyle={styles.bodyContent}
        >
          <View style={{ marginBottom: 10 }}>{metadataSection}</View>

          {(isTextPreview || isMarkdownPreview) && !loadingText && (
            <View className="mb-3">
              {textContent != null && String(textContent).trim() !== "" ? (
                <TextFileViewer text={textContent} />
              ) : (
                <PreviewFallbackBanner
                  message={previewFixingMessage(displayFileName)}
                />
              )}
            </View>
          )}

          {offlineImageOrPdfBlocked ? (
            <View className="mb-3">
              <OfflinePreviewNotice />
            </View>
          ) : null}

          {!offlineImageOrPdfBlocked && displayMediaUri ? (
            <View className="mb-3">
              {isImagePreview &&
                (imagePreviewStatus === "error" ? (
                  <PreviewFallbackBanner
                    message={previewFixingMessage(displayFileName)}
                  />
                ) : (
                  <TouchableOpacity
                    activeOpacity={0.92}
                    onPress={() => setFullscreenImageUri(displayMediaUri)}
                    accessibilityRole="imagebutton"
                    accessibilityLabel={`View ${displayFileName} full screen`}
                  >
                    <View
                      style={[
                        styles.mediaFrame,
                        { height: imagePreviewHeight },
                      ]}
                    >
                      <Image
                        source={{ uri: displayMediaUri }}
                        style={{ width: "100%", height: "100%" }}
                        resizeMode={largePreview ? "contain" : "cover"}
                        onLoad={() => setImagePreviewStatus("ready")}
                        onError={() => setImagePreviewStatus("error")}
                      />
                    </View>
                  </TouchableOpacity>
                ))}

              {isVideoPreview && displayMediaUri && (
                <View
                  style={[styles.mediaFrame, { minHeight: videoPreviewHeight }]}
                >
                  <InlineVideo
                    fileUrl={displayMediaUri}
                    height={videoPreviewHeight}
                  />
                </View>
              )}

              {isPdfPreview &&
                displayMediaUri &&
                needsAndroidPresignedPdf &&
                androidPdfResolvedUri === null && (
                  <View
                    className="mb-3"
                    style={[styles.mediaFrame, { height: pdfPreviewHeight }]}
                  />
                )}

              {isPdfPreview && Platform.OS === "android" && localUri && !isOnline && (
                <View className="mb-3" style={styles.offlinePdfPanel}>
                  <Text style={styles.offlinePdfText}>
                    PDF is saved offline. Android opens local PDFs through a PDF app.
                  </Text>
                  <TouchableOpacity
                    onPress={() => void handleOpenDocument()}
                    style={styles.accentButton}
                    accessibilityRole="button"
                  >
                    <Text style={styles.accentButtonText}>Open in Files</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* PDF inline viewer — direct URI only (no Google viewer / no JS). */}
              {isPdfPreview && pdfUriForWebView && (() => {
                const sourceUri = pdfUriForWebView;
                return (
                <View style={[styles.mediaFrame, { height: pdfPreviewHeight }]}>
                  <WebView
                    source={{ uri: sourceUri }}
                    originWhitelist={["https://*", "http://*", "file://*"]}
                    onLoadStart={() => setPdfError(null)}
                    onError={(e) =>
                      setPdfError(
                        e?.nativeEvent?.description ?? "Failed to load PDF"
                      )
                    }
                    javaScriptEnabled={false}
                    allowFileAccess={false}
                    scalesPageToFit
                    {...(Platform.OS === "android"
                      ? { mixedContentMode: "always" as const }
                      : {})}
                  />
                  {pdfError ? (
                    <View style={styles.previewErrorOverlay}>
                      <Text style={styles.previewErrorText}>
                        {previewFixingMessage(displayFileName)}
                      </Text>
                      <TouchableOpacity
                        onPress={() => void handleOpenDocument()}
                        disabled={!canOpenDocument}
                        style={[
                          styles.primaryButton,
                          { opacity: canOpenDocument ? 1 : 0.5 },
                        ]}
                      >
                        <Text style={styles.primaryButtonText}>Open in Files</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </View>
                );
              })()}

              {/* DOC / DOCX — in-app preview removed until a later update */}
              {isDocPreview && (
                <View>
                  <PreviewFallbackBanner
                    message={previewFixingMessage(displayFileName)}
                  />
                  <TouchableOpacity
                    onPress={() => void handleOpenDocument()}
                    disabled={!canOpenDocument}
                    style={[
                      styles.accentButton,
                      styles.centeredButton,
                      { opacity: canOpenDocument ? 1 : 0.45 },
                    ]}
                    accessibilityRole="button"
                  >
                    <Text style={styles.accentButtonText}>Open in Files</Text>
                  </TouchableOpacity>
                </View>
              )}

              {isAudioPreview && (
                <View style={styles.audioBlock}>
                  <TouchableOpacity
                    onPress={handleAudioToggle}
                    disabled={isAudioLoading}
                    style={styles.audioButton}
                    accessibilityRole="button"
                    accessibilityLabel={isAudioPlaying ? "Pause audio" : "Play audio"}
                  >
                    <Text style={styles.audioButtonText}>
                      {isAudioPlaying ? "Pause" : "Play"}
                    </Text>
                  </TouchableOpacity>

                  {audioTotalMs > 0 && (
                    <Slider
                      style={styles.audioSlider}
                      minimumValue={0}
                      maximumValue={audioTotalMs > 0 ? audioTotalMs : 1}
                      value={isDraggingRef.current ? undefined : audioProgressMs}
                      minimumTrackTintColor="#D7827E"
                      maximumTrackTintColor="#666666"
                      thumbTintColor="#D7827E"
                      onValueChange={handleSliderValueChange}
                      onSlidingStart={handleSliderSlidingStart}
                      onSlidingComplete={handleSliderSlidingComplete}
                      disabled={isAudioLoading}
                    />
                  )}
                  <Text style={styles.audioTime}>
                    {formatDuration(audioProgressMs)} / {formatDuration(audioTotalMs)}
                  </Text>
                </View>
              )}

              {displayMediaUri &&
                !isImagePreview &&
                !isVideoPreview &&
                !isPdfPreview &&
                !isDocPreview &&
                !isAudioPreview &&
                !(isTextPreview || isMarkdownPreview) && (
                  <PreviewFallbackBanner
                    message={previewFixingMessage(displayFileName)}
                  />
                )}
            </View>
          ) : !offlineImageOrPdfBlocked &&
            !(
              isTextPreview ||
              isMarkdownPreview ||
              String(previewUrl ?? "").trim() ||
              String(selectedFile?.url ?? "").trim()
            ) ? (
            <PreviewFallbackBanner
              message={previewFixingMessage(displayFileName)}
            />
          ) : !offlineImageOrPdfBlocked &&
            !displayMediaUri &&
            !(isTextPreview || isMarkdownPreview) &&
            (String(previewUrl ?? "").trim() ||
              String(selectedFile?.url ?? "").trim()) ? (
            <View className="mb-3">
              <PreviewFallbackBanner
                message={previewFixingMessage(displayFileName)}
              />
            </View>
          ) : null}

        </ScrollView>
      </View>
      <FullscreenImageOverlay
        imageUri={fullscreenImageUri}
        visible={Boolean(fullscreenImageUri)}
        onClose={() => setFullscreenImageUri(null)}
      />
    </View>
  );

  if (hostedInModal) {
    return overlay;
  }

  return (
    <Modal
      visible={isVisible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      supportedOrientations={["portrait", "landscape"]}
    >
      {overlay}
    </Modal>
  );
};

const styles = StyleSheet.create({
  headerButton: {
    minWidth: 48,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  bodyContent: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 16,
  },
  mediaFrame: {
    width: "100%",
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#111",
  },
  previewErrorOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 16,
  },
  previewErrorText: {
    color: "#fff",
    marginBottom: 12,
    textAlign: "center",
  },
  primaryButton: {
    backgroundColor: "#3B82F6",
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 8,
    minHeight: 48,
    justifyContent: "center",
  },
  primaryButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
  accentButton: {
    backgroundColor: "#D7827E",
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 8,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  accentButtonText: {
    color: "#111827",
    fontWeight: "700",
  },
  centeredButton: {
    alignSelf: "center",
    marginTop: 12,
  },
  offlinePdfPanel: {
    width: "100%",
    minHeight: 130,
    borderRadius: 10,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
    padding: 14,
  },
  offlinePdfText: {
    color: "#F9FAFB",
    textAlign: "center",
    lineHeight: 19,
    marginBottom: 10,
    fontSize: 13,
  },
  audioBlock: {
    marginTop: 4,
  },
  audioButton: {
    backgroundColor: "#D7827E",
    borderRadius: 10,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  audioButtonText: {
    color: "#111827",
    fontWeight: "700",
    fontSize: 15,
  },
  audioSlider: {
    width: "100%",
    height: 40,
    marginTop: 10,
  },
  audioTime: {
    color: "#9CA3AF",
    fontSize: 12,
    textAlign: "center",
    marginTop: 4,
  },
});

/**
 * BundleModal Component
 *
 * Modal showing link details with all linked files:
 * - Link metadata (name, URLs, creation date, creator)
 * - List of all files included in the link
 * - Each linked file shows as a mini file detail card
 * - Copy links functionality for the entire link
 */
import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  Clipboard,
  StyleSheet,
  Modal,
} from "react-native";
// @ts-ignore - Slider component from @react-native-community/slider
import Slider from "@react-native-community/slider";
import { FontAwesomeIcon } from "@fortawesome/react-native-fontawesome";
import {
  faXmark,
  faCopy,
} from "@fortawesome/free-solid-svg-icons";
import { Audio, Video, ResizeMode, AVPlaybackStatus } from "expo-av";
import { WebView } from "react-native-webview";
import { Image, Platform } from "react-native";
import {
  stripHtmlPreserveNewlines,
  getDisplayFileNameForUi,
  previewFixingMessage,
  isOfflineImageOrPdfPreviewBlocked,
  isSitePreviewUrl,
  HEADER_ACTION_SEPARATOR,
  HEADER_EXPAND_TO_CLOSE_GAP,
  formatLinqCreatedDisplay,
} from "../utils/helpers";
import { PreviewFallbackBanner } from "./PreviewFallbackBanner";
import { OfflinePreviewNotice } from "./OfflinePreviewNotice";
import { CollapsibleFileDetails } from "./LinqMetadataSection";
import { API_BASE } from "../api/client";
import { openDocumentFromLocalOrDownload } from "../utils/openHttpUrl";
import { getFileById } from "../db/fileRepo";
import { FullscreenImageOverlay } from "./FullscreenImageOverlay";
import { FileDetailModal } from "./FileDetailModal";
import "../global.css";
import { useNetInfo } from "@react-native-community/netinfo";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const LINQ_LOADING_COLOR = "#D7827E";

// Defines the type for the files in the bundle
//interface is like a contract that describes the shape of the data that the component will receive.

interface BundleFile {
  id: string;
  name: string;
  type: string;
  typeColor: string;
  url: string;
  createdAt: string;
  creator: string;
  content: string;
}

// Defines the type for the props that the bundle modal receives

interface BundleModalProps {
  isVisible: boolean;
  bundleData: {
    name: string;
    type?: string;
    bundledUrls: string[];
    createdAt: string;
    creator: string;
    files: BundleFile[];
    url?: string;
    date?: string;
    id?: string;
    contentType?: string;
    isHydratingChildren?: boolean;
  };
  onClose: () => void;
  getTypeColor: (color: string) => string;
  onNestedBundlePress?: (nestedBundle: any) => void;
  onExtractContents?: (nestedBundle: any, nestedBundleFile: BundleFile) => void;
  fetchUrl?: (fileId: string) => Promise<string | null>;
}

//BundleModal component that displays the bundle details
export const BundleModal: React.FC<BundleModalProps> = ({
  isVisible,
  bundleData,
  onClose,
  getTypeColor,
  onNestedBundlePress,
  onExtractContents,
  fetchUrl,
}) => {
  const insets = useSafeAreaInsets();
  const [overlayChildFile, setOverlayChildFile] = useState<BundleFile | null>(null);
  const [bundleShellFullscreen, setBundleShellFullscreen] = useState(false);
  const [copyUrlsShellFlash, setCopyUrlsShellFlash] = useState(false);
  const [copiedLinkFileId, setCopiedLinkFileId] = useState<string | null>(null);

  useEffect(() => {
    if (!isVisible) {
      setOverlayChildFile(null);
      setBundleShellFullscreen(false);
    }
  }, [isVisible]);

  const copyAllLinks = () => {
    try {
      const allUrls = (bundleData.files ?? [])
        .map((f) => `${API_BASE}/preview/${f.id}`)
        .filter(Boolean)
        .join("\n");
      const fallback = (bundleData.bundledUrls ?? []).join("\n");
      const text = allUrls || fallback;
      if (!text.trim()) {
        Alert.alert("Link not ready", "This URL is not available yet. Try again in a moment.");
        return;
      }
      Clipboard.setString(text);
      setCopyUrlsShellFlash(true);
      setTimeout(() => setCopyUrlsShellFlash(false), 2000);
    } catch (err) {
      console.error("Failed to copy to clipboard:", err);
    }
  };

  const copyFileLink = (url: string | null | undefined, fileId?: string) => {
    const preview = fileId ? `${API_BASE}/preview/${fileId}` : "";
    const raw = String(preview || url || "").trim();
    if (!raw) {
      Alert.alert("Link not ready", "This file link is not available yet. Try again in a moment.");
      return;
    }
    try {
      Clipboard.setString(raw);
      const id = fileId != null ? String(fileId).trim() : "";
      if (id) {
        setCopiedLinkFileId(id);
        setTimeout(() => {
          setCopiedLinkFileId((prev) => (prev === id ? null : prev));
        }, 2000);
      }
    } catch (err) {
      console.error("Failed to copy to clipboard:", err);
    }
  };

  // Simple in-modal audio player state (one-at-a-time)
  const [audioSound, setAudioSound] = useState<Audio.Sound | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [isAudioLoading, setIsAudioLoading] = useState(false);

  // Audio progress tracking for slider
  const [audioProgressMs, setAudioProgressMs] = useState<Record<string, number>>({});
  const [audioTotalMs, setAudioTotalMs] = useState<Record<string, number>>({});
  const isDraggingRef = useRef(false);
  const [imageLoadFailed, setImageLoadFailed] = useState<Record<string, boolean>>({});
  const [localUriById, setLocalUriById] = useState<Record<string, string>>({});
  const [fullscreenImageUri, setFullscreenImageUri] = useState<string | null>(null);
  const netInfo = useNetInfo();
  const isOnline = netInfo.isConnected !== false;

  const HEADER_ACTION_CHIP_HEIGHT = 48;

  const copyUrlChipStyle = {
    height: HEADER_ACTION_CHIP_HEIGHT,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.22)",
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    paddingHorizontal: 10,
    justifyContent: "center" as const,
    alignItems: "center" as const,
  } as const;


  const getFileLocalUri = (file: BundleFile): string | undefined => {
    const id = String(file?.id ?? "").trim();
    const fromDb = String(
      (localUriById as Record<string, string>)[id] ?? ""
    ).trim();
    const local = String((file as any)?.local_uri ?? "").trim();
    return fromDb || local || undefined;
  };

  const getPreviewUri = (file: BundleFile): string => {
    const id = String(file?.id ?? "").trim();
    if (id) {
      const fromDb = String((localUriById as Record<string, string>)[id] ?? "").trim();
      if (fromDb) return fromDb;
      const direct = String((pdfDirectUrlById as Record<string, string>)[id] ?? "").trim();
      if (direct && !isSitePreviewUrl(direct)) return direct;
    }
    const local = String((file as any)?.local_uri ?? "").trim();
    if (local) return local;
    const remote = String(file?.url ?? "").trim();
    // Never use the HTML /preview/{id} page as an Image/WebView media source.
    if (remote && !isSitePreviewUrl(remote)) return remote;
    return "";
  };

  const getOpenInTabTarget = (file: BundleFile): string => {
    const local = String((localUriById as Record<string, string>)[String(file?.id ?? "").trim()] ?? "")
      .trim() || String((file as any)?.local_uri ?? "").trim();
    if (local) return local;
    const id = String(file?.id ?? "").trim();
    if (id && !id.startsWith("opt-") && Number((file as any)?.dirty) !== 1) {
      return `${API_BASE}/preview/${id}`;
    }
    return getPreviewUri(file);
  };

  const getInlinePdfUri = (file: BundleFile): string => {
    const id = String(file?.id ?? "").trim();
    const localFromDb = String(
      (localUriById as Record<string, string>)[id] ?? ""
    ).trim();
    const local = localFromDb || String((file as any)?.local_uri ?? "").trim();
    if (!isOnline && local) return local;
    if (id && !id.startsWith("opt-") && Number((file as any)?.dirty) !== 1) {
      const direct = String((pdfDirectUrlById as Record<string, string>)[id] ?? "").trim();
      if (direct && !isSitePreviewUrl(direct)) return direct;
    }
    const remote = String(file?.url ?? "").trim();
    if (remote && !isSitePreviewUrl(remote)) return remote;
    if (local) return local;
    return "";
  };

  const isPdfLike = (file: BundleFile): boolean => {
    const label = String(file?.type ?? "").toLowerCase();
    const contentType = String((file as any)?.contentType ?? "").toLowerCase();
    const name = String(file?.name ?? "").toLowerCase();
    const path = String(getInlinePdfUri(file) || getPreviewUri(file) || "")
      .split("?")[0]
      .toLowerCase();
    return (
      label.includes("pdf") ||
      contentType === "pdf" ||
      contentType.includes("application/pdf") ||
      /\.pdf$/i.test(name) ||
      /\.pdf$/i.test(path)
    );
  };
  
  // Collapsible URLs state
  const [isUrlsExpanded, setIsUrlsExpanded] = useState(false);
  const [pdfError, setPdfError] = useState<Record<string, string | null>>({});
  const [pdfDirectUrlById, setPdfDirectUrlById] = useState<Record<string, string>>({});
  const [pdfTimedOut, setPdfTimedOut] = useState<Record<string, boolean>>({});
  const pdfTimeoutRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  
  useEffect(() => {
    return () => {
      if (audioSound) {
        audioSound.unloadAsync().catch(() => undefined);
      }
    };
  }, [audioSound]);

  useEffect(() => {
    let cancelled = false;
    if (!isVisible) return;
    const rows = bundleData?.files ?? [];
    if (!Array.isArray(rows) || rows.length === 0) return;
    (async () => {
      const entries = await Promise.all(
        rows.map(async (f: any) => {
          const id = String(f?.id ?? "").trim();
          if (!id) return null;
          try {
            const row = await getFileById(id);
            const local = String(row?.local_uri ?? "").trim();
            if (!local) return null;
            return [id, local] as const;
          } catch {
            return null;
          }
        })
      );
      if (cancelled) return;
      const next: Record<string, string> = {};
      for (const pair of entries) {
        if (!pair) continue;
        next[pair[0]] = pair[1];
      }
      if (Object.keys(next).length > 0) {
        setLocalUriById((prev) => ({ ...prev, ...next }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isVisible, bundleData?.files]);

  useEffect(() => {
    let cancelled = false;
    if (!isVisible || !fetchUrl) return;

    const mediaFiles = (bundleData?.files ?? []).filter((f: any) => {
      const id = String(f?.id ?? "").trim();
      if (!id || id.startsWith("opt-") || Number(f?.dirty) === 1) return false;
      // Prefetch direct URLs for PDFs and images (not the HTML /preview page).
      return isPdfLike(f) || isImageFile(f);
    });
    if (mediaFiles.length === 0) return;

    (async () => {
      const updates: Record<string, string> = {};
      await Promise.all(
        mediaFiles.map(async (file: any) => {
          const id = String(file?.id ?? "").trim();
          if (!id) return;
          const existing = String(
            (pdfDirectUrlById as Record<string, string>)[id] ?? ""
          ).trim();
          if (existing && !isSitePreviewUrl(existing)) return;
          const local = getFileLocalUri(file);
          if (local) return;
          const remoteExisting = String(file?.url ?? "").trim();
          if (remoteExisting && !isSitePreviewUrl(remoteExisting)) {
            updates[id] = remoteExisting;
            return;
          }
          const direct = await fetchUrl(id).catch(() => null);
          const clean = String(direct ?? "").trim();
          if (clean && !isSitePreviewUrl(clean)) updates[id] = clean;
        })
      );
      if (!cancelled && Object.keys(updates).length > 0) {
        setPdfDirectUrlById((prev) => ({ ...prev, ...updates }));
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate once per open / file set
  }, [isVisible, bundleData?.files, fetchUrl]);

  // Stop audio when modal closes
  useEffect(() => {
    if (!isVisible && audioSound) {
      audioSound.stopAsync().catch(() => undefined);
      audioSound.unloadAsync().catch(() => undefined);
      setAudioSound(null);
      setPlayingId(null);
    }
    if (!isVisible) setFullscreenImageUri(null);
  }, [isVisible, audioSound]);

  useEffect(() => {
    return () => {
      Object.values(pdfTimeoutRef.current).forEach((timer) => clearTimeout(timer));
      pdfTimeoutRef.current = {};
    };
  }, []);

  const isAudioFile = (file: BundleFile) => {
    const url = getPreviewUri(file);
    const label = (file?.type ?? "").toLowerCase();
    return (
      label.includes("audio") ||
      label.includes("recording") ||
      /\.(m4a|mp3|wav|aac|caf|ogg)$/i.test(url)
    );
  };

  const isImageFile = (file: BundleFile) => {
    const url = getPreviewUri(file);
    const label = (file?.type ?? "").toLowerCase();
    return (
      label.includes("image") || /\.(png|jpe?g|gif|bmp|webp|heic)$/i.test(url)
    );
  };

  const isVideoFile = (file: BundleFile) => {
    const url = getPreviewUri(file);
    const label = (file?.type ?? "").toLowerCase();
    return (
      !isAudioFile(file) &&
      (label.includes("video") || /\.(mp4|mov|m4v|avi|wmv|webm)$/i.test(url))
    );
  };

  const isTextFile = (file: BundleFile) => {
    const url = getPreviewUri(file);
    const path = String(url).split("?")[0].toLowerCase();
    const name = String(file?.name ?? "").toLowerCase();
    const label = String(file?.type ?? "").toLowerCase();
    const contentType = String((file as any)?.contentType ?? "").toLowerCase();
    if (isPdfLike(file)) return false;
    return (
      label === "note" ||
      contentType === "txt" ||
      contentType === "md" ||
      contentType === "rtf" ||
      contentType === "text/plain" ||
      contentType === "text/markdown" ||
      /\.(txt|md|rtf)$/i.test(name) ||
      /\.(txt|md|rtf)$/i.test(path)
    );
  };

  const isPdfFile = (file: BundleFile) => {
    return isPdfLike(file);
  };

  const isDocFile = (file: BundleFile) => {
    const name = String(file?.name ?? "").toLowerCase();
    const contentType = String((file as any)?.contentType ?? "").toLowerCase();
    const path = String(getPreviewUri(file) || "").split("?")[0].toLowerCase();
    return (
      contentType === "doc" ||
      contentType === "docx" ||
      contentType === "application/msword" ||
      contentType ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      /\.docx?$/i.test(name) ||
      /\.docx?$/i.test(path)
    );
  };

  const isNestedBundle = (file: BundleFile) => {
    // Only check the type — bundledUrls/files may not be populated yet on first open
    // (files sourced from the fileMap fallback won't have those fields).
    // Checking type alone is sufficient and gives the correct color instantly.
    const t = String((file as any)?.type ?? '').toLowerCase();
    return t === 'link' || t === 'bundle' || t === 'linq';
  };

  const isChildStillLoading = (file: BundleFile) => {
    if (isNestedBundle(file)) {
      const ids =
        Array.isArray((file as any)?.bundledFileIds)
          ? (file as any).bundledFileIds.length
          : Array.isArray((file as any)?.children?.item_id)
            ? (file as any).children.item_id.length
            : 0;
      const files = (file as any)?.files;
      return ids > 0 && (!Array.isArray(files) || files.length === 0);
    }
    if (isTextFile(file)) {
      const body = stripHtmlPreserveNewlines(String(file.content ?? "")).trim();
      return !body && !getPreviewUri(file);
    }
    if (isImageFile(file) || isVideoFile(file) || isAudioFile(file) || isPdfFile(file)) {
      return !getPreviewUri(file);
    }
    return false;
  };

  /**
   * Static placeholder for a child whose content has not arrived yet. Deliberately
   * has no spinner — animations here cost frames on older devices and the row
   * usually fills in within a few hundred ms.
   */
  const ChildLoadingIndicator = () => <View style={styles.childPlaceholder} />;

  const formatDuration = (durationMs?: number) => {
    if (!durationMs || durationMs <= 0) {
      return "0:00";
    }
    const totalSeconds = Math.round(durationMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const handleSliderValueChange = (fileId: string, value: number) => {
    setAudioProgressMs((prev) => ({ ...prev, [fileId]: value }));
  };

  const handleSliderSlidingStart = () => {
    isDraggingRef.current = true;
  };

  const handleSliderSlidingComplete = async (fileId: string, value: number) => {
    isDraggingRef.current = false;
    if (audioSound && playingId === fileId) {
      try {
        await audioSound.setPositionAsync(value);
        setAudioProgressMs((prev) => ({ ...prev, [fileId]: value }));
      } catch (err) {
        console.error("Failed to seek audio", err);
      }
    }
  };

  const handleAudioToggle = async (file: BundleFile) => {
    const url = getPreviewUri(file);
    if (!url || isAudioLoading) return;

    try {
      setIsAudioLoading(true);
      if (playingId !== file.id) {
        if (audioSound) {
          await audioSound.unloadAsync().catch(() => undefined);
          setAudioSound(null);
        }
        const { sound, status } = await Audio.Sound.createAsync({ uri: url });
        if (status.isLoaded) {
          setAudioTotalMs((prev) => ({
            ...prev,
            [file.id]: status.durationMillis ?? 0,
          }));
          setAudioProgressMs((prev) => ({
            ...prev,
            [file.id]: status.positionMillis ?? 0,
          }));
        }
        sound.setOnPlaybackStatusUpdate((status: AVPlaybackStatus) => {
          if (!status.isLoaded) return;
          // Only update progress if user is not dragging the slider
          if (!isDraggingRef.current && "positionMillis" in status) {
            setAudioProgressMs((prev) => ({
              ...prev,
              [file.id]: status.positionMillis ?? 0,
            }));
          }
          if (
            "durationMillis" in status &&
            typeof status.durationMillis === "number"
          ) {
            setAudioTotalMs((prev) => ({
              ...prev,
              [file.id]: status.durationMillis ?? 0,
            }));
          }
          if ((status as any).didJustFinish) {
            setPlayingId(null);
            sound.setPositionAsync(0).catch(() => undefined);
            setAudioProgressMs((prev) => ({ ...prev, [file.id]: 0 }));
          }
        });
        setAudioSound(sound);
        await sound.playAsync();
        setPlayingId(file.id);
      } else {
        if (!audioSound) return;
        const status = await audioSound.getStatusAsync();
        if (status.isLoaded && status.isPlaying) {
          await audioSound.pauseAsync();
          setPlayingId(null);
        } else {
          await audioSound.playAsync();
          setPlayingId(file.id);
        }
      }
    } catch (err) {
      console.error("Failed to toggle audio playback", err);
      Alert.alert("Error", "Failed to play this audio file.");
    } finally {
      setIsAudioLoading(false);
    }
  };

  const handleOpenDocumentFile = async (file: BundleFile) => {
    const source = String(getPreviewUri(file) || file?.url || "").trim();
    if (!source) {
      Alert.alert("File not ready", "This document link is not available yet.");
      return;
    }
    await openDocumentFromLocalOrDownload({
      sourceUri: source,
      fileName: getDisplayFileNameForUi(
        file?.name,
        file?.type,
        (file as any)?.contentType ?? file?.type
      ),
      contentType: (file as any)?.contentType ?? file?.type,
    });
  };

  if (!isVisible || !bundleData) return null;

  return (
    // === BundleModal Overlay Container ===
    <Modal
      visible
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
    <View
      className="flex-1"
      style={[
        { backgroundColor: "rgba(0,0,0,0.75)" },
        bundleShellFullscreen
          ? { paddingBottom: insets.bottom }
          : { justifyContent: "center", alignItems: "center" },
      ]}
    >
      {/* === BundleModal Main Card === */}
      <View
        className={`bg-background ${bundleShellFullscreen ? "" : "rounded-lg mx-6 w-11/12"}`}
        style={
          bundleShellFullscreen
            ? { flex: 1, width: "100%", maxHeight: "100%" }
            : { height: "75%", maxHeight: "80%" }
        }
      >
        {/* === BundleModal Header === */}
        <View
          style={{
            paddingTop: bundleShellFullscreen ? insets.top + 6 : 10,
            paddingHorizontal: 20,
            paddingBottom: 12,
            borderBottomWidth: 1,
            borderBottomColor: "#4B5563",
          }}
          className="flex-row items-center justify-between"
        >
          <View className="flex-row items-center flex-1 mr-2" style={{ minWidth: 0 }}>
            <View className="w-3 h-3 rounded-full bg-button-outline mr-3" />
            <Text
              className="text-white text-xl font-semibold"
              numberOfLines={1}
              style={{ flexShrink: 1 }}
            >
              {getDisplayFileNameForUi(
                bundleData.name,
                bundleData.type ?? "Link",
                bundleData.contentType
              )}
            </Text>
          </View>
          <View className="flex-row items-center flex-shrink-0">
            <TouchableOpacity
              onPress={copyAllLinks}
              style={[copyUrlChipStyle, { flexDirection: "row", alignItems: "center" }]}
              accessibilityLabel="Copy all file URLs"
            >
              <FontAwesomeIcon
                icon={faCopy}
                size={13}
                color={copyUrlsShellFlash ? "#86EFAC" : "#9CA3AF"}
              />
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "500",
                  color: copyUrlsShellFlash ? "#86EFAC" : "#9CA3AF",
                  marginLeft: 5,
                }}
              >
                {copyUrlsShellFlash ? "Copied!" : "Copy all"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onClose}
              style={{
                marginLeft: HEADER_ACTION_SEPARATOR,
                minWidth: 56,
                minHeight: 56,
                justifyContent: "center",
                alignItems: "center",
              }}
              accessibilityLabel="Close bundle details"
            >
              <FontAwesomeIcon icon={faXmark} size={22} color="white" />
            </TouchableOpacity>
          </View>
        </View>

        {/* === BundleModal Details Body (single scroll container) === */}
        <ScrollView
          className="p-6"
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={true}
        >
          {/* Top linq metadata — collapsed so the child files start near the top */}
          <View style={{ marginBottom: 14 }}>
            <CollapsibleFileDetails
              summary={`linq · ${formatLinqCreatedDisplay(
                bundleData.createdAt,
                (bundleData as any).date
              )}`}
              id={bundleData.id}
              createdAt={bundleData.createdAt}
              date={(bundleData as any).date}
              creator={bundleData.creator}
              dirty={(bundleData as any).dirty}
              isOnline={isOnline}
            />
          </View>

          {/* === Bundle URL === */}
          {/* Commented out - bundle URLs don't work when opened from mobile app browser */}
          {/* {bundleData.url && (
            <View className="mb-4">
              <Text className="text-gray-400 text-sm mb-1">URL:</Text>
              <TouchableOpacity onPress={() => bundleData.url && openURL(bundleData.url)}>
                <Text
                  className="text-blue-400 text-sm underline"
                  numberOfLines={1}
                  ellipsizeMode="middle"
                >
                  {bundleData.url}
                </Text>
              </TouchableOpacity>
            </View>
          )} */}
         

          {/* === Bundle URLs Section (Collapsible) === */}
          {/* <View className="mb-4">
            <TouchableOpacity
              onPress={() => setIsUrlsExpanded(!isUrlsExpanded)}
              className="flex-row items-center justify-between mb-1"
            >
              <Text className="text-gray-400 text-sm">
                Linked URLs ({bundleData.bundledUrls.length}):
              </Text>
              <FontAwesomeIcon
                icon={isUrlsExpanded ? faChevronUp : faChevronDown}
                size={12}
                color="#9CA3AF"
              />
            </TouchableOpacity>
            {isUrlsExpanded && (
              <View>
            {bundleData.bundledUrls.map((url, index) => {
              // Try to find the file ID for this URL from bundleData.files
              const file = bundleData?.files?.find(f => f.url === url);
              const fileId = file?.id;
              return (
                  <TouchableOpacity
                    key={index}
                    onPress={() => openURL(url, fileId)}
                    className="mb-1"
                  >
                    <Text
                      className="text-blue-400 text-sm underline"
                      numberOfLines={1}
                      ellipsizeMode="middle"
                    >
                      {url}
                    </Text>
              </TouchableOpacity>
            );
            })}
              </View>
            )}
          </View> */}

          {/* === Bundled Files Section === */}
          <View className="border-t border-gray-600 pt-4">
            <Text className="text-white text-lg font-semibold mb-4">
              linqed Files:
            </Text>
            {!bundleData?.files?.length ? (
              <View className="mb-4">
                {bundleData?.isHydratingChildren ? (
                  <ChildLoadingIndicator />
                ) : (
                  <PreviewFallbackBanner
                    message={previewFixingMessage(
                      getDisplayFileNameForUi(
                        bundleData.name,
                        bundleData.type ?? "Link",
                        bundleData.contentType
                      )
                    )}
                  />
                )}
              </View>
            ) : null}
            {bundleData?.files?.map((file, fileIndex) => {
              const isNested = isNestedBundle(file);
              const nestedBundleData = isNested ? (file as any) : null;
              const isLoadingChild = isChildStillLoading(file);
              return (
              // === Individual Bundled File Card ===
              <View key={`file-${file.id}-${fileIndex}`} className="bg-card-bg rounded-lg p-4 mb-3">
                {/* === File Header (Type + Copy Link) === */}
                <View className="flex-row items-center justify-between mb-3">
                  <View
                    className="flex-row items-center flex-1 mr-2"
                    style={{ minWidth: 0 }}
                  >
                    <View
                      className={`w-2 h-2 rounded-full ${getTypeColor(isNested ? "button-border-color" : file.typeColor)} mr-2`}
                    />
                    <Text
                      className="text-white text-base font-semibold"
                      numberOfLines={1}
                      style={{ flexShrink: 1 }}
                    >
                      {isNested ||
                      file.type === "Bundle" ||
                      file.type === "bundle" ||
                      String(file.type ?? "").toLowerCase() === "linq"
                        ? "linq"
                        : file.type}
                    </Text>
                    {isLoadingChild ? (
                      <View style={styles.pendingDot} />
                    ) : null}
                  </View>
                </View>

                <View style={{ marginBottom: 14 }}>
                  <CollapsibleFileDetails
                    summary={`${isNested ? "linq" : String(file.type ?? "File")} · ${formatLinqCreatedDisplay(
                      file.createdAt,
                      (file as any).date
                    )}`}
                    displayName={getDisplayFileNameForUi(
                      file.name,
                      file.type,
                      (file as any).contentType
                    )}
                    id={file.id}
                    createdAt={file.createdAt}
                    date={(file as any).date}
                    creator={file.creator}
                    dirty={(file as any).dirty}
                    isOnline={isOnline}
                  />
                </View>

                {/* === Nested Bundle Contents (Displayed Inline - Compact) === */}
                {isNested && nestedBundleData ? (
                  <View className="mb-3 bg-gray-700 rounded-lg p-2 border border-gray-600">
                    {/* Nested Bundle Header - Compact */}
                    <View className="flex-row items-center justify-between mb-2">
                      <View className="flex-row items-center flex-1">
                        <View className="w-1.5 h-1.5 rounded-full bg-button-outline mr-1.5" />
                        <Text className="text-white text-xs font-semibold" numberOfLines={1}>
                          {(nestedBundleData.name === "Bundle" || nestedBundleData.name === "bundle" || nestedBundleData.name === "Linq") ? "linq" : (nestedBundleData.name || "linq")}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => {
                          if (onNestedBundlePress) {
                            onNestedBundlePress(nestedBundleData);
                          }
                        }}
                        activeOpacity={0.7}
                        className="ml-2 bg-button-outline rounded-md px-4 min-h-[52px] items-center justify-center"
                      >
                        <Text className="text-black text-sm font-semibold">Open →</Text>
                      </TouchableOpacity>
                    </View>
                    
                    {/* Display nested bundle's files inline - Compact */}
                    {nestedBundleData.files && nestedBundleData.files.length > 0 ? (
                      <View className="mt-1">
                        {nestedBundleData.files.slice(0, 5).map((nestedFile: any, nestedIndex: number) => (
                          <View
                            key={`nested-${file.id}-${nestedFile.id || nestedIndex}-${nestedIndex}`}
                            className="bg-gray-800 rounded p-1.5 mb-1 border border-gray-600"
                          >
                            <View className="flex-row items-center">
                              <View
                                className={`w-1 h-1 rounded-full ${getTypeColor((nestedFile.type === "Link" || nestedFile.type === "Bundle" || nestedFile.type === "bundle" || String(nestedFile.type ?? "").toLowerCase() === "linq") ? "button-border-color" : (nestedFile.typeColor || "button-border-color"))} mr-1.5`}
                              />
                              <Text className="text-gray-300 text-xs flex-1" numberOfLines={1}>
                                {getDisplayFileNameForUi(
                                  (nestedFile.name?.trim() ||
                                    (nestedFile.type === "Bundle" ||
                                    nestedFile.type === "bundle" ||
                                    String(nestedFile.type ?? "").toLowerCase() === "linq"
                                      ? "linq"
                                      : nestedFile.type) ||
                                    "File") as string,
                                  nestedFile.type,
                                  nestedFile.contentType
                                )}
                              </Text>
                            </View>
                            {isTextFile(nestedFile as any) ? (
                              stripHtmlPreserveNewlines(
                                String(nestedFile.content ?? "")
                              ).trim() ? (
                                <Text className="text-gray-400 text-xs mt-0.5" numberOfLines={2}>
                                  {(() => {
                                    const t = stripHtmlPreserveNewlines(
                                      typeof nestedFile.content === "string"
                                        ? nestedFile.content
                                        : ""
                                    );
                                    return t
                                      ? t.substring(0, 60) + (t.length > 60 ? "..." : "")
                                      : "";
                                  })()}
                                </Text>
                              ) : (
                                <View className="mt-1">
                                  <PreviewFallbackBanner
                                    message={previewFixingMessage(
                                      getDisplayFileNameForUi(
                                        nestedFile.name,
                                        nestedFile.type,
                                        nestedFile.contentType
                                      )
                                    )}
                                  />
                                </View>
                              )
                            ) : null}
                          </View>
                        ))}
                        {nestedBundleData.files.length > 5 && (
                          <Text className="text-gray-400 text-xs mt-1 text-center">
                            +{nestedBundleData.files.length - 5} more file(s)
                          </Text>
                        )}
                      </View>
                    ) : stripHtmlPreserveNewlines(
                        String(nestedBundleData.content ?? "")
                      ).trim() ? (
                      <Text className="text-gray-400 text-xs">
                        {stripHtmlPreserveNewlines(nestedBundleData.content)}
                      </Text>
                    ) : isLoadingChild ? (
                      <ChildLoadingIndicator />
                    ) : (
                      <PreviewFallbackBanner
                        message={previewFixingMessage(
                          getDisplayFileNameForUi(
                            nestedBundleData.name,
                            nestedBundleData.type,
                            nestedBundleData.contentType
                          )
                        )}
                      />
                    )}
                    
                    {/* Extract Contents Button */}
                    {onExtractContents && (
                      <TouchableOpacity
                        onPress={() => {
                          if (onExtractContents) {
                            onExtractContents(nestedBundleData, file);
                          }
                        }}
                        className="mt-3 bg-button-outline rounded-md px-4 min-h-[52px] items-center justify-center"
                        activeOpacity={0.7}
                      >
                        <Text className="text-black font-semibold text-sm">
                          Extract Contents
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ) : null}

                {/* === File Preview / Actions (match FileDetailModal behavior) === */}
                {!isNested ? (
                isImageFile(file) ? (
                  <View className="mb-3">
                    {isOfflineImageOrPdfPreviewBlocked(
                      isOnline,
                      getFileLocalUri(file),
                      true,
                      false
                    ) ? (
                      <OfflinePreviewNotice compact />
                    ) : getPreviewUri(file) && !imageLoadFailed[file.id] ? (
                      <TouchableOpacity
                        activeOpacity={0.92}
                        onPress={() => setFullscreenImageUri(getPreviewUri(file))}
                      >
                        <Image
                          source={{ uri: getPreviewUri(file) }}
                          style={{
                            width: "100%",
                            aspectRatio: 1.6,
                            borderRadius: 12,
                          }}
                          resizeMode="cover"
                          onError={() =>
                            setImageLoadFailed((prev) => ({ ...prev, [file.id]: true }))
                          }
                        />
                      </TouchableOpacity>
                    ) : isLoadingChild ? (
                      <ChildLoadingIndicator />
                    ) : (
                      <PreviewFallbackBanner
                        message={previewFixingMessage(
                          getDisplayFileNameForUi(
                            file.name,
                            file.type,
                            (file as any).contentType
                          )
                        )}
                      />
                    )}
                  </View>
                ) : isVideoFile(file) ? (
                  <View className="mb-3">
                    {getPreviewUri(file) ? (
                      <Video
                        source={{ uri: getPreviewUri(file) }}
                        style={{ width: "100%", height: 220, borderRadius: 12 }}
                        resizeMode={ResizeMode.CONTAIN}
                        useNativeControls
                      />
                    ) : isLoadingChild ? (
                      <ChildLoadingIndicator />
                    ) : (
                      <PreviewFallbackBanner
                        message={previewFixingMessage(
                          getDisplayFileNameForUi(
                            file.name,
                            file.type,
                            (file as any).contentType
                          )
                        )}
                      />
                    )}
                  </View>
                ) : isPdfFile(file) ? (
                  (() => {
                    const fileLocalUri = getFileLocalUri(file);
                    if (
                      isOfflineImageOrPdfPreviewBlocked(
                        isOnline,
                        fileLocalUri,
                        false,
                        true
                      )
                    ) {
                      return (
                        <View className="mb-3">
                          <OfflinePreviewNotice compact />
                        </View>
                      );
                    }
                    const inlinePdfUri = getInlinePdfUri(file);
                    if (!inlinePdfUri) {
                      return (
                        <View className="mb-3">
                          {isLoadingChild ? (
                            <ChildLoadingIndicator />
                          ) : (
                            <PreviewFallbackBanner
                              message={previewFixingMessage(
                                getDisplayFileNameForUi(
                                  file.name,
                                  file.type,
                                  (file as any).contentType
                                )
                              )}
                            />
                          )}
                          <TouchableOpacity
                            onPress={() => void handleOpenDocumentFile(file)}
                            disabled={!getOpenInTabTarget(file)}
                            style={{
                              backgroundColor: "#3B82F6",
                              paddingVertical: 10,
                              paddingHorizontal: 14,
                              borderRadius: 8,
                              minHeight: 52,
                              justifyContent: "center",
                              opacity: getOpenInTabTarget(file) ? 1 : 0.5,
                            }}
                          >
                            <Text style={{ color: "#fff", fontWeight: "600", textAlign: "center" }}>
                              Open in Files
                            </Text>
                          </TouchableOpacity>
                        </View>
                      );
                    }
                    // iOS WebView can show file:// PDFs offline; Android needs an external app when offline.
                    const shouldShowOpenPdfFallback =
                      (Platform.OS === "android" && !isOnline) ||
                      Boolean(pdfTimedOut[file.id]) ||
                      Boolean(pdfError[file.id]);
                    if (shouldShowOpenPdfFallback) {
                      const showAndroidOfflineHelperCopy =
                        Platform.OS === "android" &&
                        !isOnline &&
                        Boolean(fileLocalUri);
                      return (
                        <View
                          className="mb-3"
                          style={{
                            width: "100%",
                            minHeight: 150,
                            borderRadius: 12,
                            backgroundColor: "#111827",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: 16,
                          }}
                        >
                          <Text
                            style={{
                              color: "#F9FAFB",
                              textAlign: "center",
                              lineHeight: 20,
                              marginBottom: 12,
                            }}
                          >
                            {showAndroidOfflineHelperCopy
                              ? "PDF is saved offline. Android opens local PDFs through a PDF app."
                              : "This PDF didn't load in the viewer. You can open it in another app."}
                          </Text>
                          <TouchableOpacity
                            onPress={() => void handleOpenDocumentFile(file)}
                            style={{
                              backgroundColor: "#D7827E",
                              paddingVertical: 10,
                              paddingHorizontal: 14,
                              borderRadius: 8,
                              minHeight: 52,
                              justifyContent: "center",
                            }}
                          >
                            <Text style={{ color: "#111827", fontWeight: "700" }}>
                              Open PDF
                            </Text>
                          </TouchableOpacity>
                        </View>
                      );
                    }
                    // Direct PDF URI only — no Google viewer, no JS, no file:// access.
                    return (
                      <View
                        className="mb-3"
                        style={{
                          width: "100%",
                          height: 420,
                          borderRadius: 12,
                          overflow: "hidden",
                          backgroundColor: "#111",
                        }}
                      >
                        <WebView
                          source={{
                            uri: inlinePdfUri,
                          }}
                          originWhitelist={["https://*", "http://*", "file://*"]}
                          onLoadStart={() => {
                            if (pdfTimeoutRef.current[file.id]) {
                              clearTimeout(pdfTimeoutRef.current[file.id]);
                            }
                            pdfTimeoutRef.current[file.id] = setTimeout(() => {
                              setPdfTimedOut((prev) => ({ ...prev, [file.id]: true }));
                            }, 5_000);
                            setPdfTimedOut((prev) => ({ ...prev, [file.id]: false }));
                            setPdfError((prev) => ({ ...prev, [file.id]: null }));
                          }}
                          onLoadEnd={() => {
                            if (pdfTimeoutRef.current[file.id]) {
                              clearTimeout(pdfTimeoutRef.current[file.id]);
                              delete pdfTimeoutRef.current[file.id];
                            }
                            setPdfTimedOut((prev) => ({ ...prev, [file.id]: false }));
                          }}
                          onError={(e) => {
                            if (pdfTimeoutRef.current[file.id]) {
                              clearTimeout(pdfTimeoutRef.current[file.id]);
                              delete pdfTimeoutRef.current[file.id];
                            }
                            setPdfTimedOut((prev) => ({ ...prev, [file.id]: false }));
                            setPdfError((prev) => ({
                              ...prev,
                              [file.id]: e?.nativeEvent?.description ?? "Failed to load PDF",
                            }));
                          }}
                          javaScriptEnabled={false}
                          allowFileAccess={false}
                          scalesPageToFit
                        />
                      </View>
                    );
                  })()
                ) : isTextFile(file) ? (
                  stripHtmlPreserveNewlines(String(file.content ?? "")).trim() ? (
                    <View className="mb-3 bg-gray-600 rounded-lg p-3">
                      <Text className="text-white text-sm leading-5 whitespace-pre-line">
                        {stripHtmlPreserveNewlines(file.content)}
                      </Text>
                    </View>
                  ) : isLoadingChild ? (
                    <View className="mb-3">
                      <ChildLoadingIndicator />
                    </View>
                  ) : (
                    <View className="mb-3">
                      <PreviewFallbackBanner
                        message={previewFixingMessage(
                          getDisplayFileNameForUi(
                            file.name,
                            file.type,
                            (file as any).contentType
                          )
                        )}
                      />
                    </View>
                  )
                ) : isAudioFile(file) ? (
                  <View className="mb-3">
                    {getPreviewUri(file) ? (
                      <>
                        <TouchableOpacity
                          onPress={() => handleAudioToggle(file)}
                          className={`rounded-md px-3 items-center justify-center ${playingId === file.id ? "bg-red-600" : "bg-button-outline"}`}
                          style={styles.audioButton}
                          accessibilityRole="button"
                          accessibilityLabel={
                            playingId === file.id
                              ? "Pause recording playback"
                              : "Play recording"
                          }
                          disabled={isAudioLoading}
                        >
                          <Text
                            className={
                              playingId === file.id
                                ? "text-white font-semibold"
                                : "text-black font-semibold"
                            }
                          >
                            {playingId === file.id ? "Pause" : "Play"}
                          </Text>
                        </TouchableOpacity>
                        {(audioTotalMs[file.id] ?? 0) > 0 && (
                          <View style={{ marginTop: 12, marginBottom: 8 }}>
                            <Slider
                              style={{ width: "100%", height: 40 }}
                              minimumValue={0}
                              maximumValue={audioTotalMs[file.id] || 1}
                              value={audioProgressMs[file.id] || 0}
                              minimumTrackTintColor="#D7827E"
                              maximumTrackTintColor="#666666"
                              thumbTintColor="#D7827E"
                              onValueChange={(value) =>
                                handleSliderValueChange(file.id, value)
                              }
                              onSlidingStart={handleSliderSlidingStart}
                              onSlidingComplete={(value) =>
                                handleSliderSlidingComplete(file.id, value)
                              }
                              disabled={playingId !== file.id || isAudioLoading}
                            />
                          </View>
                        )}
                        <View style={{ marginTop: 8, alignItems: "center" }}>
                          <Text style={{ color: "white", fontSize: 12 }}>
                            {formatDuration(audioProgressMs[file.id])} /{" "}
                            {formatDuration(audioTotalMs[file.id])}
                          </Text>
                        </View>
                      </>
                    ) : isLoadingChild ? (
                      <ChildLoadingIndicator />
                    ) : (
                      <PreviewFallbackBanner
                        message={previewFixingMessage(
                          getDisplayFileNameForUi(
                            file.name,
                            file.type,
                            (file as any).contentType
                          )
                        )}
                      />
                    )}
                  </View>
                ) : isLoadingChild ? (
                  <View className="mb-3">
                    <ChildLoadingIndicator />
                  </View>
                ) : (
                  <View className="mb-3">
                    <PreviewFallbackBanner
                      message={previewFixingMessage(
                        getDisplayFileNameForUi(
                          file.name,
                          file.type,
                          (file as any).contentType
                        )
                      )}
                    />
                  </View>
                )
                ) : null}

              </View>
            );
            })}
          </View>
        </ScrollView>
      </View>
      <FileDetailModal
        isVisible={overlayChildFile != null}
        selectedFile={
          overlayChildFile
            ? {
                ...overlayChildFile,
                contentType: (overlayChildFile as any).contentType,
                local_uri: (overlayChildFile as any).local_uri,
                mediaType: (overlayChildFile as any).mediaType,
              }
            : null
        }
        onClose={() => setOverlayChildFile(null)}
        getTypeColor={getTypeColor}
        fetchUrl={fetchUrl}
        startFullscreen
        hostedInModal
      />
      <FullscreenImageOverlay
        imageUri={fullscreenImageUri}
        visible={Boolean(fullscreenImageUri)}
        onClose={() => setFullscreenImageUri(null)}
      />
    </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  audioButton: {
    minHeight: 48,
  },
  childPlaceholder: {
    height: 56,
    borderRadius: 8,
    backgroundColor: "rgba(215,130,126,0.10)",
  },
  pendingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginLeft: 8,
    backgroundColor: LINQ_LOADING_COLOR,
  },
});

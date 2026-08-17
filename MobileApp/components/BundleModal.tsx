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
  TextInput,
} from "react-native";
// @ts-ignore - Slider component from @react-native-community/slider
import Slider from "@react-native-community/slider";
import { FontAwesomeIcon } from "./AppIcon";
import {
  faXmark,
  faCopy,
  faPlus,
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
  } | null;
  onClose: () => void;
  getTypeColor: (color: string) => string;
  onNestedBundlePress?: (nestedBundle: any) => void;
  onExtractContents?: (nestedBundle: any, nestedBundleFile: BundleFile) => void;
  fetchUrl?: (fileId: string) => Promise<string | null>;
  onAddFiles?: () => void;
  onRename?: (name: string) => void | Promise<void>;
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
  onAddFiles,
  onRename,
}) => {
  const insets = useSafeAreaInsets();
  const [overlayChildFile, setOverlayChildFile] = useState<BundleFile | null>(null);
  // Opaque fullScreen Modal — fill the screen (no transparent 72% sheet).
  const bundleShellFullscreen = true;
  const [copyUrlsShellFlash, setCopyUrlsShellFlash] = useState(false);
  const [copiedLinkFileId, setCopiedLinkFileId] = useState<string | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  // Keep last payload so the Modal can dismiss with visible={false} even when
  // the parent clears bundleData in the same close handler.
  const retainedBundleRef = useRef(bundleData);
  if (bundleData) retainedBundleRef.current = bundleData;
  const activeBundle = bundleData ?? retainedBundleRef.current;

  useEffect(() => {
    if (!isVisible) {
      setOverlayChildFile(null);
      setIsEditingName(false);
    }
  }, [isVisible]);

  const copyAllLinks = () => {
    if (!activeBundle) return;
    try {
      const allUrls = (activeBundle.files ?? [])
        .map((f) => `${API_BASE}/preview/${f.id}`)
        .filter(Boolean)
        .join("\n");
      const fallback = (activeBundle.bundledUrls ?? []).join("\n");
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
          // Already fetched fresh this session — no need to refetch.
          if (existing && !isSitePreviewUrl(existing)) return;
          const local = getFileLocalUri(file);
          if (local) return;
          if (!isOnline) return;
          // Never trust `file.url` here — it's a presigned S3 link cached from
          // whenever the bundle was last hydrated/synced and can already be
          // expired by the time this modal opens. Always mint a fresh one,
          // matching the web app's behavior.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate once per open / file set (+ retry when connectivity returns)
  }, [isVisible, bundleData?.files, fetchUrl, isOnline]);

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
    const local = getFileLocalUri(file);
    let source = "";
    if (local) {
      source = local;
    } else if (!isOnline) {
      Alert.alert("You're offline", "Connect to the internet to open this file.");
      return;
    } else {
      // Always mint a fresh URL at open-time rather than reuse a cached one —
      // presigned S3 links expire and mobile has no way to know when.
      const id = String(file?.id ?? "").trim();
      if (fetchUrl && id && !id.startsWith("opt-")) {
        try {
          source = String((await fetchUrl(id)) ?? "").trim();
        } catch {
          source = "";
        }
      }
      if (!source) source = String(getPreviewUri(file) || "").trim();
    }
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

  if (!activeBundle) return null;

  return (
    // === BundleModal Overlay Container ===
    <Modal
      visible={isVisible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      supportedOrientations={["portrait", "landscape"]}
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
        className={`bg-background ${bundleShellFullscreen ? "" : "rounded-lg mx-4 w-11/12"}`}
        style={
          bundleShellFullscreen
            ? { flex: 1, width: "100%", maxHeight: "100%" }
            : { height: "72%", maxHeight: "76%" }
        }
      >
        {/* === BundleModal Header === */}
        <View
          style={{
            paddingTop: bundleShellFullscreen ? insets.top + 4 : 8,
            paddingHorizontal: 14,
            paddingBottom: 10,
            borderBottomWidth: 1,
            borderBottomColor: "#4B5563",
          }}
          className="flex-row items-center justify-between"
        >
          <View className="flex-row items-center flex-1 mr-2" style={{ minWidth: 0 }}>
            <View className="w-3 h-3 rounded-full bg-button-outline mr-3" />
            {isEditingName ? (
              <TextInput
                value={nameDraft}
                onChangeText={setNameDraft}
                autoFocus
                maxLength={80}
                style={{
                  flex: 1,
                  color: "#fff",
                  fontSize: 18,
                  fontWeight: "600",
                  minHeight: 44,
                }}
                returnKeyType="done"
                onSubmitEditing={() => {
                  const next = String(nameDraft ?? "").trim().slice(0, 80);
                  setIsEditingName(false);
                  if (next && onRename) void onRename(next);
                }}
                onBlur={() => {
                  const next = String(nameDraft ?? "").trim().slice(0, 80);
                  setIsEditingName(false);
                  if (next && onRename) void onRename(next);
                }}
              />
            ) : (
              <TouchableOpacity
                onPress={() => {
                  if (!onRename || !activeBundle) return;
                  setNameDraft(
                    getDisplayFileNameForUi(
                      activeBundle.name,
                      activeBundle.type ?? "Link",
                      activeBundle.contentType
                    )
                  );
                  setIsEditingName(true);
                }}
                style={{ flex: 1, minHeight: 44, justifyContent: "center" }}
                accessibilityRole="button"
                accessibilityLabel="Rename linq"
              >
                <Text
                  className="text-white text-xl font-semibold"
                  numberOfLines={1}
                  style={{ flexShrink: 1 }}
                >
                  {getDisplayFileNameForUi(
                    activeBundle.name,
                    activeBundle.type ?? "Link",
                    activeBundle.contentType
                  )}
                </Text>
              </TouchableOpacity>
            )}
          </View>
          <View className="flex-row items-center flex-shrink-0">
            {onAddFiles ? (
              <TouchableOpacity
                onPress={onAddFiles}
                style={{
                  minWidth: 48,
                  minHeight: 48,
                  justifyContent: "center",
                  alignItems: "center",
                  marginRight: 4,
                }}
                accessibilityLabel="Add files to linq"
                accessibilityRole="button"
              >
                <FontAwesomeIcon icon={faPlus} size={18} color="white" />
              </TouchableOpacity>
            ) : null}
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
          className="p-4"
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={true}
        >
          {/* Top linq metadata — collapsed so the child files start near the top */}
          <View style={{ marginBottom: 10 }}>
            <CollapsibleFileDetails
              summary={`linq · ${formatLinqCreatedDisplay(
                activeBundle.createdAt,
                (activeBundle as any).date
              )}`}
              id={activeBundle.id}
              createdAt={activeBundle.createdAt}
              date={(activeBundle as any).date}
              creator={activeBundle.creator}
              dirty={(activeBundle as any).dirty}
              isOnline={isOnline}
            />
          </View>

          {/* === Bundle URL === */}
          {/* Commented out - bundle URLs don't work when opened from mobile app browser */}
          {/* {activeBundle.url && (
            <View className="mb-4">
              <Text className="text-gray-400 text-sm mb-1">URL:</Text>
              <TouchableOpacity onPress={() => activeBundle.url && openURL(activeBundle.url)}>
                <Text
                  className="text-blue-400 text-sm underline"
                  numberOfLines={1}
                  ellipsizeMode="middle"
                >
                  {activeBundle.url}
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
                Linked URLs ({activeBundle.bundledUrls.length}):
              </Text>
              <FontAwesomeIcon
                icon={isUrlsExpanded ? faChevronUp : faChevronDown}
                size={12}
                color="#9CA3AF"
              />
            </TouchableOpacity>
            {isUrlsExpanded && (
              <View>
            {activeBundle.bundledUrls.map((url, index) => {
              // Try to find the file ID for this URL from activeBundle.files
              const file = activeBundle?.files?.find(f => f.url === url);
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

          {/* Compact folder rows — open FileDetail / nested linq on tap */}
          <View className="border-t border-gray-600 pt-3">
            <Text className="text-gray-400 text-sm mb-2">
              {`${activeBundle?.files?.length ?? 0} item${(activeBundle?.files?.length ?? 0) === 1 ? "" : "s"}`}
            </Text>
            {!activeBundle?.files?.length ? (
              <View className="mb-3">
                {activeBundle?.isHydratingChildren ? (
                  <ChildLoadingIndicator />
                ) : (
                  <Text className="text-gray-400 text-sm">
                    Empty folder. Tap + to add files from the dashboard.
                  </Text>
                )}
              </View>
            ) : null}
            {activeBundle?.files?.map((file, fileIndex) => {
              const isNested = isNestedBundle(file);
              const nestedBundleData = isNested ? (file as any) : null;
              const isLoadingChild = isChildStillLoading(file);
              const rowName = getDisplayFileNameForUi(
                file.name,
                file.type,
                (file as any).contentType
              );
              return (
              <TouchableOpacity
                key={`file-${file.id}-${fileIndex}`}
                className="bg-card-bg rounded-lg px-3 mb-2 flex-row items-center"
                style={{ minHeight: 52 }}
                onPress={() => {
                  if (isNested && nestedBundleData && onNestedBundlePress) {
                    onNestedBundlePress(nestedBundleData);
                    return;
                  }
                  setOverlayChildFile(file);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Open ${rowName}`}
              >
                <View
                  className={`w-2 h-2 rounded-full ${getTypeColor(isNested ? "button-border-color" : file.typeColor)} mr-3`}
                />
                <Text
                  className="text-white text-base flex-1"
                  numberOfLines={1}
                  style={{ flexShrink: 1 }}
                >
                  {rowName}
                </Text>
                {isLoadingChild ? <View style={styles.pendingDot} /> : null}
                <Text className="text-gray-400 text-xs ml-2">
                  {isNested ? "linq" : String(file.type ?? "File")}
                </Text>
              </TouchableOpacity>
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

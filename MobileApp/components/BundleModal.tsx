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
import { Swipeable } from "react-native-gesture-handler";
// @ts-ignore - Slider component from @react-native-community/slider
import Slider from "@react-native-community/slider";
import { FontAwesomeIcon } from "./AppIcon";
import {
  faXmark,
  faCopy,
  faPlus,
  faPen,
  faChevronDown,
  faChevronUp,
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
  getFilePreviewUrl,
} from "../utils/helpers";
import { logSafeError } from "../utils/safeLog";
import { PreviewFallbackBanner } from "./PreviewFallbackBanner";
import { OfflinePreviewNotice } from "./OfflinePreviewNotice";
import { CollapsibleFileDetails } from "./LinqMetadataSection";
import { API_BASE } from "../api/client";
import { pdfOriginWhitelist } from "../utils/pdfWebView";
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
  date?: string;
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
  onRenameFile?: (fileId: string, name: string) => void | Promise<string | undefined>;
  /** Remove a child from this linq without deleting the underlying file. */
  onRemoveFile?: (fileId: string) => void | Promise<void>;
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
  onRenameFile,
  onRemoveFile,
}) => {
  const insets = useSafeAreaInsets();
  const [overlayChildFile, setOverlayChildFile] = useState<BundleFile | null>(null);
  // Opaque fullScreen Modal — fill the screen (no transparent 72% sheet).
  const bundleShellFullscreen = true;
  const [copyUrlsShellFlash, setCopyUrlsShellFlash] = useState(false);
  const [copiedLinkFileId, setCopiedLinkFileId] = useState<string | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  // Per-file preview collapse. Absent/false = expanded (preview shown by default).
  const [collapsedFileIds, setCollapsedFileIds] = useState<Record<string, boolean>>({});
  const swipeRowRefs = useRef<Record<string, Swipeable | null>>({});
  // Keep last payload so the Modal can dismiss with visible={false} even when
  // the parent clears bundleData in the same close handler.
  const retainedBundleRef = useRef(bundleData);
  if (bundleData) retainedBundleRef.current = bundleData;
  const activeBundle = bundleData ?? retainedBundleRef.current;

  useEffect(() => {
    if (!isVisible) {
      setOverlayChildFile(null);
      setIsEditingName(false);
      setCollapsedFileIds({});
      swipeRowRefs.current = {};
    }
  }, [isVisible]);

  useEffect(() => {
    if (!overlayChildFile?.id) return;
    const updated = activeBundle?.files?.find((f) => f.id === overlayChildFile.id);
    if (updated && updated.name !== overlayChildFile.name) {
      setOverlayChildFile(updated);
    }
  }, [activeBundle?.files, overlayChildFile?.id, overlayChildFile?.name]);

  const copyAllLinks = () => {
    if (!activeBundle) return;
    try {
      const allUrls = (activeBundle.files ?? [])
        .map((f) => getFilePreviewUrl(f.id))
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
      logSafeError("Failed to copy to clipboard", err);
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
      logSafeError("Failed to copy to clipboard", err);
    }
  };

  const toggleFileCollapsed = (fileId: string) => {
    setCollapsedFileIds((prev) => ({ ...prev, [fileId]: !prev[fileId] }));
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
    paddingHorizontal: 4,
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
        logSafeError("Failed to seek audio", err);
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
      logSafeError("Failed to toggle audio playback", err);
      Alert.alert("Error", "Failed to play this audio file.");
    } finally {
      setIsAudioLoading(false);
    }
  };

  if (!activeBundle) return null;

  // Nested linqs have no inline preview of their own — only real files count
  // toward "collapse all / expand all".
  const previewableFiles = (activeBundle?.files ?? []).filter(
    (f) => !isNestedBundle(f)
  );
  const allPreviewsCollapsed =
    previewableFiles.length > 0 &&
    previewableFiles.every((f) => collapsedFileIds[f.id]);

  const toggleAllPreviews = () => {
    if (allPreviewsCollapsed) {
      setCollapsedFileIds({});
      return;
    }
    const next: Record<string, boolean> = {};
    for (const f of previewableFiles) next[f.id] = true;
    setCollapsedFileIds(next);
  };

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
      className={`flex-1 ${bundleShellFullscreen ? "bg-background" : ""}`}
      style={
        bundleShellFullscreen
          ? undefined
          : {
              backgroundColor: "rgba(0,0,0,0.75)",
              justifyContent: "center",
              alignItems: "center",
            }
      }
    >
      {/* === BundleModal Main Card === */}
      <View
        className={`${bundleShellFullscreen ? "" : "bg-background rounded-lg mx-4 w-11/12"}`}
        style={
          bundleShellFullscreen
            ? { flex: 1, width: "100%" }
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
                style={{
                  flex: 1,
                  minHeight: 44,
                  flexDirection: "row",
                  alignItems: "center",
                }}
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
                {/* Pen icon signals the title itself is tappable to rename. */}
                <FontAwesomeIcon
                  icon={faPen}
                  size={12}
                  color="#9CA3AF"
                  style={{ marginLeft: 8 }}
                />
              </TouchableOpacity>
            )}
          </View>
          <View className="flex-row items-center flex-shrink-0" style={{ gap: HEADER_ACTION_SEPARATOR }}>
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
                  fontSize: 13,
                  fontWeight: "500",
                  color: copyUrlsShellFlash ? "#86EFAC" : "#9CA3AF",
                  marginLeft: 4,
                }}
              >
                {copyUrlsShellFlash ? "Copied!" : "Copy"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onClose}
              style={{
                minWidth: 48,
                minHeight: 48,
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
          contentContainerStyle={{
            flexGrow: 1,
            paddingBottom: onAddFiles ? insets.bottom + 96 : insets.bottom + 16,
          }}
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

          {/* Folder rows — open FileDetail / nested linq on tap; files preview inline by default */}
          <View className="border-t border-gray-600 pt-3">
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-gray-400 text-sm">
                {`${activeBundle?.files?.length ?? 0} item${(activeBundle?.files?.length ?? 0) === 1 ? "" : "s"}`}
              </Text>
              {previewableFiles.length > 0 ? (
                <TouchableOpacity
                  onPress={toggleAllPreviews}
                  style={{ minHeight: 40, paddingHorizontal: 8, justifyContent: "center" }}
                  accessibilityRole="button"
                  accessibilityLabel={allPreviewsCollapsed ? "Expand all previews" : "Collapse all previews"}
                >
                  <Text className="text-gray-400 text-xs font-medium">
                    {allPreviewsCollapsed ? "Expand all" : "Collapse all"}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
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
              const fileDateDisplay = formatLinqCreatedDisplay(
                file.createdAt,
                (file as any).date
              );
              const isCollapsed = Boolean(collapsedFileIds[file.id]);
              const openThisFile = () => {
                if (isNested && nestedBundleData && onNestedBundlePress) {
                  onNestedBundlePress(nestedBundleData);
                  return;
                }
                setOverlayChildFile(file);
              };
              const removeFromLinq = () => {
                if (!onRemoveFile) return;
                if (String(overlayChildFile?.id) === String(file.id)) {
                  setOverlayChildFile(null);
                }
                setCollapsedFileIds((prev) => {
                  const next = { ...prev };
                  delete next[file.id];
                  return next;
                });
                void onRemoveFile(file.id);
              };
              const renderRemoveAction = () => (
                <TouchableOpacity
                  onPress={removeFromLinq}
                  style={styles.swipeRemoveAction}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${rowName} from linq`}
                >
                  <Text style={styles.swipeRemoveLabel}>Remove</Text>
                </TouchableOpacity>
              );
              return (
              <View
                key={`file-${file.id}-${fileIndex}`}
                className="bg-card-bg rounded-lg mb-2 overflow-hidden"
              >
                <Swipeable
                  ref={(ref) => {
                    swipeRowRefs.current[String(file.id)] = ref;
                  }}
                  renderRightActions={onRemoveFile ? renderRemoveAction : undefined}
                  overshootRight={false}
                  onSwipeableWillOpen={() => {
                    for (const [id, ref] of Object.entries(swipeRowRefs.current)) {
                      if (id !== String(file.id) && ref) ref.close();
                    }
                  }}
                  enabled={Boolean(onRemoveFile)}
                >
                <View className="flex-row items-center px-3 bg-card-bg" style={{ minHeight: 52 }}>
                  <TouchableOpacity
                    className="flex-1 flex-row items-center"
                    style={{ minHeight: 52 }}
                    onPress={openThisFile}
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${rowName}`}
                  >
                    <View
                      className={`w-2 h-2 rounded-full ${getTypeColor(isNested ? "button-border-color" : file.typeColor)} mr-3`}
                    />
                    <View
                      className="flex-1 flex-row items-center"
                      style={{ minWidth: 0 }}
                    >
                      <Text
                        className="text-white text-base"
                        numberOfLines={1}
                        style={{ flexShrink: 1 }}
                      >
                        {rowName}
                      </Text>
                      {fileDateDisplay ? (
                        <Text
                          className="text-gray-400 text-xs ml-2"
                          numberOfLines={1}
                          style={{ flexShrink: 0 }}
                        >
                          {fileDateDisplay}
                        </Text>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                  {isLoadingChild ? <View style={styles.pendingDot} /> : null}
                  <Text className="text-gray-400 text-xs ml-2">
                    {isNested ? "linq" : String(file.type ?? "File")}
                  </Text>
                  {/* Nested linqs have nothing to preview, so no collapse toggle for them. */}
                  {!isNested ? (
                    <TouchableOpacity
                      onPress={() => toggleFileCollapsed(file.id)}
                      style={{
                        minWidth: 40,
                        minHeight: 48,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={
                        isCollapsed ? `Show ${rowName} preview` : `Hide ${rowName} preview`
                      }
                    >
                      <FontAwesomeIcon
                        icon={isCollapsed ? faChevronDown : faChevronUp}
                        size={12}
                        color="#9CA3AF"
                      />
                    </TouchableOpacity>
                  ) : null}
                </View>
                </Swipeable>

                {/* === File Preview (shown by default, collapsible per card) === */}
                {!isNested && !isCollapsed ? (
                  <View className="px-3 pb-3">
                    {isImageFile(file) ? (
                      isOfflineImageOrPdfPreviewBlocked(
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
                          message={previewFixingMessage(rowName)}
                        />
                      )
                    ) : isVideoFile(file) ? (
                      getPreviewUri(file) ? (
                        <Video
                          source={{ uri: getPreviewUri(file) }}
                          style={{ width: "100%", height: 190, borderRadius: 12 }}
                          resizeMode={ResizeMode.CONTAIN}
                          useNativeControls
                        />
                      ) : isLoadingChild ? (
                        <ChildLoadingIndicator />
                      ) : (
                        <PreviewFallbackBanner
                          message={previewFixingMessage(rowName)}
                        />
                      )
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
                          return <OfflinePreviewNotice compact />;
                        }
                        const inlinePdfUri = getInlinePdfUri(file);
                        if (!inlinePdfUri) {
                          return (
                            <View>
                              {isLoadingChild ? (
                                <ChildLoadingIndicator />
                              ) : (
                                <PreviewFallbackBanner
                                  message={previewFixingMessage(rowName)}
                                />
                              )}
                            </View>
                          );
                        }
                        // iOS WebView can show file:// PDFs offline; Android needs network or a local viewer.
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
                              style={{
                                width: "100%",
                                minHeight: 120,
                                borderRadius: 10,
                                backgroundColor: "#111827",
                                alignItems: "center",
                                justifyContent: "center",
                                padding: 14,
                              }}
                            >
                              <Text
                                style={{
                                  color: "#F9FAFB",
                                  textAlign: "center",
                                  lineHeight: 19,
                                  fontSize: 13,
                                }}
                              >
                                {showAndroidOfflineHelperCopy
                                  ? "PDF is saved offline. In-app preview is unavailable on Android without a network connection."
                                  : previewFixingMessage(rowName)}
                              </Text>
                            </View>
                          );
                        }
                        // Direct PDF URI only — no Google viewer, no JS, no file:// access.
                        return (
                          <View
                            style={{
                              width: "100%",
                              height: 340,
                              borderRadius: 12,
                              overflow: "hidden",
                              backgroundColor: "#111",
                            }}
                          >
                            <WebView
                              source={{ uri: inlinePdfUri }}
                              originWhitelist={pdfOriginWhitelist(inlinePdfUri)}
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
                        <View className="bg-gray-600 rounded-lg p-3">
                          <Text className="text-white text-sm leading-5 whitespace-pre-line">
                            {stripHtmlPreserveNewlines(file.content)}
                          </Text>
                        </View>
                      ) : isLoadingChild ? (
                        <ChildLoadingIndicator />
                      ) : (
                        <PreviewFallbackBanner
                          message={previewFixingMessage(rowName)}
                        />
                      )
                    ) : isAudioFile(file) ? (
                      getPreviewUri(file) ? (
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
                          message={previewFixingMessage(rowName)}
                        />
                      )
                    ) : isLoadingChild ? (
                      <ChildLoadingIndicator />
                    ) : (
                      <PreviewFallbackBanner
                        message={previewFixingMessage(rowName)}
                      />
                    )}
                  </View>
                ) : null}
              </View>
              );
            })}
          </View>
        </ScrollView>
      </View>
      {onAddFiles ? (
        <View
          style={[styles.addFabWrap, { bottom: insets.bottom + 20 }]}
          pointerEvents="box-none"
        >
          <TouchableOpacity
            onPress={onAddFiles}
            className="w-16 h-16 rounded-full border-2 bg-button-outline border-button-outline items-center justify-center"
            style={styles.addFab}
            accessibilityLabel="Add files to linq"
            accessibilityRole="button"
          >
            <FontAwesomeIcon icon={faPlus} size={22} color="black" />
          </TouchableOpacity>
        </View>
      ) : null}
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
        onRename={
          onRenameFile && overlayChildFile
            ? async (nextName) => {
                const storedName = await onRenameFile(overlayChildFile.id, nextName);
                if (storedName) {
                  setOverlayChildFile((prev) =>
                    prev ? { ...prev, name: storedName } : prev
                  );
                }
              }
            : undefined
        }
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
  // Floating at the bottom center of the screen puts the add-files action
  // within easy thumb reach, instead of a small header icon.
  addFabWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  addFab: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 6,
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
  swipeRemoveAction: {
    backgroundColor: "#B45309",
    justifyContent: "center",
    alignItems: "center",
    minWidth: 88,
    paddingHorizontal: 16,
    minHeight: 52,
  },
  swipeRemoveLabel: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },
});

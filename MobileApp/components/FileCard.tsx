/**
 * FileCard Component
 *
 * One row in the file list: select checkbox, type icon or photo thumbnail,
 * name + date, and the type label.
 *
 * The row is a fixed height so FlatList can position rows without measuring
 * them, which is what makes long lists scroll smoothly on older phones.
 */
import React, {
  memo,
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
} from "react";
import {
  Text,
  View,
  TouchableOpacity,
  Image,
  StyleSheet,
  Platform,
} from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { FontAwesomeIcon } from "@fortawesome/react-native-fontawesome";
import {
  faCheck,
  faMicrophone,
  faFileLines,
  faPaperclip,
  faImage,
} from "@fortawesome/free-solid-svg-icons";
import "../global.css";
import { getDisplayFileNameForUi, truncateNameForLog } from "../utils/helpers";
import { pickExtensionFromUri } from "../utils/fileHelpers";
import {
  LIST_THUMB_CACHE_DIR,
  ensureListThumbCacheDir,
  findCachedListThumb,
  noteCachedListThumb,
  normalizeImageUri,
} from "../utils/listThumbCache";
import * as filesApi from "../api/files";

/** Row height in px. FileList uses this for getItemLayout — keep them in sync. */
export const FILE_CARD_HEIGHT = 72;

const MAX_FILE_LIST_NAME_CHARS = 24;

/** Extra room beyond the dedicated 52×52 checkbox touch box.
 * Vertical must stay ≤ half FileList ROW_GAP so stacked cards do not steal taps. */
const CHECKBOX_HIT_SLOP = { top: 4, bottom: 4, left: 8, right: 0 } as const;

type FileCardFile = {
  id: string;
  name: string;
  date: string;
  type: string;
  typeColor: string;
  number: string;
  url?: string;
  /** On-device copy (offline uploads) — prefer over remote url when present */
  local_uri?: string | null;
  contentType?: string;
};

interface FileCardProps {
  file: FileCardFile;
  isSelected: boolean;
  onPress: (file: FileCardFile) => void;
  onToggleSelection: (fileId: string) => void;
  getTypeColor: (color: string) => string;
}

/** Type label shown on the right; linq rows read as "linq" regardless of source. */
function displayTypeLabel(type: string): string {
  const t = String(type ?? "").toLowerCase();
  if (t === "bundle" || t === "link" || t === "linq") return "linq";
  return type;
}

const FileCardBase: React.FC<FileCardProps> = ({
  file,
  isSelected,
  onPress,
  onToggleSelection,
  getTypeColor,
}) => {
  const [diskThumbUri, setDiskThumbUri] = useState<string | undefined>(
    undefined,
  );
  /** Fresh presigned GET when SQLite `url` expired — fetched once per row URL revision. */
  const [refreshedRemoteUrl, setRefreshedRemoteUrl] = useState<string | null>(
    null,
  );
  const thumbDownloadRef = useRef(false);
  const prevRemoteUrlRef = useRef<string>("");
  const urlRefreshAttempted = useRef(false);
  /** Android often skips `onLoad`; `onError` sets this so `onLoadEnd` does not treat a failure as success. */
  const thumbDecodeErroredRef = useRef(false);
  const thumbOnLoadFiredRef = useRef(false);

  const remoteHttpUrl = useMemo(() => {
    const r = String(refreshedRemoteUrl ?? "").trim();
    if (/^https?:\/\//i.test(r)) return r;
    const raw = String(file.url ?? "").trim();
    return /^https?:\/\//i.test(raw) ? raw : "";
  }, [file.url, refreshedRemoteUrl]);

  /** Prefer full binary `local_uri`, then persisted list-thumb cache, then remote / other URIs. */
  const thumbUri = useMemo(() => {
    const local = String(file.local_uri ?? "").trim();
    if (local) return local;
    const disk = String(diskThumbUri ?? "").trim();
    if (disk) return disk;
    const refresh = String(refreshedRemoteUrl ?? "").trim();
    if (/^https?:\/\//i.test(refresh)) return refresh;
    const raw = String(file.url ?? "").trim();
    if (!raw) return undefined;
    if (
      /^https?:\/\//i.test(raw) ||
      raw.startsWith("file://") ||
      raw.startsWith("content://")
    ) {
      return raw;
    }
    return undefined;
  }, [file.local_uri, file.url, diskThumbUri, refreshedRemoteUrl]);

  const [thumbLoaded, setThumbLoaded] = useState(false);
  const [thumbFailed, setThumbFailed] = useState(false);

  // Reset overlay state when the row identity or authoritative on-disk binary path changes —
  // not when only the presigned `url` string rotates (same image), which was causing flicker.
  useEffect(() => {
    setThumbLoaded(false);
    setThumbFailed(false);
    setDiskThumbUri(undefined);
    setRefreshedRemoteUrl(null);
    urlRefreshAttempted.current = false;
    thumbDecodeErroredRef.current = false;
    thumbOnLoadFiredRef.current = false;
    thumbDownloadRef.current = false;
  }, [file.id, file.local_uri]);

  // Re-attach a previously cached list thumbnail. Backed by one cached directory
  // read, so this costs nothing after the first row resolves.
  useEffect(() => {
    let cancelled = false;
    const id = String(file.id ?? "").trim();
    if (!id || String(file.local_uri ?? "").trim()) return;

    void findCachedListThumb(id)
      .then((path) => {
        if (!cancelled && path) setDiskThumbUri(path);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [file.id, file.local_uri]);

  // List API often omits `url` (mapServerRow used to force null). Fetch /files/url/:id so thumbnails
  // have an https source before full download or list-thumb file exists.
  useEffect(() => {
    const id = String(file.id ?? "").trim();
    if (!id || id.startsWith("opt-") || Number((file as any).dirty) === 1) return;
    if (String(file.local_uri ?? "").trim()) return;
    if (String(diskThumbUri ?? "").trim()) return;
    if (/^https?:\/\//i.test(String(file.url ?? "").trim())) return;
    if (/^https?:\/\//i.test(String(refreshedRemoteUrl ?? "").trim())) return;

    const isImg =
      file.type === "Image" ||
      /\.(jpe?g|png|gif|webp|heic|bmp)$/i.test(String(file.name ?? "")) ||
      (file.contentType != null && /image/i.test(String(file.contentType)));
    if (!isImg) return;

    let cancelled = false;
    void filesApi
      .getById(id)
      .then(({ url }) => {
        if (cancelled) return;
        if (url && /^https?:\/\//i.test(String(url).trim())) {
          setRefreshedRemoteUrl(String(url).trim());
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [
    file.id,
    file.type,
    file.name,
    file.contentType,
    file.local_uri,
    file.url,
    diskThumbUri,
    refreshedRemoteUrl,
  ]);

  // After a failed remote load, allow retry when the server URL actually changes.
  useEffect(() => {
    if (remoteHttpUrl !== prevRemoteUrlRef.current) {
      prevRemoteUrlRef.current = remoteHttpUrl;
      if (thumbFailed) setThumbFailed(false);
    }
  }, [remoteHttpUrl, thumbFailed]);

  const persistRemoteThumbAfterLoad = useCallback(async () => {
    const id = String(file.id ?? "").trim();
    const hasFullLocal = String(file.local_uri ?? "").trim().length > 0;
    if (!id || hasFullLocal || thumbDownloadRef.current) return;
    const src = remoteHttpUrl;
    if (!src) return;

    thumbDownloadRef.current = true;
    try {
      await ensureListThumbCacheDir();
      const ext = pickExtensionFromUri(src, ".jpg");
      const dest = `${LIST_THUMB_CACHE_DIR}${id}${ext}`;
      const existing = await FileSystem.getInfoAsync(dest);
      if (existing.exists && (existing as { size?: number }).size !== 0) {
        noteCachedListThumb(id, dest);
        setDiskThumbUri(dest);
        return;
      }
      const result = await FileSystem.downloadAsync(src, dest, {});
      if (result.status === 200) {
        const info = await FileSystem.getInfoAsync(dest);
        const size = (info as { size?: number }).size ?? 0;
        if (size > 0) {
          noteCachedListThumb(id, dest);
          setDiskThumbUri(dest);
        }
      }
    } catch (e) {
      console.warn(
        `[FileCard] thumb cache download failed · ${truncateNameForLog(file.name, 6)}`,
        e,
      );
    } finally {
      thumbDownloadRef.current = false;
    }
  }, [file.id, file.local_uri, file.name, remoteHttpUrl]);

  const isImage = useMemo(() => {
    const typeCheck = file.type === "Image";
    const urlToCheck = thumbUri || file.url || "";
    const urlExtCheck = /\.(jpe?g|png|webp|gif|bmp|heic)$/i.test(urlToCheck);
    const contentTypeCheck =
      file.contentType &&
      /^(jpg|jpeg|png|webp|gif|bmp|heic|image\/)/i.test(file.contentType);
    const s3Check =
      urlToCheck.includes("s3.amazonaws.com") &&
      /\.(jpe?g|png|webp|gif|bmp|heic)/i.test(urlToCheck);

    return Boolean(typeCheck || urlExtCheck || contentTypeCheck || s3Check);
  }, [file.type, file.url, file.contentType, thumbUri]);

  /** Resolved URI for native decoders (file:// for bare paths on Android). */
  const imageDisplayUri = useMemo(
    () => (thumbUri ? normalizeImageUri(thumbUri) : ""),
    [thumbUri],
  );

  const handleCardPress = useCallback(() => {
    // Let the press highlight paint before the heavier open work starts.
    requestAnimationFrame(() => onPress(file));
  }, [onPress, file]);

  const handleToggle = useCallback(
    () => onToggleSelection(file.id),
    [onToggleSelection, file.id],
  );

  const fallbackIcon = useMemo(() => {
    const fileType = file.type?.toLowerCase() || "";
    const fileName = file.name?.toLowerCase() || "";
    if (fileType === "note" || fileName.includes("note")) return faFileLines;
    if (
      fileType === "recording" ||
      fileType === "audio" ||
      fileName.includes("voice memo") ||
      fileName.includes("recording")
    ) {
      return faMicrophone;
    }
    return faPaperclip;
  }, [file.type, file.name]);

  const isLinqRow = useMemo(() => {
    const t = file.type?.toLowerCase() || "";
    return t === "link" || t === "bundle" || t === "linq";
  }, [file.type]);

  const displayName = getDisplayFileNameForUi(
    file.name,
    file.type,
    file.contentType,
  );
  const clippedDisplayName =
    displayName.length > MAX_FILE_LIST_NAME_CHARS
      ? displayName.slice(0, MAX_FILE_LIST_NAME_CHARS)
      : displayName;

  const showPhotoThumb = isImage && Boolean(thumbUri) && !thumbFailed;

  return (
    <View
      className="bg-card-bg rounded-lg flex-row items-center"
      style={styles.cardContainer}
    >
      <TouchableOpacity
        onPress={handleToggle}
        hitSlop={CHECKBOX_HIT_SLOP}
        delayPressIn={0}
        activeOpacity={0.6}
        style={styles.checkboxTouchTarget}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: isSelected }}
        accessibilityLabel={`Select ${displayName}`}
      >
        <View
          className={`w-7 h-7 items-center justify-center ${
            isSelected ? "bg-button-outline" : "border-2 border-white"
          }`}
        >
          {isSelected && (
            <FontAwesomeIcon icon={faCheck} size={15} color="black" />
          )}
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={handleCardPress}
        activeOpacity={0.7}
        hitSlop={{ top: 2, bottom: 2, left: 0, right: 2 }}
        delayPressIn={0}
        style={styles.cardOpenTarget}
        accessibilityRole="button"
        accessibilityLabel={`Open ${displayName}`}
      >
        {showPhotoThumb ? (
          <View
            className="w-10 h-10 rounded-full mr-3 overflow-hidden"
            style={styles.thumbWrap}
          >
            <Image
              key={`thumb-${file.id}-${imageDisplayUri}`}
              source={imageDisplayUri ? { uri: imageDisplayUri } : undefined}
              style={[styles.listThumbImage, { opacity: thumbLoaded ? 1 : 0 }]}
              resizeMode="cover"
              onLoad={() => {
                thumbOnLoadFiredRef.current = true;
                thumbDecodeErroredRef.current = false;
                setThumbLoaded(true);
                void persistRemoteThumbAfterLoad();
              }}
              onLoadEnd={() => {
                if (Platform.OS !== "android") return;
                // Let `onError` run in the same turn when decode fails; then only fill in if `onLoad` never ran.
                setTimeout(() => {
                  if (thumbDecodeErroredRef.current) return;
                  if (thumbOnLoadFiredRef.current) return;
                  setThumbLoaded(true);
                  void persistRemoteThumbAfterLoad();
                }, 0);
              }}
              onError={() => {
                thumbDecodeErroredRef.current = true;
                const idStr = String(file.id ?? "").trim();
                if (
                  !urlRefreshAttempted.current &&
                  idStr &&
                  !idStr.startsWith("opt-") &&
                  Number((file as any).dirty) !== 1
                ) {
                  urlRefreshAttempted.current = true;
                  void filesApi
                    .getById(idStr)
                    .then(({ url }) => {
                      if (url && /^https?:\/\//i.test(String(url).trim())) {
                        setRefreshedRemoteUrl(String(url).trim());
                        setThumbFailed(false);
                        thumbDecodeErroredRef.current = false;
                      } else {
                        setThumbFailed(true);
                      }
                    })
                    .catch(() => setThumbFailed(true));
                  return;
                }
                setThumbFailed(true);
              }}
            />
            {!thumbLoaded ? (
              <View
                className="bg-button-outline rounded-full items-center justify-center"
                style={StyleSheet.absoluteFill}
              >
                <FontAwesomeIcon icon={faImage} size={18} color="black" />
              </View>
            ) : null}
          </View>
        ) : (
          <View className="w-10 h-10 bg-button-outline rounded-full items-center justify-center mr-3">
            {isLinqRow ? (
              <Image
                source={require("../assets/linq-btn-black.png")}
                style={styles.linqIcon}
                resizeMode="contain"
              />
            ) : (
              <FontAwesomeIcon
                icon={isImage ? faImage : fallbackIcon}
                size={18}
                color="black"
              />
            )}
          </View>
        )}

        <View className="flex-1">
          <Text className="text-white text-base font-medium" numberOfLines={1}>
            {clippedDisplayName}
          </Text>
          <Text className="text-gray-400 text-xs mt-0.5" numberOfLines={1}>
            {file.date}
          </Text>
        </View>

        <View className="flex-row items-center ml-2">
          <View
            className={`w-2 h-2 rounded-full ${getTypeColor(file.typeColor)} mr-2`}
          />
          <Text className="text-gray-300 text-xs">
            {displayTypeLabel(file.type)}
          </Text>
        </View>
      </TouchableOpacity>
    </View>
  );
};

function areEqual(prev: FileCardProps, next: FileCardProps) {
  const a = prev.file;
  const b = next.file;
  return (
    prev.isSelected === next.isSelected &&
    prev.onPress === next.onPress &&
    prev.onToggleSelection === next.onToggleSelection &&
    a.id === b.id &&
    a.name === b.name &&
    a.date === b.date &&
    a.type === b.type &&
    a.typeColor === b.typeColor &&
    a.url === b.url &&
    a.local_uri === b.local_uri &&
    a.contentType === b.contentType
  );
}

export const FileCard = memo(FileCardBase, areEqual);

const styles = StyleSheet.create({
  cardContainer: {
    height: FILE_CARD_HEIGHT,
    paddingLeft: 4,
    paddingRight: 14,
  },
  checkboxTouchTarget: {
    width: 52,
    height: FILE_CARD_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  cardOpenTarget: {
    flex: 1,
    height: FILE_CARD_HEIGHT,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
  },
  thumbWrap: {
    backgroundColor: "#1a1a1a",
  },
  listThumbImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  linqIcon: {
    height: 18,
    width: 24,
  },
});

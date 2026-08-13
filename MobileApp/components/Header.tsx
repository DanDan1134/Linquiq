import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Animated,
  Easing,
  Platform,
  StyleSheet,
} from "react-native";
import { FontAwesomeIcon } from "./AppIcon";
import {
  faGear,
  faMagnifyingGlass,
  faFilter,
  faXmark,
  faTrashCan,
  faArrowsRotate,
  faCircleCheck,
  faCircleExclamation,
  faClock,
} from "@fortawesome/free-solid-svg-icons";
import type { SyncStatus } from "../hooks/useSyncStatus";
import "../global.css";

/** linq / search / delete controls share one height for visual alignment */
const HEADER_CONTROL_HEIGHT = 48;
/** Space between linq button and search block (matches prior gap-2 ≈ 8px) */
const LINQ_SEARCH_GAP = 8;

/** Matches Tailwind `green-500` used for Note type via getTypeColor("green") → bg-green-500 */
const NOTE_TYPE_GREEN = "#22c55e";
/** Muted secondary label (soft) next to sync icon */
const SYNC_LABEL_SOFT = "#94a3b8";
/**
 * App.tsx already wraps content in SafeAreaView, so this is only an extra visual
 * offset. Keep it modest so header sits a bit higher without risking notch overlap.
 */
const DASHBOARD_TOP_OFFSET = Platform.OS === "ios" ? 24 : 20;

const styles = StyleSheet.create({
  searchRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
  },
  linqButtonWrap: {
    marginRight: LINQ_SEARCH_GAP,
  },
  /** Fills all horizontal space to the right of the linq button so the search bar aligns with list / avatar inset */
  searchAndDeleteGrow: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
  },
  searchFieldOuter: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    height: HEADER_CONTROL_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
  },
});

interface HeaderProps {
  onLinkPress: () => void;
  onSettingsPress: () => void;
  email?: string;
  /** Clerk user image (e.g. Google profile photo) */
  avatarUrl?: string | null;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onFilterPress: () => void;
  /** Number of currently applied search filters (content + time). */
  appliedFilterCount?: number;
  /** When > 0, search row shares width with delete control */
  selectedFileCount?: number;
  onDeleteSelected?: () => void;
  isDeletingFiles?: boolean;
  /** Current sync state — drives the sync icon appearance */
  syncStatus?: SyncStatus;
  /** Background cache progress while status is `caching`. */
  downloadProgress?: { done: number; total: number } | null;
  /** True when there are unsynced local changes queued in outbox. */
  hasPendingLocalChanges?: boolean;
  /** Called when user taps the sync icon */
  onSyncPress?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onLinkPress,
  email,
  avatarUrl,
  onSettingsPress,
  searchQuery,
  onSearchChange,
  onFilterPress,
  appliedFilterCount = 0,
  selectedFileCount = 0,
  onDeleteSelected,
  isDeletingFiles = false,
  syncStatus = "idle",
  downloadProgress = null,
  hasPendingLocalChanges = false,
  onSyncPress,
}) => {
  const showDelete =
    selectedFileCount > 0 && typeof onDeleteSelected === "function";
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);

  useEffect(() => {
    setAvatarLoadFailed(false);
  }, [avatarUrl]);

  const isSyncBusy = syncStatus === "syncing" || syncStatus === "caching";

  // Spin animation for the sync icon when syncing or caching
  const spinValue = useRef(new Animated.Value(0)).current;
  const spinAnimation = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (isSyncBusy) {
      spinValue.setValue(0);
      spinAnimation.current = Animated.loop(
        Animated.timing(spinValue, {
          toValue: 1,
          duration: 900,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      );
      spinAnimation.current.start();
    } else {
      spinAnimation.current?.stop();
      spinAnimation.current = null;
      spinValue.setValue(0);
    }
  }, [isSyncBusy]); // eslint-disable-line react-hooks/exhaustive-deps

  const spinDeg = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  const syncIconColor =
    syncStatus === "error"
      ? "#ef4444"
      : syncStatus === "offline"
        ? "#94a3b8"
        : isSyncBusy
          ? "#D7827E"
          : hasPendingLocalChanges
            ? "#f59e0b"
            : NOTE_TYPE_GREEN; // idle — same green as Note file type

  const syncIcon =
    syncStatus === "error"
      ? faCircleExclamation
      : syncStatus === "offline"
        ? faClock
        : isSyncBusy
          ? faArrowsRotate
          : hasPendingLocalChanges
            ? faClock
            : faCircleCheck;

  const cacheLabel =
    syncStatus === "caching" &&
    downloadProgress &&
    downloadProgress.total > 0
      ? `Saving ${Math.min(downloadProgress.done, downloadProgress.total)} of ${downloadProgress.total}…`
      : syncStatus === "caching"
        ? "Saving files…"
        : null;

  const syncLabel =
    syncStatus === "syncing"
      ? "Updating list…"
      : cacheLabel
        ? cacheLabel
        : syncStatus === "error"
          ? "Couldn't sync"
          : syncStatus === "offline"
            ? "Offline"
            : hasPendingLocalChanges
              ? "Pending sync"
              : "Synced";

  // Search row visible immediately (avoid opacity-0 flash if native driver anim fails)
  const searchRowOpacity = useRef(new Animated.Value(1)).current;
  const searchRowTranslateY = useRef(new Animated.Value(0)).current;

  // Delete slot: width + fade + slide (layout; useNativeDriver: false)
  const deleteProgress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(deleteProgress, {
      toValue: showDelete ? 1 : 0,
      duration: 50,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [showDelete]); // eslint-disable-line react-hooks/exhaustive-deps -- Animated.Value ref stable

  const deleteSlotWidth = deleteProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, HEADER_CONTROL_HEIGHT],
  });
  const deleteSlotMargin = deleteProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 8],
  });
  const deleteInnerOpacity = deleteProgress;
  const deleteInnerTranslateX = deleteProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [18, 0],
  });

  const showAvatar = Boolean(avatarUrl && !avatarLoadFailed);

  return (
    <View
      className="w-full px-6 pt-4 pb-4"
      style={{ marginTop: DASHBOARD_TOP_OFFSET, zIndex: 20, elevation: 20 }}
    >
      <View className="w-full flex-row justify-between items-center mb-2">
        <Text className="text-white text-base">{email ?? "Signed in"}</Text>

        <View className="flex-row items-center" style={{ gap: 10 }}>
          {/* Sync status: icon + soft label (only icon spins while syncing) */}
          <TouchableOpacity
            onPress={onSyncPress}
            delayPressIn={0}
            accessibilityLabel={
              syncStatus === "syncing"
                ? "Updating list…"
                : syncStatus === "caching"
                  ? cacheLabel ?? "Saving files…"
                  : syncStatus === "error"
                    ? "Sync error — tap to retry"
                    : syncStatus === "offline"
                      ? "Offline — showing cached content"
                      : hasPendingLocalChanges
                        ? "Pending local changes — tap to sync now"
                        : "Synced — tap to sync now"
            }
            style={{
              minHeight: 48,
              paddingHorizontal: 8,
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
            }}
          >
            {isSyncBusy ? (
              <Animated.View style={{ transform: [{ rotate: spinDeg }] }}>
                <FontAwesomeIcon
                  icon={syncIcon}
                  size={18}
                  color={syncIconColor}
                />
              </Animated.View>
            ) : (
              <FontAwesomeIcon
                icon={syncIcon}
                size={18}
                color={syncIconColor}
              />
            )}
            <Text
              style={{
                fontSize: 12,
                fontWeight: "400",
                color: SYNC_LABEL_SOFT,
                letterSpacing: 0.2,
              }}
              numberOfLines={1}
            >
              {syncLabel}
            </Text>
          </TouchableOpacity>

          {/* Settings / avatar button */}
          <TouchableOpacity
            onPress={onSettingsPress}
            delayPressIn={0}
            accessibilityLabel="Open settings"
            className="w-12 h-12 items-center justify-center"
          >
            {showAvatar ? (
              <Image
                source={{ uri: avatarUrl as string }}
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 19,
                  borderWidth: 2,
                  borderColor: "#D7827E",
                  backgroundColor: "#1f2937",
                }}
                onError={() => setAvatarLoadFailed(true)}
                accessibilityIgnoresInvertColors
              />
            ) : (
              <View
                className="w-[38px] h-[38px] rounded-full border-2 border-button-outline items-center justify-center bg-card-bg"
                accessibilityElementsHidden
              >
                <FontAwesomeIcon icon={faGear} size={18} color="white" />
              </View>
            )}
          </TouchableOpacity>
        </View>
        {/* end right-side row */}
      </View>

      <Animated.View
        className="w-full self-stretch"
        style={{
          opacity: searchRowOpacity,
          transform: [{ translateY: searchRowTranslateY }],
        }}
      >
        <View style={styles.searchRow}>
          <TouchableOpacity
            className="bg-button-outline rounded-lg flex-row items-center justify-center px-3"
            style={[styles.linqButtonWrap, { height: HEADER_CONTROL_HEIGHT }]}
            onPress={onLinkPress}
            delayPressIn={0}
            accessibilityRole="button"
            accessibilityLabel="Create linq"
          >
            <Image
              source={require("../assets/linq-btn-black.png")}
              style={{ height: 30, width: 30 }}
              resizeMode="contain"
            />
          </TouchableOpacity>

          <View style={styles.searchAndDeleteGrow}>
            <View
              className="bg-card-bg border-2 border-[#D7827E] rounded-lg px-3 flex-row items-center"
              style={styles.searchFieldOuter}
            >
              <FontAwesomeIcon
                icon={faMagnifyingGlass}
                size={15}
                color="#D7827E"
              />
              <TextInput
                placeholder="Search"
                placeholderTextColor="#94a3b8"
                className="ml-2 flex-1 text-white"
                value={searchQuery}
                onChangeText={onSearchChange}
                autoCapitalize="none"
                autoCorrect={false}
                style={{
                  color: "#ffffff",
                  minWidth: 0,
                  flex: 1,
                  alignSelf: "stretch",
                  paddingVertical: 0,
                  ...(Platform.OS === "android"
                    ? { textAlignVertical: "center" as const }
                    : {}),
                }}
              />
              {searchQuery.length > 0 ? (
                <TouchableOpacity
                  onPress={() => onSearchChange("")}
                  className="w-12 h-12 rounded-full items-center justify-center"
                  accessibilityLabel="Clear search"
                  delayPressIn={0}
                >
                  <FontAwesomeIcon icon={faXmark} size={12} color="#D7827E" />
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                onPress={onFilterPress}
                className="w-12 h-12 rounded-full items-center justify-center"
                delayPressIn={0}
                accessibilityRole="button"
                accessibilityLabel={
                  appliedFilterCount > 0
                    ? `Open filters, ${appliedFilterCount} applied`
                    : "Open filters"
                }
              >
                <FontAwesomeIcon icon={faFilter} size={15} color="#D7827E" />
                {appliedFilterCount > 0 ? (
                  <View
                    style={{
                      position: "absolute",
                      top: 3,
                      right: 1,
                      minWidth: 15,
                      height: 15,
                      borderRadius: 8,
                      paddingHorizontal: 3,
                      backgroundColor: "#D7827E",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text
                      style={{
                        color: "#111827",
                        fontSize: 10,
                        fontWeight: "700",
                        lineHeight: 12,
                      }}
                    >
                      {appliedFilterCount > 99
                        ? "99+"
                        : String(appliedFilterCount)}
                    </Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            </View>

            <Animated.View
              style={{
                width: deleteSlotWidth,
                marginLeft: deleteSlotMargin,
                overflow: "hidden",
                alignItems: "flex-end",
                justifyContent: "center",
              }}
              pointerEvents={showDelete ? "auto" : "none"}
            >
              <Animated.View
                style={{
                  width: HEADER_CONTROL_HEIGHT,
                  opacity: deleteInnerOpacity,
                  transform: [{ translateX: deleteInnerTranslateX }],
                }}
              >
                <TouchableOpacity
                  onPress={onDeleteSelected}
                  disabled={isDeletingFiles || !showDelete}
                  className="rounded-lg bg-red-600 items-center justify-center"
                  style={{
                    width: HEADER_CONTROL_HEIGHT,
                    height: HEADER_CONTROL_HEIGHT,
                  }}
                  accessibilityLabel={`Delete ${selectedFileCount} selected file(s)`}
                  delayPressIn={0}
                >
                  {isDeletingFiles ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <FontAwesomeIcon
                      icon={faTrashCan}
                      size={18}
                      color="#ffffff"
                    />
                  )}
                </TouchableOpacity>
              </Animated.View>
            </Animated.View>
          </View>
        </View>
      </Animated.View>
    </View>
  );
};

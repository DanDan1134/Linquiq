import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  View,
  Text,
  RefreshControl,
  StyleSheet,
  Platform,
} from "react-native";
import { FileCard, FILE_CARD_HEIGHT } from "./FileCard";
import { track } from "../utils/perfLog";
import "../global.css";

type FileItem = {
  id: string;
  name: string;
  date: string;
  type: string;
  typeColor: string;
  number: string;
  url?: string;
  contentType?: string;
  /** Full file on disk (preferred for thumbnails when present). */
  local_uri?: string | null;
};

type FileListProps = {
  files: FileItem[];
  selectedFiles?: Set<string>;
  /** Rows already in the target linq — dimmed, no checkbox. */
  lockedFileIds?: Set<string>;
  onFilePress: (file: FileItem) => void;
  onToggleFileSelection: (fileId: string) => void;
  getTypeColor: (color: string) => string;
  // Pull-to-refresh
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Increment from parent to scroll the list to the top (e.g. after new file / linq). */
  scrollToTopTrigger?: number;
};

const ROW_GAP = 10;
const ROW_STRIDE = FILE_CARD_HEIGHT + ROW_GAP;

/**
 * Rows built on first paint. Everything past this is mounted as the user
 * scrolls, so a library of hundreds of files costs the same to open as ten.
 */
const FIRST_PAGE_SIZE = 20;
/** Rows appended each time the user reaches the end of the rendered window. */
const PAGE_SIZE = 20;

const Separator = () => <View style={styles.separator} />;

const EmptyState = () => (
  <View className="py-10 items-center">
    <Text className="text-gray-400">No files found.</Text>
  </View>
);

export const FileList: React.FC<FileListProps> = ({
  files,
  selectedFiles,
  lockedFileIds,
  onFilePress,
  onToggleFileSelection,
  getTypeColor,
  refreshing = false,
  onRefresh,
  scrollToTopTrigger = 0,
}) => {
  const listRef = useRef<FlatList<FileItem>>(null);
  const lastScrollTriggerRef = useRef(0);
  const [visibleCount, setVisibleCount] = useState(FIRST_PAGE_SIZE);

  /**
   * Cheap identity for "this is a different list" (search, filter, new upload)
   * versus "the same list, just re-rendered". Only the former resets paging.
   */
  const listSignature = useMemo(() => {
    const n = files?.length ?? 0;
    if (n === 0) return "0";
    return `${n}:${files[0]?.id ?? ""}:${files[n - 1]?.id ?? ""}`;
  }, [files]);

  useEffect(() => {
    setVisibleCount(FIRST_PAGE_SIZE);
  }, [listSignature]);

  const visibleFiles = useMemo(
    () => (files ?? []).slice(0, visibleCount),
    [files, visibleCount]
  );

  const handleEndReached = useCallback(() => {
    setVisibleCount((current) => {
      const total = files?.length ?? 0;
      if (current >= total) return current;
      const next = Math.min(current + PAGE_SIZE, total);
      track("LOAD MORE FILES", `rows ${current} → ${next} of ${total}`).done();
      return next;
    });
  }, [files]);

  useEffect(() => {
    if (scrollToTopTrigger <= 0) return;
    if (scrollToTopTrigger <= lastScrollTriggerRef.current) return;
    lastScrollTriggerRef.current = scrollToTopTrigger;
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, [scrollToTopTrigger]);

  const renderItem = useCallback(
    ({ item }: { item: FileItem }) => (
      <FileCard
        file={item}
        isSelected={selectedFiles?.has(item.id) ?? false}
        selectionLocked={lockedFileIds?.has(item.id) ?? false}
        onPress={onFilePress}
        onToggleSelection={onToggleFileSelection}
        getTypeColor={getTypeColor}
      />
    ),
    [selectedFiles, lockedFileIds, onFilePress, onToggleFileSelection, getTypeColor]
  );

  const keyExtractor = useCallback((item: FileItem) => String(item.id), []);

  /** Rows are a fixed height, so RN can skip measuring every card. */
  const getItemLayout = useCallback(
    (_data: ArrayLike<FileItem> | null | undefined, index: number) => ({
      length: FILE_CARD_HEIGHT,
      offset: ROW_STRIDE * index,
      index,
    }),
    []
  );

  return (
    <FlatList
      ref={listRef}
      className="flex-1 px-6"
      data={visibleFiles}
      keyExtractor={keyExtractor}
      extraData={{ selectedFiles, lockedFileIds }}
      renderItem={renderItem}
      getItemLayout={getItemLayout}
      ItemSeparatorComponent={Separator}
      onEndReached={handleEndReached}
      onEndReachedThreshold={0.6}
      keyboardShouldPersistTaps="handled"
      nestedScrollEnabled
      // Thumbnails use <Image> in FileCard; clipping off-screen rows on Android often leaves bitmaps blank.
      removeClippedSubviews={false}
      initialNumToRender={10}
      maxToRenderPerBatch={8}
      updateCellsBatchingPeriod={Platform.OS === "android" ? 32 : 50}
      windowSize={7}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor="#fff"
        />
      }
      ListEmptyComponent={EmptyState}
      contentContainerStyle={styles.content}
    />
  );
};

const styles = StyleSheet.create({
  content: {
    paddingTop: 4,
    paddingBottom: 20,
    flexGrow: 1,
  },
  separator: {
    height: ROW_GAP,
  },
});

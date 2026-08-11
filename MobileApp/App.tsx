import React, { useMemo, useState, useEffect, useRef } from "react";
import { StatusBar } from "expo-status-bar";
import {
  Alert,
  View,
  Text,
  InteractionManager,
  Platform,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { SafeAreaView, SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ClerkProvider } from '@clerk/clerk-expo';
import { useAuth, useUser } from '@clerk/clerk-expo'
import * as SecureStore from "expo-secure-store";
// AsyncStorage no longer used for file list cache — replaced by SQLite
import * as WebBrowser from 'expo-web-browser';
WebBrowser.maybeCompleteAuthSession();

// Components
import { LandingScreen } from "./components/LandingScreen";
import { LoginScreen } from "./components/LoginScreen";
import { SignUpScreen } from "./components/SignUpScreen";
import { Header } from "./components/Header";
import { FileList } from "./components/FileList"; // <- ensure this is the updated version (refreshing/onRefresh + safe selectedFiles)
import { BottomNavigation } from "./components/BottomNavigation";
import { NoteModal } from "./components/NoteModal";
import { FileDetailModal } from "./components/FileDetailModal";
import { BundleModal } from "./components/BundleModal";
import { useBundlePreview } from './hooks/useBundlePreview';
import { CameraModal } from "./components/CameraModal";
import { SettingsModal } from "./components/SettingsModal";
import {
  SearchFilterModal,
  SearchFilters,
  SubmissionTimeFilter,
} from "./components/SearchFilterModal";
import { useVoiceRecord } from "./components/VoiceRecord";
import { setTokenGetter } from './api/client'
import { clearAllInflight } from './utils/inflight'
import { clearUrlCache } from './utils/urlCache'
import {
  clearDownloadCache,
  ensureFileDownloaded,
  downloadPendingContent,
} from './sync/contentDownloader'
import { initDb } from './db/index'
import {
  getAllFiles,
  getAllBundles,
  clearAllLocalData,
  getFileById,
  updateFileContent,
  upsertBundle,
  updateBundleName,
  updateBundleChildIds,
  purgeFile,
  purgeBundle,
  deleteFile as dbDeleteFile,
  deleteBundle as dbDeleteBundle,
  type LocalFile,
  type LocalBundle,
} from './db/fileRepo'
import { useSyncStatus } from './hooks/useSyncStatus'
import { saveLocal, optimisticRow } from './sync/saveLocal'
import { enqueue, cancelJobsForId, getOutboxReferencedIds } from './db/outbox'
import NetInfo from '@react-native-community/netinfo'

// Utils and Data
import {
  getTypeColor,
  formatDateTime,
  stripHtml,
  deriveNoteUploadFileName,
  truncateNameForLog,
  deriveLinqTitleFromFiles,
  newLocalFileId,
  isLegacyOptId,
} from "./utils/helpers";
import { logPerf, logLinqOpenStep, idSuffixForLog, track } from "./utils/perfLog";
import {
  prewarmCaptureModules,
  ensureMediaLibraryPermission,
  resetPermissionCache,
} from "./utils/permissions";
import { fetchMe } from "./api/auth";
import "./global.css";

// API modules
import { API_BASE } from "./api/client";
import * as filesApi from "./api/files";
import type { SearchHitRow } from "./api/files";
import * as bundlesApi from "./api/bundles";
import { uploadFile, uploadBlob } from "./api/upload";
import {
  categoryFromExt,
  colorFromCategory,
  mediaTypeFromExt,
  pickExtensionFromUri,
  convertHeicToJpeg,
  isHeicSource,
  getDefaultFileName,
  isAudioExtension,
} from "./utils/fileHelpers";
import { apiGet } from './api/client'  // <- uses your Bearer header

// Helper for token cache
const tokenCache = {
  getToken: (key: string) => SecureStore.getItemAsync(key),
  saveToken: (key: string, value: string) => SecureStore.setItemAsync(key, value),
}

/** Human label for a linq row (never logs UUIDs). */
function linqLabelForLog(bundle: { name?: string } | null | undefined): string {
  const n = String(bundle?.name ?? "").trim();
  if (n && n !== "Bundle" && n !== "bundle") return n;
  return "linq";
}

/** Short list of child labels for logs (names truncated; no raw ids). */
function childNameSummary(files: any[] | undefined, max = 10): string {
  if (!Array.isArray(files) || files.length === 0) return "(no files yet)";
  const parts = files.slice(0, max).map((f) => {
    const name = String(f?.name ?? "").trim();
    if (name) return truncateNameForLog(name, 6);
    const t = String(f?.type ?? "").trim();
    return t ? truncateNameForLog(t, 6) : "unnamed";
  });
  const extra = files.length > max ? ` …+${files.length - max} more` : "";
  return `${files.length} item(s): ${parts.join(", ")}${extra}`;
}

function linqContentSummary(fileCount: number, loadingWhenZero = false): string {
  if (fileCount > 0) return `linq containing ${fileCount} file(s)`;
  return loadingWhenZero ? "Loading nested linq contents..." : "linq containing 0 file(s)";
}

function isGenericLinqName(name: unknown): boolean {
  const n = String(name ?? "").trim().toLowerCase();
  return !n || n === "linq" || n === "bundle" || n === "link";
}

/** Backend row types that open the linq sheet (includes literal `linq`). */
function isLinqEntryType(entry: any): boolean {
  const t = String(entry?.type ?? "").toLowerCase();
  return t === "link" || t === "bundle" || t === "linq";
}

/** Row should open BundleModal, not file detail — keep in sync with list `isBundle` logic. */
function opensAsLinqDetail(f: any): boolean {
  if (isLinqEntryType(f)) return true;
  if (Array.isArray(f?.bundledFileIds) && f.bundledFileIds.length > 0) return true;
  if (Array.isArray(f?.bundledUrls) && f.bundledUrls.length > 0) return true;
  const ct = String(f?.contentType ?? "").toLowerCase();
  return ct === "link" || ct === "bundle" || ct === "linq";
}

// Re-export helpers for backward compatibility in this file
const fetchAllFiles = filesApi.getAll;

// ─── Concurrency-limited parallel map ─────────────────────────────────────────
async function concurrentMap<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  limit = 6
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await fn(items[idx]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, Math.max(1, items.length)) }, worker)
  );
  return results;
}

// ─── SQLite is now the file list cache (replaces AsyncStorage JSON snapshot) ──
// loadCachedFiles / saveCachedFiles / clearCachedFiles removed.
// Use fileRepo.getAllFiles() / fileRepo.getAllBundles() instead.

// ─── separateBundlesAndFiles — parallel Linq fetches, no blocking cleanup ─────
async function separateBundlesAndFiles(allItems: any[]): Promise<{
  bundles: any[];
  files: any[];
}> {
  let offline = false;
  try {
    const net = await NetInfo.fetch();
    offline = !net?.isConnected;
  } catch {
    offline = false;
  }

  const bundles: any[] = [];
  const files: any[] = [];

  const isLinqType = (t: string) => {
    const lower = String(t ?? "").toLowerCase();
    return lower === "link" || lower === "bundle" || lower === "linq";
  };
  for (const item of allItems) {
    if (isLinqType(item.type)) bundles.push(item);
    else files.push(item);
  }

  const fileMap = new Map<string, any>();
  for (const file of files) if (file.id != null) fileMap.set(String(file.id), file);
  for (const bundle of bundles) if (bundle.id != null) fileMap.set(String(bundle.id), bundle);

  // Fetch all bundle contents in parallel (max 6 concurrent) instead of sequentially
  await concurrentMap(bundles, async (bundle) => {
    // opt- bundles only exist locally — never try to fetch them from the server.
    const isOptBundle = String(bundle.id ?? '').startsWith('opt-');
    const hasChildIds =
      Array.isArray(bundle.bundledFileIds) && bundle.bundledFileIds.length > 0;
    if (!offline && !isOptBundle && !hasChildIds) {
      try {
        const bundleData = await bundlesApi.getContents(bundle.id);

        if (bundleData.bundledFileIds?.length) bundle.bundledFileIds = bundleData.bundledFileIds;
        if (bundleData.bundledUrls?.length) bundle.bundledUrls = bundleData.bundledUrls;
        if (bundleData.bundledFileIds?.length) {
          await updateBundleChildIds(bundle.id, bundleData.bundledFileIds);
        }

        if (bundleData.children?.length) {
          const pick = (c: any, ...keys: string[]) => {
            for (const k of keys) {
              if (c?.data?.[k] != null) return c.data[k];
              if (c?.[k] != null) return c[k];
            }
            return undefined;
          };
          const inferNestedItemIds = (node: any): string[] => {
            const out = new Set<string>();
            const pushId = (v: any) => {
              const id = String(v ?? "").trim();
              if (id) out.add(id);
            };
            const directIds = [
              ...(Array.isArray(node?.bundledFileIds) ? node.bundledFileIds : []),
              ...(Array.isArray(node?.data?.bundledFileIds) ? node.data.bundledFileIds : []),
              ...(Array.isArray(node?.children?.item_id) ? node.children.item_id : []),
              ...(Array.isArray(node?.data?.children?.item_id) ? node.data.children.item_id : []),
            ];
            directIds.forEach(pushId);

            const nestedChildren = [
              ...(Array.isArray(node?.children) ? node.children : []),
              ...(Array.isArray(node?.data?.children) ? node.data.children : []),
            ];
            nestedChildren.forEach((c: any) => {
              pushId(
                pick(c, "id", "fileId", "file_id") ??
                  c?.id ??
                  c?.fileId ??
                  c?.file_id
              );
            });

            return Array.from(out);
          };
          bundle.files = bundleData.children.map((child: any) => {
            const rawType = pick(child, "type");
            const cat = categoryFromExt(rawType);
            const childType = String(rawType ?? "").toLowerCase();
            const isNestedBundle =
              childType === "bundle" || childType === "link" || childType === "linq";
            const rawName = pick(child, "name");
            const childName = String(rawName ?? "").trim();
            const cleanedChildName =
              childName === "Bundle" || childName === "bundle"
                ? "linq"
                : childName || "Untitled";
            const childId =
              String(
                pick(child, "id", "fileId", "file_id") ??
                  child?.id ??
                  child?.fileId ??
                  child?.file_id ??
                  ""
              ).trim() || undefined;
            const inferredNestedIds = isNestedBundle ? inferNestedItemIds(child) : [];
            const nestedCount = inferredNestedIds.length;
            return {
              id: childId || String(child?.id ?? child?.fileId ?? "").trim() || undefined,
              name: cleanedChildName,
              type: isNestedBundle ? "Link" : cat,
              typeColor: isNestedBundle ? colorFromCategory("link") : colorFromCategory(cat),
              url:
                child?.metadata?.url ?? child?.url ?? child?.fileUrl ?? pick(child, "url"),
              contentType: rawType,
              createdAt:
                pick(child, "createdAt", "created_at") ??
                child?.createdAt ??
                child?.created_at,
              creator:
                pick(child, "creator_username", "creator_email", "creator") ??
                child?.creator ??
                "",
              content: isNestedBundle
                ? linqContentSummary(nestedCount, true)
                : pick(child, "content") ?? child?.content ?? "",
              ...(isNestedBundle && {
                bundledFileIds: inferredNestedIds,
                bundledUrls: child?.bundledUrls ?? [],
                files: child?.files ?? [],
                children: child?.children ?? { item_id: [] },
              }),
            };
          });
        }
      } catch (e) {
        console.warn(
          `[perf·linqList] prefetch children failed · id${idSuffixForLog(bundle.id)}`,
          e
        );
      }
    }

    if (bundle.bundledFileIds?.length && !bundle.files?.length) {
      bundle.files = bundle.bundledFileIds
        .map((fileId: string) => fileMap.get(String(fileId)))
        .filter(Boolean);
      if (bundle.files.length && !bundle.bundledUrls?.length) {
        bundle.bundledUrls = bundle.files.map((f: any) => f.url).filter(Boolean);
      }
    } else if (!bundle.files?.length && bundle.bundledUrls?.length) {
      bundle.files = bundle.bundledUrls
        .map((url: string) =>
          files.find((f: any) => f.url === url) || bundles.find((b: any) => b.url === url)
        )
        .filter(Boolean);
    }

    bundle.content =
      bundle.files?.length
        ? `linq containing ${bundle.files.length} file(s)`
        : bundle.content ?? "Empty linq";
    if (isGenericLinqName(bundle.name)) {
      const derivedTitle = deriveLinqTitleFromFiles(bundle.files ?? []);
      bundle.name = derivedTitle;
      const bundleId = String(bundle?.id ?? "").trim();
      if (bundleId && !bundleId.startsWith("opt-") && !isGenericLinqName(derivedTitle)) {
        try {
          await updateBundleName(bundleId, derivedTitle);
        } catch (e) {
          console.warn(`[linq] failed to persist derived title for ${bundleId}:`, e);
        }
      }
    }
  }, 6);

  return { bundles, files };
}

/**
 * Merge server `raw` with SQLite-merged rows so dirty / local-only ids stay in the enrichment input.
 *
 * @param pendingOptIds  local ids currently sitting in the outbox (still uploading).
 *   When the server is available and a dirty item is NOT in this set,
 *   we skip it — the upload finished and markFileSynced will clear dirty shortly,
 *   so showing the pending item alongside the server item would produce a duplicate.
 * @param isServerSync  true after a real pull. Empty `raw` then means "deleted on server",
 *   not "offline / unknown" — do not resurrect clean local rows.
 */
function mergeRawWithMergedLists(
  raw: any[],
  mergedFiles: LocalFile[],
  mergedBundles: LocalBundle[],
  pendingOptIds?: Set<string>,
  isServerSync = false
): any[] {
  const serverReachable = isServerSync || raw.length > 0;

  const localFileToRaw = (f: LocalFile): any => {
    const item: any = {
      id: f.id,
      name: f.name,
      type: f.type,
      contentType: f.contentType ?? null,
      createdAt: f.createdAt,
      creator: f.creator,
      url: f.url,
    };
    if (f.content != null && String(f.content).trim() !== "") item.content = f.content;
    if (f.local_uri) item.local_uri = f.local_uri;
    if (f.dirty === 1) item.dirty = 1;
    return item;
  };

  const localBundleToRaw = (b: LocalBundle): any => {
    const item = localFileToRaw(b);
    item.type = b.type ?? "Link";
    // Always set (even []) so offline merge doesn’t look “missing ids” and try getContents.
    item.bundledFileIds = Array.isArray(b.bundledFileIds) ? b.bundledFileIds : [];
    return item;
  };

  const byId = new Map<string, any>();
  for (const item of raw) {
    const id = String(item?.id ?? "").trim();
    if (id) byId.set(id, item);
  }

  const upsert = (local: LocalFile | LocalBundle, isBundle: boolean) => {
    const id = String(local?.id ?? "").trim();
    if (!id) return;
    const dirty = local.dirty === 1;
    const pending =
      pendingOptIds != null && pendingOptIds.has(id);

    // When the server is reachable and this is a dirty pending upload, only include it
    // if it still has a pending outbox job.  If the upload already completed,
    // markFileSynced will clear dirty (and keep the same UUID id) — showing it now
    // would create a duplicate alongside the server item.
    if (dirty && serverReachable && pendingOptIds) {
      if (!pendingOptIds.has(id)) return;
    }

    if (dirty) {
      // Server deleted this id and there is no pending local job — drop it.
      if (serverReachable && !isLegacyOptId(id) && !byId.has(id) && !pending) {
        return;
      }
      byId.set(id, isBundle ? localBundleToRaw(local as LocalBundle) : localFileToRaw(local));
      return;
    }
    // During online sync, don't re-add clean server ids that are absent from raw.
    // Those were deleted on web (or another device) and should disappear locally.
    // Legacy opt- / never-synced placeholders are still kept when offline (raw empty).
    if (serverReachable && !isLegacyOptId(id) && !byId.has(id)) {
      return;
    }
    if (!byId.has(id)) {
      byId.set(id, isBundle ? localBundleToRaw(local as LocalBundle) : localFileToRaw(local));
    }
  };

  for (const f of mergedFiles) upsert(f, false);
  for (const b of mergedBundles) upsert(b, true);

  const ordered: any[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const id = String(item?.id ?? "").trim();
    if (!id) continue;
    ordered.push(byId.get(id) ?? item);
    seen.add(id);
  }
  for (const [id, item] of byId) {
    if (!seen.has(id)) ordered.push(item);
  }
  return ordered;
}

// ─── Background empty-bundle cleanup (fire-and-forget, never blocks the UI) ───
async function cleanupEmptyBundles(
  _bundles: any[],
  _onDeleted: (deletedIds: string[]) => void
) {
  const net = await NetInfo.fetch();
  if (!net.isConnected) return;
  // Automatic server deletes disabled: enrichment/outbox races produced false "empty"
  // bundles and removed valid linqs (see offline-first plan + outbox logs).
}


/** Map GET /files/:id Linked[] children to the same row shape openBundleDetail / Phase B expect. */
function mapApiLinkedChildrenToBundleFiles(children: any[]): any[] {
  const pick = (c: any, ...keys: string[]) => {
    for (const k of keys) {
      if (c?.data?.[k] != null) return c.data[k];
      if (c?.[k] != null) return c[k];
    }
    return undefined;
  };
  const inferNestedItemIds = (node: any): string[] => {
    const out = new Set<string>();
    const pushId = (v: any) => {
      const id = String(v ?? "").trim();
      if (id) out.add(id);
    };
    const directIds = [
      ...(Array.isArray(node?.bundledFileIds) ? node.bundledFileIds : []),
      ...(Array.isArray(node?.data?.bundledFileIds) ? node.data.bundledFileIds : []),
      ...(Array.isArray(node?.children?.item_id) ? node.children.item_id : []),
      ...(Array.isArray(node?.data?.children?.item_id) ? node.data.children.item_id : []),
    ];
    directIds.forEach(pushId);
    const nestedChildren = [
      ...(Array.isArray(node?.children) ? node.children : []),
      ...(Array.isArray(node?.data?.children) ? node.data.children : []),
    ];
    nestedChildren.forEach((c: any) => {
      pushId(
        pick(c, "id", "fileId", "file_id") ?? c?.id ?? c?.fileId ?? c?.file_id
      );
    });
    return Array.from(out);
  };

  return children.map((child: any) => {
    const rawType = pick(child, "type");
    const childType = String(rawType ?? "").toLowerCase();
    const isNestedBundle =
      childType === "bundle" || childType === "link" || childType === "linq";
    const cat = categoryFromExt(rawType);
    const childName = String(pick(child, "name") ?? "").trim();
    const inferredNestedIds = isNestedBundle ? inferNestedItemIds(child) : [];
    return {
      id:
        String(
          pick(child, "id", "fileId", "file_id") ??
            child?.id ??
            child?.fileId ??
            child?.file_id ??
            ""
        ).trim() || undefined,
      name:
        childName === "Bundle" || childName === "bundle"
          ? "linq"
          : childName || "Untitled",
      type: isNestedBundle ? "Link" : cat,
      typeColor: isNestedBundle ? colorFromCategory("link") : colorFromCategory(cat),
      url: child?.metadata?.url ?? child?.url ?? child?.fileUrl ?? pick(child, "url"),
      contentType: rawType,
      createdAt:
        pick(child, "createdAt", "created_at") ??
        child?.createdAt ??
        child?.created_at,
      creator:
        pick(child, "creator_username", "creator_email", "creator") ??
        child?.creator ??
        "",
      content: isNestedBundle
        ? linqContentSummary(inferredNestedIds.length, true)
        : pick(child, "content") ?? child?.content ?? "",
      ...(isNestedBundle && {
        bundledFileIds: inferredNestedIds,
        bundledUrls: child?.bundledUrls ?? [],
        files: [],
        children: child?.children ?? { item_id: [] },
      }),
    };
  });
}

/**
 * Media rows that need a presigned URL in BundleModal (image / video / audio / pdf).
 * Matches filename-based detection so generic types like "File" + Image.jpg still hydrate.
 */
function bundleLeafNeedsPlayableOrPreviewUrl(file: any): boolean {
  if (!file) return false;
  const t = String(file?.type ?? "").toLowerCase();
  const ct = String(file?.contentType ?? "").toLowerCase();
  const name = String(file?.name ?? "");
  const pathOnly = String(file?.url ?? "").split("?")[0];
  if (t === "link" || t === "bundle" || t === "linq") return false;
  if (
    t === "image" ||
    t === "video" ||
    t === "audio" ||
    t === "recording" ||
    t === "pdf" ||
    ct.startsWith("image/") ||
    ct.startsWith("video/") ||
    ct.startsWith("audio/") ||
    ct === "application/pdf"
  )
    return true;
  if (t.includes("audio") || t.includes("recording")) return true;
  if (t.includes("image") || t.includes("video")) return true;
  if (t === "pdf" || ct.includes("pdf")) return true;
  if (/\.(png|jpe?g|gif|webp|heic|bmp)$/i.test(name)) return true;
  if (/\.(m4a|mp3|wav|aac|caf|ogg)$/i.test(name)) return true;
  if (/\.(mp4|mov|m4v|webm|avi)$/i.test(name)) return true;
  if (/\.pdf$/i.test(name)) return true;
  if (/\.(m4a|mp3|wav|aac|ogg)$/i.test(pathOnly)) return true;
  if (/\.(png|jpe?g|gif|webp|heic)$/i.test(pathOnly)) return true;
  return false;
}

function bundleLeafNeedsNoteBodyFromUrl(file: any): boolean {
  const isNoteLike =
    String(file?.type ?? "").toLowerCase() === "note" ||
    String(file?.contentType ?? "").toLowerCase().includes("note") ||
    /\.(txt|md|rtf)$/i.test(String(file?.name ?? ""));
  if (!isNoteLike) return false;
  const body = file?.content;
  return !body || !String(body).trim();
}

/** Presigned GET, site preview, or on-device cache — any is enough to open in BundleModal. */
function bundleLeafHasReadableUri(file: any): boolean {
  return !!(
    String(file?.url ?? "").trim() ||
    String(file?.local_uri ?? "").trim()
  );
}

/**
 * Fill bundle.files (and nested linq rows) from bundledFileIds using in-memory lists.
 * SQLite / API rows often ship files: [] while child ids are present — offline open needs this.
 */
function hydrateBundleTreeFromLocalLists(
  bundle: any,
  userFiles: any[],
  bundles: any[]
): void {
  if (!bundle) return;
  const map = new Map<string, any>();
  for (const f of userFiles) {
    if (f?.id != null) map.set(String(f.id), f);
  }
  for (const b of bundles) {
    if (b?.id != null) map.set(String(b.id), b);
  }
  const walk = (node: any) => {
    if (!node) return;
    const ids = node.bundledFileIds;
    const missingChildren =
      Array.isArray(ids) &&
      ids.length > 0 &&
      (!Array.isArray(node.files) || node.files.length === 0);
    if (missingChildren) {
      const resolved = ids
        .map((id: string) => map.get(String(id)))
        .filter(Boolean);
      if (resolved.length) node.files = resolved;
    }
    if (!Array.isArray(node.files)) return;
    for (const row of node.files) {
      const k = String(row?.type ?? "").toLowerCase();
      if (k === "link" || k === "bundle" || k === "linq") walk(row);
    }
  };
  walk(bundle);
}

// ─── runPhaseB — shared Phase B hydration logic ────────────────────────────────
// Resolves nested Linq child counts, presigned URLs for media, and note body text.
// Called both from openBundleDetail (on demand) and schedulePreHydration (background).
async function runPhaseB(
  files: any[],
  /** When set, avoids re-querying NetInfo on nested recursion. */
  networkOpts?: { skipRemote: boolean }
): Promise<any[]> {
  if (!Array.isArray(files) || files.length === 0) return files;

  let skipRemote = networkOpts?.skipRemote;
  if (skipRemote === undefined) {
    try {
      const net = await NetInfo.fetch();
      skipRemote = !net.isConnected;
    } catch {
      skipRemote = false;
    }
  }

  return concurrentMap(
    files,
    async (file: any) => {
      const kind = String(file?.type ?? "").toLowerCase();
      const isNestedLinq =
        kind === "link" || kind === "bundle" || kind === "linq";
      if (isNestedLinq) {
        let working = { ...file };
        const idStr = String(working.id ?? "").trim();

        if (
          !skipRemote &&
          idStr &&
          !idStr.startsWith("opt-") &&
          !working.files?.length
        ) {
          try {
            const nested = await bundlesApi.getContents(idStr);
            const nestedChildren = Array.isArray(nested?.children)
              ? nested.children
              : [];
            if (nestedChildren.length > 0) {
              working = {
                ...working,
                files: mapApiLinkedChildrenToBundleFiles(nestedChildren),
                bundledFileIds: nested.bundledFileIds ?? working.bundledFileIds,
                bundledUrls: nested.bundledUrls ?? working.bundledUrls,
              };
              if (nested.bundledFileIds?.length) {
                await updateBundleChildIds(idStr, nested.bundledFileIds);
              }
            }
          } catch {}
        }

        const nestedCount =
          (Array.isArray(working.files) ? working.files.length : 0) ||
          (Array.isArray(working.bundledFileIds)
            ? working.bundledFileIds.length
            : 0) ||
          (Array.isArray(working.children?.item_id)
            ? working.children.item_id.length
            : 0);

        working = {
          ...working,
          content: linqContentSummary(nestedCount, true),
        };

        if (Array.isArray(working.files) && working.files.length > 0) {
          working = {
            ...working,
            files: await runPhaseB(working.files, { skipRemote }),
          };
        }
        if (isGenericLinqName(working.name)) {
          working = {
            ...working,
            name: deriveLinqTitleFromFiles(working.files ?? []),
          };
        }
        return working;
      }

      const isNoteLike =
        String(file?.type ?? "").toLowerCase() === "note" ||
        String(file?.contentType ?? "").toLowerCase().includes("note") ||
        String(file?.name ?? "").toLowerCase().endsWith(".txt") ||
        String(file?.name ?? "").toLowerCase().endsWith(".md") ||
        String(file?.name ?? "").toLowerCase().endsWith(".rtf");

      // Bundle list / getContents children often omit presigned URLs — fetch so previews work
      // (especially right after creating a linq, before a second refresh).
      const idStr = String(file?.id ?? "").trim();
      const hasLocalBinary = !!String(file?.local_uri ?? "").trim();
      const hasInlineText = !!String(file?.content ?? "").trim();
      const urlMissing = !file?.url || !String(file.url).trim();
      const needsPresignedOrNoteUrl =
        isNoteLike || bundleLeafNeedsPlayableOrPreviewUrl(file);
      if (
        !skipRemote &&
        idStr &&
        !idStr.startsWith("opt-") &&
        urlMissing &&
        !hasLocalBinary &&
        !(isNoteLike && hasInlineText) &&
        needsPresignedOrNoteUrl
      ) {
        try {
          const meta = await filesApi.getById(idStr);
          if (meta?.url) {
            file = { ...file, url: meta.url };
          }
        } catch {}
      }

      if (!skipRemote && isNoteLike && !file?.content && file?.url) {
        try {
          const text = await filesApi.getNoteContent(file.url);
          if (text) return { ...file, content: text };
        } catch {}
      }
      return file;
    },
    3
  );
}

/** True when every leaf row that needs a preview URL has one, including inside nested Linqs. */
function bundleChildRowsAreDisplayReady(files: any[] | undefined): boolean {
  if (!Array.isArray(files) || files.length === 0) return true;
  for (const file of files) {
    const kind = String(file?.type ?? "").toLowerCase();
    if (kind === "link" || kind === "bundle" || kind === "linq") {
      const nFiles = Array.isArray(file?.files) ? file.files.length : 0;
      const nIds = Math.max(
        Array.isArray(file?.bundledFileIds) ? file.bundledFileIds.length : 0,
        Array.isArray(file?.children?.item_id) ? file.children.item_id.length : 0
      );
      if (nIds > 0 && nFiles === 0) return false;
      if (!bundleChildRowsAreDisplayReady(file.files)) return false;
      continue;
    }
    const idStr = String(file?.id ?? "").trim();
    if (!idStr) continue;
    // Local-first rows may use UUID (preferred) or legacy opt- ids until upload;
    // url/local_uri may already be a file:// path.
    if (idStr.startsWith("opt-") || file?.dirty === 1) {
      if (bundleLeafNeedsPlayableOrPreviewUrl(file)) {
        if (!bundleLeafHasReadableUri(file)) return false;
      }
      if (bundleLeafNeedsNoteBodyFromUrl(file)) {
        const body = file?.content;
        if (body && String(body).trim()) continue;
        if (!bundleLeafHasReadableUri(file)) return false;
      }
      continue;
    }
    if (bundleLeafNeedsNoteBodyFromUrl(file)) {
      const body = file?.content;
      if (body && String(body).trim()) continue;
      if (!bundleLeafHasReadableUri(file)) return false;
      continue;
    }
    if (!bundleLeafNeedsPlayableOrPreviewUrl(file)) continue;
    if (!bundleLeafHasReadableUri(file)) return false;
  }
  return true;
}

/** Remove deleted file/bundle ids from a Linq row tree (top-level bundle or nested link row). */
function stripDeletedFromLinqRow(
  row: any,
  deletedSet: Set<string>
): any | null {
  if (!row) return null;
  const id = String(row.id ?? "").trim();
  if (id && deletedSet.has(id)) return null;

  const isLink = String(row.type ?? "").toLowerCase() === "link";

  let nextFiles = row.files;
  if (Array.isArray(row.files)) {
    nextFiles = row.files
      .map((child: any) => stripDeletedFromLinqRow(child, deletedSet))
      .filter(Boolean);
  }

  let nextBundledIds = Array.isArray(row.bundledFileIds)
    ? row.bundledFileIds.filter((fid: string) => !deletedSet.has(String(fid)))
    : row.bundledFileIds;

  let nextChildren = row.children;
  if (nextChildren && Array.isArray(nextChildren.item_id)) {
    nextChildren = {
      ...nextChildren,
      item_id: nextChildren.item_id.filter(
        (fid: string) => !deletedSet.has(String(fid))
      ),
    };
  }

  let nextBundledUrls = row.bundledUrls;
  if (
    Array.isArray(row.bundledFileIds) &&
    Array.isArray(row.bundledUrls) &&
    row.bundledFileIds.length === row.bundledUrls.length
  ) {
    const ni: string[] = [];
    const nu: string[] = [];
    row.bundledFileIds.forEach((fid: string, i: number) => {
      if (!deletedSet.has(String(fid))) {
        ni.push(String(fid));
        nu.push(row.bundledUrls[i]);
      }
    });
    nextBundledIds = ni;
    nextBundledUrls = nu;
  }

  let content = row.content;
  if (isLink) {
    const nestedCount =
      (Array.isArray(nextFiles) ? nextFiles.length : 0) ||
      (Array.isArray(nextBundledIds) ? nextBundledIds.length : 0) ||
      (Array.isArray(nextChildren?.item_id) ? nextChildren.item_id.length : 0);
    content = `linq containing ${nestedCount} file(s)`;
  }

  return {
    ...row,
    files: nextFiles,
    bundledFileIds: nextBundledIds,
    bundledUrls: nextBundledUrls,
    children: nextChildren,
    content,
  };
}

/** Linq / getContents caches to drop when any listed id was removed from that tree. */
function linqCacheIdsAffectedByDeletes(
  bundles: any[],
  deletedSet: Set<string>
): string[] {
  const touched = new Set<string>();

  const scanRow = (row: any, owningLinqId: string) => {
    if (!row) return;
    const rid = String(row.id ?? "").trim();
    const t = String(row.type ?? "").toLowerCase();

    const checkRefs = (ids: any[]) => {
      for (const x of ids ?? []) {
        if (deletedSet.has(String(x))) touched.add(owningLinqId);
      }
    };

    if (rid && deletedSet.has(rid)) touched.add(owningLinqId);

    checkRefs(row.bundledFileIds ?? []);
    checkRefs(row.children?.item_id ?? []);

    if (Array.isArray(row.files)) {
      for (const c of row.files) {
        const cid = String(c?.id ?? "").trim();
        if (cid && deletedSet.has(cid)) touched.add(owningLinqId);
        const childIsLink = String(c?.type ?? "").toLowerCase() === "link";
        if (childIsLink && cid) {
          scanRow(c, cid);
        } else if (c) {
          scanRow(c, owningLinqId);
        }
      }
    }
  };

  for (const b of bundles) {
    const bid = String(b?.id ?? "").trim();
    if (!bid) continue;
    if (deletedSet.has(bid)) touched.add(bid);
    scanRow(b, bid);
  }

  return Array.from(touched);
}

function isLinqTopLevelRow(r: any): boolean {
  const t = String(r?.type ?? "").toLowerCase();
  return t === "link" || t === "bundle" || t === "linq";
}

/** One FlatList row per id; if the same id appeared twice (e.g. sync glitch), prefer the Linq row. */
function dedupeFileRowsById(rows: any[]): any[] {
  const merged = new Map<string, any>();
  const order: string[] = [];
  let anon = 0;
  for (const row of rows) {
    const id = String(row?.id ?? row?.file_id ?? "").trim();
    if (!id) {
      const k = `__noid_${anon++}`;
      order.push(k);
      merged.set(k, row);
      continue;
    }
    if (!merged.has(id)) {
      order.push(id);
      merged.set(id, row);
      continue;
    }
    const cur = merged.get(id);
    const next =
      isLinqTopLevelRow(row) && !isLinqTopLevelRow(cur) ? row : cur;
    merged.set(id, next);
  }
  return order.map((k) => merged.get(k)!);
}

/** Fill missing typeColor on bundle rows (e.g. files resolved from fileMap without UI fields). */
function inferTypeColorForBundleFile(file: any): string {
  if (file?.typeColor && String(file.typeColor).trim()) return file.typeColor;
  const ty = String(file?.type ?? "").toLowerCase();
  if (ty === "link" || ty === "bundle" || ty === "linq") return colorFromCategory("Link");
  const disp = String(file?.type ?? "");
  if (["Image", "Audio", "Video", "PDF", "Note", "File", "Link"].includes(disp)) {
    return colorFromCategory(disp);
  }
  const ct = String(file?.contentType ?? "").toLowerCase();
  if (ct.startsWith("image/")) return colorFromCategory("Image");
  if (ct.startsWith("audio/")) return colorFromCategory("Audio");
  if (ct.startsWith("video/")) return colorFromCategory("Video");
  if (ct === "application/pdf" || ty === "pdf") return colorFromCategory("PDF");
  if (ct.includes("note") || ty === "note") return colorFromCategory("Note");
  const name = String(file?.name ?? "");
  const ext = name.includes(".") ? (name.split(".").pop() ?? "") : "";
  const cat = categoryFromExt(ext || ty);
  return colorFromCategory(cat);
}

function enrichBundleFileTypeColors(files: any[] | undefined): any[] {
  if (!Array.isArray(files)) return [];
  return files.map((f) => {
    const typeColor = inferTypeColorForBundleFile(f);
    const nested = (f as any).files;
    if (Array.isArray(nested) && nested.length > 0) {
      const nestedEnriched = enrichBundleFileTypeColors(nested);
      return { ...f, typeColor, files: nestedEnriched };
    }
    return { ...f, typeColor };
  });
}

function WireClerkToken() {
  const { getToken } = useAuth()
  React.useEffect(() => {
    setTokenGetter(getToken)
  }, [getToken])
  return null
}

function AppContent() {
  // Screen routing
  const [screen, setScreen] = useState<"landing" | "login" | "signup" | "home">(
    "landing"
  );
  
  const { isSignedIn } = useAuth()
  const { user, isLoaded: userLoaded } = useUser()
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const { signOut } = useAuth()

  // Boot-time loading flag and email
  const [booting, setBooting] = useState(true);

  // ── Initialize SQLite DB on first mount ────────────────────────────────────
  useEffect(() => {
    initDb().catch((e) => console.error('[db] initDb failed:', e));
  }, []);

  // Warm camera/mic/library native modules so the first tap opens instantly.
  useEffect(() => {
    InteractionManager.runAfterInteractions(() => {
      void prewarmCaptureModules();
    });
  }, []);
  const [email, setEmail] = useState<string | undefined>(undefined);

  // UI state
  const [isSettingsModalVisible, setIsSettingsModalVisible] = useState(false);

  // File/bundle state
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [isNoteModalVisible, setIsNoteModalVisible] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [selectedFile, setSelectedFile] = useState<any>(null);
  const [isFileDetailVisible, setIsFileDetailVisible] = useState(false);
  const [selectedFilesForUpload, setSelectedFilesForUpload] = useState<any[]>(
    []
  );
  const [bundles, setBundles] = useState<any[]>([]);
  const [selectedBundle, setSelectedBundle] = useState<any | null>(null);
  const [selectedBundleUuid, setSelectedBundleUuid] = useState<string | null>(null);
  const [isBundleDetailVisible, setIsBundleDetailVisible] = useState(false);
  const [isCameraVisible, setIsCameraVisible] = useState(false);
  const [userFiles, setUserFiles] = useState<any[]>([]);

  // Pull-to-refresh
  const [refreshing, setRefreshing] = useState(false);
  /** Bumped when user creates a linq or posts a file so FileList scrolls to top. */
  const [fileListScrollTopTrigger, setFileListScrollTopTrigger] = useState(0);
  const bumpFileListScrollTop = React.useCallback(() => {
    setFileListScrollTopTrigger((n) => n + 1);
  }, []);

  // Note content cache (Map<fileId, noteBody>) so search can match keywords in note body
  const [noteContentCache, setNoteContentCache] = useState<Map<string, string>>(new Map());

  // Search/filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [isFilterVisible, setIsFilterVisible] = useState(false);
  const [isDeletingFiles, setIsDeletingFiles] = useState(false);
  const [contentFilters, setContentFilters] = useState<SearchFilters>({
    pdf: false,
    audio: false,
    images: false,
    link: false,
    notes: false,
  });

  const [submissionTime, setSubmissionTime] =
    useState<SubmissionTimeFilter>("all");
  const appliedFilterCount =
    Object.values(contentFilters).filter(Boolean).length +
    (submissionTime !== "all" ? 1 : 0);

  /** GET /api/files/search — same endpoint as web; primary search path when query non-empty */
  const [searchApiHits, setSearchApiHits] = useState<SearchHitRow[]>([]);
  const [searchApiStatus, setSearchApiStatus] = useState<
    "idle" | "loading" | "ok" | "error"
  >("idle");
  const { data: preview, load, fetchUrl } = useBundlePreview();

  const fileById = React.useMemo(
    () => new Map((userFiles ?? []).map((f: any) => [String(f.id), f])),
    [userFiles]
  );

  const bundleById = React.useMemo(
    () => new Map((bundles ?? []).map((b: any) => [String(b.id), b])),
    [bundles]
  );

  const handleCreateLinq = React.useCallback(async () => {
    const selectedIds = Array.from(selectedFiles ?? [])
    if (selectedIds.length < 2) {
      Alert.alert('Select at least 2 items to create a linq')
      return
    }

    const linqFiles = selectedIds
      .map((id) => fileById.get(id) ?? bundles.find((b: any) => String(b.id) === id))
      .filter(Boolean);
    const linqTitle = deriveLinqTitleFromFiles(linqFiles);

    try {
      // Always local-first: works offline; outbox resolves child opt- ids after uploads sync
      const localBundleId = `opt-linq-${Date.now()}`
      await upsertBundle({
        id: localBundleId,
        name: linqTitle,
        type: 'Link',
        created_at: new Date().toISOString(),
        creator: email ?? null,
        child_ids: JSON.stringify(selectedIds),
        dirty: 1,
        deleted: 0,
      })
      await enqueue({ op: 'create_bundle', localBundleId, childLocalIds: selectedIds })

      const syntheticBundle = {
        id: localBundleId,
        name: linqTitle,
        type: 'Link',
        typeColor: colorFromCategory('Link'),
        bundledFileIds: selectedIds,
        bundledUrls: linqFiles.map((f: any) => f?.url).filter(Boolean),
        files: linqFiles,
        content: `linq containing ${linqFiles.length} file(s)`,
        createdAt: new Date().toISOString(),
        creator: email ?? '',
        dirty: 1,
      }
      setBundles((prev) => [syntheticBundle, ...prev])
      setSelectedFiles(new Set())
      bumpFileListScrollTop()
      // Do not force immediate sync after creating a linq; let 1-min timer/manual sync handle it.
      markLocalChangePending()
    } catch (err: any) {
      console.error('Create Linq failed:', err)
      Alert.alert('Error', err?.message ?? 'Failed to create linq')
    }
  }, [selectedFiles, fileById, email, bundles, bumpFileListScrollTop])

  // Derived lists — bundles first in the merge map so a Linq wins over a stray duplicate file row.
  const sortedFiles = useMemo(() => {
    const byId = new Map<string, any>();
    for (const b of bundles) {
      const id = String(b?.id ?? "").trim();
      if (id) byId.set(id, b);
    }
    for (const f of userFiles) {
      const id = String(f?.id ?? "").trim();
      if (!id) continue;
      if (!byId.has(id)) byId.set(id, f);
    }
    return Array.from(byId.values()).sort((a, b) => {
      const dateA = new Date(a.createdAt ?? a.date).getTime();
      const dateB = new Date(b.createdAt ?? b.date).getTime();
      return dateB - dateA;
    });
  }, [bundles, userFiles]);

  useEffect(() => {
    const selectedIds = Array.from(selectedFiles ?? []).map((id) => String(id));
    const liveIds = new Set<string>();
    for (const f of userFiles ?? []) {
      if (f?.id != null) liveIds.add(String(f.id));
    }
    for (const b of bundles ?? []) {
      if (b?.id != null) liveIds.add(String(b.id));
    }
    const staleSelectionIds = selectedIds.filter((id) => !liveIds.has(id));

    if (staleSelectionIds.length > 0) {
      const pruned = selectedIds.filter((id) => liveIds.has(id));
      setSelectedFiles(new Set(pruned));
    }
  }, [selectedFiles, userFiles, bundles]);

  const searchRequestId = useRef(0);
  // Debounced server search (same as web: GET /api/files/search?q=…)
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q || !isLoggedIn || screen !== "home") {
      setSearchApiHits((prev) => (prev.length === 0 ? prev : []));
      setSearchApiStatus((prev) => (prev === "idle" ? prev : "idle"));
      return;
    }
    const rid = ++searchRequestId.current;
    setSearchApiStatus("loading");
    setSearchApiHits([]);
    let cancelled = false;
    const tid = setTimeout(async () => {
      if (rid !== searchRequestId.current) return;
      try {
        const rows = await filesApi.searchFiles(q);
        if (cancelled || rid !== searchRequestId.current) return;
        setSearchApiHits(Array.isArray(rows) ? rows : []);
        setSearchApiStatus("ok");
      } catch (e) {
        if (!cancelled && rid === searchRequestId.current) {
          console.warn("GET /api/files/search failed, falling back to on-device search:", e);
          setSearchApiHits([]);
          setSearchApiStatus("error");
        }
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(tid);
    };
  }, [searchQuery, isLoggedIn, screen]);

const filteredFiles = useMemo(() => {
  const query = searchQuery.trim().toLowerCase();
  const hasActiveContentFilter = Object.values(contentFilters).some(Boolean);

  // --- helpers ---

  // Decide category using contentType first (if present), then extension, then backend type.
  const inferCategory = (entry: any): string => {
    const t = String(entry.type ?? "").toLowerCase();
    const ct = String(entry.contentType ?? "").toLowerCase();

    // Prefer explicit contentType when available
    if (ct.startsWith("image/")) return "Image";
    if (ct.startsWith("audio/")) return "Audio";
    if (ct.startsWith("video/")) return "Video";
    if (ct === "application/pdf" || t === "pdf") return "PDF";

    // Known backend type values (Linqs: link, bundle, linq)
    if (t === "link" || t === "bundle" || t === "linq") return "Link";
    if (t === "image") return "Image";
    if (t === "audio" || t === "recording") return "Audio";
    if (t === "video") return "Video";
    if (t === "note") return "Note";
    if (t === "file" || t === "document") return "File";

    // Fallback: infer by filename extension
    const ext = entry?.name?.split(".").pop()?.toLowerCase();
    if (ext) {
      if (["jpg","jpeg","png","gif","bmp","webp","heic"].includes(ext)) return "Image";
      if (["mp3","m4a","aac","wav","ogg","caf"].includes(ext)) return "Audio";
      if (["mp4","mov","webm","m4v","avi","wmv"].includes(ext)) return "Video";
      if (ext === "pdf") return "PDF";
      if (["md","txt","rtf"].includes(ext)) return "Note";
    }
    return "File";
  };

  // Normalize any entry to the FileCard shape the UI expects.
  const normalizeEntry = (entry: any) => {
    const idStr = String(entry.id ?? entry.file_id ?? "");
    const created = entry.createdAt ?? entry.date ?? null;
    const date =
      created && !Number.isNaN(new Date(created).getTime())
        ? formatDateTime(new Date(created))     // "MM/DD/YYYY HH:MMAM/PM"
        : "";                                   // safe empty if unknown

    const category = inferCategory(entry);
    const typeColor = colorFromCategory(category); // -> "blue" | "red" | ... | "button-border-color"

    // For the short display label on the right
    const fileID_cutoff = -5; // change this -5 to be other sizes if you want. negative means it comes from the right side.
    const number = String(entry.file_id ?? idStr).slice(fileID_cutoff); 

    // Preserve all existing fields (url, contentType, etc.), but ensure required display fields.
    return {
      ...entry,
      id: idStr,       // ensure string IDs app-wide (FileCard/FileList already use string)  
      date,
      type: category,  // normalized category (FileCard displays "linq" when type == "Link") 
      typeColor,       // color keyword; FileCard will call getTypeColor(typeColor)  
      number,
    };
  };

  // Linqs: backend/API can use type "link", "bundle", or "linq"; we display as "linq"
  const isBundle = (entry: any) => {
    const t = String(entry.type ?? "").toLowerCase();
    return t === "link" || t === "bundle" || t === "linq";
  };

  // String-keyed map with *normalized* entries to preserve complete metadata
  const allFilesMap = new Map<string, any>();
  for (const file of userFiles) {
    if (file?.id != null) allFilesMap.set(String(file.id), normalizeEntry(file));
  }
  for (const bundle of bundles) {
    if (bundle?.id != null) allFilesMap.set(String(bundle.id), normalizeEntry(bundle));
  }

  const matchesContentFilter = (entry: any) => {
    if (!hasActiveContentFilter) return true;
    const category = inferCategory(entry);
    // Content filters are strict top-level type filters (no nested type leakage).
    // Example: with only Images selected, linq rows should not appear unless Linqs is also selected.
    const isPdf = contentFilters.pdf && category === "PDF";
    const isAudio = contentFilters.audio && category === "Audio";
    const isImage = contentFilters.images && category === "Image";
    const isLinkType = contentFilters.link && category === "Link";
    const isNote = contentFilters.notes && category === "Note";

    // Multiple selected filters should behave as OR (union), not AND (intersection).
    // Example: Notes + Linqs should include either notes OR linqs.
    return isPdf || isAudio || isImage || isLinkType || isNote;
  };

  const matchesSubmissionTime = (entry: any) => {
    if (submissionTime === "all") return true;
    const submittedAt = new Date(entry.createdAt ?? entry.date ?? "");
    if (Number.isNaN(submittedAt.getTime())) return false;
    const now = Date.now();
    const diffMs = now - submittedAt.getTime();
    const dayMs  = 24 * 60 * 60 * 1000;
    switch (submissionTime) {
      case "24h": return diffMs <= dayMs;
      case "7d":  return diffMs <= 7 * dayMs;
      case "30d": return diffMs <= 30 * dayMs;
      default:    return true;
    }
  };

  // Search: title (name), date, text content (content + note body cache), and for Linqs also search inside their files
  const matchesQuery = (entry: any) => {
    if (!query) return true;
    const baseFields: unknown[] = [
      entry.name,
      entry.type,
      entry.number,
      entry.date,
      entry.createdAt,
      entry.contentType,
      entry.creator,
      stripHtml(entry.content),
      entry.content,
      noteContentCache.get(String(entry.id)),
    ];
    // For Linqs (and any entry with .files), also match on nested file title, date, and text content
    if (Array.isArray(entry.files)) {
      for (const nested of entry.files) {
        baseFields.push(
          nested?.name,
          nested?.type,
          nested?.number,
          nested?.date,
          nested?.createdAt,
          nested?.contentType,
          nested?.creator,
          stripHtml(nested?.content),
          nested?.content,
          nested?.id != null ? noteContentCache.get(String(nested.id)) : null
        );
      }
    }
    return baseFields
      .filter(v => v !== undefined && v !== null && v !== "")
      .map(v => String(v).toLowerCase())
      .some(v => v.includes(query));
  };

  const appendParentLinqsForMatchedFiles = (
    normalizedTop: any[],
    sourceSorted: any[]
  ): any[] => {
    const matchedFileIds = new Set<string>();
    for (const e of normalizedTop) {
      if (!isBundle(e)) {
        matchedFileIds.add(String(e.id));
        if (e.file_id != null) matchedFileIds.add(String(e.file_id));
      }
    }
    const topLevelIds = new Set(normalizedTop.map((e: any) => String(e.id)));
    const linqsContainingMatchedFiles: any[] = [];
    for (const entry of sourceSorted) {
      if (!isBundle(entry)) continue;
      if (topLevelIds.has(String(entry.id))) continue;
      const fromFiles =
        Array.isArray(entry.files) &&
        entry.files.some((f: any) => {
          const id = f?.id ?? f?.file_id;
          return id != null && matchedFileIds.has(String(id));
        });
      const fromBundledIds =
        Array.isArray(entry.bundledFileIds) &&
        entry.bundledFileIds.some((id: any) => matchedFileIds.has(String(id)));
      if (fromFiles || fromBundledIds) {
        linqsContainingMatchedFiles.push(
          allFilesMap.get(String(entry.id)) ?? normalizeEntry(entry)
        );
      }
    }
    return [...normalizedTop, ...linqsContainingMatchedFiles];
  };

  /** When false, skip injecting parent linqs (respects “notes only” etc. without “linq” checked). */
  const allowParentLinqInjection =
    !hasActiveContentFilter || contentFilters.link;

  /** On-device search (metadata + note cache when loaded); used when query empty, API error, or loading with no hits yet */
  const clientSideSearchList = (): any[] => {
    const filteredTopLevel = sortedFiles
      .filter(
        (entry) =>
          matchesQuery(entry) &&
          matchesContentFilter(entry) &&
          matchesSubmissionTime(entry)
      )
      .map(normalizeEntry);
    return allowParentLinqInjection
      ? appendParentLinqsForMatchedFiles(filteredTopLevel, sortedFiles)
      : filteredTopLevel;
  };

  if (!query) {
    return dedupeFileRowsById(clientSideSearchList());
  }

  // Non-empty query: primary path = GET /api/files/search (web parity)
  if (
    searchApiStatus === "error" ||
    (searchApiStatus === "loading" && searchApiHits.length === 0)
  ) {
    return dedupeFileRowsById(clientSideSearchList());
  }

  if (searchApiStatus === "ok" && searchApiHits.length === 0) {
    return dedupeFileRowsById(clientSideSearchList());
  }

  const mergeSearchHit = (hit: SearchHitRow): any | null => {
    const id = String(hit.file?.id ?? hit.file?.file_id ?? "").trim();
    if (!id) return null;
    const local = fileById.get(id) ?? bundleById.get(id);
    const fromHit: any = {
      id,
      file_id: hit.file.file_id,
      name: hit.file.name ?? "Untitled",
      type: hit.file.type,
      contentType: hit.file.type,
      createdAt: hit.file.createdAt,
      creator: hit.file.creator_email ?? hit.file.creator_id ?? "",
      description: hit.file.description,
      matchedIn: hit.matchedIn,
      searchSnippet: hit.snippet,
    };
    return local ? { ...fromHit, ...local, id } : fromHit;
  };

  const seenIds = new Set<string>();
  const mergedRaw: any[] = [];
  for (const hit of searchApiHits) {
    const m = mergeSearchHit(hit);
    if (!m || seenIds.has(String(m.id))) continue;
    seenIds.add(String(m.id));
    mergedRaw.push(m);
  }

  const filteredTopLevel = mergedRaw
    .filter(
      (entry) => matchesContentFilter(entry) && matchesSubmissionTime(entry)
    )
    .map(normalizeEntry);

  const withLinqs = allowParentLinqInjection
    ? appendParentLinqsForMatchedFiles(filteredTopLevel, sortedFiles)
    : filteredTopLevel;
  withLinqs.sort((a: any, b: any) => {
    const dateA = new Date(a.createdAt ?? a.date).getTime();
    const dateB = new Date(b.createdAt ?? b.date).getTime();
    return dateB - dateA;
  });
  return dedupeFileRowsById(withLinqs);
}, [
  sortedFiles,
  bundles,
  userFiles,
  searchQuery,
  contentFilters,
  submissionTime,
  noteContentCache,
  searchApiHits,
  searchApiStatus,
  fileById,
  bundleById,
]);

  useEffect(() => {
    if (isBundleDetailVisible && selectedBundleUuid) {
      load(selectedBundleUuid);
    }
  }, [isBundleDetailVisible, selectedBundleUuid, load]);

  // When preview data arrives from the hook, map it to the modal shape.
  // Do not list `selectedBundle` in deps — when files are empty, merging would re-run forever.
  useEffect(() => {
    if (!preview) return;
    setSelectedBundle((prev: any) => {
      const hasExistingFiles =
        prev && Array.isArray(prev.files) && prev.files.length > 0;
      if (hasExistingFiles) return prev;
      return {
        name: preview.name ?? "linq",
        createdAt: preview.createdAt ?? "",
        creator: preview.creator ?? "",
        bundledUrls: preview.bundledUrls ?? [],
        files: preview.files ?? [],
        id: preview.id,
        url: preview.url,
        date: preview.date,
        type: "Link",
        typeColor: getTypeColor("link"),
        content: `linq containing ${(preview.files ?? []).length} file(s)`,
      };
    });
  }, [preview]);


  // Ref to avoid duplicate note-body prefetch (initial list hydration)
  const fetchedNoteContentIds = useRef<Set<string>>(new Set());

  // ── Optimization refs ──────────────────────────────────────────────────────
  /** True while a silent loadAndSetFiles is running; prevents overlapping calls. */
  const syncInFlightRef = useRef(false);
  /** Fingerprint of last fetched file list; if unchanged, skip bundle enrichment. */
  const lastFingerprintRef = useRef<string | null>(null);
  /** Debounce timer for AppState "active" events — kept for manual refresh fallback. */
  const appStateSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * Set to true the first time a full online sync writes state.
   * Prevents a stale offline SQLite boot from overwriting fresh server data.
   */
  const hasServerDataRef = useRef(false);

  // ── SQLite-backed sync (outbox drain + pull merge) ──────────────────────────
  const {
    status: syncStatus,
    triggerSync,
    hasPendingLocalChanges,
    markLocalChangePending,
  } = useSyncStatus({
    enabled: isLoggedIn && screen === 'home',
    onSyncComplete: ({ files: freshFiles, bundles: freshBundles, raw, source }) => {
      // Prefer explicit source. Fall back for any older callers that omit it.
      const syncSource = source ?? (raw.length > 0 ? 'server' : 'offline');
      const isServerSync = syncSource === 'server';
      const isCacheSync = syncSource === 'cache';
      if (isServerSync) hasServerDataRef.current = true;

      InteractionManager.runAfterInteractions(async () => {
        try {
          // After we've shown server-backed data, ignore an *empty* offline SQLite
          // snapshot (avoids wiping the list mid-session). Cache + server must still
          // apply empty lists so web deletes clear the UI.
          if (syncSource === 'offline' && hasServerDataRef.current) {
            const n = freshFiles.length + freshBundles.length;
            if (n === 0) return;
          }

          // ── Helper: stamp typeColor + date on any file/bundle row ─────────
          const decorateRow = (f: any) => ({
            ...f,
            typeColor: f.typeColor ?? colorFromCategory(categoryFromExt(f.type ?? '')),
            date: f.date ?? f.createdAt ?? '',
          });

          if (!isServerSync) {
            // ── Offline / post-cache fast path ───────────────────────────────
            // Skip separateBundlesAndFiles: it calls NetInfo + getContents and
            // can hang/throw/produce empty bundles offline.
            // Decorate SQLite rows directly and resolve Linq children from the
            // in-memory fileMap — zero network needed.
            if (
              syncSource === 'offline' &&
              freshFiles.length === 0 &&
              freshBundles.length === 0
            ) {
              return;
            }
            const isLinqT = (t: string) => {
              const l = String(t ?? '').toLowerCase();
              return l === 'link' || l === 'bundle' || l === 'linq';
            };
            const decoratedFiles = freshFiles
              .filter((f: any) => !isLinqT(f.type))
              .map(decorateRow);
            const baseBundles = freshBundles.map((b: any) => {
              const dec = decorateRow(b);
              return dec;
            });
            const decoratedBundles = baseBundles.map((b: any) => {
              const dec = { ...b };
              hydrateBundleTreeFromLocalLists(dec, decoratedFiles, baseBundles);
              dec.content = dec.files?.length
                ? linqContentSummary(dec.files.length)
                : dec.content ?? 'Empty linq';
              if (isGenericLinqName(dec.name)) {
                dec.name = deriveLinqTitleFromFiles(dec.files ?? []);
              }
              return dec;
            });
            // Cache refresh after a pull that deleted everything: clear UI.
            if (isCacheSync || decoratedFiles.length + decoratedBundles.length > 0) {
              setBundles(decoratedBundles);
              setUserFiles(decoratedFiles);
              if (isCacheSync) {
                lastFingerprintRef.current = [...decoratedFiles, ...decoratedBundles]
                  .map((i: any) => `${i.id ?? ''}:${i.createdAt ?? ''}`)
                  .sort()
                  .join('|');
              }
            }
            return;
          }

          // ── Online path: merge raw + SQLite, then full enrichment ─────────
          let pendingOptIds: Set<string> | undefined;
          try {
            const { fileIds, bundleIds } = await getOutboxReferencedIds();
            pendingOptIds = new Set([...fileIds, ...bundleIds]);
          } catch { /* non-fatal */ }

          const mergedInput = mergeRawWithMergedLists(
            raw,
            freshFiles,
            freshBundles,
            pendingOptIds,
            true
          );
          const fp = mergedInput
            .map((i: any) => `${i.id ?? ''}:${i.createdAt ?? ''}`)
            .sort()
            .join('|');
          if (fp === lastFingerprintRef.current) return;
          lastFingerprintRef.current = fp;
          const { bundles: enrichedBundles, files: enrichedFiles } =
            await separateBundlesAndFiles(mergedInput);
          setBundles(enrichedBundles.map(decorateRow));
          setUserFiles(enrichedFiles.map(decorateRow));
        } catch (e) {
          console.warn('[sync] onSyncComplete enrichment failed:', e);
          // Still apply the SQLite snapshot so web deletes are not stuck in UI
          // when enrichment fails after a successful purge.
          if (isServerSync || isCacheSync) {
            try {
              const isLinqT = (t: string) => {
                const l = String(t ?? '').toLowerCase();
                return l === 'link' || l === 'bundle' || l === 'linq';
              };
              setUserFiles(
                freshFiles
                  .filter((f: any) => !isLinqT(f.type))
                  .map((f: any) => ({
                    ...f,
                    typeColor:
                      f.typeColor ?? colorFromCategory(categoryFromExt(f.type ?? '')),
                    date: f.date ?? f.createdAt ?? '',
                  }))
              );
              setBundles(
                freshBundles.map((b: any) => ({
                  ...b,
                  typeColor:
                    b.typeColor ?? colorFromCategory(categoryFromExt(b.type ?? '')),
                  date: b.date ?? b.createdAt ?? '',
                }))
              );
            } catch {
              /* non-fatal */
            }
          }
        }
      });
    },
  });
  /** Guards duplicate openBundleDetail runs for the same Linq id. */
  const openingBundleIdRef = useRef<string | null>(null);
  /** Pre-hydrated Phase B results keyed by bundleId — enables instant Linq opens. */
  const preHydratedRef = useRef<Map<string, { files: any[]; hydratedAt: number }>>(new Map());
  /** Cancels showing the bundle modal if the user closed while open/hydration was in flight. */
  const bundleOpenTokenRef = useRef<object | null>(null);
  /** Latest bundles for delete-side-effects without stale closures. */
  const bundlesRef = useRef<any[]>([]);
  /** Latest open Linq row for background hydration while the modal stays open. */
  const selectedBundleSyncRef = useRef<any | null>(null);

  useEffect(() => {
    bundlesRef.current = bundles;
  }, [bundles]);

  // If a linq was deleted remotely and is no longer in the list, close the stale modal.
  useEffect(() => {
    if (!isBundleDetailVisible || !selectedBundleUuid) return;
    const stillExists = bundles.some(
      (b: any) => String(b?.id ?? "") === String(selectedBundleUuid)
    );
    if (stillExists) return;
    setIsBundleDetailVisible(false);
    setSelectedBundleUuid(null);
    setSelectedBundle(null);
    bundleOpenTokenRef.current = null;
    openingBundleIdRef.current = null;
  }, [bundles, isBundleDetailVisible, selectedBundleUuid]);

  useEffect(() => {
    selectedBundleSyncRef.current = selectedBundle;
  }, [selectedBundle]);

  // If the Linq modal is open but media URLs are still filling in, re-run Phase B when the list
  // refreshes or on first paint — keeps previews updating without closing the sheet.
  useEffect(() => {
    if (!isBundleDetailVisible || !selectedBundleUuid) return;
    const bundleId = selectedBundleUuid;
    let cancelled = false;

    (async () => {
      const snap = selectedBundleSyncRef.current;
      if (!snap || String(snap.id) !== bundleId) return;
      if (bundleChildRowsAreDisplayReady(snap.files)) return;

      const rowFromList = bundles.find((b: any) => String(b.id) === bundleId);
      let seed =
        snap.files?.length ? snap.files : rowFromList?.files?.length ? rowFromList.files : [];
      if ((!Array.isArray(seed) || seed.length === 0) && rowFromList) {
        const node = { ...rowFromList };
        hydrateBundleTreeFromLocalLists(node, userFiles, bundles);
        seed = node.files ?? [];
      }
      if (!Array.isArray(seed) || seed.length === 0) return;

      try {
        const hydrated = enrichBundleFileTypeColors(await runPhaseB(seed));
        if (cancelled) return;
        setSelectedBundle((cur: any) => {
        if (!cur || String(cur.serverId ?? cur.id ?? "") !== bundleId) return cur;
          if (bundleChildRowsAreDisplayReady(cur.files)) return cur;
          return {
            ...cur,
            files: hydrated,
            bundledFileIds: rowFromList?.bundledFileIds ?? cur.bundledFileIds,
            bundledUrls: rowFromList?.bundledUrls ?? cur.bundledUrls,
            content: `linq containing ${hydrated.length} file(s)`,
          };
        });
        if (bundleChildRowsAreDisplayReady(hydrated)) {
          preHydratedRef.current.set(bundleId, {
            files: hydrated,
            hydratedAt: Date.now(),
          });
        }
      } catch {}
    })();

    return () => {
      cancelled = true;
    };
  }, [bundles, userFiles, isBundleDetailVisible, selectedBundleUuid]);

  // Kick off Phase B hydration for all bundles in the background so opens are instant.
  function schedulePreHydration(freshBundles: any[], freshFiles: any[]) {
    InteractionManager.runAfterInteractions(async () => {
      await concurrentMap(
        freshBundles,
        async (bundle: any) => {
          hydrateBundleTreeFromLocalLists(bundle, freshFiles, freshBundles);
          if (!bundle.files?.length) return;
          const bundleId = String(bundle.id ?? "").trim();
          if (!bundleId) return;
          const hydratedFiles = enrichBundleFileTypeColors(await runPhaseB(bundle.files));
          preHydratedRef.current.set(bundleId, { files: hydratedFiles, hydratedAt: Date.now() });
        },
        3
      );
    });
  }

  // Voice recording hook
  const {
    handleMicrophonePress: handleVoiceRecordPress,
    isRecordingActive,
    isCountdownActive,
    countdownSeconds,
    recordingElapsed,
    isAudioRequesting,
  } = useVoiceRecord({
    onRecordingSaved: async (recordingItem) => {
      try {
        const uri: string = recordingItem?.uri ?? recordingItem?.url ?? "";
        if (!uri) throw new Error("No audio file URI from recorder.");

        const fileName = getDefaultFileName("audio", ".mp3");
        const localId = newLocalFileId();

        // Save locally first (copies to persistent storage + enqueues upload)
        const { localUri } = await saveLocal({
          localId,
          name: fileName,
          type: "Audio",
          contentType: "mp3",
          sourceUri: uri,
          destExt: ".mp3",
          creator: email,
        });

        // Show in list immediately (works offline)
        setUserFiles((prev) => [
          optimisticRow({
            localId,
            name: fileName,
            type: "Audio",
            contentType: "mp3",
            localUri,
            creator: email,
          }) as any,
          ...prev,
        ]);
        bumpFileListScrollTop();

        markLocalChangePending();
      } catch (e: any) {
        console.error("Audio save error:", e);
        Alert.alert("Error", e?.message ?? "Could not save audio.");
      }
    },
    defaultFiles: [],
    bundles,
    notes: userFiles,
    currentUserEmail: email ?? "me (placeholder)",
    recordingDuration: 0, // start immediately
  });

  /**
   * Runs a background task and logs how long it took. No blocking UI — local
   * writes are optimistic, so the list already shows the result.
   */
  async function withAction<T>(task: () => Promise<T>, label?: string): Promise<T> {
    const t = track(label ?? "ACTION");
    try {
      const result = await task();
      t.done();
      return result;
    } catch (e) {
      t.fail("failed", e);
      throw e;
    }
  }

  // ---- Shared: fetch from server, separate, set state, save cache ----
  async function loadAndSetFiles(opts?: { silent?: boolean }) {
    const startedAt = Date.now();
    try {
      // ── Read SQLite first — works offline, no network needed ──────────────────
      // This MUST happen before fetchAllFiles so that if the server is unreachable
      // we still have local data to display (opt- files, opt- linqs, etc.).
      let localFiles: any[] = [];
      let localBundles: any[] = [];
      let t = Date.now();
      try {
        localFiles = (await getAllFiles()) as any[];
        localBundles = (await getAllBundles()) as any[];
      } catch (dbErr) {
        console.warn('[files] SQLite read failed:', dbErr);
      }
      const msSqliteRead = Date.now() - t;

      // ── Try server fetch; silently fall back to empty when offline ────────────
      let raw: any[] = [];
      let serverListOk = false;
      t = Date.now();
      try {
        raw = await fetchAllFiles();
        serverListOk = true;
      } catch {
        console.log(
          `[files] API list unreachable · SQLite-only · local read was ${msSqliteRead}ms`
        );
      }
      const msApiList = Date.now() - t;

      // Which opt- ids are still genuinely pending in the outbox?
      // Used by mergeRawWithMergedLists to avoid showing opt- items that have
      // already been uploaded (their server id will arrive with markFileSynced).
      let pendingOptIds: Set<string> | undefined;
      if (serverListOk) {
        try {
          const { fileIds, bundleIds } = await getOutboxReferencedIds();
          pendingOptIds = new Set([...fileIds, ...bundleIds]);
        } catch { /* non-fatal */ }
      }

      // Merge server list with local SQLite so opt- items survive the refresh.
      const merged = mergeRawWithMergedLists(
        raw,
        localFiles,
        localBundles,
        pendingOptIds,
        serverListOk
      );

      // ── Client fingerprint: skip enrichment when list unchanged (silent syncs) ──
      // When there is no server payload (offline / fetch failed), never skip — merged
      // list comes only from SQLite and must still run through enrichment.
      if (opts?.silent && serverListOk) {
        const fp = merged
          .map((i: any) => `${i.id ?? ""}:${i.createdAt ?? ""}`)
          .sort()
          .join("|");
        if (fp === lastFingerprintRef.current) {
          logPerf(
            "files",
            `unchanged fingerprint · skip enrich · sql ${msSqliteRead}ms · api ${msApiList}ms`,
            startedAt
          );
          return;
        }
        lastFingerprintRef.current = fp;
      } else if (!opts?.silent) {
        // Update fingerprint on explicit loads so the next silent sync compares correctly
        lastFingerprintRef.current = merged
          .map((i: any) => `${i.id ?? ""}:${i.createdAt ?? ""}`)
          .sort()
          .join("|");

        // ── Show list immediately before bundle enrichment ────────────────────────
        // Split synchronously (no network) so the list renders as soon as API responds.
        const isLinqRaw = (t: string) => {
          const lower = String(t ?? "").toLowerCase();
          return lower === "link" || lower === "bundle" || lower === "linq";
        };
        const addUiFieldsEarly = (f: any) => ({
          ...f,
          typeColor: f.typeColor ?? colorFromCategory(categoryFromExt(f.type ?? '')),
          date: f.date ?? f.createdAt ?? '',
        });
        setUserFiles(merged.filter((i: any) => !isLinqRaw(i.type)).map(addUiFieldsEarly));
        setBundles(merged.filter((i: any) => isLinqRaw(i.type)).map(addUiFieldsEarly));
        logPerf(
          "files",
          `first paint · ${merged.length} rows · sql ${msSqliteRead}ms · GET /files ${msApiList}ms`,
          startedAt
        );
      }

      // ── Enrich bundles + pre-hydrate in background (both silent and explicit) ──
      InteractionManager.runAfterInteractions(async () => {
        try {
          const enrichT = Date.now();
          const { bundles: freshBundles, files: freshFiles } =
            await separateBundlesAndFiles(merged);
          const msEnrich = Date.now() - enrichT;
          const addUiF = (f: any) => ({
            ...f,
            typeColor: f.typeColor ?? colorFromCategory(categoryFromExt(f.type ?? '')),
            date: f.date ?? f.createdAt ?? '',
          });
          setBundles(freshBundles.map(addUiF));
          setUserFiles(freshFiles.map(addUiF));
          // SQLite is updated by pullSync — no AsyncStorage save needed here
          logPerf(
            "files",
            `linq prefetch done · ${freshFiles.length} files · ${freshBundles.length} linqs · enrich ${msEnrich}ms`,
            startedAt
          );

          // Cleanup and pre-hydration after enrichment settles
          InteractionManager.runAfterInteractions(() => {
            cleanupEmptyBundles(freshBundles, (deletedIds) => {
              setBundles((prev) => prev.filter((b) => !deletedIds.includes(b.id)));
              // No cache save — SQLite updated by pullSync
            });
            schedulePreHydration(freshBundles, freshFiles);
          });
        } catch (e) {
          console.warn("[files] background linq prefetch failed:", e);
        }
      });
    } catch (e) {
      console.warn("[files] load failed:", e);
    }
  }

  const clerkEmail = user?.primaryEmailAddress?.emailAddress;
  const clerkUserId = user?.id;

  // Boot-time restore: auto sign-in if token exists
  useEffect(() => {
    // Wait until Clerk finishes loading the user
    if (!userLoaded) return;
    if (isSignedIn) {
      setIsLoggedIn(true);
      setEmail(clerkEmail ?? undefined);
      setScreen("home");
    } else {
      setIsLoggedIn(false);
      setScreen("landing");
    }
    setBooting(false);
  }, [isSignedIn, userLoaded, clerkEmail, clerkUserId]);


  // ---- Initial list load — local SQLite only. Network sync is manual. ----
  const [initialListLoaded, setInitialListLoaded] = useState(false);
  useEffect(() => {
    (async () => {
      if (!isLoggedIn || screen !== "home" || initialListLoaded) return;
      setInitialListLoaded(true);

      try {
        // Read from SQLite immediately — paint the list with no network wait
        const [localFiles, localBundles] = await Promise.all([
          getAllFiles(),
          getAllBundles(),
        ]);
        // Add UI fields that SQLite rows lack (typeColor, date)
        const addUiFields = (arr: any[]) =>
          arr.map((f) => ({
            ...f,
            typeColor: f.typeColor ?? colorFromCategory(categoryFromExt(f.type ?? '')),
            date: f.date ?? f.createdAt ?? '',
          }));
        const decoratedFiles = addUiFields(localFiles as any[]);
        const baseBundles = addUiFields(localBundles as any[]);
        const decoratedBundles = baseBundles.map((b: any) => {
          const dec = { ...b };
          hydrateBundleTreeFromLocalLists(dec, decoratedFiles, baseBundles);
          dec.content = dec.files?.length
            ? linqContentSummary(dec.files.length)
            : dec.content ?? 'Empty linq';
          if (isGenericLinqName(dec.name)) {
            dec.name = deriveLinqTitleFromFiles(dec.files ?? []);
          }
          return dec;
        });
        setUserFiles(decoratedFiles);
        setBundles(decoratedBundles);
      } catch (e) {
        console.warn('[boot] SQLite read failed:', e);
      }
    })();
  }, [isLoggedIn, screen, initialListLoaded]);

  // ---- Preload note content after list load so search can match note body without waiting for user to type ----
  useEffect(() => {
    if (!isLoggedIn || screen !== "home" || !initialListLoaded) return;
    if (userFiles.length === 0 && bundles.length === 0) return;

    const isNoteFile = (file: any): boolean => {
      if (!file) return false;
      const type = String(file.type || "").toLowerCase();
      const contentType = String(file.contentType || "").toLowerCase();
      const name = String(file.name || "").toLowerCase();
      return (
        type === "note" ||
        name.endsWith(".md") ||
        name.endsWith(".txt") ||
        name.endsWith(".rtf") ||
        contentType.endsWith(".md") ||
        contentType.endsWith(".txt") ||
        contentType.endsWith(".rtf")
      );
    };

    let cancelled = false;
    (async () => {
      const isOptimistic = (f: any) =>
        isLegacyOptId(f?.id) || f?.dirty === 1;
      const topLevelNotes: any[] = userFiles.filter(
        (f: any) =>
          f?.id != null &&
          !isOptimistic(f) &&
          isNoteFile(f) &&
          !(f.content && String(f.content).trim() !== "") &&
          !fetchedNoteContentIds.current.has(String(f.id))
      );
      const nestedNotes: Array<{ bundleId: string; file: any }> = [];
      for (const bundle of bundles) {
        if (!bundle.files?.length) continue;
        for (const file of bundle.files) {
          if (!file?.id || isOptimistic(file) || !isNoteFile(file)) continue;
          if (file.content && String(file.content).trim() !== "") continue;
          if (fetchedNoteContentIds.current.has(String(file.id))) continue;
          nestedNotes.push({ bundleId: bundle.id, file });
        }
      }
      const toFetch = topLevelNotes.length + nestedNotes.length;
      if (toFetch === 0) return;

      topLevelNotes.forEach((f: any) => { if (f.id != null) fetchedNoteContentIds.current.add(String(f.id)); });
      nestedNotes.forEach(({ file }) => { if (file.id != null) fetchedNoteContentIds.current.add(String(file.id)); });

      const fetchOne = async (file: any): Promise<string | null> => {
        if (cancelled) return null;
        // Skip optimistic placeholders — they have no real server record yet
        if (isOptimistic(file)) return null;
        try {
          let url = file.url;
          if (file.id != null) {
            try {
              const focus = await filesApi.getById(String(file.id));
              if (focus?.url) url = focus.url;
            } catch (_) {}
          }
          if (!url) return null;
          return await filesApi.getNoteContent(url);
        } catch (_) {
          return null;
        }
      };

      const topResults = await Promise.all(topLevelNotes.map(async (file) => ({ file, content: await fetchOne(file) })));
      const nestedResults = await Promise.all(nestedNotes.map(async ({ bundleId, file }) => ({ bundleId, file, content: await fetchOne(file) })));

      if (cancelled) return;

      setNoteContentCache((prev) => {
        const next = new Map(prev);
        for (const r of [...topResults, ...nestedResults]) {
          const file = "file" in r ? r.file : null;
          if (file?.id != null && r.content) next.set(String(file.id), stripHtml(r.content));
        }
        return next;
      });
      for (const r of [...topResults, ...nestedResults]) {
        const file = "file" in r ? r.file : null;
        if (file?.id != null && r.content) {
          void updateFileContent(String(file.id), r.content).catch(() => undefined);
        }
      }
      setUserFiles((current) =>
        current.map((f: any) => {
          const r = topResults.find((x) => x.file?.id === f.id);
          return r?.content ? { ...f, content: r.content } : f;
        })
      );
      setBundles((current) =>
        current.map((bundle: any) => {
          const bundleResults = nestedResults.filter((r) => r.bundleId === bundle.id);
          if (bundleResults.length === 0) return bundle;
          const updatedFiles = (bundle.files || []).map((file: any) => {
            const r = bundleResults.find((x) => x.file?.id === file.id);
            return r?.content ? { ...file, content: r.content } : file;
          });
          return { ...bundle, files: updatedFiles };
        })
      );
    })();

    return () => { cancelled = true; };
  }, [isLoggedIn, screen, initialListLoaded, userFiles, bundles]);

  // ---- Foreground refresh now handled by useSyncStatus (AppState + NetInfo) ----
  // The appStateSyncTimerRef is kept to avoid regressions in other code paths
  // but the listener below is removed — useSyncStatus owns foreground sync.

  // Loading UI while deciding where to go
  if (booting) {
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center">
        <StatusBar style="light" />
        <Text className="text-white">Loading…</Text>
      </SafeAreaView>
    );
  }

  // ===== Handlers =====
  const toggleFileSelection = (fileId: string) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  };

  const openFileDetail = async (file: any) => {
    const t = track("OPEN FILE", truncateNameForLog(String(file?.name ?? "")));
    try {
      if (opensAsLinqDetail(file)) {
        openBundleDetail(file);
        return;
      }

      // 1) Prefer SQLite row (note body + local_uri). Keep opening local-first.
      let url = file?.url;
      let extFromLocal = (file?.contentType || "").toLowerCase();
      let nameFromLocal: string | undefined;

      let merged: any = file;
      if (file?.id) {
        try {
          const row = await getFileById(String(file.id));
          if (row) {
            merged = {
              ...file,
              ...row,
              content: row.content ?? file.content,
              url: row.url ?? file.url,
              local_uri: row.local_uri ?? (file as any).local_uri,
            };
          }
        } catch (e) {
          console.warn(`getFileById failed for ${file?.id}`, e);
        }
      }
      t.step("read from local db");

      const netState = await NetInfo.fetch();
      const id = String(merged?.id ?? "").trim();
      const canSyncThisFile =
        id !== "" &&
        !isLegacyOptId(id) &&
        Number(merged?.dirty) !== 1 &&
        !!netState.isConnected;

      const mergedExt = String(merged?.contentType ?? "").toLowerCase();
      const mergedName = String(merged?.name ?? "").toLowerCase();
      const isInlineText =
        (merged?.content != null && String(merged.content).trim() !== "") ||
        mergedExt === "txt" ||
        mergedExt === "md" ||
        mergedExt === "text/plain" ||
        mergedExt === "text/markdown" ||
        /\.txt$/i.test(mergedName) ||
        /\.md$/i.test(mergedName) ||
        String(merged?.type ?? "").toLowerCase() === "note";

      const localUriBefore =
        merged?.local_uri && String(merged.local_uri).trim() !== ""
          ? String(merged.local_uri)
          : undefined;

      if (!localUriBefore && !isInlineText && canSyncThisFile) {
        try {
          const hydrated = await ensureFileDownloaded(id);
          if (hydrated) {
            merged = {
              ...merged,
              ...hydrated,
              content: hydrated.content ?? merged.content,
              local_uri: hydrated.local_uri ?? merged.local_uri,
            };
          }
        } catch (e) {
          console.warn(`ensureFileDownloaded failed for ${id}`, e);
        }
        t.step("downloaded content");
      }

      const localUri =
        merged?.local_uri && String(merged.local_uri).trim() !== ""
          ? String(merged.local_uri)
          : undefined;

      // Prefer on-device cache. For images/PDFs/etc., fall back to a fresh
      // presigned S3 URL — never the HTML /preview/{id} page (RN Image/WebView
      // cannot render that Clerk-auth page as media).
      url = localUri ?? undefined;
      if (!url) {
        const existing = String(merged?.url ?? url ?? "").trim();
        const looksLikeSitePreview =
          /\/preview\/[^/?#]+/i.test(existing) ||
          existing.includes("linquiq-sigma.vercel.app/preview/");
        if (existing && !looksLikeSitePreview) {
          url = existing;
        } else if (isInlineText) {
          url = existing || undefined;
        } else if (canSyncThisFile) {
          try {
            const remote = await fetchUrl(id);
            if (remote && String(remote).trim() !== "") {
              url = String(remote).trim();
            }
          } catch (e) {
            console.warn(`fetchUrl failed for ${id}`, e);
          }
        }
      }
      extFromLocal = (merged?.contentType ?? extFromLocal ?? "").toLowerCase();
      nameFromLocal = merged?.name;

      // 2) Derive mediaType for the modal (audio/video hints)
      const mediaType = (() => {
        const e = extFromLocal;
        if (["mp4", "mov", "webm", "m4v", "avi", "wmv"].includes(e))
          return "video";
        if (["mp3", "m4a", "aac", "wav", "ogg", "caf"].includes(e))
          return "audio";
        return undefined;
      })();

      // 3) Open modal with a fresh URL and richer hints
      const resolved = {
        ...merged,
        url,
        local_uri: merged?.local_uri ?? (file as any).local_uri,
        name: nameFromLocal ?? merged?.name,
        contentType: extFromLocal,
        mediaType, // helps expo-audio/expo-video paths
      };

      setSelectedFile(resolved);
      setIsFileDetailVisible(true);
      t.done(localUri ? "from device" : "from network");
    } catch (err) {
      t.fail("open file", err);
      Alert.alert(
        "Unable to open file",
        "Please pull to refresh and try again."
      );
    }
  };

  const pickDocument = async () => {
    const t = track("PICK DOCUMENT");
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || result.assets.length === 0) {
        t.done("cancelled");
        return;
      }
      t.step("picker closed");

      const asset = result.assets[0];
      const mime = String((asset as { mimeType?: string }).mimeType ?? "");
      const heicHints = { mimeType: mime || null, fileName: asset.name ?? null };
      const wasHeicPick = isHeicSource(asset.uri, heicHints);
      let fileUri = asset.uri;
      fileUri = await convertHeicToJpeg(fileUri, heicHints);
      const stillHeicPick = isHeicSource(fileUri, { mimeType: null, fileName: null });
      let ext = pickExtensionFromUri(fileUri, "");
      if (!ext && wasHeicPick && !stillHeicPick) ext = ".jpg";
      if (!ext) ext = ".bin";
      const extClean = ext.replace(/^\./, "").toLowerCase();
      const isAudio = isAudioExtension(ext);

      let fileName: string;
      if (isAudio) {
        const extLower = extClean;
        if (extLower !== "mp3") {
          console.log(`Audio file is ${extLower}, keeping original format`);
        }
        fileName = getDefaultFileName("audio", ext, true);
      } else {
        fileName = asset.name ?? getDefaultFileName("document", ext);
        if (wasHeicPick && !stillHeicPick && typeof fileName === "string") {
          fileName = fileName.replace(/\.hei[cf]$/i, ".jpg");
        }
      }

      const cat = categoryFromExt(extClean);
      const localId = newLocalFileId();

      // Save locally first — works offline, enqueues upload for later
      const { localUri } = await saveLocal({
        localId,
        name: fileName,
        type: cat,
        contentType: extClean,
        sourceUri: fileUri,
        destExt: ext || ".bin",
        creator: email,
      });
      t.step("saved locally");

      // Show in list immediately
      setUserFiles((prev) => [
        optimisticRow({
          localId,
          name: fileName,
          type: cat,
          contentType: extClean,
          localUri,
          creator: email,
        }) as any,
        ...prev,
      ]);
      bumpFileListScrollTop();

      markLocalChangePending();
      t.done(truncateNameForLog(fileName));
    } catch (err: any) {
      t.fail("document save", err);
      Alert.alert("Error", err?.message ?? "Could not save file.");
    }
  };

  // Image picker + upload (uses expo-image-picker; multi-select when the OS supports it)
  const pickImage = async () => {
    const t = track("PICK IMAGE");
    try {
      const allowed = await ensureMediaLibraryPermission();
      if (!allowed) {
        t.fail("photo library not allowed");
        Alert.alert(
          "Permission required",
          "This app needs access to your photo library to pick images."
        );
        return;
      }
      t.step("photo library allowed");

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.8,
        allowsEditing: false,
        allowsMultipleSelection: true,
        ...(Platform.OS === "ios"
          ? {
              preferredAssetRepresentationMode:
                ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
            }
          : {}),
      });

      if (result.canceled || (result as any).cancelled) {
        t.done("cancelled");
        return;
      }
      const assets: any[] = Array.isArray((result as any).assets)
        ? (result as any).assets
        : (result as any).uri
          ? [result as any]
          : [];
      if (!assets.length) {
        t.done("no assets");
        return;
      }
      t.step(`picker closed · ${assets.length} selected`);

      const savedRows: any[] = [];
      let failureCount = 0;

      for (let i = 0; i < assets.length; i++) {
        const asset = assets[i];
        let fileUri = asset?.uri;
        if (!fileUri) { failureCount += 1; continue; }
        try {
          const heicHints = {
            mimeType: asset?.mimeType ?? null,
            fileName: asset?.fileName ?? null,
          };
          const originalExt = pickExtensionFromUri(fileUri, ".jpg");
          const wasHeic = isHeicSource(fileUri, heicHints);
          fileUri = await convertHeicToJpeg(fileUri, heicHints);
          const ext = pickExtensionFromUri(fileUri, wasHeic ? ".jpg" : originalExt || ".jpg");
          const stillHeicAfterConvert =
            ext === ".heic" ||
            ext === ".heif" ||
            isHeicSource(fileUri, { mimeType: null, fileName: null });
          // Only force .jpg when conversion actually succeeded.
          const finalExt = wasHeic && !stillHeicAfterConvert ? ".jpg" : ext;
          const safeExt = finalExt.replace(/^\./, "").toLowerCase();

          const rawName = typeof asset.fileName === "string" ? asset.fileName.trim() : "";
          let fileName: string;
          if (rawName) {
            fileName = rawName.includes(".") ? rawName : `${rawName}${finalExt}`;
            if (wasHeic && !stillHeicAfterConvert) {
              fileName = fileName.replace(/\.hei[cf]$/i, ".jpg");
            }
          } else if (assets.length > 1) {
            fileName = `Image ${i + 1}${finalExt}`;
          } else {
            fileName = getDefaultFileName("image", finalExt);
          }

          const cat = categoryFromExt(safeExt);
          const localId = newLocalFileId();

          // Save locally first — works offline
          const { localUri } = await saveLocal({
            localId,
            name: fileName,
            type: cat,
            contentType: safeExt,
            sourceUri: fileUri,
            destExt: finalExt,
            creator: email,
          });

          savedRows.push(optimisticRow({
            localId,
            name: fileName,
            type: cat,
            contentType: safeExt,
            localUri,
            creator: email,
          }));
        } catch (e) {
          failureCount += 1;
          console.warn(`Image save failed for asset ${i}:`, e);
        }
      }

      if (savedRows.length) {
        setUserFiles((prev) => [...savedRows, ...prev]);
        bumpFileListScrollTop();
      }
      t.step(`saved ${savedRows.length}/${assets.length} locally`);
      if (failureCount > 0) {
        Alert.alert(
          "Some images could not be saved",
          `${failureCount} of ${assets.length} image(s) failed.`
        );
      }

      markLocalChangePending();
      t.done(`${savedRows.length} image(s)`);
    } catch (err: any) {
      t.fail("image save", err);
      Alert.alert("Error", err?.message ?? "Failed to save image.");
    }
  };

  // NEW: Ask user whether they want File or Image
  const handleAttachmentPress = () => {
    Alert.alert("Upload", "Choose what to upload", [
      { text: "File", onPress: pickDocument },
      { text: "Image", onPress: pickImage },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const handleNoteSave = async () => {
    const body = noteText;
    const trimmed = body.trim();
    setIsNoteModalVisible(false);
    setNoteText("");
    if (!trimmed) return;

    const fileName = deriveNoteUploadFileName(body);
    const localId = newLocalFileId();
    const displayName = fileName.replace(/\.txt$/, "");
    const t = track("SAVE NOTE");

    try {
      // Save locally first — works offline, enqueues upload for later
      await saveLocal({
        localId,
        name: fileName,
        type: "Note",
        contentType: "txt",
        content: body.replace(/\r\n/g, "\n"),
        creator: email,
      });

      // Show in list immediately
      setUserFiles((prev) => [
        optimisticRow({
          localId,
          name: displayName,
          type: "Note",
          contentType: "txt",
          content: body,
          creator: email,
        }) as any,
        ...prev,
      ]);
      bumpFileListScrollTop();

      // Mark local change pending; periodic/foreground/reconnect sync will drain outbox.
      markLocalChangePending();
      t.done(truncateNameForLog(displayName));
    } catch (err: any) {
      t.fail("note save", err);
      Alert.alert("Error", "Could not save note.");
    }
  };

const openBundleDetail = async (bundle: any) => {
  const startedAt = Date.now();
  const requestedBundleId = String(bundle.serverId ?? bundle.id ?? "").trim();
  if (!requestedBundleId) return;

  const title = linqLabelForLog(bundle);
  logLinqOpenStep(title, `Open · ${childNameSummary(bundle.files)}`, startedAt);

  // If this exact Linq is currently visible, force a clean reopen path.
  // Returning early here can trap the UI in "duplicate open" loops.
  const visibleBundleId = String(
    selectedBundle?.serverId ?? selectedBundle?.id ?? selectedBundleUuid ?? ""
  ).trim();
  if (isBundleDetailVisible && visibleBundleId && visibleBundleId === requestedBundleId) {
    setIsBundleDetailVisible(false);
    setSelectedBundleUuid(null);
    setSelectedBundle(null);
    bundleOpenTokenRef.current = null;
    openingBundleIdRef.current = null;
  }

  // If a request for this Linq is already in-flight, do nothing.
  if (openingBundleIdRef.current === requestedBundleId) {
    logPerf(
      "linqOpen",
      `Skipped duplicate open · "${title}"`,
      startedAt
    );
    return;
  }
  openingBundleIdRef.current = requestedBundleId;

  // DB / list rows often have bundledFileIds but files: [] — resolve from live lists before any fetch.
  let stepMark = Date.now();
  hydrateBundleTreeFromLocalLists(bundle, userFiles, bundles);
  logLinqOpenStep(
    title,
    `Filled from device lists · ${childNameSummary(bundle.files)}`,
    startedAt,
    stepMark
  );

  // ── Pre-hydration fast path: open instantly if background URL hydration already ran ──
  const PRE_HYDRATE_TTL_MS = 5 * 60 * 1000; // 5 minutes
  const preHydratedEntry = preHydratedRef.current.get(requestedBundleId);
  const preHydrationFresh =
    !!preHydratedEntry && Date.now() - preHydratedEntry.hydratedAt < PRE_HYDRATE_TTL_MS;

  // Fast path: retry URL hydration briefly — right after create, first background pass often lacks URLs.
  if (preHydrationFresh && preHydratedEntry) {
    stepMark = Date.now();
    logLinqOpenStep(
      title,
      `Cached tree — retry URL fetch until previews work`,
      startedAt,
      stepMark
    );
    let files = enrichBundleFileTypeColors(preHydratedEntry.files);
    let openedInstant = false;
    for (let a = 0; a < 22; a++) {
      files = enrichBundleFileTypeColors(await runPhaseB(files));
      if (bundleChildRowsAreDisplayReady(files)) {
        preHydratedRef.current.set(requestedBundleId, {
          files,
          hydratedAt: Date.now(),
        });
        bundle.files = files;
        setSelectedBundle({
          ...bundle,
          files,
          name: (bundle.name === "Bundle" || bundle.name === "bundle") ? "linq" : bundle.name,
          url: requestedBundleId ? `${API_BASE}/file/${requestedBundleId}` : bundle.url,
        });
        setSelectedBundleUuid(requestedBundleId);
        setIsBundleDetailVisible(true);
        openedInstant = true;
        break;
      }
      if (a < 21) await new Promise((r) => setTimeout(r, 220));
    }
    if (openedInstant) {
      openingBundleIdRef.current = null;
      logPerf(
        "linqOpen",
        `Instant open (cache) "${title}" · ${childNameSummary(files)}`,
        startedAt
      );
      return;
    }
    preHydratedRef.current.delete(requestedBundleId);
    bundlesApi.invalidateBundleContentsCache(requestedBundleId);
  }

  const openToken = {};
  bundleOpenTokenRef.current = openToken;

  stepMark = Date.now();
  logLinqOpenStep(
    title,
    `Slow path — server fetch for children/URLs · ${childNameSummary(bundle.files)}`,
    startedAt,
    stepMark
  );

  // Slow path: open the linq shell immediately, then fill children async.
  bundle.name =
    bundle.name === "Bundle" || bundle.name === "bundle" ? "linq" : bundle.name;
  bundle.url = requestedBundleId
    ? `${API_BASE}/file/${requestedBundleId}`
    : bundle.url;
  setSelectedBundle({
    ...bundle,
    files: enrichBundleFileTypeColors(bundle.files),
    name: (bundle.name === "Bundle" || bundle.name === "bundle") ? "linq" : bundle.name,
    url: requestedBundleId ? `${API_BASE}/file/${requestedBundleId}` : bundle.url,
    isHydratingChildren: true,
  });
  setSelectedBundleUuid(requestedBundleId);
  setIsBundleDetailVisible(true);
  logPerf(
    "linqOpen",
    `Sheet shown before child fetch · "${title}" · ${childNameSummary(bundle.files)}`,
    startedAt
  );

  const hasValidFiles = bundle.files?.length > 0 && bundle.files.every((f: any) => {
    const id = String(f?.id ?? "").trim();
    const name = String(f?.name ?? "").trim();
    if (id === "" || name === "") return false;

    // Nested Linq rows coming from the flat list often have unknown child counts.
    // Mark those as incomplete so we fetch at least top-level children first.
    const isNestedLinq = String(f?.type ?? "").toLowerCase() === "link";
    if (!isNestedLinq) return true;
    const hasNestedRefs =
      (Array.isArray(f?.files) && f.files.length > 0) ||
      (Array.isArray(f?.bundledFileIds) && f.bundledFileIds.length > 0) ||
      (Array.isArray(f?.children?.item_id) && f.children.item_id.length > 0);
    return hasNestedRefs;
  });

  // If incoming row data is incomplete, fetch top-level children after the shell is visible.
  // The modal shows a linq-colored loading state until these rows arrive.
  // Skip for opt- ids — they're local-only and the server doesn't know about them.
  if ((!bundle.files || bundle.files.length === 0 || !hasValidFiles) && !requestedBundleId.startsWith('opt-')) {
    const tFetch1 = Date.now();
    logLinqOpenStep(
      title,
      `API: loading child list (row was empty/incomplete)…`,
      startedAt,
      tFetch1
    );
    try {
      const quick = await bundlesApi.getContents(requestedBundleId);
      if (Array.isArray(quick.children) && quick.children.length > 0) {
        bundle.files = mapApiLinkedChildrenToBundleFiles(quick.children);
      }
      if (quick.bundledFileIds?.length) bundle.bundledFileIds = quick.bundledFileIds;
      if (quick.bundledUrls?.length) bundle.bundledUrls = quick.bundledUrls;
      if (quick.bundledFileIds?.length) {
        await updateBundleChildIds(requestedBundleId, quick.bundledFileIds);
      }
      setSelectedBundle((cur: any) => {
        if (!cur || String(cur.serverId ?? cur.id ?? "") !== requestedBundleId) return cur;
        return {
          ...cur,
          files: enrichBundleFileTypeColors(bundle.files),
          bundledFileIds: bundle.bundledFileIds,
          bundledUrls: bundle.bundledUrls,
          content: `linq containing ${(bundle.files ?? []).length} file(s)`,
          isHydratingChildren: true,
        };
      });
      logLinqOpenStep(
        title,
        `API: child list loaded · ${childNameSummary(bundle.files)}`,
        startedAt,
        tFetch1
      );
    } catch (e) {
      console.warn(
        `[linq·open] "${title}" · initial child list fetch failed · id${idSuffixForLog(requestedBundleId)}`,
        e
      );
      setSelectedBundle((cur: any) => {
        if (!cur || String(cur.serverId ?? cur.id ?? "") !== requestedBundleId) return cur;
        return { ...cur, isHydratingChildren: false };
      });
    }
  }

  // Ensure every row has a real typeColor (fileMap-resolved children often omit it).
  bundle.files = enrichBundleFileTypeColors(bundle.files);

  // Fresh linqs: list-shaped children often lack presigned URLs — refetch before resolving media URLs.
  if (
    !requestedBundleId.startsWith("opt-") &&
    !bundleChildRowsAreDisplayReady(bundle.files)
  ) {
    const tFetch2 = Date.now();
    logLinqOpenStep(
      title,
      `API: re-fetch children (previews/URLs not ready yet)…`,
      startedAt,
      tFetch2
    );
    try {
      const quick = await bundlesApi.getContents(requestedBundleId);
      if (Array.isArray(quick.children) && quick.children.length > 0) {
        bundle.files = enrichBundleFileTypeColors(
          mapApiLinkedChildrenToBundleFiles(quick.children)
        );
      }
      if (quick.bundledFileIds?.length) bundle.bundledFileIds = quick.bundledFileIds;
      if (quick.bundledUrls?.length) bundle.bundledUrls = quick.bundledUrls;
      if (quick.bundledFileIds?.length) {
        await updateBundleChildIds(requestedBundleId, quick.bundledFileIds);
      }
      logLinqOpenStep(
        title,
        `API: re-fetch done · ${childNameSummary(bundle.files)}`,
        startedAt,
        tFetch2
      );
    } catch (e) {
      console.warn(
        `[linq·open] "${title}" · re-fetch before URL hydration failed · id${idSuffixForLog(requestedBundleId)}`,
        e
      );
    }
  }

  // ── Set display fields and show the sheet immediately from local rows ─
  bundle.name =
    bundle.name === "Bundle" || bundle.name === "bundle" ? "linq" : bundle.name;
  bundle.url = requestedBundleId
    ? `${API_BASE}/file/${requestedBundleId}`
    : bundle.url;
  const localFirstBundle = {
    ...bundle,
    files: enrichBundleFileTypeColors(bundle.files),
    name: (bundle.name === "Bundle" || bundle.name === "bundle") ? "linq" : bundle.name,
    url: requestedBundleId ? `${API_BASE}/file/${requestedBundleId}` : bundle.url,
    isHydratingChildren: !bundleChildRowsAreDisplayReady(bundle.files),
  };
  setSelectedBundle(localFirstBundle);
  setSelectedBundleUuid(requestedBundleId);
  setIsBundleDetailVisible(true);
  logPerf(
    "linqOpen",
    `Child rows ready; hydrating URLs async · "${title}" · ${childNameSummary(localFirstBundle.files)}`,
    startedAt
  );

  // ── Resolve presigned URLs, note bodies, nested linq trees while the sheet stays open ─
  const HYDRATE_MAX_ATTEMPTS = 40;
  const HYDRATE_BACKOFF_MS = 300;
  try {
    if (!Array.isArray(bundle.files)) bundle.files = [];
    for (let attempt = 0; attempt < HYDRATE_MAX_ATTEMPTS; attempt++) {
      const attemptStart = Date.now();
      if (bundleOpenTokenRef.current !== openToken) break;
      bundle.files = enrichBundleFileTypeColors(await runPhaseB(bundle.files));
      if (bundleOpenTokenRef.current === openToken) {
        setSelectedBundle((cur: any) => {
          if (!cur || String(cur.serverId ?? cur.id ?? "") !== requestedBundleId) return cur;
          return {
            ...cur,
            files: bundle.files,
            content: `linq containing ${bundle.files.length} file(s)`,
            isHydratingChildren: !bundleChildRowsAreDisplayReady(bundle.files),
          };
        });
      }
      if (bundleChildRowsAreDisplayReady(bundle.files)) break;
      if (attempt < HYDRATE_MAX_ATTEMPTS - 1) {
        logLinqOpenStep(
          title,
          `URL hydration attempt ${attempt + 1}: still waiting · sleep ${HYDRATE_BACKOFF_MS}ms · ${childNameSummary(bundle.files)}`,
          startedAt,
          attemptStart
        );
        await new Promise((r) => setTimeout(r, HYDRATE_BACKOFF_MS));
      }
    }
    logPerf(
      "linqOpen",
      `URLs ready · ${bundle.files.length} top-level row(s) · "${title}" · ${childNameSummary(bundle.files)}`,
      startedAt
    );
  } catch (e) {
    console.warn(
      `[linq·open] "${title}" · URL / nested fetch failed · id${idSuffixForLog(requestedBundleId)}`,
      e
    );
    bundleOpenTokenRef.current = null;
  }

  // 🛠 Fix the browser route URL for bundles (no /api)
  const cleanedBundle = {
    ...bundle,
    name: (bundle.name === "Bundle" || bundle.name === "bundle") ? "linq" : bundle.name,
    url: requestedBundleId ? `${API_BASE}/file/${requestedBundleId}` : bundle.url, // <-- site route
    isHydratingChildren: !bundleChildRowsAreDisplayReady(bundle.files),
  };

  // Keep the already-open sheet in sync with the latest hydrated rows.
  if (bundleOpenTokenRef.current === openToken) {
    setSelectedBundle(cleanedBundle);
    setSelectedBundleUuid(requestedBundleId);
    setIsBundleDetailVisible(true);
    logPerf(
      "linqOpen",
      `${bundleChildRowsAreDisplayReady(cleanedBundle.files) ? "Children hydrated" : "Children still hydrating"} · "${title}" · ${childNameSummary(cleanedBundle.files)}`,
      startedAt
    );
  }

  if (openingBundleIdRef.current === requestedBundleId) {
    openingBundleIdRef.current = null;
  }
};

const handleExtractContents = async (nestedBundle: any, nestedBundleFile: any) => {
  if (!selectedBundle || !nestedBundle) {
    Alert.alert("Error", "Unable to extract contents");
    return;
  }

  const nestedFiles = nestedBundle.files ?? [];
  const hintedFilesCount = Array.isArray(nestedBundle?.bundledFileIds)
    ? nestedBundle.bundledFileIds.length
    : 0;
  const hintedChildrenCount = Array.isArray(nestedBundle?.children?.item_id)
    ? nestedBundle.children.item_id.length
    : 0;
  const hintedFromContent = (() => {
    const m = String(nestedBundle?.content ?? "").match(/(\d+)\s*file/i);
    return m ? Number(m[1]) : 0;
  })();
  const estimatedCount = Math.max(
    nestedFiles.length,
    hintedFilesCount,
    hintedChildrenCount,
    hintedFromContent
  );

  // Small helpers (data-aware)
  const pick = (child: any, ...keys: string[]) => {
    for (const k of keys) {
      if (child?.data?.[k] != null) return child.data[k];
      if (child?.[k] != null) return child[k];
    }
    return undefined;
  };
  const asId = (x: any) =>
    String(x?.data?.id ?? x?.id ?? x?.fileId ?? x?.file_id ?? x?.data_id ?? '').trim();

  Alert.alert(
    "Extract Contents?",
    `Merge ${estimatedCount} nested item${estimatedCount === 1 ? "" : "s"} into this linq?`,
    [
      { text: "Cancel", style: "cancel" },
      {
        text: "Extract",
        onPress: async () => {
          const parentBundleId = String(selectedBundle.id ?? "").trim();
          const nestedBundleId = String(nestedBundleFile.id ?? "").trim();

          if (!parentBundleId || !nestedBundleId) {
            Alert.alert("Error", "Invalid link IDs");
            return;
          }

          const isBundleType = (rawType: any) => {
            const t = String(rawType ?? "").toLowerCase();
            return t === "bundle" || t === "link" || t === "linq";
          };

          try {
            const newBundleObject = await withAction(async () => {
              console.log(
                `[linq·extract] merge nested id${idSuffixForLog(nestedBundleId)} → parent id${idSuffixForLog(parentBundleId)}`
              );

              // Close immediately so the global action bar reads as “this screen is updating”.
              setIsBundleDetailVisible(false);
              setSelectedBundle(null);

              // ========= Step 1: Load parent children from getContents() =========
              const parentContents = await bundlesApi.getContents(parentBundleId);
              const parentChildren = Array.isArray(parentContents.children)
                ? parentContents.children
                : [];

              const parentOtherBundles: string[] = [];
              const parentFileIds: string[] = [];

              for (const child of parentChildren) {
                const cid = asId(child);
                if (!cid || cid === nestedBundleId || cid === parentBundleId) continue;
                const isBundle = isBundleType(pick(child, "type"));
                if (isBundle) parentOtherBundles.push(cid);
                else parentFileIds.push(cid);
              }

              console.log(
                `[linq·extract] parent: ${parentFileIds.length} files, ${parentOtherBundles.length} other linqs`
              );

              // ========= Step 2: Load nested bundle children from getContents() =========
              const nestedContents = await bundlesApi.getContents(nestedBundleId);
              const nestedChildren = Array.isArray(nestedContents.children)
                ? nestedContents.children
                : [];

              const nestedBundles: string[] = [];
              const nestedFileIds: string[] = [];

              for (const child of nestedChildren) {
                const cid = asId(child);
                if (!cid) continue;
                const isBundle = isBundleType(pick(child, "type"));
                if (cid === parentBundleId || cid === nestedBundleId) continue;
                if (isBundle) nestedBundles.push(cid);
                else nestedFileIds.push(cid);
              }

              console.log(
                `[linq·extract] nested: ${nestedFileIds.length} files, ${nestedBundles.length} linqs`
              );

              if (nestedFileIds.length === 0 && nestedBundles.length === 0) {
                throw new Error("__EXTRACT_EMPTY_NESTED__");
              }

              // ========= Step 3: Combine and de-duplicate =========
              const allFileIds = [...parentFileIds, ...nestedFileIds].filter(
                (id) => id !== parentBundleId && id !== nestedBundleId
              );
              const allBundleIds = [...parentOtherBundles, ...nestedBundles].filter(
                (id) => id !== parentBundleId && id !== nestedBundleId
              );
              const combinedFileIds = [...allFileIds, ...allBundleIds];
              const uniqueFileIds = Array.from(new Set(combinedFileIds));

              console.log(
                `[linq·extract] create merged linq · ${uniqueFileIds.length} items (${allFileIds.length} files + ${allBundleIds.length} linqs)`
              );

              const connectResponse = await bundlesApi.createBundle(uniqueFileIds);
              if (!connectResponse?.okay || !connectResponse?.data) {
                throw new Error("Failed to create new bundle");
              }

              let newBundleId: string | null = null;
              if (connectResponse.data?.bundle?.id) {
                newBundleId = String(connectResponse.data.bundle.id).trim();
              }
              if (!newBundleId && Array.isArray(connectResponse.data?.links)) {
                const candidate = connectResponse.data.links.find(
                  (x: any) => String(x?.type ?? "").toLowerCase() === "bundle" && x?.id
                );
                if (candidate?.id) newBundleId = String(candidate.id).trim();
              }
              if (!newBundleId && Array.isArray(connectResponse.data)) {
                const bundlesInResponse = connectResponse.data.filter(
                  (item: any) => String(item?.type ?? "").toLowerCase() === "bundle"
                );
                if (bundlesInResponse.length > 0 && bundlesInResponse[0]?.id) {
                  newBundleId = String(bundlesInResponse[0].id).trim();
                }
              }

              if (!newBundleId) {
                console.warn("createBundle response had unexpected shape (payload redacted)");
                throw new Error("Could not determine new bundle id from connect response");
              }

              console.log(`[linq·extract] created id${idSuffixForLog(newBundleId)}`);

              const oldBundleIds = [parentBundleId, nestedBundleId];
              const deleteResults = await Promise.allSettled(
                oldBundleIds.map((id) => filesApi.deleteFileById(id))
              );
              const deleteFailures = deleteResults
                .map((res, idx) => ({ res, id: oldBundleIds[idx] }))
                .filter((x) => x.res.status === "rejected");
              if (deleteFailures.length === 0) {
                console.log(`[linq·extract] removed old linqs`);
              } else {
                deleteFailures.forEach(({ res, id }) => {
                  console.warn(
                    `[linq·extract] delete old id${idSuffixForLog(id)} failed:`,
                    (res as PromiseRejectedResult).reason?.message ??
                      (res as PromiseRejectedResult).reason
                  );
                });
              }

              preHydratedRef.current.delete(parentBundleId);
              preHydratedRef.current.delete(nestedBundleId);
              bundlesApi.invalidateBundleContentsCache(parentBundleId);
              bundlesApi.invalidateBundleContentsCache(nestedBundleId);
              bundlesApi.invalidateBundleContentsCache(newBundleId);

              const extractStartedAt = Date.now();
              const verify = await bundlesApi.getContents(newBundleId);
              const bundleChildren = Array.isArray(verify.children) ? verify.children : [];
              console.log(
                `[linq·extract] verify id${idSuffixForLog(newBundleId)} · ${bundleChildren.length} children`
              );

              const built = {
                id: newBundleId,
                name: "linq",
                type: "Link",
                typeColor: colorFromCategory("link"),
                bundledFileIds: bundleChildren.map(asId).filter(Boolean),
                bundledUrls: verify.bundledUrls ?? [],
                files: [],
                url: `${API_BASE}/file/${newBundleId}`,
                content: `linq containing ${bundleChildren.length} file(s)`,
                createdAt: new Date().toISOString(),
                creator: email,
              };

              logPerf(
                "linqExtract",
                `Ready id${idSuffixForLog(newBundleId)} · ${bundleChildren.length} children`,
                extractStartedAt
              );
              return built;
            }, "Updating linq…");

            openBundleDetail(newBundleObject);
            markLocalChangePending();
          } catch (err: any) {
            if (String(err?.message) === "__EXTRACT_EMPTY_NESTED__") {
              Alert.alert("Error", "Nested link has no files to extract");
              return;
            }
            console.error("Extract contents error:", err);
            Alert.alert("Error", err?.message ?? "Failed to extract contents.");
          }
        },
      },
    ]
  );
};

  // Microphone (voice record)
  const handleMicrophonePress = () => {
    handleVoiceRecordPress();
  };

  // Camera
  const handleCameraPress = () => {
    setIsCameraVisible(true);
  };

  // Pull-to-refresh: dismiss the spinner immediately, then let sync run in background.
  const refreshFiles = async (opts?: { manageActionStrip?: boolean }) => {
    setRefreshing(true);
    // Dismiss spinner right away so the list snaps back without waiting on the network.
    setTimeout(() => setRefreshing(false), 300);
    // Fire-and-forget — sync updates the list reactively as results come in.
    triggerSync().catch(() => {});
  };

  const handleBulkDeleteSelected = () => {
    const ids = Array.from(selectedFiles);
    if (ids.length === 0) return;
    Alert.alert(
      "Delete files",
      `Delete ${ids.length} selected file(s)? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setIsDeletingFiles(true);
            try {
              await withAction(async () => {
                // Offline-safe: write to SQLite + outbox first, server will catch up later.
                for (const id of ids) {
                  const selectedRow =
                    userFiles.find((f: any) => String(f?.id) === String(id)) ??
                    bundlesRef.current.find((b: any) => String(b?.id) === String(id));
                  const neverSynced =
                    isLegacyOptId(id) || Number(selectedRow?.dirty) === 1;
                  if (neverSynced) {
                    // Never reached the server — cancel any pending upload/linq jobs and purge locally.
                    await cancelJobsForId(id);
                    await purgeFile(id);
                    await purgeBundle(id);
                  } else {
                    // Mark deleted locally and queue a server delete via outbox.
                    await dbDeleteFile(id);
                    await dbDeleteBundle(id);
                    await enqueue({ op: 'delete', serverId: id });
                  }
                }

                // Optimistic UI update — all selected ids are treated as deleted.
                const deletedSet = new Set(ids);
                setSelectedFiles(new Set());
                setUserFiles((prev) =>
                  prev.filter((f: any) => !deletedSet.has(String(f.id)))
                );
                const inv = linqCacheIdsAffectedByDeletes(
                  bundlesRef.current,
                  deletedSet
                );
                inv.forEach((bundleId) => {
                  preHydratedRef.current.delete(bundleId);
                  bundlesApi.invalidateBundleContentsCache(bundleId);
                });
                deletedSet.forEach((id) => preHydratedRef.current.delete(id));
                setBundles((prev) =>
                  prev
                    .filter((b: any) => !deletedSet.has(String(b.id)))
                    .map((b: any) => stripDeletedFromLinqRow(b, deletedSet))
                    .filter(Boolean)
                );
                setSelectedBundle((prev: any) => {
                  if (!prev) return prev;
                  if (deletedSet.has(String(prev.id))) return null;
                  return stripDeletedFromLinqRow(prev, deletedSet);
                });
                if (
                  selectedBundleUuid &&
                  deletedSet.has(selectedBundleUuid)
                ) {
                  setIsBundleDetailVisible(false);
                  setSelectedBundleUuid(null);
                }
              }, `Deleting ${ids.length} file${ids.length > 1 ? "s" : ""}…`);
              // Mark pending; periodic/foreground/reconnect sync will drain outbox.
              markLocalChangePending();
            } catch (e: any) {
              Alert.alert("Error", e?.message ?? "Delete failed");
            } finally {
              setIsDeletingFiles(false);
            }
          },
        },
      ]
    );
  };

  const handleFilePress = (file: any) => {
    const fileAny = file as any;
    // Let press opacity animation paint before expensive open logic runs.
    requestAnimationFrame(() => {
      if (opensAsLinqDetail(fileAny)) {
        void openBundleDetail(fileAny);
      } else {
        void openFileDetail(fileAny);
      }
    });
  };

  // Auth-related
  const handleLoginSuccess = async (initialEmail?: string) => {
    if (initialEmail) setEmail(initialEmail);
    setIsLoggedIn(true);
    setScreen("home");

    // The home effect loads SQLite. Server sync only runs after a manual action.
  };

  const handleSignUpSuccess = async (initialEmail?: string) => {
    if (initialEmail) setEmail(initialEmail);
    setIsLoggedIn(true);
    setScreen("home");
    // The home effect loads SQLite. Server sync only runs after a manual action.
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setEmail(undefined);
    setSelectedFiles(new Set());
    setSelectedFilesForUpload([]);
    setBundles([]);
    setSelectedBundle(null);
    setUserFiles([]);
    setScreen("landing");
    setInitialListLoaded(false);
    // Clear SQLite local data and in-memory caches
    clearAllLocalData().catch((e) => console.warn('clearAllLocalData failed:', e));
    clearDownloadCache().catch((e) => console.warn('clearDownloadCache failed:', e));
    // Reset optimization state so the next login starts fresh
    lastFingerprintRef.current = null;
    syncInFlightRef.current = false;
    hasServerDataRef.current = false;
    clearAllInflight();
    clearUrlCache();
    resetPermissionCache();
  };

  const handlePhotoTaken = async (photoUri: string) => {
    const t = track("SAVE PHOTO");
    try {
      const originalExt = pickExtensionFromUri(photoUri, ".jpg");
      const wasHeic = isHeicSource(photoUri, { mimeType: null, fileName: null });
      const convertedUri = await convertHeicToJpeg(photoUri, {
        mimeType: null,
        fileName: null,
      });
      const ext = pickExtensionFromUri(convertedUri, wasHeic ? ".jpg" : originalExt || ".jpg");
      const stillHeicAfterConvert =
        ext === ".heic" ||
        ext === ".heif" ||
        isHeicSource(convertedUri, { mimeType: null, fileName: null });
      // Keep HEIC extension if conversion fails to avoid mismatched file bytes/ext.
      const finalExt = wasHeic && !stillHeicAfterConvert ? ".jpg" : ext;
      const extClean = finalExt.replace(/^\./, "").toLowerCase();
      const fileName = getDefaultFileName("photo", finalExt);
      const localId = newLocalFileId();
      const cat = categoryFromExt(extClean);

      // Save locally first — works offline, enqueues upload for later
      const { localUri } = await saveLocal({
        localId,
        name: fileName,
        type: cat,
        contentType: extClean,
        sourceUri: convertedUri,
        destExt: finalExt,
        creator: email,
      });
      t.step("saved locally");

      // Show in list immediately
      setUserFiles((prev) => [
        optimisticRow({
          localId,
          name: fileName,
          type: cat,
          contentType: extClean,
          localUri,
          creator: email,
        }) as any,
        ...prev,
      ]);
      bumpFileListScrollTop();

      markLocalChangePending();
      t.done(truncateNameForLog(fileName));
    } catch (e: any) {
      t.fail("photo save", e);
      Alert.alert("Error", e?.message ?? "Could not save photo.");
    }
  };

  // ===== Routing =====
  if (screen === "landing") {
    return (
      <LandingScreen
        onLoginPress={() => setScreen("login")}
        onSignUpPress={() => setScreen("signup")}
        onSocialSuccess={() => handleLoginSuccess()}
      />
    );
  }

  if (screen === "login") {
    return (
      <LoginScreen
        onLoginSuccess={handleLoginSuccess}
        onBackPress={() => setScreen("landing")}
      />
    );
  }

  if (screen === "signup") {
    return (
      <SignUpScreen
        onSignUpSuccess={handleSignUpSuccess}
        onBackPress={() => setScreen("landing")}
      />
    );
  }

  // ===== Main home =====
  return (
    <SafeAreaView className="flex-1 bg-background">
      <StatusBar style="light" />

      <Header
        email={email}
        avatarUrl={userLoaded ? user?.imageUrl : undefined}
        onSettingsPress={() => setIsSettingsModalVisible(true)}
        onLinkPress={handleCreateLinq}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onFilterPress={() => setIsFilterVisible(true)}
        appliedFilterCount={appliedFilterCount}
        selectedFileCount={selectedFiles.size}
        onDeleteSelected={handleBulkDeleteSelected}
        isDeletingFiles={isDeletingFiles}
        syncStatus={syncStatus}
        hasPendingLocalChanges={hasPendingLocalChanges}
        onSyncPress={triggerSync}
      />

      <FileList
        files={filteredFiles ?? []}
        selectedFiles={selectedFiles ?? new Set<string>()}
        onFilePress={handleFilePress}
        onToggleFileSelection={(fileId: string) => toggleFileSelection(fileId)}//{toggleFileSelection}
        getTypeColor={getTypeColor}
        refreshing={refreshing}
        onRefresh={refreshFiles}
        scrollToTopTrigger={fileListScrollTopTrigger}
      />

      <BottomNavigation
        onNotePress={() => setIsNoteModalVisible(true)}
        onAttachmentPress={handleAttachmentPress}
        onMicrophonePress={handleMicrophonePress}
        onCameraPress={handleCameraPress}
        isRecording={isRecordingActive}
        recordingTime={Math.floor(recordingElapsed)}
        isMicBusy={isAudioRequesting}
      />

      <NoteModal
        isVisible={isNoteModalVisible}
        noteText={noteText}
        onNoteTextChange={setNoteText}
        onClose={() => {
          setIsNoteModalVisible(false);
          setNoteText("");
        }}
        onSave={handleNoteSave}
      />

      <FileDetailModal
        isVisible={isFileDetailVisible}
        selectedFile={selectedFile}
        onClose={() => setIsFileDetailVisible(false)}
        getTypeColor={getTypeColor}
        fetchUrl={fetchUrl}
      />

      <BundleModal
        isVisible={isBundleDetailVisible}
        bundleData={selectedBundle}
        onClose={() => {
          bundleOpenTokenRef.current = null;
          setSelectedBundleUuid(null);
          setSelectedBundle(null);
          setIsBundleDetailVisible(false);
        }}
        getTypeColor={getTypeColor}
        onNestedBundlePress={(nestedBundle) => {
          // Route nested Linq opens through the same normalized open pipeline.
          // This ensures UUID + structure fetching + count normalization all run.
          const nestedId =
            String(
              nestedBundle?.serverId ??
                nestedBundle?.id ??
                nestedBundle?.fileId ??
                nestedBundle?.file_id ??
                ""
            ).trim();
          if (!nestedId) return;
          openBundleDetail({
            ...nestedBundle,
            id: nestedId,
            serverId: nestedId,
            type: "Link",
            name:
              nestedBundle?.name === "Bundle" || nestedBundle?.name === "bundle"
                ? "linq"
                : nestedBundle?.name ?? "linq",
          });
        }}
        onExtractContents={handleExtractContents}
        fetchUrl={fetchUrl}
      />

      <CameraModal
        isVisible={isCameraVisible}
        onClose={() => setIsCameraVisible(false)}
        onPhotoTaken={handlePhotoTaken}
      />

      <SearchFilterModal
        visible={isFilterVisible}
        filters={contentFilters}
        submissionTime={submissionTime}
        onToggleFilter={(key) =>
          setContentFilters((prev) => ({ ...prev, [key]: !prev[key] }))
        }
        onSubmissionTimeChange={(value) => setSubmissionTime(value)}
        onReset={() => {
          setContentFilters({
            pdf: false,
            audio: false,
            images: false,
            link: false,
            notes: false,
          });
          setSubmissionTime("all");
        }}
        onClose={() => setIsFilterVisible(false)}
      />

      <SettingsModal
        isVisible={isSettingsModalVisible}
        onClose={() => setIsSettingsModalVisible(false)}
        accountLabel={email ?? null}

        onLogout={async () => {
          try {
            await signOut();
          } finally {
            setIsSettingsModalVisible(false); 
            handleLogout();
          }
        }}
      />
    </SafeAreaView>
  );
}


export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ClerkProvider
          publishableKey = "pk_test_d2VhbHRoeS1jaGFtb2lzLTQyLmNsZXJrLmFjY291bnRzLmRldiQ"
          tokenCache={tokenCache}
        >
          <WireClerkToken />
          <AppContent />
        </ClerkProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}


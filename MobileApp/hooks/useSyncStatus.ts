/**
 * useSyncStatus — central sync orchestrator hook.
 *
 * Responsibilities:
 *  - Exposes sync status ('idle' | 'syncing' | 'caching' | 'offline' | 'error') to the UI.
 *  - Syncs only when `triggerSync` is called by a user action.
 *  - Drains the outbox (pending uploads), then does a pull-merge from server.
 *  - Marks metadata sync done quickly; caches binaries in the background.
 *  - Calls back with fresh { files, bundles } so App.tsx can update React state.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { drainOutbox } from '../sync/outboxWorker';
import { pullAndMerge } from '../sync/pullSync';
import {
  getAllFiles,
  getAllBundles,
  getFilesNeedingDownload,
  type LocalFile,
  type LocalBundle,
} from '../db/fileRepo';
import { pendingCount } from '../db/outbox';
import { downloadPendingContent } from '../sync/contentDownloader';
import { logPerf } from '../utils/perfLog';
import { devLog, logSafeWarn } from '../utils/safeLog';

export type SyncStatus = 'idle' | 'syncing' | 'caching' | 'offline' | 'error';

/** How a sync snapshot was produced. Never infer this from `raw.length`
 *  — an empty server list (all items deleted) is a valid online pull. */
export type SyncCompleteSource = 'server' | 'cache' | 'offline';

export type SyncCompletePayload = {
  files: LocalFile[];
  bundles: LocalBundle[];
  raw: any[];
  source: SyncCompleteSource;
};

export type SyncPullResult = SyncCompletePayload & {
  changedFileIds?: string[];
};

export type DownloadProgress = { done: number; total: number };

type UseSyncStatusOptions = {
  /** Called with fresh data after a successful pull-merge. */
  onSyncComplete: (data: SyncCompletePayload) => void;
  /** Whether the user is currently logged in (sync only runs when true). */
  enabled: boolean;
};

export function useSyncStatus({ onSyncComplete, enabled }: UseSyncStatusOptions) {
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [hasPendingLocalChanges, setHasPendingLocalChanges] = useState(false);
  /** Guards outbox + pull only — background cache does not block Sync. */
  const syncInFlight = useRef(false);
  const cacheInFlight = useRef(false);
  const onSyncCompleteRef = useRef(onSyncComplete);
  onSyncCompleteRef.current = onSyncComplete;

  const refreshPendingState = useCallback(async () => {
    try {
      const count = await pendingCount();
      setHasPendingLocalChanges(count > 0);
    } catch {
      // Non-fatal; keep current indicator state.
    }
  }, []);

  const runBackgroundCache = useCallback(
    async (changedFileCount: number, pendingCacheCount: number) => {
      if (cacheInFlight.current) {
        // downloadPendingContent coalesces reruns when already busy.
      }
      cacheInFlight.current = true;
      setStatus('caching');
      setDownloadProgress(
        pendingCacheCount > 0 ? { done: 0, total: pendingCacheCount } : null
      );
      const cacheT = Date.now();
      try {
        await downloadPendingContent((done, total) => {
          setDownloadProgress({ done, total });
        });

        const files = await getAllFiles();
        const bundles = await getAllBundles();
        onSyncCompleteRef.current({ files, bundles, raw: [], source: 'cache' });
        if (__DEV__) {
          logPerf(
            'sync',
            `cache stage finished · changed ${changedFileCount} · pending ${pendingCacheCount}`,
            cacheT
          );
        }
      } catch (e) {
        logSafeWarn('[sync] cache stage failed', e);
      } finally {
        cacheInFlight.current = false;
        setTimeout(() => setDownloadProgress(null), 1_200);
        setStatus((s) => (s === 'caching' ? 'idle' : s));
      }
    },
    []
  );

  // ── Core sync function ─────────────────────────────────────────────────
  const runSync = useCallback(async (): Promise<SyncPullResult | null> => {
    if (!enabled) return null;
    if (syncInFlight.current) return null;

    // Check network before attempting a full server sync.
    const netState = await NetInfo.fetch();
    if (!netState.isConnected) {
      setStatus('offline');
      // Offline: serve whatever is already in SQLite so the UI isn't empty.
      const offT = Date.now();
      devLog('[sync] offline · reading SQLite only');
      try {
        const files = await getAllFiles();
        const bundles = await getAllBundles();
        const snapshot: SyncCompletePayload = {
          files,
          bundles,
          raw: [],
          source: 'offline',
        };
        onSyncComplete(snapshot);
        if (__DEV__) {
          logPerf(
            'sync',
            `offline SQLite · ${files.length} files · ${bundles.length} linqs`,
            offT
          );
        }
        return snapshot;
      } catch (e) {
        logSafeWarn('[sync] SQLite offline read failed', e);
        return null;
      }
    }

    syncInFlight.current = true;
    setStatus('syncing');
    const syncT = Date.now();
    try {
      // 1. Push any pending local changes first
      let t = Date.now();
      devLog('[sync] drain outbox');
      await drainOutbox();
      const outboxMs = Date.now() - t;
      // 2. Pull server state and merge into SQLite
      t = Date.now();
      devLog('[sync] pull list');
      const result = await pullAndMerge();
      const pullMs = Date.now() - t;
      if (__DEV__) {
        logPerf(
          'sync',
          `push+pull · outbox ${outboxMs}ms · pull ${pullMs}ms · rows ${result.raw?.length ?? 0}`,
          syncT
        );
      }
      // Metadata sync is done — list is usable immediately.
      onSyncComplete({ ...result, source: 'server' });

      await refreshPendingState();
      setLastSyncedAt(new Date());

      // 3. Cache binaries in the background (does not block Sync idle / next tap).
      const changedFileCount = result.changedFileIds?.length ?? 0;
      const pendingCacheRows = await getFilesNeedingDownload();
      const pendingCacheCount = pendingCacheRows.length;
      const shouldRunCache = changedFileCount > 0 || pendingCacheCount > 0;

      syncInFlight.current = false;

      if (shouldRunCache) {
        void runBackgroundCache(changedFileCount, pendingCacheCount);
      } else {
        setDownloadProgress(null);
        setStatus('idle');
        if (__DEV__) {
          devLog('[sync] cache stage skipped · no changed ids and no pending cache rows');
        }
      }

      return result;
    } catch (err) {
      logSafeWarn('[sync] push+pull failed', err);
      setStatus('error');
      // Reset to idle after 10s so the error icon doesn't stay forever
      setTimeout(() => setStatus((s) => (s === 'error' ? 'idle' : s)), 10_000);
      return null;
    } finally {
      syncInFlight.current = false;
    }
  }, [enabled, onSyncComplete, refreshPendingState, runBackgroundCache]);

  // ── Expose triggerSync so App.tsx / the sync button can call it ────────
  /** Resolves when outbox drain + pull (or offline SQLite read) finishes; returns pull payload or null. */
  const triggerSync = useCallback(() => runSync(), [runSync]);

  // Check whether local work is waiting, but never start network sync here.
  useEffect(() => {
    if (!enabled) return;
    void refreshPendingState();
  }, [enabled, refreshPendingState]);

  const markLocalChangePending = useCallback(() => {
    setHasPendingLocalChanges(true);
  }, []);

  return {
    status,
    lastSyncedAt,
    triggerSync,
    downloadProgress,
    hasPendingLocalChanges,
    markLocalChangePending,
  };
}

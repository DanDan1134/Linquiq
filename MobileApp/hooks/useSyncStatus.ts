/**
 * useSyncStatus — central sync orchestrator hook.
 *
 * Responsibilities:
 *  - Exposes sync status ('idle' | 'syncing' | 'offline' | 'error') to the UI.
 *  - Syncs only when `triggerSync` is called by a user action.
 *  - Drains the outbox (pending uploads), then does a pull-merge from server.
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

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error';

export type SyncPullResult = {
  files: LocalFile[];
  bundles: LocalBundle[];
  raw: any[];
  changedFileIds?: string[];
};

type UseSyncStatusOptions = {
  /** Called with fresh data after a successful pull-merge. */
  onSyncComplete: (data: { files: LocalFile[]; bundles: LocalBundle[]; raw: any[] }) => void;
  /** Whether the user is currently logged in (sync only runs when true). */
  enabled: boolean;
};

export function useSyncStatus({ onSyncComplete, enabled }: UseSyncStatusOptions) {
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<{ done: number; total: number } | null>(null);
  const [hasPendingLocalChanges, setHasPendingLocalChanges] = useState(false);
  const syncInFlight = useRef(false);

  const refreshPendingState = useCallback(async () => {
    try {
      const count = await pendingCount();
      setHasPendingLocalChanges(count > 0);
    } catch {
      // Non-fatal; keep current indicator state.
    }
  }, []);

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
      console.log('[sync] offline · reading SQLite only');
      try {
        const files = await getAllFiles();
        const bundles = await getAllBundles();
        const snapshot = { files, bundles, raw: [] as any[] };
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
        console.warn('[sync] SQLite offline read failed:', e);
        return null;
      }
    }

    syncInFlight.current = true;
    setStatus('syncing');
    const syncT = Date.now();
    try {
      // 1. Push any pending local changes first
      let t = Date.now();
      await drainOutbox();
      const outboxMs = Date.now() - t;
      // 2. Pull server state and merge into SQLite
      t = Date.now();
      const result = await pullAndMerge();
      const pullMs = Date.now() - t;
      if (__DEV__) {
        logPerf(
          'sync',
          `push+pull · outbox ${outboxMs}ms · pull ${pullMs}ms · rows ${result.raw?.length ?? 0}`,
          syncT
        );
      }
      // Update list immediately after pull so users can interact,
      // but keep status=syncing until cache download also finishes.
      onSyncComplete(result);

      // 3. Cache stage:
      //    - Always run on first launch if SQLite still has pending/failed uncached rows.
      //    - Otherwise run only when pull introduced new/updated server files.
      const changedFileCount = result.changedFileIds?.length ?? 0;
      const pendingCacheRows = await getFilesNeedingDownload();
      const pendingCacheCount = pendingCacheRows.length;
      const shouldRunCache = changedFileCount > 0 || pendingCacheCount > 0;
      if (shouldRunCache) {
        setDownloadProgress(null);
        const cacheT = Date.now();
        try {
          await downloadPendingContent((done, total) => {
            setDownloadProgress({ done, total });
            if (done >= total) {
              // Brief delay so the UI can show "100%" before clearing
              setTimeout(() => setDownloadProgress(null), 1_500);
            }
          });

          // Refresh React state from SQLite so new local_uri/content appears immediately.
          const files = await getAllFiles();
          const bundles = await getAllBundles();
          onSyncComplete({ files, bundles, raw: [] });
          if (__DEV__) {
            logPerf(
              'sync',
              `cache stage finished · changed ${changedFileCount} · pending ${pendingCacheCount}`,
              cacheT
            );
          }
        } catch (e) {
          console.warn('[sync] cache stage failed:', e);
        }
      } else {
        setDownloadProgress(null);
        if (__DEV__) {
          console.log('[sync] cache stage skipped · no changed ids and no pending cache rows');
        }
      }

      await refreshPendingState();
      setLastSyncedAt(new Date());
      setStatus('idle');

      return result;
    } catch (err) {
      console.warn('[sync] push+pull failed:', (err as any)?.message ?? err);
      setStatus('error');
      // Reset to idle after 10s so the error icon doesn't stay forever
      setTimeout(() => setStatus((s) => (s === 'error' ? 'idle' : s)), 10_000);
      return null;
    } finally {
      syncInFlight.current = false;
    }
  }, [enabled, onSyncComplete, refreshPendingState]);

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

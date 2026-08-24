// Sync store — what `<SyncPill />` and the sync screens read, and where the delta cursor lives.
//
// TWO THINGS WERE WRONG HERE UNTIL 2026-08-19, both of the same kind: the state existed, nothing
// wrote it.
//
//   1. `status` and `pendingCount` had no writer anywhere in the app. `<SyncPill />` is the only sync
//      indicator the product has — <OfflineBanner /> was deleted on 2026-08-06 on the explicit
//      grounds that "every write made offline enqueues, `pendingCount` rises, and the pill already
//      says cloud-upload with the count" — so with the count pinned at 0 the pill said `cloud-done`
//      to a worker whose whole shift was sitting unsent on the device. See sync/queueObserver.ts for
//      the writer.
//
//   2. `lastSyncAt` was held in memory only, so every cold start read null and asked /sync/delta for
//      everything since the epoch. The server pages that at 500 rows per entity type and expects the
//      client to resume from `server_timestamp` (SyncService.delta) — a cursor that resets on every
//      launch turns an incremental pull into a full re-download, on the mobile data of someone
//      standing on a building site. It is persisted here, alongside the pattern authStore /
//      localeStore / themeStore already use.

import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

const LAST_SYNC_AT_KEY = 'cos_last_sync_at';

export type SyncStatus = 'idle' | 'syncing' | 'error';

interface SyncState {
  status: SyncStatus;
  lastSyncAt: string | null;
  pendingCount: number;
  errorMessage: string | null;

  /** Restore the delta cursor on app launch, so the first pull is incremental. */
  hydrate: () => Promise<void>;

  setStatus: (status: SyncStatus) => void;
  setPendingCount: (count: number) => void;
  /** Advance the delta cursor and persist it. Fire-and-forget for callers that cannot await. */
  setLastSyncAt: (timestamp: string) => Promise<void>;
  setError: (message: string | null) => void;
}

export const useSyncStore = create<SyncState>((set) => ({
  status: 'idle',
  lastSyncAt: null,
  pendingCount: 0,
  errorMessage: null,

  hydrate: async () => {
    const stored = await SecureStore.getItemAsync(LAST_SYNC_AT_KEY);
    // A stored value that is not a real instant would be rejected by the server with COS-SYNC-002
    // (SyncService.delta validates `since`), taking the whole pull down. Falling back to null means
    // one full pull, which is recoverable; a poisoned cursor is not.
    if (stored && !Number.isNaN(Date.parse(stored))) {
      set({ lastSyncAt: stored });
    }
  },

  setStatus: (status) => set({ status }),
  setPendingCount: (count) => set({ pendingCount: count }),

  setLastSyncAt: async (timestamp) => {
    set({ lastSyncAt: timestamp });
    await SecureStore.setItemAsync(LAST_SYNC_AT_KEY, timestamp);
  },

  setError: (message) => set({ errorMessage: message }),
}));

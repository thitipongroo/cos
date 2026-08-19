import { create } from 'zustand';
import type { LocalDbStatus } from '../sync/localDbLimit';

export interface Conflict {
  itemId: number;
  entityType: string;
  entityId: string;
  localPayload: unknown;
  serverPayload: unknown;
}

interface OfflineState {
  isOnline: boolean;
  conflicts: Conflict[];
  /**
   * How full the device's local cache is against the §17.7 500 MB ceiling.
   *
   * `checkLocalDbLimit()` computed this on every entry to the app and did nothing with it but a
   * `console.warn` — invisible in a release build, which is the only build a site foreman has. It is
   * held here so the Support screen's diagnostics can state it, next to the queue depth and conflict
   * count that answer the same question ("is this device healthy?").
   */
  localDbStatus: LocalDbStatus;
  setIsOnline: (online: boolean) => void;
  setLocalDbStatus: (status: LocalDbStatus) => void;
  addConflict: (conflict: Conflict) => void;
  resolveConflict: (itemId: number) => void;
  clearConflicts: () => void;
}

export const useOfflineStore = create<OfflineState>((set) => ({
  isOnline: true,
  conflicts: [],
  localDbStatus: 'OK',
  setIsOnline: (online) => set({ isOnline: online }),
  setLocalDbStatus: (status) => set({ localDbStatus: status }),
  addConflict: (conflict) => set((state) => ({ conflicts: [...state.conflicts, conflict] })),
  resolveConflict: (itemId) =>
    set((state) => ({ conflicts: state.conflicts.filter((c) => c.itemId !== itemId) })),
  clearConflicts: () => set({ conflicts: [] }),
}));

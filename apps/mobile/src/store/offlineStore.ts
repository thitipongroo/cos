import { create } from 'zustand';

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
  setIsOnline: (online: boolean) => void;
  addConflict: (conflict: Conflict) => void;
  resolveConflict: (itemId: number) => void;
  clearConflicts: () => void;
}

export const useOfflineStore = create<OfflineState>((set) => ({
  isOnline: true,
  conflicts: [],
  setIsOnline: (online) => set({ isOnline: online }),
  addConflict: (conflict) => set((state) => ({ conflicts: [...state.conflicts, conflict] })),
  resolveConflict: (itemId) =>
    set((state) => ({ conflicts: state.conflicts.filter((c) => c.itemId !== itemId) })),
  clearConflicts: () => set({ conflicts: [] }),
}));

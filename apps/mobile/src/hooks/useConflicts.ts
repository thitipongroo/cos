import { useOfflineStore } from '../store/offlineStore';
import type { Conflict } from '../store/offlineStore';

export function useConflicts(): Conflict[] {
  return useOfflineStore((state) => state.conflicts);
}

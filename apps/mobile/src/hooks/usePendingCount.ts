import { useSyncStore } from '../store/syncStore';

export function usePendingCount(): number {
  return useSyncStore((state) => state.pendingCount);
}

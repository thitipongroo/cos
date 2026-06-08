import { useSyncStore } from '../store/syncStore';
import type { SyncStatus } from '../store/syncStore';

export function useSyncStatus(): SyncStatus {
  return useSyncStore((state) => state.status);
}

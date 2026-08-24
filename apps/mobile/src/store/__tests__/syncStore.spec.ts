jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  getItemAsync: jest.fn().mockResolvedValue(null),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

import * as SecureStore from 'expo-secure-store';
import { useSyncStore } from '../syncStore';

describe('syncStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSyncStore.setState({
      status: 'idle',
      lastSyncAt: null,
      pendingCount: 0,
      errorMessage: null,
    });
  });

  it('initial state is correct', () => {
    const state = useSyncStore.getState();
    expect(state.status).toBe('idle');
    expect(state.lastSyncAt).toBeNull();
    expect(state.pendingCount).toBe(0);
    expect(state.errorMessage).toBeNull();
  });

  it('setStatus updates status', () => {
    useSyncStore.getState().setStatus('syncing');
    expect(useSyncStore.getState().status).toBe('syncing');
  });

  it('setPendingCount updates pendingCount', () => {
    useSyncStore.getState().setPendingCount(7);
    expect(useSyncStore.getState().pendingCount).toBe(7);
  });

  it('setError updates errorMessage', () => {
    useSyncStore.getState().setError('connection refused');
    expect(useSyncStore.getState().errorMessage).toBe('connection refused');
  });

  it('setError with null clears errorMessage', () => {
    useSyncStore.getState().setError('some error');
    useSyncStore.getState().setError(null);
    expect(useSyncStore.getState().errorMessage).toBeNull();
  });

  // The delta cursor was held in memory only, so every cold start asked /sync/delta for everything
  // since the epoch -- a full re-download on mobile data instead of an incremental pull.
  describe('the delta cursor survives a restart', () => {
    const ts = '2026-06-08T10:00:00.000Z';

    it('setLastSyncAt updates and persists', async () => {
      await useSyncStore.getState().setLastSyncAt(ts);
      expect(useSyncStore.getState().lastSyncAt).toBe(ts);
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith('cos_last_sync_at', ts);
    });

    it('hydrate restores a stored cursor', async () => {
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce(ts);
      await useSyncStore.getState().hydrate();
      expect(useSyncStore.getState().lastSyncAt).toBe(ts);
    });

    it('hydrate leaves the cursor null when nothing is stored', async () => {
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce(null);
      await useSyncStore.getState().hydrate();
      expect(useSyncStore.getState().lastSyncAt).toBeNull();
    });

    it('hydrate rejects a stored value that is not a real instant', async () => {
      // The server answers COS-SYNC-002 for an unparseable `since` and the whole pull dies with it.
      // One full pull is recoverable; a poisoned cursor is not.
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce('not-a-date');
      await useSyncStore.getState().hydrate();
      expect(useSyncStore.getState().lastSyncAt).toBeNull();
    });
  });
});

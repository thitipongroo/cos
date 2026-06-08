import { useSyncStore } from '../syncStore';

describe('syncStore', () => {
  beforeEach(() => {
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

  it('setLastSyncAt updates lastSyncAt', () => {
    const ts = '2026-06-08T10:00:00.000Z';
    useSyncStore.getState().setLastSyncAt(ts);
    expect(useSyncStore.getState().lastSyncAt).toBe(ts);
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
});

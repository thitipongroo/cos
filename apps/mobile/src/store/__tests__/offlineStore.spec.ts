import { useOfflineStore } from '../offlineStore';
import type { Conflict } from '../offlineStore';

const makeConflict = (itemId: number): Conflict => ({
  itemId,
  entityType: 'local_site_reports',
  entityId: `entity-${itemId}`,
  localPayload: { local: true },
  serverPayload: { server: true },
});

describe('offlineStore', () => {
  beforeEach(() => {
    useOfflineStore.setState({ isOnline: true, conflicts: [] });
  });

  it('initial state is correct', () => {
    const state = useOfflineStore.getState();
    expect(state.isOnline).toBe(true);
    expect(state.conflicts).toEqual([]);
  });

  it('setIsOnline updates isOnline to false', () => {
    useOfflineStore.getState().setIsOnline(false);
    expect(useOfflineStore.getState().isOnline).toBe(false);
  });

  it('setIsOnline updates isOnline back to true', () => {
    useOfflineStore.getState().setIsOnline(false);
    useOfflineStore.getState().setIsOnline(true);
    expect(useOfflineStore.getState().isOnline).toBe(true);
  });

  it('addConflict appends to conflicts array', () => {
    useOfflineStore.getState().addConflict(makeConflict(1));
    useOfflineStore.getState().addConflict(makeConflict(2));
    expect(useOfflineStore.getState().conflicts).toHaveLength(2);
    expect(useOfflineStore.getState().conflicts[0].itemId).toBe(1);
  });

  it('resolveConflict removes conflict by itemId', () => {
    useOfflineStore.getState().addConflict(makeConflict(10));
    useOfflineStore.getState().addConflict(makeConflict(20));
    useOfflineStore.getState().resolveConflict(10);
    const conflicts = useOfflineStore.getState().conflicts;
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].itemId).toBe(20);
  });

  it('clearConflicts empties the conflicts array', () => {
    useOfflineStore.getState().addConflict(makeConflict(1));
    useOfflineStore.getState().addConflict(makeConflict(2));
    useOfflineStore.getState().clearConflicts();
    expect(useOfflineStore.getState().conflicts).toHaveLength(0);
  });
});

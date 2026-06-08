import type { SyncStatus } from '../../store/syncStore';

const mockSelector = jest.fn<SyncStatus, [(s: { status: SyncStatus }) => SyncStatus]>();

jest.mock('../../store/syncStore', () => ({
  useSyncStore: (selector: (s: { status: SyncStatus }) => SyncStatus) => mockSelector(selector),
}));

import { useSyncStatus } from '../useSyncStatus';

describe('useSyncStatus', () => {
  it('delegates to useSyncStore and returns status', () => {
    mockSelector.mockImplementation((sel) => sel({ status: 'syncing' }));
    expect(useSyncStatus()).toBe('syncing');
  });

  it('returns idle when store status is idle', () => {
    mockSelector.mockImplementation((sel) => sel({ status: 'idle' }));
    expect(useSyncStatus()).toBe('idle');
  });
});

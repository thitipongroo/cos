// The sync indicators' shared reading: which of the four states wins, and what it says.
//
// This used to be a ternary copied into <SyncPill /> and <OverlaySyncPill />, where the logic suite
// could not reach it (neither .tsx is in collectCoverageFrom) — and the two copies had already
// drifted on the SYNCED glyph. Now it is one hook, and the precedence is asserted rather than
// maintained by hand in two places.

import type { SyncStatus } from '../../store/syncStore';
import { darkColors } from '../../theme/tokens';

let status: SyncStatus = 'idle';
let pending = 0;

jest.mock('../useSyncStatus', () => ({ useSyncStatus: () => status }));
jest.mock('../usePendingCount', () => ({ usePendingCount: () => pending }));
jest.mock('../../i18n', () => ({
  useT: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key,
}));

import { useSyncPillView } from '../useSyncPillView';

describe('useSyncPillView', () => {
  beforeEach(() => {
    status = 'idle';
    pending = 0;
  });

  it('reports synced with the glyph its caller asked for', () => {
    expect(useSyncPillView('cloud-done')).toEqual({
      icon: 'cloud-done',
      color: darkColors.success,
      label: 'sync.pill.synced',
    });
    expect(useSyncPillView('check-circle').icon).toBe('check-circle');
  });

  it('reports pending with the queue depth once anything is waiting', () => {
    pending = 3;

    expect(useSyncPillView('cloud-done')).toEqual({
      icon: 'cloud-upload',
      color: darkColors.syncing,
      label: 'sync.pill.pending:{"count":3}',
    });
  });

  it('reports syncing ahead of a non-empty queue', () => {
    status = 'syncing';
    pending = 3;

    expect(useSyncPillView('cloud-done').icon).toBe('sync');
  });

  it('reports error ahead of every other state', () => {
    status = 'error';
    pending = 3;

    expect(useSyncPillView('cloud-done')).toEqual({
      icon: 'sync-problem',
      color: darkColors.danger,
      label: 'sync.pill.error',
    });
  });

  // Offline is NOT a state of its own (PO 2026-08-06) — it produces pending, and offline with an
  // empty queue genuinely is synced. This pins that: no network, nothing waiting, still synced.
  it('reads an empty queue as synced whatever the network is doing', () => {
    status = 'idle';
    pending = 0;

    expect(useSyncPillView('cloud-done').icon).toBe('cloud-done');
  });
});

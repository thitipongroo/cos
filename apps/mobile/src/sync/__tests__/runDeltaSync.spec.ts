const mockFetchDelta = jest.fn();
const mockSetLastSyncAt = jest.fn();
const mockState: { lastSyncAt: string | null; setLastSyncAt: jest.Mock } = {
  lastSyncAt: null,
  setLastSyncAt: mockSetLastSyncAt,
};
const mockUpsertByKey = jest.fn();
const mockDeleteByKey = jest.fn();

jest.mock('../../api/client', () => ({ fetchDelta: mockFetchDelta }));
jest.mock('../../store/syncStore', () => ({ useSyncStore: { getState: () => mockState } }));
jest.mock('../../db/database', () => ({
  upsertByKey: mockUpsertByKey,
  deleteByKey: mockDeleteByKey,
}));

import { runDeltaSync } from '../runDeltaSync';

describe('runDeltaSync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockState.lastSyncAt = null;
  });

  it('upserts new records, sets sync_status, defaults since to epoch, advances cursor', async () => {
    mockFetchDelta.mockResolvedValue({
      updated: [{ entity_type: 'task', task_id: 't1', progress_percent: 5 }],
      deleted: [],
      server_timestamp: 'ts1',
    });

    await runDeltaSync();

    expect(mockFetchDelta).toHaveBeenCalledWith(
      expect.arrayContaining(['task']),
      '1970-01-01T00:00:00.000Z',
    );
    expect(mockUpsertByKey).toHaveBeenCalledWith(
      'local_tasks',
      'taskId',
      't1',
      expect.objectContaining({
        taskId: 't1',
        progressPercent: 5,
        offlineSyncStatus: 'SYNCED',
      }),
    );
    expect(mockSetLastSyncAt).toHaveBeenCalledWith('ts1');
  });

  it('routes each entity type to its table (issue → local_issues)', async () => {
    mockFetchDelta.mockResolvedValue({
      updated: [{ entity_type: 'issue', issue_id: 'i1', title: 'Leak' }],
      deleted: [],
      server_timestamp: 'ts2',
    });

    await runDeltaSync();

    expect(mockUpsertByKey).toHaveBeenCalledWith(
      'local_issues',
      'issueId',
      'i1',
      expect.objectContaining({ issueId: 'i1', title: 'Leak', offlineSyncStatus: 'SYNCED' }),
    );
  });

  it('skips unknown entity_type and rows without an id', async () => {
    mockFetchDelta.mockResolvedValue({
      updated: [{ entity_type: 'bogus', x: 1 }, { entity_type: 'task' }],
      deleted: [],
      server_timestamp: 'ts3',
    });

    await runDeltaSync();

    expect(mockUpsertByKey).not.toHaveBeenCalled();
  });

  it('removes deleted ids across tables and uses the stored cursor when present', async () => {
    mockState.lastSyncAt = '2026-06-01T00:00:00Z';
    mockFetchDelta.mockResolvedValue({ updated: [], deleted: ['d1'], server_timestamp: 'ts4' });

    await runDeltaSync();

    expect(mockFetchDelta).toHaveBeenCalledWith(expect.any(Array), '2026-06-01T00:00:00Z');
    // matched across all six entity tables by each table's server-key column
    expect(mockDeleteByKey).toHaveBeenCalledWith('local_tasks', 'taskId', 'd1');
    expect(mockDeleteByKey).toHaveBeenCalledWith('local_issues', 'issueId', 'd1');
    expect(mockDeleteByKey).toHaveBeenCalledWith(
      'local_material_consumptions',
      'consumptionId',
      'd1',
    );
    expect(mockDeleteByKey).toHaveBeenCalledTimes(6);
    expect(mockSetLastSyncAt).toHaveBeenCalledWith('ts4');
  });
});

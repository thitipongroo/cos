const mockFetchDelta = jest.fn();
const mockSetLastSyncAt = jest.fn().mockResolvedValue(undefined);
const mockState: { lastSyncAt: string | null; setLastSyncAt: jest.Mock } = {
  lastSyncAt: null,
  setLastSyncAt: mockSetLastSyncAt,
};
const mockUpsertByKey = jest.fn();
const mockDeleteByKeys = jest.fn();
const mockExistingKeys = jest.fn();
const mockInsertMany = jest.fn();
const mockClearTable = jest.fn();

jest.mock('../../api/client', () => ({ fetchDelta: mockFetchDelta }));
jest.mock('../../store/syncStore', () => ({ useSyncStore: { getState: () => mockState } }));
jest.mock('../../db/database', () => ({
  upsertByKey: mockUpsertByKey,
  deleteByKeys: mockDeleteByKeys,
  existingKeys: mockExistingKeys,
  insertMany: mockInsertMany,
  clearTable: mockClearTable,
}));

import { runDeltaSync } from '../runDeltaSync';

/** A single, final page — the common case. */
const page = (over: Record<string, unknown> = {}) => ({
  updated: [],
  deleted: [],
  server_timestamp: 'ts',
  has_more: false,
  ...over,
});

describe('runDeltaSync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockState.lastSyncAt = null;
    // Nothing already cached unless a test says otherwise.
    mockExistingKeys.mockResolvedValue(new Set<string>());
  });

  it('inserts new records, sets sync_status, defaults since to epoch, advances cursor', async () => {
    mockFetchDelta.mockResolvedValue(
      page({
        updated: [{ entity_type: 'task', task_id: 't1', progress_percent: 5 }],
        server_timestamp: 'ts1',
      }),
    );

    await runDeltaSync();

    expect(mockFetchDelta).toHaveBeenCalledWith(
      expect.arrayContaining(['task']),
      '1970-01-01T00:00:00.000Z',
    );
    expect(mockInsertMany).toHaveBeenCalledWith('local_tasks', [
      expect.objectContaining({ taskId: 't1', progressPercent: 5, offlineSyncStatus: 'SYNCED' }),
    ]);
    expect(mockSetLastSyncAt).toHaveBeenCalledWith('ts1');
  });

  it('updates a row that is already cached instead of inserting a second one', async () => {
    mockExistingKeys.mockResolvedValue(new Set(['t1']));
    mockFetchDelta.mockResolvedValue(
      page({ updated: [{ entity_type: 'task', task_id: 't1', progress_percent: 90 }] }),
    );

    await runDeltaSync();

    expect(mockUpsertByKey).toHaveBeenCalledWith(
      'local_tasks',
      'taskId',
      't1',
      expect.objectContaining({ progressPercent: 90 }),
    );
    expect(mockInsertMany).toHaveBeenCalledWith('local_tasks', []);
  });

  it('routes each entity type to its table (issue -> local_issues)', async () => {
    mockFetchDelta.mockResolvedValue(
      page({ updated: [{ entity_type: 'issue', issue_id: 'i1', title: 'Leak' }] }),
    );

    await runDeltaSync();

    expect(mockInsertMany).toHaveBeenCalledWith('local_issues', [
      expect.objectContaining({ issueId: 'i1', title: 'Leak', offlineSyncStatus: 'SYNCED' }),
    ]);
  });

  it('skips unknown entity_type and rows without an id', async () => {
    mockFetchDelta.mockResolvedValue(
      page({ updated: [{ entity_type: 'bogus', x: 1 }, { entity_type: 'task' }] }),
    );

    await runDeltaSync();

    expect(mockInsertMany).not.toHaveBeenCalled();
    expect(mockUpsertByKey).not.toHaveBeenCalled();
  });

  it('asks the database once per table, not once per row', async () => {
    // The point of the grouping. Twenty tasks used to cost twenty SELECTs and twenty writes.
    const updated = Array.from({ length: 20 }, (_, i) => ({
      entity_type: 'task',
      task_id: `t${i}`,
    }));
    mockFetchDelta.mockResolvedValue(page({ updated }));

    await runDeltaSync();

    expect(mockExistingKeys).toHaveBeenCalledTimes(1);
    expect(mockInsertMany).toHaveBeenCalledTimes(1);
    expect((mockInsertMany.mock.calls[0] as [string, unknown[]])[1]).toHaveLength(20);
  });

  it('keeps the LAST value when one page carries an id twice', async () => {
    mockFetchDelta.mockResolvedValue(
      page({
        updated: [
          { entity_type: 'task', task_id: 't1', progress_percent: 10 },
          { entity_type: 'task', task_id: 't1', progress_percent: 40 },
        ],
      }),
    );

    await runDeltaSync();

    expect(mockInsertMany).toHaveBeenCalledWith('local_tasks', [
      expect.objectContaining({ progressPercent: 40 }),
    ]);
  });

  it('removes deleted ids across tables in ONE statement each, and uses the stored cursor', async () => {
    mockState.lastSyncAt = '2026-06-01T00:00:00Z';
    mockFetchDelta.mockResolvedValue(page({ deleted: ['d1', 'd2'], server_timestamp: 'ts4' }));

    await runDeltaSync();

    expect(mockFetchDelta).toHaveBeenCalledWith(expect.any(Array), '2026-06-01T00:00:00Z');
    // `deleted` is a flat id list with no entity type, so every id is tried against every table --
    // but once per table for the whole page, not once per table per id.
    expect(mockDeleteByKeys).toHaveBeenCalledWith('local_tasks', 'taskId', ['d1', 'd2']);
    expect(mockDeleteByKeys).toHaveBeenCalledWith('local_issues', 'issueId', ['d1', 'd2']);
    expect(mockDeleteByKeys).toHaveBeenCalledTimes(6);
    expect(mockSetLastSyncAt).toHaveBeenCalledWith('ts4');
  });

  it('does not touch the tables when a page carries no tombstones', async () => {
    mockFetchDelta.mockResolvedValue(page());
    await runDeltaSync();
    expect(mockDeleteByKeys).not.toHaveBeenCalled();
  });

  // The server pages at 500 rows per entity type and expects the client to keep asking. The client
  // read the first page and stopped, silently dropping everything behind it.
  describe('paging', () => {
    it('keeps calling while has_more, resuming from each page cursor', async () => {
      mockFetchDelta
        .mockResolvedValueOnce(page({ server_timestamp: 'p1', has_more: true }))
        .mockResolvedValueOnce(page({ server_timestamp: 'p2', has_more: true }))
        .mockResolvedValueOnce(page({ server_timestamp: 'p3', has_more: false }));

      await runDeltaSync();

      expect(mockFetchDelta).toHaveBeenCalledTimes(3);
      expect(mockFetchDelta).toHaveBeenNthCalledWith(2, expect.any(Array), 'p1');
      expect(mockFetchDelta).toHaveBeenNthCalledWith(3, expect.any(Array), 'p2');
    });

    it('persists the cursor after EACH page, so an interrupted pull resumes', async () => {
      mockFetchDelta
        .mockResolvedValueOnce(page({ server_timestamp: 'p1', has_more: true }))
        .mockResolvedValueOnce(page({ server_timestamp: 'p2', has_more: false }));

      await runDeltaSync();

      expect(mockSetLastSyncAt).toHaveBeenNthCalledWith(1, 'p1');
      expect(mockSetLastSyncAt).toHaveBeenNthCalledWith(2, 'p2');
    });

    it('stops at the page cap rather than spinning forever on a cursor that cannot advance', async () => {
      // The server documents one unpageable case: a full page sharing an identical timestamp.
      mockFetchDelta.mockResolvedValue(page({ server_timestamp: 'stuck', has_more: true }));

      await runDeltaSync();

      expect(mockFetchDelta).toHaveBeenCalledTimes(50);
    });

    it('treats a backend that omits has_more as a single page', async () => {
      mockFetchDelta.mockResolvedValue({ updated: [], deleted: [], server_timestamp: 'ts' });
      await runDeltaSync();
      expect(mockFetchDelta).toHaveBeenCalledTimes(1);
    });
  });

  // When `since` predates the tombstone retention window the server's `deleted` list is knowingly
  // incomplete, so rows deleted while this device was away would live on it forever. The server
  // documents dropping local state as the client's obligation; the client never did it.
  describe('full_resync_required', () => {
    it('clears every cached table before applying the pages', async () => {
      const order: string[] = [];
      mockClearTable.mockImplementation((t: string) => {
        order.push(`clear:${t}`);
      });
      mockInsertMany.mockImplementation(() => {
        order.push('insert');
      });
      mockFetchDelta.mockResolvedValue(
        page({
          full_resync_required: true,
          updated: [{ entity_type: 'task', task_id: 't1' }],
        }),
      );

      await runDeltaSync();

      expect(mockClearTable).toHaveBeenCalledTimes(6);
      expect(order[0]).toMatch(/^clear:/);
      expect(order[order.length - 1]).toBe('insert');
    });

    it('clears ONCE across a multi-page resync, not once per page', async () => {
      mockFetchDelta
        .mockResolvedValueOnce(
          page({ full_resync_required: true, server_timestamp: 'p1', has_more: true }),
        )
        .mockResolvedValueOnce(page({ full_resync_required: true, server_timestamp: 'p2' }));

      await runDeltaSync();

      expect(mockClearTable).toHaveBeenCalledTimes(6);
    });

    it('leaves the cache alone when the flag is absent', async () => {
      mockFetchDelta.mockResolvedValue(page());
      await runDeltaSync();
      expect(mockClearTable).not.toHaveBeenCalled();
    });
  });
});

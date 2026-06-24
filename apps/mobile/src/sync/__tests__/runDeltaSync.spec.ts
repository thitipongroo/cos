const mockFetchDelta = jest.fn();
const mockSetLastSyncAt = jest.fn();
const mockState: { lastSyncAt: string | null; setLastSyncAt: jest.Mock } = {
  lastSyncAt: null,
  setLastSyncAt: mockSetLastSyncAt,
};
const mockFetch = jest.fn();
const mockCreate = jest.fn();
const mockCollection = { query: () => ({ fetch: mockFetch }), create: mockCreate };

jest.mock('@nozbe/watermelondb', () => ({ Q: { where: () => ({}) } }));
jest.mock('../../api/client', () => ({ fetchDelta: mockFetchDelta }));
jest.mock('../../store/syncStore', () => ({ useSyncStore: { getState: () => mockState } }));
jest.mock('../../db/database', () => ({
  database: { write: (fn: () => Promise<void>) => fn(), get: () => mockCollection },
}));

import { runDeltaSync } from '../runDeltaSync';

describe('runDeltaSync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockState.lastSyncAt = null;
  });

  it('creates new records, sets sync_status, defaults since to epoch, advances cursor', async () => {
    mockFetchDelta.mockResolvedValue({
      updated: [{ entity_type: 'task', task_id: 't1', progress_percent: 5 }],
      deleted: [],
      server_timestamp: 'ts1',
    });
    mockFetch.mockResolvedValue([]); // not found → create
    let created: { _setRaw: jest.Mock } | undefined;
    mockCreate.mockImplementation(async (fn: (r: { _setRaw: jest.Mock }) => void) => {
      created = { _setRaw: jest.fn() };
      fn(created);
    });

    await runDeltaSync();

    expect(mockFetchDelta).toHaveBeenCalledWith(
      expect.arrayContaining(['task']),
      '1970-01-01T00:00:00.000Z',
    );
    expect(mockCreate).toHaveBeenCalled();
    expect(created!._setRaw).toHaveBeenCalledWith('task_id', 't1');
    expect(created!._setRaw).toHaveBeenCalledWith('sync_status', 'SYNCED');
    expect(mockSetLastSyncAt).toHaveBeenCalledWith('ts1');
  });

  it('updates an existing record', async () => {
    mockFetchDelta.mockResolvedValue({
      updated: [{ entity_type: 'issue', issue_id: 'i1' }],
      deleted: [],
      server_timestamp: 'ts2',
    });
    const rec: { _setRaw: jest.Mock; update: jest.Mock } = {
      _setRaw: jest.fn(),
      update: jest.fn(async (fn: (r: typeof rec) => void) => fn(rec)),
    };
    mockFetch.mockResolvedValue([rec]);

    await runDeltaSync();

    expect(rec.update).toHaveBeenCalled();
    expect(rec._setRaw).toHaveBeenCalledWith('sync_status', 'SYNCED');
  });

  it('skips unknown entity_type and rows without an id', async () => {
    mockFetchDelta.mockResolvedValue({
      updated: [{ entity_type: 'bogus', x: 1 }, { entity_type: 'task' }],
      deleted: [],
      server_timestamp: 'ts3',
    });
    mockFetch.mockResolvedValue([]);
    await runDeltaSync();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('removes deleted ids and uses the stored cursor when present', async () => {
    mockState.lastSyncAt = '2026-06-01T00:00:00Z';
    const rec = { destroyPermanently: jest.fn() };
    mockFetchDelta.mockResolvedValue({ updated: [], deleted: ['d1'], server_timestamp: 'ts4' });
    mockFetch.mockResolvedValue([rec]);

    await runDeltaSync();

    expect(mockFetchDelta).toHaveBeenCalledWith(expect.any(Array), '2026-06-01T00:00:00Z');
    expect(rec.destroyPermanently).toHaveBeenCalled();
  });
});

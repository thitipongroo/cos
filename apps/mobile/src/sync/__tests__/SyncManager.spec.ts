import type { SyncQueueItem } from '../../db/sync-queue';
import type { HttpClient, SyncManagerCallbacks } from '../SyncManager';
import { SyncManager } from '../SyncManager';
import { ConflictHandler } from '../ConflictHandler';

// ── Mock sync-queue ──────────────────────────────────────────────────────────
const mockFetchPending = jest.fn<SyncQueueItem[], [number]>().mockReturnValue([]);
const mockMarkSyncing = jest.fn();
const mockMarkSynced = jest.fn();
const mockMarkFailed = jest.fn();

jest.mock('../../db/sync-queue', () => ({
  fetchPending: (...args: unknown[]) => mockFetchPending(...(args as [number])),
  markSyncing: (...args: unknown[]) => mockMarkSyncing(...args),
  markSynced: (...args: unknown[]) => mockMarkSynced(...args),
  markFailed: (...args: unknown[]) => mockMarkFailed(...args),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

const makeItem = (overrides: Partial<SyncQueueItem> = {}): SyncQueueItem => ({
  id: 1,
  entity_type: 'local_site_reports',
  entity_id: 'entity-1',
  operation: 'CREATE',
  payload: JSON.stringify({ title: 'test' }),
  status: 'PENDING',
  retry_count: 0,
  client_submitted_at: '2026-06-08T00:00:00Z',
  last_attempt_at: null,
  error_message: null,
  ...overrides,
});

const makeHttpClient = (responseStatus = 'ACCEPTED', serverPayload?: unknown): HttpClient => ({
  post: jest.fn().mockResolvedValue({
    data: { status: responseStatus, server_payload: serverPayload },
  }),
});

const makeManager = (
  httpClient: HttpClient,
  token: string | null = 'test-token',
  callbacks: SyncManagerCallbacks = {},
) => new SyncManager(httpClient, () => token, callbacks);

// ── Tests ────────────────────────────────────────────────────────────────────

describe('SyncManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchPending.mockReturnValue([]);
  });

  describe('processQueue', () => {
    it('returns zeroed result when queue is empty', async () => {
      const manager = makeManager(makeHttpClient());
      const result = await manager.processQueue();
      expect(result).toEqual({ synced: 0, failed: 0, exhausted: 0 });
    });

    it('works with no callbacks argument (uses default empty callbacks)', async () => {
      // Covers the default parameter branch: callbacks = {}
      const manager = new SyncManager(makeHttpClient(), () => 'tok');
      const result = await manager.processQueue();
      expect(result).toEqual({ synced: 0, failed: 0, exhausted: 0 });
    });

    it('processes ACCEPTED item: marks syncing + synced, increments synced count', async () => {
      mockFetchPending.mockReturnValueOnce([makeItem()]);
      const http = makeHttpClient('ACCEPTED');
      const manager = makeManager(http);
      const result = await manager.processQueue();
      expect(mockMarkSyncing).toHaveBeenCalledWith(1);
      expect(mockMarkSynced).toHaveBeenCalledWith(1);
      expect(result).toEqual({ synced: 1, failed: 0, exhausted: 0 });
    });

    it('ACCEPTED calls onAccepted with the entity + server payload (ADR-056 reconcile)', async () => {
      mockFetchPending.mockReturnValueOnce([makeItem()]);
      const http = makeHttpClient('ACCEPTED', { version: 4 });
      const onAccepted = jest.fn().mockResolvedValue(undefined);
      const manager = makeManager(http, 'tok', { onAccepted });
      await manager.processQueue();
      expect(onAccepted).toHaveBeenCalledWith('local_site_reports', 'entity-1', { version: 4 });
    });

    it('ACCEPTED without an onAccepted callback is a no-op (still synced)', async () => {
      mockFetchPending.mockReturnValueOnce([makeItem()]);
      const http = makeHttpClient('ACCEPTED');
      const manager = makeManager(http);
      const result = await manager.processQueue();
      expect(result.synced).toBe(1);
    });

    it('ACCEPTED onAccepted with no server_payload passes null (covers ?? branch)', async () => {
      mockFetchPending.mockReturnValueOnce([makeItem()]);
      const http = makeHttpClient('ACCEPTED'); // no serverPayload
      const onAccepted = jest.fn().mockResolvedValue(undefined);
      const manager = makeManager(http, 'tok', { onAccepted });
      await manager.processQueue();
      expect(onAccepted).toHaveBeenCalledWith('local_site_reports', 'entity-1', null);
    });

    it('includes Authorization header when token is present', async () => {
      mockFetchPending.mockReturnValueOnce([makeItem()]);
      const http = makeHttpClient('ACCEPTED');
      const manager = makeManager(http, 'bearer-token');
      await manager.processQueue();
      const [, , config] = (http.post as jest.Mock).mock.calls[0] as [
        string,
        unknown,
        { headers: Record<string, string> },
      ];
      expect(config.headers['Authorization']).toBe('Bearer bearer-token');
    });

    it('omits Authorization header when token is null', async () => {
      mockFetchPending.mockReturnValueOnce([makeItem()]);
      const http = makeHttpClient('ACCEPTED');
      const manager = makeManager(http, null);
      await manager.processQueue();
      const [, , config] = (http.post as jest.Mock).mock.calls[0] as [
        string,
        unknown,
        { headers: Record<string, string> },
      ];
      expect(config.headers['Authorization']).toBeUndefined();
    });

    it('CONFLICT_FLAGGED: marks synced, calls onConflict, calls onUserNotify', async () => {
      mockFetchPending.mockReturnValueOnce([makeItem()]);
      const http = makeHttpClient('CONFLICT_FLAGGED', { server: 'data' });
      const onConflict = jest.fn();
      const onUserNotify = jest.fn();
      const manager = makeManager(http, 'tok', { onConflict, onUserNotify });
      const result = await manager.processQueue();
      expect(mockMarkSynced).toHaveBeenCalledWith(1);
      expect(onConflict).toHaveBeenCalledWith('local_site_reports', 'entity-1', { server: 'data' });
      expect(onUserNotify).toHaveBeenCalled();
      expect(result.synced).toBe(1);
    });

    it('CONFLICT_FLAGGED without callbacks: no error thrown', async () => {
      mockFetchPending.mockReturnValueOnce([makeItem()]);
      const http = makeHttpClient('CONFLICT_FLAGGED');
      const manager = makeManager(http, 'tok', {});
      await expect(manager.processQueue()).resolves.toMatchObject({ synced: 1 });
    });

    it('CONFLICT_FLAGGED with onConflict but no server_payload: passes null', async () => {
      mockFetchPending.mockReturnValueOnce([makeItem()]);
      const http = makeHttpClient('CONFLICT_FLAGGED'); // no server_payload → undefined
      const onConflict = jest.fn();
      const onUserNotify = jest.fn();
      const manager = makeManager(http, 'tok', { onConflict, onUserNotify });
      await manager.processQueue();
      expect(onConflict).toHaveBeenCalledWith('local_site_reports', 'entity-1', null);
    });

    it('CONFLICT_REJECTED: marks synced, calls onRejected, calls onUserNotify', async () => {
      mockFetchPending.mockReturnValueOnce([makeItem()]);
      const http = makeHttpClient('CONFLICT_REJECTED', { server: 'v2' });
      const onRejected = jest.fn();
      const onUserNotify = jest.fn();
      const manager = makeManager(http, 'tok', { onRejected, onUserNotify });
      const result = await manager.processQueue();
      expect(mockMarkSynced).toHaveBeenCalledWith(1);
      expect(onRejected).toHaveBeenCalledWith('local_site_reports', 'entity-1', { server: 'v2' });
      expect(onUserNotify).toHaveBeenCalled();
      expect(result.synced).toBe(1);
    });

    it('CONFLICT_REJECTED without callbacks: no error thrown', async () => {
      mockFetchPending.mockReturnValueOnce([makeItem()]);
      const http = makeHttpClient('CONFLICT_REJECTED');
      const manager = makeManager(http, 'tok', {});
      await expect(manager.processQueue()).resolves.toMatchObject({ synced: 1 });
    });

    it('CONFLICT_REJECTED with onRejected but no server_payload: passes null', async () => {
      mockFetchPending.mockReturnValueOnce([makeItem()]);
      const http = makeHttpClient('CONFLICT_REJECTED'); // no server_payload → undefined
      const onRejected = jest.fn();
      const onUserNotify = jest.fn();
      const manager = makeManager(http, 'tok', { onRejected, onUserNotify });
      await manager.processQueue();
      expect(onRejected).toHaveBeenCalledWith('local_site_reports', 'entity-1', null);
    });

    it('accepts a custom ConflictHandler instance via constructor (covers ?? left branch)', async () => {
      mockFetchPending.mockReturnValueOnce([makeItem()]);
      const http = makeHttpClient('ACCEPTED');
      const customHandler = new ConflictHandler();
      const manager = new SyncManager(http, () => 'tok', {}, customHandler);
      const result = await manager.processQueue();
      expect(result.synced).toBe(1);
    });

    it('server error: marks failed, increments failed count when retry_count < MAX_RETRIES', async () => {
      mockFetchPending.mockReturnValueOnce([makeItem({ retry_count: 2 })]);
      const http: HttpClient = { post: jest.fn().mockRejectedValue(new Error('network error')) };
      const manager = makeManager(http);
      const result = await manager.processQueue();
      expect(mockMarkFailed).toHaveBeenCalledWith(1, 'network error');
      expect(result).toEqual({ synced: 0, failed: 1, exhausted: 0 });
    });

    it('uses "unknown error" message when error is not an Error instance', async () => {
      mockFetchPending.mockReturnValueOnce([makeItem({ retry_count: 2 })]);
      const http: HttpClient = { post: jest.fn().mockRejectedValue('string error') };
      const manager = makeManager(http);
      const result = await manager.processQueue();
      expect(mockMarkFailed).toHaveBeenCalledWith(1, 'unknown error');
      expect(result.failed).toBe(1);
    });

    it('retry_count + 1 >= MAX_RETRIES: triggers exhaustion, increments exhausted count', async () => {
      mockFetchPending.mockReturnValueOnce([
        makeItem({ entity_type: 'safety_incidents', retry_count: 4 }),
      ]);
      const http: HttpClient = { post: jest.fn().mockRejectedValue(new Error('timeout')) };
      const onExhausted = jest.fn().mockResolvedValue(undefined);
      const manager = makeManager(http, 'tok', { onExhausted });
      const result = await manager.processQueue();
      expect(result).toEqual({ synced: 0, failed: 0, exhausted: 1 });
      expect(onExhausted).toHaveBeenCalledWith('safety_incidents', 'entity-1', 'CREATE');
    });
  });

  describe('handleExhaustion', () => {
    const exhausted = (entityType: string, callbacks: SyncManagerCallbacks = {}) => {
      mockFetchPending.mockReturnValueOnce([makeItem({ entity_type: entityType, retry_count: 4 })]);
      const http: HttpClient = { post: jest.fn().mockRejectedValue(new Error('x')) };
      return new SyncManager(http, () => 'tok', callbacks).processQueue();
    };

    it('safety_incidents → calls onExhausted', async () => {
      const onExhausted = jest.fn().mockResolvedValue(undefined);
      await exhausted('safety_incidents', { onExhausted });
      expect(onExhausted).toHaveBeenCalledWith('safety_incidents', 'entity-1', 'CREATE');
    });

    it('workforce_attendance → calls onExhausted', async () => {
      const onExhausted = jest.fn().mockResolvedValue(undefined);
      await exhausted('workforce_attendance', { onExhausted });
      expect(onExhausted).toHaveBeenCalled();
    });

    it('inspection_results → calls onExhausted', async () => {
      const onExhausted = jest.fn().mockResolvedValue(undefined);
      await exhausted('inspection_results', { onExhausted });
      expect(onExhausted).toHaveBeenCalled();
    });

    it('material_consumption → calls onExhausted', async () => {
      const onExhausted = jest.fn().mockResolvedValue(undefined);
      await exhausted('material_consumption', { onExhausted });
      expect(onExhausted).toHaveBeenCalled();
    });

    it('exhausted_notify without onExhausted callback: no error', async () => {
      await expect(exhausted('safety_incidents', {})).resolves.toMatchObject({ exhausted: 1 });
    });

    it('task_progress_updates → calls onUserNotify with message', async () => {
      const onUserNotify = jest.fn();
      await exhausted('task_progress_updates', { onUserNotify });
      expect(onUserNotify).toHaveBeenCalledWith(expect.stringContaining('task_progress_updates'));
    });

    it('site_report_drafts → calls onUserNotify', async () => {
      const onUserNotify = jest.fn();
      await exhausted('site_report_drafts', { onUserNotify });
      expect(onUserNotify).toHaveBeenCalled();
    });

    it('discard_notify without onUserNotify callback: no error', async () => {
      await expect(exhausted('task_progress_updates', {})).resolves.toMatchObject({ exhausted: 1 });
    });

    it('equipment_usage_logs → silent discard, no callbacks called', async () => {
      const onExhausted = jest.fn().mockResolvedValue(undefined);
      const onUserNotify = jest.fn();
      await exhausted('equipment_usage_logs', { onExhausted, onUserNotify });
      expect(onExhausted).not.toHaveBeenCalled();
      expect(onUserNotify).not.toHaveBeenCalled();
    });

    it('unknown entity type → no callbacks called', async () => {
      const onExhausted = jest.fn().mockResolvedValue(undefined);
      const onUserNotify = jest.fn();
      await exhausted('unknown_entity_xyz', { onExhausted, onUserNotify });
      expect(onExhausted).not.toHaveBeenCalled();
      expect(onUserNotify).not.toHaveBeenCalled();
    });
  });
});

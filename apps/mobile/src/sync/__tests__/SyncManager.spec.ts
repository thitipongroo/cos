import type { SyncQueueItem } from '../../db/sync-queue';
import type { HttpClient, SyncManagerCallbacks } from '../SyncManager';
import { SyncManager } from '../SyncManager';
import { ConflictHandler } from '../ConflictHandler';

// ── Mock sync-queue ──────────────────────────────────────────────────────────
const mockFetchPending = jest.fn<SyncQueueItem[], [number]>().mockReturnValue([]);
const mockMarkSyncing = jest.fn();
const mockMarkSynced = jest.fn();
const mockMarkFailed = jest.fn();
const mockMarkPermanentlyFailed = jest.fn();
const mockRequeueFailed = jest.fn();
const mockResetStale = jest.fn();

jest.mock('../../db/sync-queue', () => ({
  fetchPending: (...args: unknown[]) => mockFetchPending(...(args as [number])),
  markSyncing: (...args: unknown[]) => mockMarkSyncing(...args),
  markSynced: (...args: unknown[]) => mockMarkSynced(...args),
  markFailed: (...args: unknown[]) => mockMarkFailed(...args),
  markPermanentlyFailed: (...args: unknown[]) => mockMarkPermanentlyFailed(...args),
  requeueFailed: (...args: unknown[]) => mockRequeueFailed(...args),
  resetStale: (...args: unknown[]) => mockResetStale(...args),
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
      expect(result).toEqual({ synced: 0, failed: 0, exhausted: 0, interrupted: false });
    });

    it('works with no callbacks argument (uses default empty callbacks)', async () => {
      // Covers the default parameter branch: callbacks = {}
      const manager = new SyncManager(makeHttpClient(), () => 'tok');
      const result = await manager.processQueue();
      expect(result).toEqual({ synced: 0, failed: 0, exhausted: 0, interrupted: false });
    });

    it('processes ACCEPTED item: marks syncing + synced, increments synced count', async () => {
      mockFetchPending.mockReturnValueOnce([makeItem()]);
      const http = makeHttpClient('ACCEPTED');
      const manager = makeManager(http);
      const result = await manager.processQueue();
      expect(mockMarkSyncing).toHaveBeenCalledWith(1);
      expect(mockMarkSynced).toHaveBeenCalledWith(1);
      expect(result).toEqual({ synced: 1, failed: 0, exhausted: 0, interrupted: false });
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
      expect(result).toEqual({ synced: 0, failed: 1, exhausted: 0, interrupted: false });
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
      mockFetchPending.mockReturnValueOnce([makeItem({ entity_type: 'safety', retry_count: 4 })]);
      const http: HttpClient = { post: jest.fn().mockRejectedValue(new Error('timeout')) };
      const onExhausted = jest.fn().mockResolvedValue(undefined);
      const manager = makeManager(http, 'tok', { onExhausted });
      const result = await manager.processQueue();
      expect(result).toEqual({ synced: 0, failed: 0, exhausted: 1, interrupted: false });
      // Widened 2026-08-22 (OQ-38): the callback receives the WHOLE queue item, because the §17.2
      // review queue stores the payload so an admin can review and manually import it.
      expect(onExhausted).toHaveBeenCalledWith(
        expect.objectContaining({
          entity_type: 'safety',
          entity_id: 'entity-1',
          operation: 'CREATE',
          payload: expect.any(String),
        }),
      );
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
      await exhausted('safety', { onExhausted });
      // Widened 2026-08-22 (OQ-38): the callback receives the WHOLE queue item, because the §17.2
      // review queue stores the payload so an admin can review and manually import it.
      expect(onExhausted).toHaveBeenCalledWith(
        expect.objectContaining({
          entity_type: 'safety',
          entity_id: 'entity-1',
          operation: 'CREATE',
          payload: expect.any(String),
        }),
      );
    });

    it('workforce_attendance → calls onExhausted', async () => {
      const onExhausted = jest.fn().mockResolvedValue(undefined);
      await exhausted('attendance', { onExhausted });
      expect(onExhausted).toHaveBeenCalled();
    });

    it('inspection_results → calls onExhausted', async () => {
      const onExhausted = jest.fn().mockResolvedValue(undefined);
      await exhausted('inspection', { onExhausted });
      expect(onExhausted).toHaveBeenCalled();
    });

    it('material_consumption → calls onExhausted', async () => {
      const onExhausted = jest.fn().mockResolvedValue(undefined);
      await exhausted('material', { onExhausted });
      expect(onExhausted).toHaveBeenCalled();
    });

    it('exhausted_notify without onExhausted callback: no error', async () => {
      await expect(exhausted('safety', {})).resolves.toMatchObject({ exhausted: 1 });
    });

    it('task_progress_updates → calls onUserNotify with message', async () => {
      const onUserNotify = jest.fn();
      await exhausted('task', { onUserNotify });
      expect(onUserNotify).toHaveBeenCalledWith('sync.exhausted.discarded');
    });

    it('site_report_drafts → calls onUserNotify', async () => {
      const onUserNotify = jest.fn();
      await exhausted('site_report', { onUserNotify });
      expect(onUserNotify).toHaveBeenCalled();
    });

    it('discard_notify without onUserNotify callback: no error', async () => {
      await expect(exhausted('task', {})).resolves.toMatchObject({ exhausted: 1 });
    });

    it('equipment_usage_logs → silent discard, no callbacks called', async () => {
      const onExhausted = jest.fn().mockResolvedValue(undefined);
      const onUserNotify = jest.fn();
      await exhausted('equipment', { onExhausted, onUserNotify });
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

  // -- Queue recovery + failure classification (added 2026-08-19) -------------------------------
  //
  // None of this could happen before: `requeueFailed` and `resetStale` had no caller anywhere in the
  // app, so `fetchPending` (PENDING only) never saw a row again once it had failed or been caught
  // mid-flight by an app kill. `retry_count` therefore never passed 1 either, which made MAX_RETRIES
  // and the whole 17.2 exhaustion policy dead code.
  describe('queue recovery', () => {
    it('returns stranded and retryable rows to the queue BEFORE reading it', async () => {
      const order: string[] = [];
      mockResetStale.mockImplementation(() => order.push('resetStale'));
      mockRequeueFailed.mockImplementation(() => order.push('requeueFailed'));
      mockFetchPending.mockImplementation(() => {
        order.push('fetchPending');
        return [];
      });

      await makeManager(makeHttpClient()).processQueue();

      expect(order).toEqual(['resetStale', 'requeueFailed', 'fetchPending']);
      expect(mockRequeueFailed).toHaveBeenCalledWith(5);
    });
  });

  describe('failure classification', () => {
    const networkError = () => Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' });
    const httpError = (status: number) =>
      Object.assign(new Error('Request failed with status ' + status), {
        response: { status },
      });

    it('stops the batch when the network drops, and spends no retries', async () => {
      // The old loop kept going: one walk out of coverage burned a retry on all 20 items in the
      // batch, so four such walks discarded a shift's work under 17.2.
      mockFetchPending.mockReturnValueOnce([
        makeItem({ id: 1 }),
        makeItem({ id: 2 }),
        makeItem({ id: 3 }),
      ]);
      const http: HttpClient = { post: jest.fn().mockRejectedValue(networkError()) };

      const result = await makeManager(http).processQueue();

      expect(http.post).toHaveBeenCalledTimes(1);
      expect(mockMarkFailed).not.toHaveBeenCalled();
      expect(result).toEqual({ synced: 0, failed: 0, exhausted: 0, interrupted: true });
    });

    it('puts the in-flight row back to PENDING when it stops', async () => {
      mockFetchPending.mockReturnValueOnce([makeItem({ id: 1 })]);
      const http: HttpClient = { post: jest.fn().mockRejectedValue(networkError()) };

      await makeManager(http).processQueue();

      // Once to recover the queue at the start, once to undo the markSyncing of the aborted item.
      expect(mockResetStale).toHaveBeenCalledTimes(2);
    });

    it('discards a 4xx immediately instead of retrying it five times', async () => {
      // /sync/push answers 400 for an entity_type it has no case for. Five identical rejections
      // spread over five cycles reach the same discard, hours later.
      mockFetchPending.mockReturnValueOnce([
        makeItem({ id: 7, entity_type: 'safety', retry_count: 0 }),
      ]);
      const onExhausted = jest.fn().mockResolvedValue(undefined);
      const http: HttpClient = { post: jest.fn().mockRejectedValue(httpError(400)) };

      const result = await makeManager(http, 'tok', { onExhausted }).processQueue();

      expect(mockMarkPermanentlyFailed).toHaveBeenCalledWith(7, expect.any(String), 5);
      expect(mockMarkFailed).not.toHaveBeenCalled();
      // Widened 2026-08-22 (OQ-38): the callback receives the WHOLE queue item, because the §17.2
      // review queue stores the payload so an admin can review and manually import it.
      expect(onExhausted).toHaveBeenCalledWith(
        expect.objectContaining({
          entity_type: 'safety',
          entity_id: 'entity-1',
          operation: 'CREATE',
          payload: expect.any(String),
        }),
      );
      expect(result).toEqual({ synced: 0, failed: 0, exhausted: 1, interrupted: false });
    });

    it('keeps retrying a 429 - the server asked us to come back', async () => {
      mockFetchPending.mockReturnValueOnce([makeItem({ id: 8 })]);
      const http: HttpClient = { post: jest.fn().mockRejectedValue(httpError(429)) };

      const result = await makeManager(http).processQueue();

      expect(mockMarkFailed).toHaveBeenCalledWith(8, expect.any(String));
      expect(mockMarkPermanentlyFailed).not.toHaveBeenCalled();
      expect(result.failed).toBe(1);
    });

    it('keeps retrying a 5xx - a bad moment, not a bad item', async () => {
      mockFetchPending.mockReturnValueOnce([makeItem({ id: 9 })]);
      const http: HttpClient = { post: jest.fn().mockRejectedValue(httpError(503)) };

      const result = await makeManager(http).processQueue();

      expect(mockMarkFailed).toHaveBeenCalledWith(9, expect.any(String));
      expect(result.failed).toBe(1);
    });

    it('continues past a permanently-failed item to the rest of the batch', async () => {
      mockFetchPending.mockReturnValueOnce([makeItem({ id: 1 }), makeItem({ id: 2 })]);
      const http: HttpClient = {
        post: jest
          .fn()
          .mockRejectedValueOnce(httpError(400))
          .mockResolvedValueOnce({ data: { status: 'ACCEPTED' } }),
      };

      const result = await makeManager(http).processQueue();

      expect(result.exhausted).toBe(1);
      expect(result.synced).toBe(1);
    });
  });

  // The verdict has to reach the local row. `ConflictHandler.apply()` returned a resolution and
  // SyncManager read only the message off it, so a rejected change was never written back and a
  // flagged one was never marked - the row kept sync_status PENDING forever.
  describe('onResolved', () => {
    it('fires on ACCEPTED with the server payload the device should now hold', async () => {
      mockFetchPending.mockReturnValueOnce([makeItem({ entity_type: 'issue', entity_id: 'i-1' })]);
      const onResolved = jest.fn().mockResolvedValue(undefined);
      const serverRow = { issue_id: 'i-1', status: 'OPEN' };

      await makeManager(makeHttpClient('ACCEPTED', serverRow), 'tok', {
        onResolved,
      }).processQueue();

      expect(onResolved).toHaveBeenCalledWith('issue', 'i-1', {
        localSyncStatus: 'SYNCED',
        payload: serverRow,
      });
    });

    it('marks the row CONFLICT on CONFLICT_FLAGGED', async () => {
      mockFetchPending.mockReturnValueOnce([makeItem({ entity_type: 'issue', entity_id: 'i-2' })]);
      const onResolved = jest.fn().mockResolvedValue(undefined);

      await makeManager(makeHttpClient('CONFLICT_FLAGGED', { a: 1 }), 'tok', {
        onResolved,
      }).processQueue();

      expect(onResolved).toHaveBeenCalledWith(
        'issue',
        'i-2',
        expect.objectContaining({ localSyncStatus: 'CONFLICT' }),
      );
    });

    it('runs BEFORE the status callbacks, so they see the resolved row', async () => {
      mockFetchPending.mockReturnValueOnce([makeItem({ entity_type: 'issue' })]);
      const order: string[] = [];

      await makeManager(makeHttpClient('CONFLICT_FLAGGED'), 'tok', {
        onResolved: async () => {
          order.push('onResolved');
        },
        onConflict: () => order.push('onConflict'),
      }).processQueue();

      expect(order).toEqual(['onResolved', 'onConflict']);
    });

    it('is optional - absence is not an error', async () => {
      mockFetchPending.mockReturnValueOnce([makeItem()]);
      await expect(makeManager(makeHttpClient()).processQueue()).resolves.toEqual(
        expect.objectContaining({ synced: 1 }),
      );
    });
  });
});

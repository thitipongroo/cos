// runPushSync orchestrates SyncManager + PhotoUploadQueue over mocked modules. The individual pieces
// (conflict resolution, enqueue-on-upload, the upload queue) are unit-tested in their own specs; here
// we assert the wiring: queue drains BEFORE photos upload, and the annotation callbacks are hooked.

const mockProcessQueue = jest
  .fn()
  .mockResolvedValue({ synced: 0, failed: 0, exhausted: 0, interrupted: false });
const mockProcessAll = jest.fn().mockResolvedValue(undefined);
let capturedManagerCallbacks: Record<string, unknown> = {};
let capturedOnUploaded: ((l: string, s: string) => Promise<void>) | undefined;

let capturedGetToken: (() => string | null) | undefined;
jest.mock('../SyncManager', () => ({
  SyncManager: jest.fn().mockImplementation((_http, token, callbacks) => {
    capturedGetToken = token;
    capturedManagerCallbacks = callbacks;
    return { processQueue: mockProcessQueue };
  }),
}));
jest.mock('../PhotoUploadQueue', () => ({
  PhotoUploadQueue: jest.fn().mockImplementation((_repo, _base, _token, onUploaded) => {
    capturedOnUploaded = onUploaded;
    return { processAll: mockProcessAll };
  }),
}));
const mockEnqueueAnnotation = jest.fn().mockResolvedValue(1);
jest.mock('../enqueueAnnotation', () => ({
  enqueueAnnotationForUploadedPhoto: (...args: unknown[]) => mockEnqueueAnnotation(...args),
}));
const mockAddConflict = jest.fn();
const mockMarkSynced = jest.fn().mockResolvedValue(undefined);
const mockFindLocal = jest.fn();
jest.mock('../../db/sync-queue', () => ({ enqueue: jest.fn() }));
jest.mock('../../db/photoRepo', () => ({
  photoRepo: {},
  findLocalPhotoByServerFileId: (...a: unknown[]) => mockFindLocal(...a),
}));
jest.mock('../../db/annotationRepo', () => ({
  getAnnotation: jest.fn(),
  markAnnotationSynced: (...a: unknown[]) => mockMarkSynced(...a),
}));
const mockApiPost = jest.fn().mockResolvedValue({});
jest.mock('../../api/client', () => ({
  apiClient: { post: (...a: unknown[]) => mockApiPost(...a) },
}));
jest.mock('../../store/authStore', () => ({
  useAuthStore: { getState: () => ({ accessToken: 'tok' }) },
}));
jest.mock('../../store/offlineStore', () => ({
  useOfflineStore: { getState: () => ({ addConflict: mockAddConflict }) },
}));
const mockSetError = jest.fn();
jest.mock('../../store/syncStore', () => ({
  useSyncStore: { getState: () => ({ setError: mockSetError }) },
}));
const mockSetSyncStatusByKey = jest.fn().mockResolvedValue(undefined);
jest.mock('../../db/database', () => ({
  setSyncStatusByKey: (...a: unknown[]) => mockSetSyncStatusByKey(...a),
}));

import { runPushSync } from '../runPushSync';

describe('runPushSync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedManagerCallbacks = {};
    capturedOnUploaded = undefined;
  });

  it('supplies the auth token from the store to the sync clients', async () => {
    await runPushSync();
    expect(capturedGetToken!()).toBe('tok');
  });

  it('drains the queue before uploading photos (§17.6 media last)', async () => {
    const order: string[] = [];
    mockProcessQueue.mockImplementation(async () => {
      order.push('queue');
      return { synced: 0, failed: 0, exhausted: 0 };
    });
    mockProcessAll.mockImplementation(async () => {
      order.push('photos');
    });

    await runPushSync();

    expect(order).toEqual(['queue', 'photos']);
  });

  it('routes a photo upload into the annotation enqueue hook', async () => {
    await runPushSync();
    await capturedOnUploaded!('local-1', 'server-9');

    expect(mockEnqueueAnnotation).toHaveBeenCalledWith(
      'local-1',
      'server-9',
      expect.objectContaining({ getAnnotation: expect.anything(), enqueue: expect.anything() }),
    );
  });

  it('onConflict records the conflict in the offline store', async () => {
    await runPushSync();
    (capturedManagerCallbacks['onConflict'] as (a: string, b: string, c: unknown) => void)(
      'photo_annotation',
      'server-9',
      { version: 5 },
    );
    expect(mockAddConflict).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'photo_annotation', entityId: 'server-9' }),
    );
  });

  describe('onAccepted', () => {
    const onAccepted = () =>
      capturedManagerCallbacks['onAccepted'] as (a: string, b: string, c: unknown) => Promise<void>;

    it('clears a photo_annotation locally with the server version', async () => {
      mockFindLocal.mockResolvedValue('local-1');
      await runPushSync();
      await onAccepted()('photo_annotation', 'server-9', { version: 3 });

      expect(mockFindLocal).toHaveBeenCalledWith('server-9');
      expect(mockMarkSynced).toHaveBeenCalledWith('local-1', 3);
    });

    it('ignores non-annotation entity types', async () => {
      await runPushSync();
      await onAccepted()('issue', 'x', { version: 3 });
      expect(mockMarkSynced).not.toHaveBeenCalled();
    });

    it('ignores a payload without a numeric version', async () => {
      await runPushSync();
      await onAccepted()('photo_annotation', 'server-9', null);
      expect(mockMarkSynced).not.toHaveBeenCalled();
    });

    it('does nothing when the server file id maps to no local photo', async () => {
      mockFindLocal.mockResolvedValue(null);
      await runPushSync();
      await onAccepted()('photo_annotation', 'server-9', { version: 3 });
      expect(mockMarkSynced).not.toHaveBeenCalled();
    });
  });

  // The verdict reaches the local row. `onResolved` closes the loop ConflictHandler used to compute
  // and SyncManager used to drop - the row that produced a mutation kept sync_status PENDING
  // whatever the server answered.
  describe('onResolved writes the verdict back', () => {
    it('maps a pushed entity type to its local table and writes the status', async () => {
      await runPushSync();
      const onResolved = capturedManagerCallbacks['onResolved'] as (
        t: string,
        id: string,
        r: { localSyncStatus: string; payload: unknown },
      ) => Promise<void>;

      await onResolved('issue', 'client-uuid-1', { localSyncStatus: 'SYNCED', payload: {} });

      expect(mockSetSyncStatusByKey).toHaveBeenCalledWith(
        'local_issues',
        'issueId',
        'client-uuid-1',
        'SYNCED',
      );
    });

    it('writes CONFLICT for a flagged row', async () => {
      await runPushSync();
      const onResolved = capturedManagerCallbacks['onResolved'] as (
        t: string,
        id: string,
        r: { localSyncStatus: string; payload: unknown },
      ) => Promise<void>;

      await onResolved('safety', 'inc-1', { localSyncStatus: 'CONFLICT', payload: {} });

      expect(mockSetSyncStatusByKey).toHaveBeenCalledWith(
        'local_incidents',
        'incidentId',
        'inc-1',
        'CONFLICT',
      );
    });

    it('does nothing for an entity type with no local row to update', async () => {
      // `material` enqueues under the parent report's id and writes no local consumption row;
      // `inspection` has no local table at all. Guessing at a target would corrupt an unrelated row.
      await runPushSync();
      const onResolved = capturedManagerCallbacks['onResolved'] as (
        t: string,
        id: string,
        r: { localSyncStatus: string; payload: unknown },
      ) => Promise<void>;

      await onResolved('material', 'report-1', { localSyncStatus: 'SYNCED', payload: {} });
      await onResolved('inspection', 'checklist-1', { localSyncStatus: 'SYNCED', payload: {} });

      expect(mockSetSyncStatusByKey).not.toHaveBeenCalled();
    });
  });

  describe('the user hears about a change that did not stick', () => {
    it('records a REJECTED push as a conflict, the surface ConflictBadge already counts', async () => {
      await runPushSync();
      const onRejected = capturedManagerCallbacks['onRejected'] as (
        t: string,
        id: string,
        p: unknown,
      ) => void;

      onRejected('issue', 'i-9', { server: true });

      expect(mockAddConflict).toHaveBeenCalledWith(
        expect.objectContaining({ entityType: 'issue', entityId: 'i-9' }),
      );
    });

    it('passes a translation KEY to the store, never a finished sentence', async () => {
      await runPushSync();
      const onUserNotify = capturedManagerCallbacks['onUserNotify'] as (k: string) => void;

      onUserNotify('sync.conflict.rejected');

      expect(mockSetError).toHaveBeenCalledWith('sync.conflict.rejected');
    });
  });

  describe('a cycle cut short by the network', () => {
    it("does not run the photo queue - each failure would spend one of a photo's three attempts", async () => {
      mockProcessQueue.mockResolvedValueOnce({
        synced: 0,
        failed: 0,
        exhausted: 0,
        interrupted: true,
      });

      await runPushSync();

      expect(mockProcessAll).not.toHaveBeenCalled();
    });

    it('runs the photo queue on a normal cycle', async () => {
      await runPushSync();
      expect(mockProcessAll).toHaveBeenCalledTimes(1);
    });
  });

  describe('retry exhaustion reaches the server (§17.2 / OQ-38)', () => {
    // THE defect this guards: SyncManager routed the four review-queue entity types to
    // `callbacks.onExhausted`, and runPushSync — the only production construction of SyncManager —
    // supplied onConflict, onRejected and onUserNotify and NOT onExhausted. So a safety incident that
    // failed to sync five times escalated to nobody, on a code path with 100% branch coverage.
    const onExhausted = () =>
      capturedManagerCallbacks['onExhausted'] as (i: typeof item) => Promise<void>;

    const item = {
      id: 7,
      entity_type: 'safety_incidents',
      entity_id: 'inc-1',
      operation: 'CREATE' as const,
      payload: JSON.stringify({ title: 'Scaffold collapse', severity: 'CRITICAL' }),
      status: 'FAILED' as const,
      retry_count: 5,
      client_submitted_at: '2026-08-22T03:00:00Z',
      last_attempt_at: '2026-08-22T04:00:00Z',
      error_message: 'Network request failed',
    };

    it('supplies an onExhausted callback at all', async () => {
      await runPushSync();
      expect(capturedManagerCallbacks['onExhausted']).toBeDefined();
    });

    it('posts the whole record to /sync/exhausted, payload parsed', async () => {
      await runPushSync();
      await onExhausted()(item);

      expect(mockApiPost).toHaveBeenCalledWith('/sync/exhausted', {
        entity_type: 'safety_incidents',
        entity_id: 'inc-1',
        operation: 'CREATE',
        // Parsed, not the raw JSON string: sync_queue stores text, the server column is jsonb.
        payload: { title: 'Scaffold collapse', severity: 'CRITICAL' },
        client_submitted_at: '2026-08-22T03:00:00Z',
        last_error: 'Network request failed',
      });
    });

    it('does not throw when the report itself fails — the device already lost the network', async () => {
      mockApiPost.mockRejectedValueOnce(new Error('still offline'));
      await runPushSync();

      await expect(onExhausted()(item)).resolves.toBeUndefined();
      expect(mockSetError).toHaveBeenCalledWith('sync.exhausted.report_failed');
    });
  });
});

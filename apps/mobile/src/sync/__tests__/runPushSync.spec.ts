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
jest.mock('../../api/client', () => ({ apiClient: {}, post: jest.fn() }));
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
});

describe('runPushSync — §17.2 exhaustion reporting', () => {
  const getPost = (): jest.Mock =>
    (jest.requireMock('../../api/client') as { post: jest.Mock }).post;

  beforeEach(() => {
    getPost().mockReset();
    getPost().mockResolvedValue({ item_id: 'row-1' });
  });

  it('reports an exhausted item to the server', async () => {
    // The callback had no implementation at all before 2026-08-23: SyncManager guarded every call
    // with `if (this.callbacks.onExhausted)`, so a safety incident abandoned after five attempts
    // told nobody — not the device, not the review queue, not the PM.
    await runPushSync();
    const onExhausted = capturedManagerCallbacks['onExhausted'] as (
      a: string,
      b: string,
      c: string,
    ) => Promise<void>;
    expect(onExhausted).toBeDefined();

    await onExhausted('safety', 'entity-1', 'CREATE');

    expect(getPost()).toHaveBeenCalledWith(
      '/sync/exhausted',
      expect.objectContaining({
        entity_type: 'safety',
        entity_id: 'entity-1',
        operation: 'CREATE',
        client_id: 'entity-1',
      }),
    );
  });

  it('swallows a failed report rather than aborting the queue drain', async () => {
    // The device is offline — which is WHY the item exhausted. Throwing here would abandon the rest
    // of the queue over a notification, and the row is preserved either way, so the next cycle
    // reports it again.
    getPost().mockRejectedValue(new Error('offline'));
    await runPushSync();
    const onExhausted = capturedManagerCallbacks['onExhausted'] as (
      a: string,
      b: string,
      c: string,
    ) => Promise<void>;

    await expect(onExhausted('safety', 'entity-1', 'CREATE')).resolves.toBeUndefined();
  });
});

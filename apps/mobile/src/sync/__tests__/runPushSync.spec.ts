// runPushSync orchestrates SyncManager + PhotoUploadQueue over mocked modules. The individual pieces
// (conflict resolution, enqueue-on-upload, the upload queue) are unit-tested in their own specs; here
// we assert the wiring: queue drains BEFORE photos upload, and the annotation callbacks are hooked.

const mockProcessQueue = jest.fn().mockResolvedValue({ synced: 0, failed: 0, exhausted: 0 });
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
jest.mock('../../api/client', () => ({ apiClient: {} }));
jest.mock('../../store/authStore', () => ({
  useAuthStore: { getState: () => ({ accessToken: 'tok' }) },
}));
jest.mock('../../store/offlineStore', () => ({
  useOfflineStore: { getState: () => ({ addConflict: mockAddConflict }) },
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
});

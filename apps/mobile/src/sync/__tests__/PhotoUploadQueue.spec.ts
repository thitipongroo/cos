import { PhotoUploadQueue } from '../PhotoUploadQueue';
import type { PhotoRepository, PendingPhoto } from '../PhotoUploadQueue';
// Import from the same `/legacy` subpath the source uses (SDK 54+); the jest moduleNameMapper
// maps both `expo-file-system` and `expo-file-system/legacy` to the same mock.
import * as FileSystem from 'expo-file-system/legacy';

const BASE_URL = 'https://api.example.com';

const makePhoto = (localId = 'photo-1', retryCount = 0): PendingPhoto => ({
  localId,
  localPath: '/cache/photo-1.jpg',
  entityType: 'site_report',
  entityId: 'entity-1',
  retryCount,
});

const makeRepo = (photos: PendingPhoto[] = []): jest.Mocked<PhotoRepository> => ({
  getPendingPhotos: jest.fn().mockResolvedValue(photos),
  markUploading: jest.fn().mockResolvedValue(undefined),
  markUploaded: jest.fn().mockResolvedValue(undefined),
  markPending: jest.fn().mockResolvedValue(undefined),
  markFailed: jest.fn().mockResolvedValue(undefined),
});

describe('PhotoUploadQueue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('processNext', () => {
    it('does nothing when there are no pending photos', async () => {
      const repo = makeRepo([]);
      const queue = new PhotoUploadQueue(repo, BASE_URL, () => 'token');
      await queue.processNext();
      expect(FileSystem.uploadAsync).not.toHaveBeenCalled();
    });

    it('uploads the first pending photo', async () => {
      const repo = makeRepo([makePhoto()]);
      const queue = new PhotoUploadQueue(repo, BASE_URL, () => 'token');
      await queue.processNext();
      expect(FileSystem.uploadAsync).toHaveBeenCalledTimes(1);
      expect(repo.markUploading).toHaveBeenCalledWith('photo-1');
      expect(repo.markUploaded).toHaveBeenCalledWith('photo-1', 'server-file-id');
    });

    it('fires the onUploaded hook with the server file id after a successful upload', async () => {
      const repo = makeRepo([makePhoto()]);
      const onUploaded = jest.fn().mockResolvedValue(undefined);
      const queue = new PhotoUploadQueue(repo, BASE_URL, () => 'token', onUploaded);
      await queue.processNext();
      expect(onUploaded).toHaveBeenCalledWith('photo-1', 'server-file-id');
    });

    it('swallows an onUploaded failure — the upload itself still succeeds', async () => {
      const repo = makeRepo([makePhoto()]);
      const onUploaded = jest.fn().mockRejectedValue(new Error('enqueue failed'));
      const queue = new PhotoUploadQueue(repo, BASE_URL, () => 'token', onUploaded);
      await expect(queue.processNext()).resolves.toBeUndefined();
      expect(repo.markUploaded).toHaveBeenCalledWith('photo-1', 'server-file-id');
    });

    it('includes Authorization header when token is present', async () => {
      const repo = makeRepo([makePhoto()]);
      const queue = new PhotoUploadQueue(repo, BASE_URL, () => 'my-token');
      await queue.processNext();
      const [, , opts] = (FileSystem.uploadAsync as jest.Mock).mock.calls[0] as [
        string,
        string,
        { headers: Record<string, string> },
      ];
      expect(opts.headers['Authorization']).toBe('Bearer my-token');
    });

    it('omits Authorization header when token is null', async () => {
      const repo = makeRepo([makePhoto()]);
      const queue = new PhotoUploadQueue(repo, BASE_URL, () => null);
      await queue.processNext();
      const [, , opts] = (FileSystem.uploadAsync as jest.Mock).mock.calls[0] as [
        string,
        string,
        { headers: Record<string, string> },
      ];
      expect(opts.headers['Authorization']).toBeUndefined();
    });
  });

  describe('processAll', () => {
    it('uploads all pending photos in order', async () => {
      const photos = [makePhoto('p1'), makePhoto('p2')];
      const repo = makeRepo(photos);
      const queue = new PhotoUploadQueue(repo, BASE_URL, () => 'token');
      await queue.processAll();
      expect(FileSystem.uploadAsync).toHaveBeenCalledTimes(2);
      expect(repo.markUploaded).toHaveBeenCalledWith('p1', 'server-file-id');
      expect(repo.markUploaded).toHaveBeenCalledWith('p2', 'server-file-id');
    });
  });

  // The regression that motivated this whole shape (2026-08-19). A failed upload used to leave the
  // row in UPLOADING, which `getPendingPhotos` (PENDING only) never selects again — one failure
  // stranded a site photo on the device permanently. Nothing may leave a photo in UPLOADING.
  describe('a failed upload always leaves the row actionable', () => {
    it('returns the photo to PENDING with the attempt recorded', async () => {
      (FileSystem.uploadAsync as jest.Mock).mockRejectedValueOnce(new Error('upload failed'));
      const repo = makeRepo([makePhoto('photo-1', 0)]);
      await new PhotoUploadQueue(repo, BASE_URL, () => 'token').processNext();

      expect(repo.markPending).toHaveBeenCalledWith('photo-1', 1);
      expect(repo.markFailed).not.toHaveBeenCalled();
    });

    it('counts attempts from the ROW, so the budget survives a new queue instance', async () => {
      // runPushSync builds a fresh PhotoUploadQueue every cycle. The old in-memory Map reset to zero
      // each time, so MAX_RETRIES was unreachable and a doomed photo retried forever.
      (FileSystem.uploadAsync as jest.Mock).mockRejectedValue(new Error('upload failed'));

      const first = makeRepo([makePhoto('photo-1', 0)]);
      await new PhotoUploadQueue(first, BASE_URL, () => 'token').processNext();
      expect(first.markPending).toHaveBeenCalledWith('photo-1', 1);

      const second = makeRepo([makePhoto('photo-1', 1)]);
      await new PhotoUploadQueue(second, BASE_URL, () => 'token').processNext();
      expect(second.markPending).toHaveBeenCalledWith('photo-1', 2);

      const third = makeRepo([makePhoto('photo-1', 2)]);
      await new PhotoUploadQueue(third, BASE_URL, () => 'token').processNext();
      expect(third.markFailed).toHaveBeenCalledWith('photo-1');
      expect(third.markPending).not.toHaveBeenCalled();
    });
  });

  // uploadAsync RESOLVES on a 4xx/5xx rather than throwing, so the status has to be read. A rejected
  // upload used to be marked UPLOADED with an empty file_id — the bytes never left the device, and
  // nothing recorded that.
  describe('a non-2xx response is not an upload', () => {
    it('does not mark uploaded on a 500, and retries', async () => {
      (FileSystem.uploadAsync as jest.Mock).mockResolvedValueOnce({
        status: 500,
        body: 'upstream exploded',
      });
      const repo = makeRepo([makePhoto()]);
      await new PhotoUploadQueue(repo, BASE_URL, () => 'token').processNext();

      expect(repo.markUploaded).not.toHaveBeenCalled();
      expect(repo.markPending).toHaveBeenCalledWith('photo-1', 1);
    });

    it('fails a 413 immediately — a file this size will never be accepted', async () => {
      (FileSystem.uploadAsync as jest.Mock).mockResolvedValueOnce({
        status: 413,
        body: 'too large',
      });
      const repo = makeRepo([makePhoto()]);
      await new PhotoUploadQueue(repo, BASE_URL, () => 'token').processNext();

      expect(repo.markFailed).toHaveBeenCalledWith('photo-1');
      expect(repo.markPending).not.toHaveBeenCalled();
    });

    it('retries a 429 rather than discarding — the server asked us to come back', async () => {
      (FileSystem.uploadAsync as jest.Mock).mockResolvedValueOnce({
        status: 429,
        body: 'slow down',
      });
      const repo = makeRepo([makePhoto()]);
      await new PhotoUploadQueue(repo, BASE_URL, () => 'token').processNext();

      expect(repo.markPending).toHaveBeenCalledWith('photo-1', 1);
      expect(repo.markFailed).not.toHaveBeenCalled();
    });

    it('treats a 2xx carrying no file_id as a failure, not an upload', async () => {
      (FileSystem.uploadAsync as jest.Mock).mockResolvedValueOnce({ status: 200, body: '{}' });
      const repo = makeRepo([makePhoto()]);
      const onUploaded = jest.fn().mockResolvedValue(undefined);
      await new PhotoUploadQueue(repo, BASE_URL, () => 'token', onUploaded).processNext();

      expect(repo.markUploaded).not.toHaveBeenCalled();
      expect(onUploaded).not.toHaveBeenCalled();
      expect(repo.markPending).toHaveBeenCalledWith('photo-1', 1);
    });

    it('treats an unparseable body as a failure', async () => {
      (FileSystem.uploadAsync as jest.Mock).mockResolvedValueOnce({
        status: 200,
        body: '<html>gateway</html>',
      });
      const repo = makeRepo([makePhoto()]);
      await new PhotoUploadQueue(repo, BASE_URL, () => 'token').processNext();

      expect(repo.markUploaded).not.toHaveBeenCalled();
      expect(repo.markPending).toHaveBeenCalledWith('photo-1', 1);
    });
  });
});

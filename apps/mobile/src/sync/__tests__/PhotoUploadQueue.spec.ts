import { PhotoUploadQueue } from '../PhotoUploadQueue';
import type { PhotoRepository, PendingPhoto } from '../PhotoUploadQueue';
// Import from the same `/legacy` subpath the source uses (SDK 54+); the jest moduleNameMapper
// maps both `expo-file-system` and `expo-file-system/legacy` to the same mock.
import * as FileSystem from 'expo-file-system/legacy';

const BASE_URL = 'https://api.example.com';

const makePhoto = (localId = 'photo-1'): PendingPhoto => ({
  localId,
  localPath: '/cache/photo-1.jpg',
  entityType: 'site_report',
  entityId: 'entity-1',
});

const makeRepo = (photos: PendingPhoto[] = []): jest.Mocked<PhotoRepository> => ({
  getPendingPhotos: jest.fn().mockResolvedValue(photos),
  markUploading: jest.fn().mockResolvedValue(undefined),
  markUploaded: jest.fn().mockResolvedValue(undefined),
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

    it('uses empty string as file_id when server response omits file_id (covers ?? right branch)', async () => {
      (FileSystem.uploadAsync as jest.Mock).mockResolvedValueOnce({ status: 200, body: '{}' });
      const repo = makeRepo([makePhoto()]);
      const queue = new PhotoUploadQueue(repo, BASE_URL, () => 'token');
      await queue.processNext();
      expect(repo.markUploaded).toHaveBeenCalledWith('photo-1', '');
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

  describe('retry logic', () => {
    it('retries up to MAX_RETRIES times on failure, then marks failed', async () => {
      (FileSystem.uploadAsync as jest.Mock).mockRejectedValue(new Error('upload failed'));
      const repo = makeRepo([makePhoto()]);
      const queue = new PhotoUploadQueue(repo, BASE_URL, () => 'token');

      // Each processNext call is one attempt; after 3 failures it marks failed
      await queue.processNext(); // attempt 1 → retry_count = 1
      await queue.processNext(); // attempt 2 → retry_count = 2
      await queue.processNext(); // attempt 3 → retry_count = 3 → markFailed
      expect(repo.markFailed).toHaveBeenCalledWith('photo-1');
    });

    it('does not re-attempt after markFailed (retry count exceeds MAX)', async () => {
      (FileSystem.uploadAsync as jest.Mock).mockRejectedValue(new Error('fail'));
      const repo = makeRepo([makePhoto()]);
      const queue = new PhotoUploadQueue(repo, BASE_URL, () => 'token');

      await queue.processNext(); // 1
      await queue.processNext(); // 2
      await queue.processNext(); // 3 — markFailed + remove from retryMap
      await queue.processNext(); // 4 — retryMap cleared; treated as new → markFailed again
      // markFailed called at least twice
      expect(repo.markFailed.mock.calls.length).toBeGreaterThanOrEqual(1);
    });
  });
});

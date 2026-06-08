import { createFileCleanupActivities } from '../cleanup/file-cleanup.activities';
import type { DbService } from '../services/db.service';
import type { MinioService } from '../services/minio.service';
import type { OpenSearchService } from '../services/opensearch.service';

const EXPIRED_ROW = {
  file_id: 'fid-1',
  tenant_id: 'tid-1',
  stored_key: 'key/test.jpg',
  original_filename: 'test.jpg',
  bucket_name: 'cos-tid-1',
  mime_type: 'image/jpeg',
  file_size_bytes: '1024',
  file_status: 'CLEAN' as const,
  uploaded_by: 'uid-1',
  uploaded_at: new Date(),
  deleted_at: new Date(),
  quarantined_at: null,
};

const QUARANTINE_ROW = {
  ...EXPIRED_ROW,
  file_id: 'fid-q1',
  file_status: 'QUARANTINED' as const,
  deleted_at: null,
  quarantined_at: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
};

function makeMocks() {
  const db = {
    findExpiredFiles: jest.fn(),
    hardDeleteFile: jest.fn().mockResolvedValue(undefined),
    findExpiredQuarantinedFiles: jest.fn(),
  } as unknown as DbService;

  const minio = {
    deleteFile: jest.fn().mockResolvedValue(undefined),
    deleteFromQuarantine: jest.fn().mockResolvedValue(undefined),
  } as unknown as MinioService;

  const opensearch = {
    deleteFileIndex: jest.fn().mockResolvedValue(undefined),
  } as unknown as OpenSearchService;

  return { db, minio, opensearch };
}

describe('createFileCleanupActivities', () => {
  describe('findExpiredFiles', () => {
    it('returns array of file IDs', async () => {
      const { db, minio, opensearch } = makeMocks();
      (db.findExpiredFiles as jest.Mock).mockResolvedValue([EXPIRED_ROW]);
      const activities = createFileCleanupActivities(db, minio, opensearch);
      const ids = await activities.findExpiredFiles();
      expect(ids).toEqual(['fid-1']);
    });

    it('returns empty array when no expired files', async () => {
      const { db, minio, opensearch } = makeMocks();
      (db.findExpiredFiles as jest.Mock).mockResolvedValue([]);
      const activities = createFileCleanupActivities(db, minio, opensearch);
      expect(await activities.findExpiredFiles()).toEqual([]);
    });
  });

  describe('hardDeleteFile', () => {
    it('deletes from MinIO, OpenSearch, then DB', async () => {
      const { db, minio, opensearch } = makeMocks();
      (db.findExpiredFiles as jest.Mock).mockResolvedValue([EXPIRED_ROW]);
      const activities = createFileCleanupActivities(db, minio, opensearch);

      await activities.hardDeleteFile('fid-1');

      expect(minio.deleteFile).toHaveBeenCalledWith('tid-1', 'key/test.jpg');
      expect(opensearch.deleteFileIndex).toHaveBeenCalledWith('tid-1', 'fid-1');
      expect(db.hardDeleteFile).toHaveBeenCalledWith('fid-1');
    });

    it('is idempotent — no-op when file not in expired list', async () => {
      const { db, minio, opensearch } = makeMocks();
      (db.findExpiredFiles as jest.Mock).mockResolvedValue([]);
      const activities = createFileCleanupActivities(db, minio, opensearch);

      await activities.hardDeleteFile('missing-id');

      expect(minio.deleteFile).not.toHaveBeenCalled();
      expect(db.hardDeleteFile).not.toHaveBeenCalled();
    });

    it('continues when MinIO delete fails (logs warning only)', async () => {
      const { db, minio, opensearch } = makeMocks();
      (db.findExpiredFiles as jest.Mock).mockResolvedValue([EXPIRED_ROW]);
      (minio.deleteFile as jest.Mock).mockRejectedValue(new Error('minio error'));
      const activities = createFileCleanupActivities(db, minio, opensearch);

      await expect(activities.hardDeleteFile('fid-1')).resolves.toBeUndefined();
      expect(db.hardDeleteFile).toHaveBeenCalledWith('fid-1');
    });

    it('continues when OpenSearch delete fails (logs warning only)', async () => {
      const { db, minio, opensearch } = makeMocks();
      (db.findExpiredFiles as jest.Mock).mockResolvedValue([EXPIRED_ROW]);
      (opensearch.deleteFileIndex as jest.Mock).mockRejectedValue(new Error('os error'));
      const activities = createFileCleanupActivities(db, minio, opensearch);

      await expect(activities.hardDeleteFile('fid-1')).resolves.toBeUndefined();
      expect(db.hardDeleteFile).toHaveBeenCalledWith('fid-1');
    });
  });

  describe('findExpiredQuarantinedFiles', () => {
    it('returns array of quarantined file IDs past 30-day retention', async () => {
      const { db, minio, opensearch } = makeMocks();
      (db.findExpiredQuarantinedFiles as jest.Mock).mockResolvedValue([QUARANTINE_ROW]);
      const activities = createFileCleanupActivities(db, minio, opensearch);
      const ids = await activities.findExpiredQuarantinedFiles();
      expect(ids).toEqual(['fid-q1']);
    });

    it('returns empty array when no expired quarantined files', async () => {
      const { db, minio, opensearch } = makeMocks();
      (db.findExpiredQuarantinedFiles as jest.Mock).mockResolvedValue([]);
      const activities = createFileCleanupActivities(db, minio, opensearch);
      expect(await activities.findExpiredQuarantinedFiles()).toEqual([]);
    });
  });

  describe('purgeQuarantinedFile', () => {
    it('deletes from quarantine bucket, OpenSearch, then DB', async () => {
      const { db, minio, opensearch } = makeMocks();
      (db.findExpiredQuarantinedFiles as jest.Mock).mockResolvedValue([QUARANTINE_ROW]);
      const activities = createFileCleanupActivities(db, minio, opensearch);

      await activities.purgeQuarantinedFile('fid-q1');

      expect(minio.deleteFromQuarantine).toHaveBeenCalledWith('tid-1', 'key/test.jpg');
      expect(opensearch.deleteFileIndex).toHaveBeenCalledWith('tid-1', 'fid-q1');
      expect(db.hardDeleteFile).toHaveBeenCalledWith('fid-q1');
    });

    it('is idempotent — no-op when file not in expired quarantine list', async () => {
      const { db, minio, opensearch } = makeMocks();
      (db.findExpiredQuarantinedFiles as jest.Mock).mockResolvedValue([]);
      const activities = createFileCleanupActivities(db, minio, opensearch);

      await activities.purgeQuarantinedFile('missing-id');

      expect(minio.deleteFromQuarantine).not.toHaveBeenCalled();
      expect(db.hardDeleteFile).not.toHaveBeenCalled();
    });

    it('continues when quarantine MinIO delete fails (logs warning only)', async () => {
      const { db, minio, opensearch } = makeMocks();
      (db.findExpiredQuarantinedFiles as jest.Mock).mockResolvedValue([QUARANTINE_ROW]);
      (minio.deleteFromQuarantine as jest.Mock).mockRejectedValue(new Error('minio error'));
      const activities = createFileCleanupActivities(db, minio, opensearch);

      await expect(activities.purgeQuarantinedFile('fid-q1')).resolves.toBeUndefined();
      expect(db.hardDeleteFile).toHaveBeenCalledWith('fid-q1');
    });

    it('continues when quarantine OpenSearch delete fails (logs warning only)', async () => {
      const { db, minio, opensearch } = makeMocks();
      (db.findExpiredQuarantinedFiles as jest.Mock).mockResolvedValue([QUARANTINE_ROW]);
      (opensearch.deleteFileIndex as jest.Mock).mockRejectedValue(new Error('os error'));
      const activities = createFileCleanupActivities(db, minio, opensearch);

      await expect(activities.purgeQuarantinedFile('fid-q1')).resolves.toBeUndefined();
      expect(db.hardDeleteFile).toHaveBeenCalledWith('fid-q1');
    });
  });
});

import { DbService } from '../services/db.service';
import type { FileServiceConfig } from '../config';

const mockQuery = jest.fn();
const mockEnd = jest.fn().mockResolvedValue(undefined);

jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => ({ query: mockQuery, end: mockEnd })),
}));

const config = {
  database: { url: 'postgresql://test' },
} as FileServiceConfig;

const FILE_ROW = {
  file_id: 'fid-1',
  tenant_id: 'tid-1',
  original_filename: 'test.jpg',
  stored_key: '2026/01/fid-1/test.jpg',
  bucket_name: 'cos-tid-1',
  mime_type: 'image/jpeg',
  file_size_bytes: '1024',
  file_status: 'CLEAN' as const,
  uploaded_by: 'uid-1',
  uploaded_at: new Date(),
  deleted_at: null,
  quarantined_at: null,
};

describe('DbService', () => {
  let db: DbService;

  beforeEach(() => {
    jest.clearAllMocks();
    db = new DbService(config);
  });

  describe('insertFile', () => {
    it('inserts and returns the row', async () => {
      mockQuery.mockResolvedValue({ rows: [FILE_ROW] });
      const result = await db.insertFile({
        fileId: 'fid-1',
        tenantId: 'tid-1',
        originalFilename: 'test.jpg',
        storedKey: '2026/01/fid-1/test.jpg',
        bucketName: 'cos-tid-1',
        mimeType: 'image/jpeg',
        fileSizeBytes: 1024,
        uploadedBy: 'uid-1',
      });
      expect(result.file_id).toBe('fid-1');
      expect(mockQuery).toHaveBeenCalledTimes(1);
      // defaults: is_archive=false, parent_file_id=null
      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([false, null]),
      );
    });

    it('inserts an archive child with is_archive and parent_file_id set', async () => {
      mockQuery.mockResolvedValue({ rows: [FILE_ROW] });
      await db.insertFile({
        fileId: 'child-1',
        tenantId: 'tid-1',
        originalFilename: 'a.jpg',
        storedKey: '2026/07/child-1/a.jpg',
        bucketName: 'cos-tid-1',
        mimeType: 'image/jpeg',
        fileSizeBytes: 10,
        uploadedBy: 'uid-1',
        isArchive: true,
        parentFileId: 'archive-1',
      });
      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([true, 'archive-1']),
      );
    });
  });

  describe('markArchiveExtracted', () => {
    it('sets extracted_at for the archive', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });
      await db.markArchiveExtracted('archive-1');
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('extracted_at = now()'), [
        'archive-1',
      ]);
    });
  });

  describe('insertFile derives category', () => {
    it('stores the mime-derived category', async () => {
      mockQuery.mockResolvedValue({ rows: [FILE_ROW] });
      await db.insertFile({
        fileId: 'fid-1',
        tenantId: 'tid-1',
        originalFilename: 'plan.dwg',
        storedKey: 'k',
        bucketName: 'cos-tid-1',
        mimeType: 'image/vnd.dwg',
        fileSizeBytes: 1,
        uploadedBy: 'uid-1',
      });
      expect(mockQuery).toHaveBeenCalledWith(expect.any(String), expect.arrayContaining(['cad']));
    });
  });

  describe('retention + legal hold', () => {
    it('findExpiredFiles excludes files under legal hold', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      await db.findExpiredFiles();
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('legal_hold = false'));
    });

    it('findExpiredQuarantinedFiles excludes files under legal hold', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      await db.findExpiredQuarantinedFiles();
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('legal_hold = false'));
    });

    it('findFilesPastRetention joins retention_policies by category', async () => {
      mockQuery.mockResolvedValue({ rows: [FILE_ROW] });
      const rows = await db.findFilesPastRetention();
      expect(rows).toHaveLength(1);
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('retention_policies'));
    });

    it('softDeleteFileAdmin sets deleted_at without tenant scoping', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });
      await db.softDeleteFileAdmin('fid-1');
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('deleted_at = now()'), [
        'fid-1',
      ]);
    });

    it('setLegalHold returns true when a row is updated', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });
      expect(await db.setLegalHold('fid-1', 'tid-1', 'litigation', 'admin-1')).toBe(true);
    });

    it('setLegalHold returns false when no row matches (nullish rowCount)', async () => {
      mockQuery.mockResolvedValue({});
      expect(await db.setLegalHold('missing', 'tid-1', 'r', 'admin-1')).toBe(false);
    });

    it('releaseLegalHold returns true when a row is updated', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });
      expect(await db.releaseLegalHold('fid-1', 'tid-1')).toBe(true);
    });

    it('releaseLegalHold returns false when no row matches (nullish rowCount)', async () => {
      mockQuery.mockResolvedValue({});
      expect(await db.releaseLegalHold('missing', 'tid-1')).toBe(false);
    });

    it('upsertRetentionPolicy returns the persisted policy', async () => {
      const policy = { policy_id: 'p1', tenant_id: 'tid-1', category: 'image', retention_days: 90 };
      mockQuery.mockResolvedValue({ rows: [policy] });
      const result = await db.upsertRetentionPolicy('tid-1', 'image', 90);
      expect(result).toEqual(policy);
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT'), [
        'tid-1',
        'image',
        90,
      ]);
    });

    it('listRetentionPolicies returns the tenant policies', async () => {
      mockQuery.mockResolvedValue({ rows: [{ category: 'image' }] });
      const rows = await db.listRetentionPolicies('tid-1');
      expect(rows).toHaveLength(1);
    });
  });

  describe('updateFileStatus', () => {
    it('executes UPDATE query', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });
      await db.updateFileStatus('fid-1', 'CLEAN');
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('UPDATE files.files'), [
        'CLEAN',
        'fid-1',
      ]);
    });
  });

  describe('findFileById', () => {
    it('returns row when found', async () => {
      mockQuery.mockResolvedValue({ rows: [FILE_ROW] });
      const result = await db.findFileById('fid-1', 'tid-1');
      expect(result).toEqual(FILE_ROW);
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      const result = await db.findFileById('missing', 'tid-1');
      expect(result).toBeNull();
    });
  });

  describe('softDeleteFile', () => {
    it('returns true when row updated', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });
      expect(await db.softDeleteFile('fid-1', 'tid-1')).toBe(true);
    });

    it('returns false when row not found', async () => {
      mockQuery.mockResolvedValue({ rowCount: 0 });
      expect(await db.softDeleteFile('missing', 'tid-1')).toBe(false);
    });

    it('returns false when rowCount is null (pg edge case)', async () => {
      mockQuery.mockResolvedValue({ rowCount: null });
      expect(await db.softDeleteFile('fid-1', 'tid-1')).toBe(false);
    });
  });

  describe('listFiles', () => {
    it('returns array of rows', async () => {
      mockQuery.mockResolvedValue({ rows: [FILE_ROW] });
      const result = await db.listFiles({ tenantId: 'tid-1', limit: 10, offset: 0 });
      expect(result).toHaveLength(1);
    });
  });

  describe('listFilesByEntity', () => {
    it('returns array of rows for entity', async () => {
      mockQuery.mockResolvedValue({ rows: [FILE_ROW] });
      const result = await db.listFilesByEntity({
        tenantId: 'tid-1',
        entityType: 'site_report',
        entityId: 'eid-1',
      });
      expect(result).toHaveLength(1);
    });
  });

  describe('insertMetadata', () => {
    it('executes INSERT query', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });
      await db.insertMetadata({
        metadataId: 'mid-1',
        fileId: 'fid-1',
        tenantId: 'tid-1',
        entityType: 'site_report',
        entityId: 'eid-1',
      });
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO files.file_metadata'),
        expect.any(Array),
      );
    });
  });

  describe('markFileQuarantined', () => {
    it('sets file_status to QUARANTINED and sets quarantined_at', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });
      await db.markFileQuarantined('fid-1');
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('QUARANTINED'), ['fid-1']);
    });
  });

  describe('findFileByIdAdmin', () => {
    it('returns row without tenant filter', async () => {
      mockQuery.mockResolvedValue({ rows: [FILE_ROW] });
      const result = await db.findFileByIdAdmin('fid-1');
      expect(result).toEqual(FILE_ROW);
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('WHERE file_id = $1'), [
        'fid-1',
      ]);
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      const result = await db.findFileByIdAdmin('missing');
      expect(result).toBeNull();
    });
  });

  describe('findExpiredFiles', () => {
    it('returns expired file rows', async () => {
      mockQuery.mockResolvedValue({ rows: [FILE_ROW] });
      const result = await db.findExpiredFiles();
      expect(result).toHaveLength(1);
    });
  });

  describe('findExpiredQuarantinedFiles', () => {
    it('returns quarantined files past 30-day retention', async () => {
      mockQuery.mockResolvedValue({ rows: [FILE_ROW] });
      const result = await db.findExpiredQuarantinedFiles();
      expect(result).toHaveLength(1);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("file_status = 'QUARANTINED'"),
      );
    });

    it('returns empty array when no expired quarantined files', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      expect(await db.findExpiredQuarantinedFiles()).toEqual([]);
    });
  });

  describe('hardDeleteFile', () => {
    it('deletes metadata then file', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });
      await db.hardDeleteFile('fid-1');
      expect(mockQuery).toHaveBeenCalledTimes(2);
      expect(mockQuery).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('DELETE FROM files.file_metadata'),
        ['fid-1'],
      );
      expect(mockQuery).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('DELETE FROM files.files'),
        ['fid-1'],
      );
    });
  });

  describe('end', () => {
    it('closes the pool', async () => {
      await db.end();
      expect(mockEnd).toHaveBeenCalledTimes(1);
    });
  });
});

import { OpenSearchService } from '../services/opensearch.service';
import type { FileServiceConfig } from '../config';
import type { StoredFileRow } from '../types';

const mockIndex = jest.fn();
const mockDelete = jest.fn();

jest.mock('@opensearch-project/opensearch', () => ({
  Client: jest.fn().mockImplementation(() => ({
    index: mockIndex,
    delete: mockDelete,
  })),
}));

const config = { opensearch: { host: 'http://localhost:9200' } } as FileServiceConfig;

const FILE_ROW: StoredFileRow = {
  file_id: 'fid-1',
  tenant_id: 'tid-1',
  original_filename: 'test.jpg',
  stored_key: 'key',
  bucket_name: 'cos-tid-1',
  mime_type: 'image/jpeg',
  file_size_bytes: '1024',
  file_status: 'CLEAN',
  uploaded_by: 'uid-1',
  uploaded_at: new Date('2026-01-01'),
  deleted_at: null,
  quarantined_at: null,
  is_archive: false,
  extracted_at: null,
  parent_file_id: null,
  category: 'image',
  legal_hold: false,
  legal_hold_reason: null,
  legal_hold_by: null,
  legal_hold_at: null,
};

describe('OpenSearchService', () => {
  let svc: OpenSearchService;

  beforeEach(() => {
    jest.clearAllMocks();
    svc = new OpenSearchService(config);
  });

  describe('indexFile', () => {
    it('indexes file in tenant-scoped index', async () => {
      mockIndex.mockResolvedValue({});
      await svc.indexFile(FILE_ROW);
      expect(mockIndex).toHaveBeenCalledWith({
        index: 'files-tid-1',
        id: 'fid-1',
        body: expect.objectContaining({ file_id: 'fid-1', tenant_id: 'tid-1' }),
      });
    });

    it('propagates OpenSearch errors', async () => {
      mockIndex.mockRejectedValue(new Error('opensearch error'));
      await expect(svc.indexFile(FILE_ROW)).rejects.toThrow('opensearch error');
    });
  });

  describe('deleteFileIndex', () => {
    it('deletes document from index', async () => {
      mockDelete.mockResolvedValue({});
      await svc.deleteFileIndex('tid-1', 'fid-1');
      expect(mockDelete).toHaveBeenCalledWith({ index: 'files-tid-1', id: 'fid-1' });
    });
  });
});

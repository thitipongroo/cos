import { OpenSearchService } from '../services/opensearch.service';
import type { FileServiceConfig } from '../config';
import type { FileMetadataRow, StoredFileRow } from '../types';

const mockIndex = jest.fn();
const mockDelete = jest.fn();
const mockSearch = jest.fn();

jest.mock('@opensearch-project/opensearch', () => ({
  Client: jest.fn().mockImplementation(() => ({
    index: mockIndex,
    delete: mockDelete,
    search: mockSearch,
  })),
}));

const config = { opensearch: { host: 'http://localhost:9200' } } as FileServiceConfig;

const FILE_ROW: StoredFileRow = {
  sha256: null,
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

describe('OpenSearchService — the indexed document (spec §Phase 9 OpenSearch Indexing)', () => {
  let svc: OpenSearchService;

  const META: FileMetadataRow[] = [
    {
      metadata_id: 'mid-1',
      file_id: 'fid-1',
      tenant_id: 'tid-1',
      entity_type: 'site_report',
      entity_id: 'eid-1',
      metadata_key: 'entity_ref',
      metadata_value: 'eid-1',
    },
    {
      metadata_id: 'mid-2',
      file_id: 'fid-1',
      tenant_id: 'tid-1',
      entity_type: null,
      entity_id: null,
      metadata_key: 'drawing_number',
      metadata_value: 'A-101-REV-C',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    // clearAllMocks clears recorded calls but NOT implementations: an earlier describe leaves
    // mockIndex rejecting, and that would leak into every test below it.
    mockIndex.mockResolvedValue(undefined);
    svc = new OpenSearchService(config);
  });

  it('carries entity_type and entity_id from the metadata rows', async () => {
    // They live in files.file_metadata, not on the file row, so nothing puts them in the document
    // unless they are read alongside it.
    await svc.indexFile(FILE_ROW, META);
    const body = mockIndex.mock.calls[0]![0].body as Record<string, unknown>;
    expect(body['entity_type']).toBe('site_report');
    expect(body['entity_id']).toBe('eid-1');
  });

  it('carries every metadata key-value pair', async () => {
    await svc.indexFile(FILE_ROW, META);
    const body = mockIndex.mock.calls[0]![0].body as {
      metadata: Array<{ key: string; value: string | null }>;
    };
    expect(body.metadata).toEqual([
      { key: 'entity_ref', value: 'eid-1' },
      { key: 'drawing_number', value: 'A-101-REV-C' },
    ]);
  });

  it('indexes a file with no metadata at all', async () => {
    // Not every file hangs off an entity. The document must still be written, with nulls rather
    // than a crash or a missing document.
    await svc.indexFile(FILE_ROW);
    const body = mockIndex.mock.calls[0]![0].body as Record<string, unknown>;
    expect(body['entity_type']).toBeNull();
    expect(body['entity_id']).toBeNull();
    expect(body['metadata']).toEqual([]);
  });

  it('takes the entity reference from the first row that names one', async () => {
    // The table permits several rows per file; only some name an entity. Reading the last one would
    // make the indexed reference depend on row order.
    await svc.indexFile(FILE_ROW, [META[1]!, META[0]!]);
    const body = mockIndex.mock.calls[0]![0].body as Record<string, unknown>;
    expect(body['entity_type']).toBe('site_report');
  });
});

describe('OpenSearchService — search (spec §Phase 9: filename and metadata values)', () => {
  let svc: OpenSearchService;

  beforeEach(() => {
    jest.clearAllMocks();
    svc = new OpenSearchService(config);
    mockSearch.mockResolvedValue({ body: { hits: { hits: [{ _source: { file_id: 'fid-1' } }] } } });
  });

  it('queries both fields the spec names', async () => {
    // Filenames alone find "IMG_4821.jpg" and never the drawing number recorded against it.
    await svc.search('tid-1', 'A-101');
    const body = mockSearch.mock.calls[0]![0].body as {
      query: { multi_match: { fields: string[]; query: string } };
    };
    expect(body.query.multi_match.fields).toEqual(['original_filename', 'metadata.value']);
    expect(body.query.multi_match.query).toBe('A-101');
  });

  it("searches only the calling tenant's index", async () => {
    // Scoped by index, not by a query predicate: a forgotten filter then cannot reach another
    // tenant's documents.
    await svc.search('tid-1', 'anything');
    expect(mockSearch.mock.calls[0]![0].index).toBe('files-tid-1');
  });

  it('returns the matching file ids', async () => {
    await expect(svc.search('tid-1', 'A-101')).resolves.toEqual(['fid-1']);
  });

  it('returns nothing when the index has no hits', async () => {
    mockSearch.mockResolvedValue({ body: { hits: { hits: [] } } });
    await expect(svc.search('tid-1', 'nothing')).resolves.toEqual([]);
  });

  it('skips hits with no file_id rather than returning undefined entries', async () => {
    mockSearch.mockResolvedValue({ body: { hits: { hits: [{ _source: {} }, {}] } } });
    await expect(svc.search('tid-1', 'x')).resolves.toEqual([]);
  });

  it('survives a response with no hits envelope', async () => {
    mockSearch.mockResolvedValue({ body: {} });
    await expect(svc.search('tid-1', 'x')).resolves.toEqual([]);
  });
});

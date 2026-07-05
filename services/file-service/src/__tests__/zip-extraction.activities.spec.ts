import { createZipExtractionActivities } from '../extraction/zip-extraction.activities';
import type { ExtractionDeps } from '../extraction/zip-extraction.activities';

function setup(extractImpl?: jest.Mock, archiveRow: unknown = ARCHIVE) {
  const db = {
    findFileByIdAdmin: jest.fn().mockResolvedValue(archiveRow),
    insertFile: jest.fn().mockResolvedValue({}),
    markArchiveExtracted: jest.fn().mockResolvedValue(undefined),
    updateFileStatus: jest.fn().mockResolvedValue(undefined),
    findFileById: jest.fn().mockResolvedValue(null),
    markFileQuarantined: jest.fn().mockResolvedValue(undefined),
  };
  const minio = {
    downloadToBuffer: jest.fn().mockResolvedValue(Buffer.from('zip-bytes')),
    uploadFile: jest.fn().mockResolvedValue(undefined),
    bucketName: jest.fn((t: string) => `cos-${t}`),
    moveToQuarantine: jest.fn().mockResolvedValue(undefined),
  };
  const zip = { extract: extractImpl ?? jest.fn().mockResolvedValue([]) };
  const scanServices = {
    antivirus: { scan: jest.fn().mockResolvedValue({ clean: true }) },
    db,
    minio,
    opensearch: { indexFile: jest.fn().mockResolvedValue(undefined) },
    kafka: { publishFileQuarantined: jest.fn().mockResolvedValue(undefined) },
  };
  const acts = createZipExtractionActivities({
    db,
    minio,
    zip,
    scanServices,
  } as unknown as ExtractionDeps);
  return { acts, db, minio, zip, scanServices };
}

const ARCHIVE = {
  file_id: 'archive-1',
  tenant_id: 'tenant-1',
  stored_key: '2026/07/archive-1/bulk.zip',
  uploaded_by: 'user-1',
};

describe('zip extraction activities', () => {
  it('returns 0 and skips download when the archive is not found', async () => {
    const { acts, minio } = setup(undefined, null);
    expect(await acts.extractArchive('missing')).toBe(0);
    expect(minio.downloadToBuffer).not.toHaveBeenCalled();
  });

  it('stores + scans each extracted entry as a child of the archive', async () => {
    const extract = jest.fn().mockResolvedValue([
      { filename: 'a.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('a') },
      { filename: 'b.pdf', mimeType: 'application/pdf', buffer: Buffer.from('b') },
    ]);
    const { acts, db, minio, scanServices } = setup(extract);

    const count = await acts.extractArchive('archive-1');

    expect(count).toBe(2);
    expect(minio.downloadToBuffer).toHaveBeenCalledWith('tenant-1', ARCHIVE.stored_key);
    expect(minio.uploadFile).toHaveBeenCalledTimes(2);
    expect(db.insertFile).toHaveBeenCalledTimes(2);
    expect(db.insertFile).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        originalFilename: 'a.jpg',
        mimeType: 'image/jpeg',
        parentFileId: 'archive-1',
        uploadedBy: 'user-1',
      }),
    );
    // per-entry antivirus re-validation ran (scan-runner → antivirus.scan)
    expect(scanServices.antivirus.scan).toHaveBeenCalledTimes(2);
    expect(db.updateFileStatus).toHaveBeenCalledWith(expect.any(String), 'CLEAN');
  });

  it('returns 0 (rejected, no children) when extraction throws', async () => {
    const extract = jest.fn().mockRejectedValue(new Error('zip bomb'));
    const { acts, db } = setup(extract);
    expect(await acts.extractArchive('archive-1')).toBe(0);
    expect(db.insertFile).not.toHaveBeenCalled();
  });

  it('markArchiveExtracted delegates to db', async () => {
    const { acts, db } = setup();
    await acts.markArchiveExtracted('archive-1');
    expect(db.markArchiveExtracted).toHaveBeenCalledWith('archive-1');
  });
});

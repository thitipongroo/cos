import { AntivirusService } from '../services/antivirus.service';
import type { FsOps, AntivirusDeps } from '../services/antivirus.service';
import type { FileServiceConfig } from '../config';
import type { StoredFileRow } from '../types';

const mockScanFile = jest.fn();
const mockInit = jest.fn();

jest.mock('clamscan', () => {
  return jest.fn().mockImplementation(() => ({
    init: mockInit,
  }));
});

const config = {
  clamav: { host: 'clamav', port: 3310, timeoutMs: 60000 },
} as FileServiceConfig;

const FILE_ID = 'file-uuid-1';
const fileRow = {
  file_id: FILE_ID,
  tenant_id: 'tenant-1',
  stored_key: '2026/07/file-uuid-1/plan.pdf',
  bucket_name: 'cos-tenant-1',
} as StoredFileRow;

// Factory for mock deps — scan(fileId) resolves the row via db then downloads bytes from MinIO.
function makeMockDeps(overrides?: Partial<AntivirusDeps>): AntivirusDeps {
  return {
    db: { findFileByIdAdmin: jest.fn().mockResolvedValue(fileRow) },
    minio: { downloadToBuffer: jest.fn().mockResolvedValue(Buffer.from('file bytes')) },
    ...overrides,
  };
}

// Factory for mock FsOps — injected via constructor DI (no jest.mock of built-ins needed)
function makeMockFs(overrides?: Partial<FsOps>): FsOps {
  return {
    writeFile: jest.fn().mockResolvedValue(undefined),
    unlink: jest.fn().mockResolvedValue(undefined),
    tmpdir: jest.fn().mockReturnValue('/tmp'),
    join: jest.fn((...parts: string[]) => parts.join('/')),
    ...overrides,
  };
}

describe('AntivirusService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInit.mockResolvedValue({ scanFile: mockScanFile });
  });

  it('returns clean: true when ClamAV reports no infection', async () => {
    mockScanFile.mockResolvedValue({ isInfected: false, viruses: [] });
    const svc = new AntivirusService(config, makeMockDeps(), makeMockFs());
    expect(await svc.scan(FILE_ID)).toEqual({ clean: true });
  });

  it('fetches the stored bytes by fileId (db lookup → MinIO download)', async () => {
    mockScanFile.mockResolvedValue({ isInfected: false, viruses: [] });
    const deps = makeMockDeps();
    const svc = new AntivirusService(config, deps, makeMockFs());
    await svc.scan(FILE_ID);
    expect(deps.db.findFileByIdAdmin).toHaveBeenCalledWith(FILE_ID);
    expect(deps.minio.downloadToBuffer).toHaveBeenCalledWith('tenant-1', fileRow.stored_key);
  });

  it('throws when the file is not found', async () => {
    const deps = makeMockDeps({
      db: { findFileByIdAdmin: jest.fn().mockResolvedValue(null) },
    });
    const svc = new AntivirusService(config, deps, makeMockFs());
    await expect(svc.scan('missing-id')).rejects.toThrow('file not found: missing-id');
  });

  it('returns clean: false with threat name when virus detected', async () => {
    mockScanFile.mockResolvedValue({ isInfected: true, viruses: ['Eicar-Test-Signature'] });
    const svc = new AntivirusService(config, makeMockDeps(), makeMockFs());
    expect(await svc.scan(FILE_ID)).toEqual({
      clean: false,
      threat: 'Eicar-Test-Signature',
    });
  });

  it('returns clean: false with "unknown" when virus array is empty', async () => {
    mockScanFile.mockResolvedValue({ isInfected: true, viruses: [] });
    const svc = new AntivirusService(config, makeMockDeps(), makeMockFs());
    expect(await svc.scan(FILE_ID)).toEqual({ clean: false, threat: 'unknown' });
  });

  it('propagates scan errors', async () => {
    mockScanFile.mockRejectedValue(new Error('clamav unavailable'));
    const svc = new AntivirusService(config, makeMockDeps(), makeMockFs());
    await expect(svc.scan(FILE_ID)).rejects.toThrow('clamav unavailable');
  });

  it('still returns result even when unlink fails (catch handler)', async () => {
    // Inject an fs mock where unlink rejects — exercises the .catch(() => undefined) handler
    const mockFs = makeMockFs({
      unlink: jest.fn().mockRejectedValue(new Error('unlink failed')),
    });
    mockScanFile.mockResolvedValue({ isInfected: false, viruses: [] });
    const svc = new AntivirusService(config, makeMockDeps(), mockFs);
    // Should NOT throw — the catch handler swallows the unlink error
    await expect(svc.scan(FILE_ID)).resolves.toEqual({ clean: true });
  });

  it('connects lazily — init is not called at construction, only on first scan', async () => {
    mockScanFile.mockResolvedValue({ isInfected: false, viruses: [] });
    const svc = new AntivirusService(config, makeMockDeps(), makeMockFs());
    expect(mockInit).not.toHaveBeenCalled();
    await svc.scan(FILE_ID);
    expect(mockInit).toHaveBeenCalledTimes(1);
  });

  it('reuses the cached connection on subsequent scans — init runs once', async () => {
    // Covers the falsy branch of `if (!this.clamPromise)`: a successful init is cached, so the
    // second scan reuses the existing connection instead of reconnecting.
    mockScanFile.mockResolvedValue({ isInfected: false, viruses: [] });
    const svc = new AntivirusService(config, makeMockDeps(), makeMockFs());
    await svc.scan(FILE_ID);
    await svc.scan(FILE_ID);
    expect(mockInit).toHaveBeenCalledTimes(1);
  });

  it('does not cache a failed init — a later scan retries the connection', async () => {
    mockInit.mockRejectedValueOnce(new Error('ECONNRESET'));
    const svc = new AntivirusService(config, makeMockDeps(), makeMockFs());

    // First scan: init rejects (clamd still loading) → error propagates, promise not cached
    await expect(svc.scan(FILE_ID)).rejects.toThrow('ECONNRESET');

    // Second scan: init succeeds (clamd now ready) → fresh connection, scan completes
    mockScanFile.mockResolvedValue({ isInfected: false, viruses: [] });
    expect(await svc.scan(FILE_ID)).toEqual({ clean: true });
    expect(mockInit).toHaveBeenCalledTimes(2);
  });

  it('uses real fs when no FsOps injected (default path coverage)', () => {
    // Verifies the default fs: {} branch in constructor (no injection)
    // We only test construction — not actual scan (would require real ClamAV)
    expect(() => new AntivirusService(config, makeMockDeps())).not.toThrow();
  });
});

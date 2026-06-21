import { AntivirusService } from '../services/antivirus.service';
import type { FsOps } from '../services/antivirus.service';
import type { FileServiceConfig } from '../config';

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
    const svc = new AntivirusService(config, makeMockFs());
    expect(await svc.scan(Buffer.from('safe content'))).toEqual({ clean: true });
  });

  it('returns clean: false with threat name when virus detected', async () => {
    mockScanFile.mockResolvedValue({ isInfected: true, viruses: ['Eicar-Test-Signature'] });
    const svc = new AntivirusService(config, makeMockFs());
    expect(await svc.scan(Buffer.from('eicar'))).toEqual({
      clean: false,
      threat: 'Eicar-Test-Signature',
    });
  });

  it('returns clean: false with "unknown" when virus array is empty', async () => {
    mockScanFile.mockResolvedValue({ isInfected: true, viruses: [] });
    const svc = new AntivirusService(config, makeMockFs());
    expect(await svc.scan(Buffer.from('eicar'))).toEqual({ clean: false, threat: 'unknown' });
  });

  it('propagates scan errors', async () => {
    mockScanFile.mockRejectedValue(new Error('clamav unavailable'));
    const svc = new AntivirusService(config, makeMockFs());
    await expect(svc.scan(Buffer.from('data'))).rejects.toThrow('clamav unavailable');
  });

  it('still returns result even when unlink fails (catch handler)', async () => {
    // Inject an fs mock where unlink rejects — exercises the .catch(() => undefined) handler
    const mockFs = makeMockFs({
      unlink: jest.fn().mockRejectedValue(new Error('unlink failed')),
    });
    mockScanFile.mockResolvedValue({ isInfected: false, viruses: [] });
    const svc = new AntivirusService(config, mockFs);
    // Should NOT throw — the catch handler swallows the unlink error
    await expect(svc.scan(Buffer.from('data'))).resolves.toEqual({ clean: true });
  });

  it('connects lazily — init is not called at construction, only on first scan', async () => {
    mockScanFile.mockResolvedValue({ isInfected: false, viruses: [] });
    const svc = new AntivirusService(config, makeMockFs());
    expect(mockInit).not.toHaveBeenCalled();
    await svc.scan(Buffer.from('data'));
    expect(mockInit).toHaveBeenCalledTimes(1);
  });

  it('does not cache a failed init — a later scan retries the connection', async () => {
    mockInit.mockRejectedValueOnce(new Error('ECONNRESET'));
    const svc = new AntivirusService(config, makeMockFs());

    // First scan: init rejects (clamd still loading) → error propagates, promise not cached
    await expect(svc.scan(Buffer.from('data'))).rejects.toThrow('ECONNRESET');

    // Second scan: init succeeds (clamd now ready) → fresh connection, scan completes
    mockScanFile.mockResolvedValue({ isInfected: false, viruses: [] });
    expect(await svc.scan(Buffer.from('data'))).toEqual({ clean: true });
    expect(mockInit).toHaveBeenCalledTimes(2);
  });

  it('uses real fs when no FsOps injected (default path coverage)', () => {
    // Verifies the default fs: {} branch in constructor (no injection)
    // We only test construction — not actual scan (would require real ClamAV)
    expect(() => new AntivirusService(config)).not.toThrow();
  });
});

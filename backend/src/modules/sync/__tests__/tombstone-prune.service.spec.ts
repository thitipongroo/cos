jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));
jest.mock('@nestjs/schedule', () => ({ Cron: () => () => undefined }));

const mockExecuteRaw = jest.fn();
const mockDisconnect = jest.fn().mockResolvedValue(undefined);
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    $executeRaw: mockExecuteRaw,
    $disconnect: mockDisconnect,
  })),
}));

import { TombstonePruneService } from '../tombstone-prune.service';

describe('TombstonePruneService', () => {
  let service: TombstonePruneService;
  const ORIGINAL_ENV = process.env['SYNC_TOMBSTONE_RETENTION_DAYS'];

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env['SYNC_TOMBSTONE_RETENTION_DAYS'];
    service = new TombstonePruneService();
  });

  afterAll(() => {
    // Restore the original env so this suite never leaks state into others under the shared worker.
    if (ORIGINAL_ENV === undefined) delete process.env['SYNC_TOMBSTONE_RETENTION_DAYS'];
    else process.env['SYNC_TOMBSTONE_RETENTION_DAYS'] = ORIGINAL_ENV;
  });

  it('prunes tombstones older than the default window and returns the deleted count', async () => {
    mockExecuteRaw.mockResolvedValue(7);
    await expect(service.pruneOldTombstones()).resolves.toBe(7);
    expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
  });

  it('honours a valid SYNC_TOMBSTONE_RETENTION_DAYS override', async () => {
    process.env['SYNC_TOMBSTONE_RETENTION_DAYS'] = '30';
    mockExecuteRaw.mockResolvedValue(0);
    await expect(service.pruneOldTombstones()).resolves.toBe(0);
    expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
  });

  it('falls back to the default when the env value is non-numeric (NaN)', async () => {
    process.env['SYNC_TOMBSTONE_RETENTION_DAYS'] = 'not-a-number';
    mockExecuteRaw.mockResolvedValue(0);
    await service.pruneOldTombstones();
    expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
  });

  it('falls back to the default when the env value is non-positive', async () => {
    process.env['SYNC_TOMBSTONE_RETENTION_DAYS'] = '0';
    mockExecuteRaw.mockResolvedValue(0);
    await service.pruneOldTombstones();
    expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
  });

  it('disconnects the privileged client on module destroy', async () => {
    await service.onModuleDestroy();
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });
});

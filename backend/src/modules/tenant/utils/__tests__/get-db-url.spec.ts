// Unit tests for getDbUrlForTenant
// PrismaClient is mocked — no real DB connection required.

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(),
}));

import { PrismaClient } from '@prisma/client';
import { getDbUrlForTenant } from '../get-db-url';

const SHARED_DB = 'postgresql://cos:pass@pgbouncer:6432/cos';

const mockQueryRaw = jest.fn();
const mockDisconnect = jest.fn();

beforeEach(() => {
  jest.resetAllMocks();
  mockDisconnect.mockResolvedValue(undefined);
  process.env['DATABASE_URL'] = SHARED_DB;
  (PrismaClient as jest.Mock).mockImplementation(() => ({
    $queryRaw: mockQueryRaw,
    $disconnect: mockDisconnect,
  }));
});

afterEach(() => {
  delete process.env['DATABASE_URL'];
});

describe('getDbUrlForTenant', () => {
  it('returns dedicated_db_url when tenant has one', async () => {
    const dedicatedUrl = 'postgresql://tenant:pass@dedicated-rds:5432/tenantdb';
    mockQueryRaw.mockResolvedValueOnce([{ dedicated_db_url: dedicatedUrl }]);
    const result = await getDbUrlForTenant('tenant-uuid-001');
    expect(result).toBe(dedicatedUrl);
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });

  it('returns DATABASE_URL when dedicated_db_url is null (shared tenant)', async () => {
    mockQueryRaw.mockResolvedValueOnce([{ dedicated_db_url: null }]);
    const result = await getDbUrlForTenant('tenant-uuid-002');
    expect(result).toBe(SHARED_DB);
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });

  it('returns empty string when tenant not found and DATABASE_URL unset', async () => {
    delete process.env['DATABASE_URL'];
    mockQueryRaw.mockResolvedValueOnce([]);
    const result = await getDbUrlForTenant('nonexistent-uuid');
    expect(result).toBe('');
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });

  it('calls $disconnect even when query throws', async () => {
    mockQueryRaw.mockRejectedValueOnce(new Error('DB connection failed'));
    await expect(getDbUrlForTenant('tenant-uuid-001')).rejects.toThrow('DB connection failed');
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });
});

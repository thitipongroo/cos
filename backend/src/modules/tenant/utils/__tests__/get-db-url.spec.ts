// Unit tests for getDbUrlForTenant
// PrismaClient is mocked — no real DB connection required.
// The platform.tenants lookup uses DATABASE_URL; the RETURNED connection is an app-role URL
// (dedicated_db_url for enterprise, else APP_DATABASE_URL) so RLS is enforced — it must never return
// the RLS-bypassing DATABASE_URL superuser (H1 fix, spec §7.7, QM-18).

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(),
}));

import { getDbUrlForTenant } from '../get-db-url';
import { PrismaClient } from '@prisma/client';

const LOOKUP_DB = 'postgresql://cos:pass@pgbouncer:6432/cos';
const APP_DB = 'postgresql://app_user:pass@pgbouncer:6432/cos';

const mockQueryRaw = jest.fn();
const mockDisconnect = jest.fn();

beforeEach(() => {
  jest.resetAllMocks();
  mockDisconnect.mockResolvedValue(undefined);
  process.env['DATABASE_URL'] = LOOKUP_DB;
  process.env['APP_DATABASE_URL'] = APP_DB;
  (PrismaClient as jest.Mock).mockImplementation(() => ({
    $queryRaw: mockQueryRaw,
    $disconnect: mockDisconnect,
  }));
});

afterEach(() => {
  delete process.env['DATABASE_URL'];
  delete process.env['APP_DATABASE_URL'];
});

describe('getDbUrlForTenant', () => {
  it('returns dedicated_db_url when tenant has one (enterprise)', async () => {
    const dedicatedUrl = 'postgresql://app_user:pass@dedicated-rds:5432/tenantdb';
    mockQueryRaw.mockResolvedValueOnce([{ dedicated_db_url: dedicatedUrl }]);
    const result = await getDbUrlForTenant('tenant-uuid-001');
    expect(result).toBe(dedicatedUrl);
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });

  it('returns APP_DATABASE_URL (not DATABASE_URL) when dedicated_db_url is null (shared tenant)', async () => {
    mockQueryRaw.mockResolvedValueOnce([{ dedicated_db_url: null }]);
    const result = await getDbUrlForTenant('tenant-uuid-002');
    expect(result).toBe(APP_DB);
    expect(result).not.toBe(LOOKUP_DB);
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });

  it('returns APP_DATABASE_URL when the tenant row is not found (shared fallback)', async () => {
    mockQueryRaw.mockResolvedValueOnce([]);
    const result = await getDbUrlForTenant('nonexistent-uuid');
    expect(result).toBe(APP_DB);
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });

  it('throws when a shared tenant needs a connection but APP_DATABASE_URL is unset', async () => {
    delete process.env['APP_DATABASE_URL'];
    mockQueryRaw.mockResolvedValueOnce([{ dedicated_db_url: null }]);
    await expect(getDbUrlForTenant('tenant-uuid-002')).rejects.toThrow(
      /APP_DATABASE_URL is not set/,
    );
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });

  it('calls $disconnect even when the lookup query throws', async () => {
    mockQueryRaw.mockRejectedValueOnce(new Error('DB connection failed'));
    await expect(getDbUrlForTenant('tenant-uuid-001')).rejects.toThrow('DB connection failed');
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });
});

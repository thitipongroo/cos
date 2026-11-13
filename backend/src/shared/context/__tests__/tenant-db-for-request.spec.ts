// tenantDbForRequest — the routing the non-JWT guards get (D50, 2026-11-13): the dedicated database
// when the tenant has one, and the JWT path's 401 for an inactive or unknown tenant.

import { UnauthorizedException } from '@nestjs/common';

const resolveTenantDb = jest.fn();
jest.mock('../../prisma/get-db-url', () => ({
  ...jest.requireActual('../../prisma/get-db-url'),
  resolveTenantDb: (id: string) => resolveTenantDb(id),
}));

import { tenantDbForRequest } from '../tenant-db-for-request';
import { TenantInactiveError } from '../../prisma/get-db-url';

describe('tenantDbForRequest', () => {
  beforeEach(() => resolveTenantDb.mockReset());

  it('returns the dedicated URL, or null for the shared database', async () => {
    resolveTenantDb.mockResolvedValueOnce({ dedicatedDbUrl: 'postgresql://x@d:5432/cos' });
    await expect(tenantDbForRequest('t')).resolves.toBe('postgresql://x@d:5432/cos');
    resolveTenantDb.mockResolvedValueOnce({ dedicatedDbUrl: null });
    await expect(tenantDbForRequest('t')).resolves.toBeNull();
  });

  it.each(['inactive', 'unknown'] as const)('answers 401 for an %s tenant', async (reason) => {
    resolveTenantDb.mockRejectedValueOnce(new TenantInactiveError('t', reason));
    const err = await tenantDbForRequest('t').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UnauthorizedException);
    expect((err as UnauthorizedException).message).toBe('Tenant or user not found or inactive');
  });

  it('lets any other failure through as it is (a database outage is not a 401)', async () => {
    resolveTenantDb.mockRejectedValueOnce(new Error('connection refused'));
    await expect(tenantDbForRequest('t')).rejects.toThrow('connection refused');
  });
});

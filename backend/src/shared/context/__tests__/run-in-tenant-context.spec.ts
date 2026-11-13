// runInTenantContext — the wrapper a Kafka consumer uses to enter CLS before it touches anything
// tenant-scoped (TDD OQ-45).
//
// The optional keys are the point of these tests. A consumer that has a tenant but no actor must
// still get a context, and the keys it did not supply must be left OUT of the store rather than
// written as an empty string — `''` in an audit column looks like an answer, where an absent key
// lets the column stay null.

// D50 (2026-11-13): it also routes — the tenant's dedicated database into CLS when it has one — and
// refuses an inactive or unknown tenant before the callback runs.

const resolveTenantDb = jest.fn();
jest.mock('../../prisma/get-db-url', () => ({
  ...jest.requireActual('../../prisma/get-db-url'),
  resolveTenantDb: (id: string) => resolveTenantDb(id),
}));

import { ClsServiceManager } from 'nestjs-cls';
import { runInTenantContext } from '../run-in-tenant-context';
import {
  CLS_DEDICATED_DB_URL,
  CLS_USER_ID,
  CLS_USER_ROLE,
  clsDedicatedDbUrl,
  clsTenantId,
  clsUserId,
  clsUserRole,
} from '../cls-context';
import { TenantInactiveError } from '../../prisma/get-db-url';

beforeEach(() => resolveTenantDb.mockReset().mockResolvedValue({ dedicatedDbUrl: null }));

describe('runInTenantContext', () => {
  it('makes the tenant readable inside the callback and returns its value', async () => {
    const seen: Array<string | null> = [];
    await expect(
      runInTenantContext({ tenantId: 't-1', userId: 'u-1', userRole: 'SYSTEM' }, async () => {
        seen.push(clsTenantId(), clsUserId(), clsUserRole());
        return 'done';
      }),
    ).resolves.toBe('done');
    expect(seen).toEqual(['t-1', 'u-1', 'SYSTEM']);
  });

  it('omits the optional keys rather than storing a value for them', async () => {
    const cls = ClsServiceManager.getClsService();
    await runInTenantContext({ tenantId: 't-2' }, async () => {
      expect(clsTenantId()).toBe('t-2');
      // The accessors flatten "unset" to '' by design, so assert on the STORE: nothing was written,
      // which is what keeps a repository from putting an empty string into an audit column.
      expect(cls.get(CLS_USER_ID)).toBeUndefined();
      expect(cls.get(CLS_USER_ROLE)).toBeUndefined();
      expect(clsUserId()).toBe('');
      expect(clsUserRole()).toBe('');
    });
  });

  it('the context does not leak past the callback', async () => {
    // Each consumed event gets its own context. If it escaped, the next event would be processed
    // under the previous event's tenant — a cross-tenant read, not an ordinary bug.
    await runInTenantContext({ tenantId: 't-3' }, async () => undefined);
    expect(ClsServiceManager.getClsService().isActive()).toBe(false);
  });

  it('a throwing callback still unwinds the context', async () => {
    await expect(
      runInTenantContext({ tenantId: 't-4' }, async () => {
        throw new Error('handler blew up');
      }),
    ).rejects.toThrow('handler blew up');
    expect(ClsServiceManager.getClsService().isActive()).toBe(false);
  });

  it("puts the tenant's dedicated database into CLS, where TenantPrismaService reads it", async () => {
    const url = 'postgresql://app_user:pw@tenant-db.internal:5432/cos';
    resolveTenantDb.mockResolvedValue({ dedicatedDbUrl: url });
    await runInTenantContext({ tenantId: 't-5' }, async () => {
      expect(clsDedicatedDbUrl()).toBe(url);
    });
    expect(resolveTenantDb).toHaveBeenCalledWith('t-5');
  });

  it('leaves the dedicated key out for a tenant on the shared database', async () => {
    await runInTenantContext({ tenantId: 't-6' }, async () => {
      expect(ClsServiceManager.getClsService().get(CLS_DEDICATED_DB_URL)).toBeUndefined();
    });
  });

  it('refuses an inactive tenant before the callback runs', async () => {
    resolveTenantDb.mockRejectedValue(new TenantInactiveError('t-7', 'inactive'));
    const fn = jest.fn();
    await expect(runInTenantContext({ tenantId: 't-7' }, fn)).rejects.toBeInstanceOf(
      TenantInactiveError,
    );
    expect(fn).not.toHaveBeenCalled();
  });

  it("a context entered inside another tenant's does not inherit its dedicated database", async () => {
    resolveTenantDb.mockImplementation(async (id: string) => ({
      dedicatedDbUrl: id === 'enterprise' ? 'postgresql://app_user:pw@a.internal:5432/cos' : null,
    }));
    let inner: string | undefined = 'unset';
    await runInTenantContext({ tenantId: 'enterprise' }, async () => {
      await runInTenantContext({ tenantId: 'shared' }, async () => {
        inner = clsDedicatedDbUrl();
      });
    });
    expect(inner).toBeUndefined();
  });
});

// runInTenantContext — the wrapper a Kafka consumer uses to enter CLS before it touches anything
// tenant-scoped (TDD OQ-45).
//
// The optional keys are the point of these tests. A consumer that has a tenant but no actor must
// still get a context, and the keys it did not supply must be left OUT of the store rather than
// written as an empty string — `''` in an audit column looks like an answer, where an absent key
// lets the column stay null.

import { ClsServiceManager } from 'nestjs-cls';
import { runInTenantContext } from '../run-in-tenant-context';
import { CLS_USER_ID, CLS_USER_ROLE, clsTenantId, clsUserId, clsUserRole } from '../cls-context';

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
});

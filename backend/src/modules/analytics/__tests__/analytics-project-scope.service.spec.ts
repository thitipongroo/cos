jest.mock('@cos/logger', () => {
  const warn = jest.fn();
  return {
    createLogger: jest.fn(() => ({
      info: jest.fn(),
      warn,
      error: jest.fn(),
      debug: jest.fn(),
      child: jest.fn(),
    })),
    __loggerMock: { warn },
  };
});
const { __loggerMock: loggerMock } = jest.requireMock('@cos/logger');

import { ClsServiceManager } from 'nestjs-cls';
import { CosRole } from '@cos/types';
import { AnalyticsProjectScopeService } from '../analytics-project-scope.service';
import { CLS_USER_ID, CLS_USER_ROLE } from '../../../shared/context/cls-context';

function harness(memberProjectIds: string[] = []) {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue(memberProjectIds.map((project_id) => ({ project_id }))),
  };
  const db = { run: jest.fn((cb: (t: typeof tx) => unknown) => cb(tx)) };
  return { svc: new AnalyticsProjectScopeService(db as never), db, tx };
}

/** Run `fn` with a CLS context carrying the given role/user. */
function as<T>(role: string, userId: string | undefined, fn: () => Promise<T>): Promise<T> {
  const cls = ClsServiceManager.getClsService();
  return cls.run(async () => {
    cls.set(CLS_USER_ROLE, role);
    if (userId !== undefined) cls.set(CLS_USER_ID, userId);
    return fn();
  });
}

describe('AnalyticsProjectScopeService', () => {
  beforeEach(() => loggerMock.warn.mockClear());

  // §6.5 names the PM and only the PM. Roles outside that rule keep their §6.4 grant untouched —
  // narrowing them here would be inventing policy.
  it.each([CosRole.EXECUTIVE, CosRole.TENANT_ADMIN, CosRole.FINANCE])(
    '%s is not project-scoped — ids pass through without a query',
    async (role) => {
      const { svc, db } = harness();
      const out = await as(role, 'u1', () => svc.filterVisibleProjectIds(['p1', 'p2']));
      expect(out).toEqual(['p1', 'p2']);
      expect(db.run).not.toHaveBeenCalled();
    },
  );

  it('PROJECT_MANAGER keeps only the projects they are a member of', async () => {
    const { svc } = harness(['p1']);
    const out = await as(CosRole.PROJECT_MANAGER, 'u1', () =>
      svc.filterVisibleProjectIds(['p1', 'p2', 'p3']),
    );
    expect(out).toEqual(['p1']);
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.objectContaining({ denied: ['p2', 'p3'], allowed: ['p1'] }),
      'analytics.project-scope: dropped projects the caller is not assigned to',
    );
  });

  it('PROJECT_MANAGER who is a member of everything requested keeps all of them, silently', async () => {
    const { svc } = harness(['p1', 'p2']);
    const out = await as(CosRole.PROJECT_MANAGER, 'u1', () =>
      svc.filterVisibleProjectIds(['p1', 'p2']),
    );
    expect(out).toEqual(['p1', 'p2']);
    expect(loggerMock.warn).not.toHaveBeenCalled();
  });

  it('PROJECT_MANAGER with no memberships gets nothing back', async () => {
    const { svc } = harness([]);
    const out = await as(CosRole.PROJECT_MANAGER, 'u1', () =>
      svc.filterVisibleProjectIds(['p1', 'p2']),
    );
    expect(out).toEqual([]);
  });

  // Failing open here would hand a PM the entire tenant, so an unresolvable identity denies all.
  it('denies every project when a project-scoped role has no user id in context', async () => {
    const { svc, db } = harness(['p1']);
    const out = await as(CosRole.PROJECT_MANAGER, undefined, () =>
      svc.filterVisibleProjectIds(['p1']),
    );
    expect(out).toEqual([]);
    expect(db.run).not.toHaveBeenCalled();
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.objectContaining({ role: CosRole.PROJECT_MANAGER }),
      'analytics.project-scope: no user id in context — denying all projects',
    );
  });

  it('short-circuits an empty request without querying', async () => {
    const { svc, db } = harness();
    const out = await as(CosRole.PROJECT_MANAGER, 'u1', () => svc.filterVisibleProjectIds([]));
    expect(out).toEqual([]);
    expect(db.run).not.toHaveBeenCalled();
  });

  it('scopes the membership query to the tenant GUC', async () => {
    const { svc, tx } = harness(['p1']);
    await as(CosRole.PROJECT_MANAGER, 'u1', () => svc.filterVisibleProjectIds(['p1']));
    const sql = (tx.$queryRaw.mock.calls[0][0] as string[]).join('?');
    expect(sql).toContain('projects.project_members');
    expect(sql).toContain("current_setting('app.current_tenant_id', TRUE)");
  });
});

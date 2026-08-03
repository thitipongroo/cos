jest.mock('@cos/logger', () => {
  const warn = jest.fn();
  const names: string[] = [];
  const createLogger = jest.fn((module: string) => {
    names.push(module);
    return { info: jest.fn(), warn, error: jest.fn(), debug: jest.fn(), child: jest.fn() };
  });
  return { createLogger, __loggerMock: { warn, names } };
});
const { __loggerMock: loggerMock } = jest.requireMock('@cos/logger');

import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { CosRole } from '@cos/types';
import { SyncAuthGuard } from '../sync-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { CLS_SYNC_ALLOWED_ENTITY_TYPES } from '../../../shared/context/cls-context';

/** RolesGuard stand-in: the caller holds exactly `held`, no additional-roles DB lookup. */
function rolesFor(held: CosRole[]): RolesGuard {
  return {
    hasAnyRole: jest.fn((_user, required: readonly CosRole[]) =>
      Promise.resolve(required.some((r) => held.includes(r))),
    ),
  } as unknown as RolesGuard;
}

function makeGuard(held: CosRole[], clsActive = true) {
  const store = new Map<string, unknown>();
  const cls = {
    isActive: () => clsActive,
    set: (k: string, v: unknown) => store.set(k, v),
  } as never;
  return { guard: new SyncAuthGuard(rolesFor(held), cls), store };
}

function ctx(req: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

const SITE_WORKER = { role: CosRole.SITE_WORKER, user_id: 'u1', tenant_id: 't1' };

describe('SyncAuthGuard', () => {
  beforeEach(() => loggerMock.warn.mockClear());

  it('creates the module logger with the exact name', () => {
    expect(loggerMock.names).toContain('sync-auth-guard');
  });

  it('rejects a request whose JWT carries no role claim', async () => {
    const { guard } = makeGuard([]);
    await expect(guard.canActivate(ctx({ method: 'POST', user: undefined }))).rejects.toThrow(
      'Missing role claim in JWT',
    );
  });

  describe('push / resolve', () => {
    it('allows a push the caller’s role covers', async () => {
      const { guard } = makeGuard([CosRole.SITE_WORKER]);
      const req = { method: 'POST', user: SITE_WORKER, body: { entity_type: 'site_report' } };
      await expect(guard.canActivate(ctx(req))).resolves.toBe(true);
    });

    // The bypass this guard exists to close: POST /safety/incidents requires SITE_ENGINEER |
    // SAFETY_OFFICER | TENANT_ADMIN, and /sync/push reached the same service with no check at all.
    it('denies a SITE_WORKER pushing a safety incident (parity with POST /safety/incidents)', async () => {
      const { guard } = makeGuard([CosRole.SITE_WORKER]);
      const req = { method: 'POST', user: SITE_WORKER, body: { entity_type: 'safety' } };
      await expect(guard.canActivate(ctx(req))).rejects.toBeInstanceOf(ForbiddenException);
      expect(loggerMock.warn).toHaveBeenCalledWith(
        expect.objectContaining({ entityType: 'safety' }),
        'sync.push denied — insufficient role',
      );
    });

    it('denies a SITE_WORKER recording attendance for someone else', async () => {
      const { guard } = makeGuard([CosRole.SITE_WORKER]);
      const req = { method: 'POST', user: SITE_WORKER, body: { entity_type: 'attendance' } };
      await expect(guard.canActivate(ctx(req))).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('lets an unknown entity_type through so the service can answer 400, not 403', async () => {
      const { guard } = makeGuard([]);
      const req = { method: 'POST', user: SITE_WORKER, body: { entity_type: 'nope' } };
      await expect(guard.canActivate(ctx(req))).resolves.toBe(true);
    });

    // Prototype-chain keys must not resolve to a registry entry.
    it('does not treat inherited Object keys as known entity types', async () => {
      const { guard } = makeGuard([]);
      const req = { method: 'POST', user: SITE_WORKER, body: { entity_type: 'constructor' } };
      await expect(guard.canActivate(ctx(req))).resolves.toBe(true);
    });

    it('tolerates a non-string / missing entity_type', async () => {
      const { guard } = makeGuard([]);
      await expect(
        guard.canActivate(ctx({ method: 'POST', user: SITE_WORKER, body: { entity_type: 7 } })),
      ).resolves.toBe(true);
      await expect(guard.canActivate(ctx({ method: 'POST', user: SITE_WORKER }))).resolves.toBe(
        true,
      );
    });

    it('photo_annotation carries no role requirement (no REST write route to mirror)', async () => {
      const { guard } = makeGuard([]);
      const req = { method: 'POST', user: SITE_WORKER, body: { entity_type: 'photo_annotation' } };
      await expect(guard.canActivate(ctx(req))).resolves.toBe(true);
    });
  });

  describe('delta', () => {
    it('narrows the requested types to the readable ones instead of rejecting the call', async () => {
      // A SITE_WORKER may read tasks/reports/issues but not safety incidents. The mobile client asks
      // for all six in one request, so a 403 would break sync outright for this role.
      const { guard, store } = makeGuard([CosRole.SITE_WORKER]);
      const req = {
        method: 'GET',
        user: SITE_WORKER,
        query: {
          'entity_types[]': ['task', 'site_report', 'issue', 'attendance', 'safety', 'material'],
        },
      };
      await expect(guard.canActivate(ctx(req))).resolves.toBe(true);
      expect(store.get(CLS_SYNC_ALLOWED_ENTITY_TYPES)).toEqual([
        'task',
        'site_report',
        'issue',
        'attendance', // no entry in DELTA_ROLES — "Any role" per 14-api-architecture
        'material',
      ]);
      expect(loggerMock.warn).toHaveBeenCalledWith(
        expect.objectContaining({ denied: ['safety'] }),
        'sync.delta narrowed — entity types dropped for insufficient role',
      );
    });

    it('keeps every type for a role that may read them all, and logs nothing', async () => {
      const { guard, store } = makeGuard([CosRole.TENANT_ADMIN]);
      const req = {
        method: 'GET',
        user: { role: CosRole.TENANT_ADMIN, user_id: 'u1', tenant_id: 't1' },
        query: { entity_types: 'safety' },
      };
      await expect(guard.canActivate(ctx(req))).resolves.toBe(true);
      expect(store.get(CLS_SYNC_ALLOWED_ENTITY_TYPES)).toEqual(['safety']);
      expect(loggerMock.warn).not.toHaveBeenCalled();
    });

    it('publishes an empty list when no requested type is readable', async () => {
      const { guard, store } = makeGuard([CosRole.PROCUREMENT_OFFICER]);
      const req = {
        method: 'GET',
        user: { role: CosRole.PROCUREMENT_OFFICER, user_id: 'u1', tenant_id: 't1' },
        query: { entity_types: ['safety', 'task'] },
      };
      await expect(guard.canActivate(ctx(req))).resolves.toBe(true);
      expect(store.get(CLS_SYNC_ALLOWED_ENTITY_TYPES)).toEqual([]);
    });

    it('handles a request with no entity_types at all', async () => {
      const { guard, store } = makeGuard([CosRole.SITE_WORKER]);
      await expect(
        guard.canActivate(ctx({ method: 'GET', user: SITE_WORKER, query: {} })),
      ).resolves.toBe(true);
      expect(store.get(CLS_SYNC_ALLOWED_ENTITY_TYPES)).toEqual([]);
      await expect(guard.canActivate(ctx({ method: 'GET', user: SITE_WORKER }))).resolves.toBe(
        true,
      );
    });

    it('does not throw when there is no active CLS context', async () => {
      const { guard, store } = makeGuard([CosRole.SITE_WORKER], false);
      const req = { method: 'GET', user: SITE_WORKER, query: { entity_types: 'task' } };
      await expect(guard.canActivate(ctx(req))).resolves.toBe(true);
      expect(store.size).toBe(0);
    });
  });
});

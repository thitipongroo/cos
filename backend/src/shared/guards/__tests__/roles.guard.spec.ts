jest.mock('@cos/logger', () => {
  const info = jest.fn();
  const warn = jest.fn();
  const error = jest.fn();
  const names: string[] = [];
  const createLogger = jest.fn((module: string) => {
    names.push(module);
    return { info, warn, error, debug: jest.fn(), child: jest.fn() };
  });
  return { createLogger, __loggerMock: { info, warn, error, names } };
});
const { __loggerMock: loggerMock } = jest.requireMock('@cos/logger');

import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../roles.guard';
import { CosRole } from '@cos/types';

// The guard falls back to a DB query (user_additional_roles) only when the primary role is
// insufficient. Inject a fake client so unit tests never touch a real database.
function makeGuard(reflector: Reflector, additionalRoles: string[] = []): RolesGuard {
  const guard = new RolesGuard(reflector);
  (guard as unknown as { prisma: unknown }).prisma = {
    $queryRaw: jest.fn().mockResolvedValue(additionalRoles.map((role) => ({ role }))),
    $disconnect: jest.fn().mockResolvedValue(undefined),
  };
  return guard;
}
function ctxWith(user: unknown): ExecutionContext {
  return {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: jest.fn().mockReturnValue({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  it('allows when no roles required', async () => {
    const reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const guard = makeGuard(reflector);
    await expect(guard.canActivate(ctxWith({ role: CosRole.SITE_WORKER }))).resolves.toBe(true);
  });

  it('allows when user has required role (primary — no DB fallback)', async () => {
    const reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([CosRole.PROJECT_MANAGER]);
    const guard = makeGuard(reflector);
    const prisma = (guard as unknown as { prisma: { $queryRaw: jest.Mock } }).prisma;
    await expect(
      guard.canActivate(ctxWith({ role: CosRole.PROJECT_MANAGER, user_id: 'u1', tenant_id: 't1' })),
    ).resolves.toBe(true);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('allows when an ADDITIONAL role satisfies the requirement (multi-role fallback)', async () => {
    const reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([CosRole.SAFETY_OFFICER]);
    // Primary is PROJECT_MANAGER; the user also holds SAFETY_OFFICER as an additional role.
    const guard = makeGuard(reflector, [CosRole.SAFETY_OFFICER]);
    await expect(
      guard.canActivate(ctxWith({ role: CosRole.PROJECT_MANAGER, user_id: 'u1', tenant_id: 't1' })),
    ).resolves.toBe(true);
  });

  it('throws ForbiddenException when neither primary nor additional roles suffice', async () => {
    const reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([CosRole.FINANCE]);
    const guard = makeGuard(reflector, [CosRole.SAFETY_OFFICER]);
    await expect(
      guard.canActivate(ctxWith({ role: CosRole.SITE_WORKER, user_id: 'u1', tenant_id: 't1' })),
    ).rejects.toThrow("Role 'SITE_WORKER' does not have access. Required: FINANCE");
  });

  it('throws ForbiddenException when no user in request', async () => {
    const reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([CosRole.TENANT_ADMIN]);
    const guard = makeGuard(reflector);
    await expect(guard.canActivate(ctxWith(undefined))).rejects.toThrow(
      'Missing role claim in JWT',
    );
  });

  it('creates the module logger with the exact name', () => {
    expect(loggerMock.names).toContain('roles-guard');
  });

  it('missing role claim throws the exact message and logs the exact warn', async () => {
    loggerMock.warn.mockClear();
    const reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([CosRole.TENANT_ADMIN]);
    const guard = makeGuard(reflector);
    await expect(guard.canActivate(ctxWith(undefined))).rejects.toThrow(
      'Missing role claim in JWT',
    );
    expect(loggerMock.warn).toHaveBeenCalledWith('RolesGuard: no role in JWT');
  });

  it('SITE_WORKER (no matching additional role) cannot access a FINANCE endpoint', async () => {
    const reflector = new Reflector();
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([CosRole.FINANCE, CosRole.TENANT_ADMIN]);
    const guard = makeGuard(reflector, []);
    await expect(
      guard.canActivate(ctxWith({ role: CosRole.SITE_WORKER, user_id: 'u1', tenant_id: 't1' })),
    ).rejects.toThrow("Role 'SITE_WORKER' does not have access. Required: FINANCE | TENANT_ADMIN");
  });

  // hasAnyRole — the runtime-roles entry point used by SyncAuthGuard, where the required roles come
  // from the request body/query rather than an @Roles decorator.
  describe('hasAnyRole', () => {
    const user = { role: CosRole.SITE_WORKER, user_id: 'u1', tenant_id: 't1' };

    it('true on the primary role without querying additional roles', async () => {
      const guard = makeGuard(new Reflector());
      const prisma = (guard as unknown as { prisma: { $queryRaw: jest.Mock } }).prisma;
      await expect(guard.hasAnyRole(user, [CosRole.SITE_WORKER])).resolves.toBe(true);
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('true when an ADDITIONAL role satisfies it', async () => {
      const guard = makeGuard(new Reflector(), [CosRole.SAFETY_OFFICER]);
      await expect(guard.hasAnyRole(user, [CosRole.SAFETY_OFFICER])).resolves.toBe(true);
    });

    it('false when neither primary nor additional roles satisfy it', async () => {
      const guard = makeGuard(new Reflector(), [CosRole.VIEWER]);
      await expect(guard.hasAnyRole(user, [CosRole.FINANCE])).resolves.toBe(false);
    });

    it('false when the JWT carries no role claim', async () => {
      const guard = makeGuard(new Reflector());
      await expect(
        guard.hasAnyRole({ role: '', user_id: 'u1', tenant_id: 't1' } as never, [CosRole.FINANCE]),
      ).resolves.toBe(false);
    });
  });

  it('onModuleDestroy disconnects the prisma client', async () => {
    const guard = makeGuard(new Reflector());
    const prisma = (guard as unknown as { prisma: { $disconnect: jest.Mock } }).prisma;
    await expect(guard.onModuleDestroy()).resolves.toBeUndefined();
    expect(prisma.$disconnect).toHaveBeenCalledTimes(1);
  });
});

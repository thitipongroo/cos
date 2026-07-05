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

import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../roles.guard';
import { CosRole } from '@cos/types';

describe('RolesGuard', () => {
  it('allows when no roles required', () => {
    const reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const guard = new RolesGuard(reflector);

    const ctx = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: () => ({ user: { role: CosRole.SITE_WORKER } }),
      }),
    } as unknown as ExecutionContext;

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows when user has required role', () => {
    const reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([CosRole.PROJECT_MANAGER]);
    const guard = new RolesGuard(reflector);

    const ctx = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: () => ({ user: { role: CosRole.PROJECT_MANAGER, user_id: 'u1' } }),
      }),
    } as unknown as ExecutionContext;

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('throws ForbiddenException when role insufficient', () => {
    const reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([CosRole.FINANCE]);
    const guard = new RolesGuard(reflector);

    const ctx = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: () => ({ user: { role: CosRole.SITE_WORKER, user_id: 'u1' } }),
      }),
    } as unknown as ExecutionContext;

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when no user in request', () => {
    const reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([CosRole.TENANT_ADMIN]);
    const guard = new RolesGuard(reflector);

    const ctx = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({ getRequest: () => ({}) }),
    } as unknown as ExecutionContext;

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('creates the module logger with the exact name', () => {
    expect(loggerMock.names).toContain('roles-guard');
  });

  it('missing role claim throws the exact message and logs the exact warn', () => {
    loggerMock.warn.mockClear();
    const reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([CosRole.TENANT_ADMIN]);
    const guard = new RolesGuard(reflector);
    const ctx = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({ getRequest: () => ({}) }),
    } as unknown as ExecutionContext;
    expect(() => guard.canActivate(ctx)).toThrow('Missing role claim in JWT');
    expect(loggerMock.warn).toHaveBeenCalledWith('RolesGuard: no role in JWT');
  });

  it('insufficient role throws the exact message listing required roles and logs the denial', () => {
    loggerMock.warn.mockClear();
    const reflector = new Reflector();
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([CosRole.FINANCE, CosRole.TENANT_ADMIN]);
    const guard = new RolesGuard(reflector);
    const ctx = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: () => ({ user: { role: CosRole.SITE_WORKER, user_id: 'u1' } }),
      }),
    } as unknown as ExecutionContext;
    expect(() => guard.canActivate(ctx)).toThrow(
      "Role 'SITE_WORKER' does not have access. Required: FINANCE | TENANT_ADMIN",
    );
    expect(loggerMock.warn).toHaveBeenCalledWith(
      {
        userId: 'u1',
        requiredRoles: [CosRole.FINANCE, CosRole.TENANT_ADMIN],
        actualRole: CosRole.SITE_WORKER,
      },
      'Access denied — insufficient role',
    );
  });

  it('SITE_WORKER cannot access FINANCE endpoint', () => {
    const reflector = new Reflector();
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([CosRole.FINANCE, CosRole.TENANT_ADMIN]);
    const guard = new RolesGuard(reflector);

    const ctx = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: () => ({ user: { role: CosRole.SITE_WORKER, user_id: 'u1' } }),
      }),
    } as unknown as ExecutionContext;

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});

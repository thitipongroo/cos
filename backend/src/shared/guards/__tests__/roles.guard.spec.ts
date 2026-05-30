import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../roles.guard';
import { ROLES_KEY } from '@cos/rbac';
import { CosRole } from '@cos/types';

const makeContext = (role?: string, requiredRoles?: CosRole[]): ExecutionContext => {
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(requiredRoles) } as unknown as Reflector;
  const guard = new RolesGuard(reflector);

  const request = { user: role ? { cos_role: role, cos_user_id: 'user-1' } : undefined };
  const ctx = {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: jest.fn().mockReturnValue({ getRequest: () => request }),
  } as unknown as ExecutionContext;

  return { ctx, guard, reflector } as unknown as ExecutionContext;
};

describe('RolesGuard', () => {
  it('allows when no roles required', () => {
    const reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const guard = new RolesGuard(reflector);

    const ctx = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: () => ({ user: { cos_role: CosRole.SITE_WORKER } }),
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
        getRequest: () => ({ user: { cos_role: CosRole.PROJECT_MANAGER, cos_user_id: 'u1' } }),
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
        getRequest: () => ({ user: { cos_role: CosRole.SITE_WORKER, cos_user_id: 'u1' } }),
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

  it('SITE_WORKER cannot access FINANCE endpoint', () => {
    const reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([CosRole.FINANCE, CosRole.TENANT_ADMIN]);
    const guard = new RolesGuard(reflector);

    const ctx = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: () => ({ user: { cos_role: CosRole.SITE_WORKER, cos_user_id: 'u1' } }),
      }),
    } as unknown as ExecutionContext;

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});

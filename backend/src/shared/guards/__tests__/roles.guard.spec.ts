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

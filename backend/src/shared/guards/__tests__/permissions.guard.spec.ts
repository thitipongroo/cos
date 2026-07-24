// Unit tests — PermissionsGuard + permissionGranted (spec §6.4 fine-grained authorization).

jest.mock('@cos/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard, permissionGranted } from '../permissions.guard';

function ctx(user: unknown): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function guardWith(required: string[] | undefined): PermissionsGuard {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(required),
  } as unknown as Reflector;
  return new PermissionsGuard(reflector);
}

describe('permissionGranted', () => {
  it('grants via exact match, *:* and resource:* wildcards', () => {
    expect(permissionGranted(['finance:approve'], 'finance:approve')).toBe(true);
    expect(permissionGranted(['*:*'], 'finance:approve')).toBe(true);
    expect(permissionGranted(['finance:*'], 'finance:approve')).toBe(true);
  });

  it('denies when neither exact nor wildcard covers the permission', () => {
    expect(permissionGranted(['finance:read'], 'finance:approve')).toBe(false);
    expect(permissionGranted(['project:*'], 'finance:approve')).toBe(false);
  });
});

describe('PermissionsGuard', () => {
  it('allows when the endpoint has no @RequirePermissions metadata', () => {
    expect(guardWith(undefined).canActivate(ctx({ role: 'SITE_WORKER' }))).toBe(true);
    expect(guardWith([]).canActivate(ctx({ role: 'SITE_WORKER' }))).toBe(true);
  });

  it('allows when the role grants every required permission', () => {
    expect(guardWith(['finance:approve']).canActivate(ctx({ role: 'FINANCE' }))).toBe(true);
    // TENANT_ADMIN holds *:*
    expect(guardWith(['finance:approve']).canActivate(ctx({ role: 'TENANT_ADMIN' }))).toBe(true);
  });

  it('throws ForbiddenException when the role is missing a required permission', () => {
    // PROJECT_MANAGER has finance:read but not finance:approve
    expect(() =>
      guardWith(['finance:approve']).canActivate(ctx({ role: 'PROJECT_MANAGER', user_id: 'u1' })),
    ).toThrow(ForbiddenException);
  });

  it('throws when no role claim is present', () => {
    expect(() => guardWith(['finance:approve']).canActivate(ctx({}))).toThrow(ForbiddenException);
  });

  it('denies an unknown role (no permissions granted)', () => {
    expect(() =>
      guardWith(['finance:approve']).canActivate(ctx({ role: 'NOT_A_ROLE', user_id: 'u1' })),
    ).toThrow(ForbiddenException);
  });
});

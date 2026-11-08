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

// s1.identity.additional-role-mfa — OFF unless a test turns it on (ADR-110 round 4).
const flags = { isEnabled: jest.fn().mockReturnValue(false) };

// The guard only hits the DB (additional-roles union) when the primary role alone is insufficient;
// inject a fake client so unit tests never touch a real database.
function guardWith(
  required: string[] | undefined,
  additionalRoles: string[] = [],
): PermissionsGuard {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(required),
  } as unknown as Reflector;
  const guard = new PermissionsGuard(reflector, flags as never);
  (guard as unknown as { prisma: unknown }).prisma = {
    $queryRaw: jest.fn().mockResolvedValue(additionalRoles.map((role) => ({ role }))),
    $disconnect: jest.fn().mockResolvedValue(undefined),
  };
  return guard;
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
  it('allows when the endpoint has no @RequirePermissions metadata', async () => {
    await expect(guardWith(undefined).canActivate(ctx({ role: 'SITE_WORKER' }))).resolves.toBe(
      true,
    );
    await expect(guardWith([]).canActivate(ctx({ role: 'SITE_WORKER' }))).resolves.toBe(true);
  });

  it('allows when the primary role grants every required permission (no DB fallback)', async () => {
    await expect(
      guardWith(['finance:approve']).canActivate(ctx({ role: 'FINANCE' })),
    ).resolves.toBe(true);
    // TENANT_ADMIN holds *:*
    await expect(
      guardWith(['finance:approve']).canActivate(ctx({ role: 'TENANT_ADMIN' })),
    ).resolves.toBe(true);
  });

  it('allows when an ADDITIONAL role supplies the missing permission (multi-role union)', async () => {
    // Primary PROJECT_MANAGER lacks finance:approve; the user also holds FINANCE (which grants it).
    await expect(
      guardWith(['finance:approve'], ['FINANCE']).canActivate(
        ctx({ role: 'PROJECT_MANAGER', user_id: 'u1', tenant_id: 't1' }),
      ),
    ).resolves.toBe(true);
  });

  it('throws ForbiddenException when neither primary nor additional roles grant it', async () => {
    // PROJECT_MANAGER has finance:read but not finance:approve, and no additional role supplies it.
    await expect(
      guardWith(['finance:approve']).canActivate(
        ctx({ role: 'PROJECT_MANAGER', user_id: 'u1', tenant_id: 't1' }),
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('throws when no role claim is present', async () => {
    await expect(guardWith(['finance:approve']).canActivate(ctx({}))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('denies an unknown role (no permissions granted)', async () => {
    await expect(
      guardWith(['finance:approve']).canActivate(
        ctx({ role: 'NOT_A_ROLE', user_id: 'u1', tenant_id: 't1' }),
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('throws (and lists additional roles) when present additional roles still do not grant it', async () => {
    // Primary PROJECT_MANAGER lacks finance:approve; the additional role is unknown so ROLE_PERMISSIONS
    // yields the `?? []` fallback — the union still misses, and the warn path maps over the non-empty
    // extra roles (exercises both the flatMap fallback branch and the additionalRoles map).
    await expect(
      guardWith(['finance:approve'], ['NOT_A_ROLE']).canActivate(
        ctx({ role: 'PROJECT_MANAGER', user_id: 'u1', tenant_id: 't1' }),
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('onModuleDestroy disconnects the prisma client', async () => {
    const guard = guardWith(undefined);
    const prisma = (guard as unknown as { prisma: { $disconnect: jest.Mock } }).prisma;
    await expect(guard.onModuleDestroy()).resolves.toBeUndefined();
    expect(prisma.$disconnect).toHaveBeenCalledTimes(1);
  });
});

// ADR-110 round 4: an additional TENANT_ADMIN / FINANCE contributes its permissions only to a token that proved MFA.
describe('PermissionsGuard — additional privileged role needs MFA', () => {
  const env = { ...process.env };
  beforeEach(() => {
    flags.isEnabled.mockReturnValue(true);
    process.env['MFA_ENFORCE'] = 'true';
    delete process.env['MFA_REQUIRED_ACR'];
  });
  afterEach(() => {
    flags.isEnabled.mockReturnValue(false);
    process.env = { ...env };
  });
  const user = (acr?: string) => ({
    user_id: 'u1',
    tenant_id: 't1',
    role: 'SITE_WORKER',
    ...(acr ? { acr } : {}),
  });

  it('an additional FINANCE without MFA does not supply finance permissions', async () => {
    await expect(
      guardWith(['finance:approve'], ['FINANCE']).canActivate(ctx(user())),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(flags.isEnabled).toHaveBeenCalledWith('s1.identity.additional-role-mfa', {
      tenantId: 't1',
      userId: 'u1',
    });
  });

  it('it does with an MFA token', async () => {
    await expect(
      guardWith(['finance:approve'], ['FINANCE']).canActivate(ctx(user('gold'))),
    ).resolves.toBe(true);
  });

  it('a non-privileged additional role still contributes without MFA', async () => {
    await expect(
      guardWith(['project:read'], ['PROJECT_MANAGER']).canActivate(ctx(user())),
    ).resolves.toBe(true);
  });
});

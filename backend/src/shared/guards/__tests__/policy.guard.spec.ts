import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { PolicyGuard } from '../policy.guard';

const makeCtx = (user?: { cos_user_id: string; cos_tenant_id: string; cos_role: string }, tenantId?: string, paramTenantId?: string) => {
  const request = {
    user,
    tenantId,
    params: paramTenantId ? { tenantId: paramTenantId } : {},
  };

  return {
    switchToHttp: jest.fn().mockReturnValue({ getRequest: () => request }),
  } as unknown as ExecutionContext;
};

describe('PolicyGuard', () => {
  let guard: PolicyGuard;

  beforeEach(() => {
    guard = new PolicyGuard();
  });

  it('returns false when no user', () => {
    const ctx = makeCtx(undefined, undefined);
    expect(guard.canActivate(ctx)).toBe(false);
  });

  it('allows when tenant in JWT matches request tenant', () => {
    const ctx = makeCtx(
      { cos_user_id: 'u1', cos_tenant_id: 'tenant-1', cos_role: 'PROJECT_MANAGER' },
      'tenant-1',
    );
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('blocks cross-tenant access via tenantId on request', () => {
    const ctx = makeCtx(
      { cos_user_id: 'u1', cos_tenant_id: 'tenant-1', cos_role: 'PROJECT_MANAGER' },
      'tenant-2',
    );
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('blocks cross-tenant access via params.tenantId', () => {
    const ctx = makeCtx(
      { cos_user_id: 'u1', cos_tenant_id: 'tenant-1', cos_role: 'TENANT_ADMIN' },
      undefined,
      'tenant-99',
    );
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('allows when no tenant context in request (tenant-agnostic endpoint)', () => {
    const ctx = makeCtx(
      { cos_user_id: 'u1', cos_tenant_id: 'tenant-1', cos_role: 'PROJECT_MANAGER' },
      undefined,
    );
    expect(guard.canActivate(ctx)).toBe(true);
  });
});

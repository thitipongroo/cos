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
import { PolicyGuard } from '../policy.guard';

const makeCtx = (
  user?: { user_id: string; tenant_id: string; role: string },
  tenantId?: string,
  paramTenantId?: string,
) => {
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
      { user_id: 'u1', tenant_id: 'tenant-1', role: 'PROJECT_MANAGER' },
      'tenant-1',
    );
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('blocks cross-tenant access via tenantId on request', () => {
    const ctx = makeCtx(
      { user_id: 'u1', tenant_id: 'tenant-1', role: 'PROJECT_MANAGER' },
      'tenant-2',
    );
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('blocks cross-tenant access via params.tenantId', () => {
    const ctx = makeCtx(
      { user_id: 'u1', tenant_id: 'tenant-1', role: 'TENANT_ADMIN' },
      undefined,
      'tenant-99',
    );
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('allows when no tenant context in request (tenant-agnostic endpoint)', () => {
    const ctx = makeCtx(
      { user_id: 'u1', tenant_id: 'tenant-1', role: 'PROJECT_MANAGER' },
      undefined,
    );
    expect(guard.canActivate(ctx)).toBe(true);
  });

  // ── Mutation hardening — exact contracts ──────────────────────────────────

  it('creates the module logger with the exact name', () => {
    expect(loggerMock.names).toContain('policy-guard');
  });

  it('cross-tenant block throws the exact message and logs the exact warn event', () => {
    loggerMock.warn.mockClear();
    const ctx = makeCtx(
      { user_id: 'u1', tenant_id: 'tenant-1', role: 'PROJECT_MANAGER' },
      'tenant-2',
    );
    expect(() => guard.canActivate(ctx)).toThrow('Cross-tenant access is not allowed');
    expect(loggerMock.warn).toHaveBeenCalledWith(
      { userId: 'u1', requestTenantId: 'tenant-2', jwtTenantId: 'tenant-1' },
      'Cross-tenant access attempt blocked',
    );
  });

  it('request.tenantId takes precedence over params.tenantId', () => {
    // tenantId matches the JWT; a mismatched params.tenantId must NOT be consulted.
    const ctx = makeCtx(
      { user_id: 'u1', tenant_id: 'tenant-1', role: 'PROJECT_MANAGER' },
      'tenant-1',
      'tenant-99',
    );
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('tolerates a request without params (optional chaining on params)', () => {
    const request = { user: { user_id: 'u1', tenant_id: 'tenant-1', role: 'PROJECT_MANAGER' } };
    const ctx = {
      switchToHttp: jest.fn().mockReturnValue({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    expect(guard.canActivate(ctx)).toBe(true);
  });
});

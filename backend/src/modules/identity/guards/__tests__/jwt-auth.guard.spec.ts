// Unit tests for JwtAuthGuard.handleRequest — the point where the authenticated user is published into
// CLS. The parent AuthGuard('keycloak-jwt') is mocked so super.handleRequest() can be driven to return
// a user, return undefined, or throw, exercising every branch of the CLS-publish logic.

const mockSuperHandleRequest = jest.fn();

jest.mock('@nestjs/passport', () => ({
  AuthGuard: jest.fn(() => {
    class MockAuthGuard {
      handleRequest(...args: unknown[]): unknown {
        return mockSuperHandleRequest(...args);
      }
    }
    return MockAuthGuard;
  }),
}));

import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { JwtAuthGuard } from '../jwt-auth.guard';
import {
  CLS_TENANT_ID,
  CLS_USER_ID,
  CLS_USER_ROLE,
  CLS_TENANT_CODE,
  CLS_DEDICATED_DB_URL,
} from '../../../../shared/context/cls-context';

const CONTEXT = {} as ExecutionContext;

const FULL_USER = {
  tenant_id: 'tenant-1',
  user_id: 'user-1',
  role: 'SITE_WORKER',
  tenantCode: 'acme',
  dedicatedDbUrl: 'postgresql://app@dedicated/ent',
};

function makeGuard(isActive: boolean): { guard: JwtAuthGuard; set: jest.Mock } {
  const set = jest.fn();
  const cls = { isActive: () => isActive, set } as unknown as ClsService;
  return { guard: new JwtAuthGuard(cls), set };
}

describe('JwtAuthGuard.handleRequest', () => {
  beforeEach(() => mockSuperHandleRequest.mockReset());

  it('publishes the full tenant context into CLS when a user is present and CLS is active', () => {
    mockSuperHandleRequest.mockReturnValue(FULL_USER);
    const { guard, set } = makeGuard(true);

    const result = guard.handleRequest(null, FULL_USER, null, CONTEXT);

    expect(result).toBe(FULL_USER);
    expect(set).toHaveBeenCalledWith(CLS_TENANT_ID, 'tenant-1');
    expect(set).toHaveBeenCalledWith(CLS_USER_ID, 'user-1');
    expect(set).toHaveBeenCalledWith(CLS_USER_ROLE, 'SITE_WORKER');
    expect(set).toHaveBeenCalledWith(CLS_TENANT_CODE, 'acme');
    expect(set).toHaveBeenCalledWith(CLS_DEDICATED_DB_URL, 'postgresql://app@dedicated/ent');
    expect(set).toHaveBeenCalledTimes(5);
  });

  it('does not touch CLS when the context is not active', () => {
    mockSuperHandleRequest.mockReturnValue(FULL_USER);
    const { guard, set } = makeGuard(false);

    guard.handleRequest(null, FULL_USER, null, CONTEXT);

    expect(set).not.toHaveBeenCalled();
  });

  it('does not touch CLS when the user has no tenant_id', () => {
    const userNoTenant = { user_id: 'user-1', role: 'SITE_WORKER' };
    mockSuperHandleRequest.mockReturnValue(userNoTenant);
    const { guard, set } = makeGuard(true);

    guard.handleRequest(null, userNoTenant as never, null, CONTEXT);

    expect(set).not.toHaveBeenCalled();
  });

  it('does not touch CLS when super.handleRequest returns no user', () => {
    mockSuperHandleRequest.mockReturnValue(undefined);
    const { guard, set } = makeGuard(true);

    const result = guard.handleRequest(null, undefined as never, null, CONTEXT);

    expect(result).toBeUndefined();
    expect(set).not.toHaveBeenCalled();
  });

  it('propagates the error thrown by super.handleRequest (invalid/missing token)', () => {
    mockSuperHandleRequest.mockImplementation(() => {
      throw new Error('unauthorized');
    });
    const { guard, set } = makeGuard(true);

    expect(() => guard.handleRequest(null, null as never, null, CONTEXT)).toThrow('unauthorized');
    expect(set).not.toHaveBeenCalled();
  });

  describe('Layer 2 MFA gate', () => {
    const ORIGINAL_ENV = { ...process.env };
    afterEach(() => {
      process.env = { ...ORIGINAL_ENV };
    });

    it('rejects a privileged role lacking MFA acr when MFA_ENFORCE=true (before CLS is touched)', () => {
      process.env['MFA_ENFORCE'] = 'true';
      const admin = { ...FULL_USER, role: 'TENANT_ADMIN', acr: undefined };
      mockSuperHandleRequest.mockReturnValue(admin);
      const { guard, set } = makeGuard(true);

      expect(() => guard.handleRequest(null, admin as never, null, CONTEXT)).toThrow(
        ForbiddenException,
      );
      expect(set).not.toHaveBeenCalled();
    });

    it('admits a privileged role whose acr proves MFA and still publishes CLS', () => {
      process.env['MFA_ENFORCE'] = 'true';
      const admin = { ...FULL_USER, role: 'TENANT_ADMIN', acr: 'gold' };
      mockSuperHandleRequest.mockReturnValue(admin);
      const { guard, set } = makeGuard(true);

      const result = guard.handleRequest(null, admin as never, null, CONTEXT);

      expect(result).toBe(admin);
      expect(set).toHaveBeenCalledWith(CLS_USER_ROLE, 'TENANT_ADMIN');
    });
  });
});

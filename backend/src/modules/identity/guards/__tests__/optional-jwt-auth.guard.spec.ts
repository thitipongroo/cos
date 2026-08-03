// Unit tests for OptionalJwtAuthGuard — the "authenticate if you can, never reject" variant used by
// GET /api/v1/flags. Same mocking shape as jwt-auth.guard.spec: the passport parent is stubbed so
// super.handleRequest() can be driven to return a user or throw.

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

import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { OptionalJwtAuthGuard } from '../optional-jwt-auth.guard';
import { LastSeenService } from '../../last-seen.service';
import { CLS_TENANT_ID, CLS_USER_ID } from '../../../../shared/context/cls-context';

const CONTEXT = {} as ExecutionContext;

const USER = {
  tenant_id: 'tenant-1',
  user_id: 'user-1',
  role: 'SITE_WORKER',
  tenantCode: 'acme',
};

function makeGuard(): { guard: OptionalJwtAuthGuard; set: jest.Mock } {
  const set = jest.fn();
  const cls = { isActive: () => true, set } as unknown as ClsService;
  const lastSeen = { touch: jest.fn() } as unknown as LastSeenService;
  return { guard: new OptionalJwtAuthGuard(cls, lastSeen), set };
}

describe('OptionalJwtAuthGuard.handleRequest', () => {
  beforeEach(() => mockSuperHandleRequest.mockReset());

  it('publishes the tenant context when a valid token is present', () => {
    mockSuperHandleRequest.mockReturnValue(USER);
    const { guard, set } = makeGuard();

    expect(guard.handleRequest(null, USER, null, CONTEXT)).toBe(USER);
    expect(set).toHaveBeenCalledWith(CLS_TENANT_ID, 'tenant-1');
    expect(set).toHaveBeenCalledWith(CLS_USER_ID, 'user-1');
  });

  // The login screen reads flags before any token exists — this must not 401.
  it('returns undefined and publishes nothing when no token is present', () => {
    const { guard, set } = makeGuard();

    expect(guard.handleRequest(null, undefined, null, CONTEXT)).toBeUndefined();
    expect(set).not.toHaveBeenCalled();
    expect(mockSuperHandleRequest).not.toHaveBeenCalled();
  });

  it('degrades to anonymous when passport reports an error (expired / malformed token)', () => {
    const { guard, set } = makeGuard();

    expect(
      guard.handleRequest(new UnauthorizedException('jwt expired'), undefined, null, CONTEXT),
    ).toBeUndefined();
    expect(set).not.toHaveBeenCalled();
  });

  it('degrades to anonymous when the parent rejects an otherwise-valid token (MFA gate)', () => {
    mockSuperHandleRequest.mockImplementation(() => {
      throw new UnauthorizedException('MFA required');
    });
    const { guard } = makeGuard();

    expect(guard.handleRequest(null, USER, null, CONTEXT)).toBeUndefined();
  });
});

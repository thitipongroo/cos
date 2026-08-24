// Unit tests — SubjectVerifyTokenGuard (ADR-090 §6).
//
// The guard is what makes the PUBLIC confirm endpoint safe: it takes the tenant from the token's own
// signed claim and publishes it into CLS, so the write behind it still runs under RLS. If it ever
// stopped setting the tenant, the confirm would run with no tenant context — which is why that is
// what these assert, alongside the subject never being attributed as a platform user.

import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { ClsService } from 'nestjs-cls';
import { SubjectVerifyTokenGuard } from '../subject-verify-token.guard';
import type { SubjectVerificationService } from '../subject-verification.service';
import { CLS_TENANT_ID, CLS_USER_ID, CLS_USER_ROLE } from '../../../../shared/context/cls-context';

const TENANT = '11111111-1111-4111-8111-111111111111';
const REQUEST_ID = '33333333-3333-4333-8333-333333333333';

function ctx(req: unknown): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
}

describe('SubjectVerifyTokenGuard', () => {
  let cls: jest.Mocked<Pick<ClsService, 'isActive' | 'set'>>;
  let verification: jest.Mocked<Pick<SubjectVerificationService, 'verify'>>;
  let guard: SubjectVerifyTokenGuard;

  beforeEach(() => {
    cls = { isActive: jest.fn().mockReturnValue(true), set: jest.fn() } as unknown as typeof cls;
    verification = { verify: jest.fn() } as unknown as typeof verification;
    guard = new SubjectVerifyTokenGuard(
      cls as unknown as ClsService,
      verification as unknown as SubjectVerificationService,
    );
  });

  it('publishes the tenant from the token and never attributes the subject as a user', async () => {
    verification.verify.mockResolvedValue({ tenantId: TENANT, requestId: REQUEST_ID });
    const req: Record<string, unknown> = { params: { token: 'tok' } };

    await expect(guard.canActivate(ctx(req))).resolves.toBe(true);

    expect(cls.set).toHaveBeenCalledWith(CLS_TENANT_ID, TENANT);
    // A URN, not a user id: the audit trail must not read as though an admin acted.
    expect(cls.set).toHaveBeenCalledWith(CLS_USER_ID, `urn:cos:data-subject:${REQUEST_ID}`);
    expect(cls.set).toHaveBeenCalledWith(CLS_USER_ROLE, 'DATA_SUBJECT');
    expect(req['tenantId']).toBe(TENANT);
    expect(req['subjectRequestId']).toBe(REQUEST_ID);
  });

  it('still sets the request fields when CLS is not active', async () => {
    cls.isActive.mockReturnValue(false);
    verification.verify.mockResolvedValue({ tenantId: TENANT, requestId: REQUEST_ID });
    const req: Record<string, unknown> = { params: { token: 'tok' } };

    await expect(guard.canActivate(ctx(req))).resolves.toBe(true);
    expect(cls.set).not.toHaveBeenCalled();
    expect(req['tenantId']).toBe(TENANT);
  });

  it('rejects a request with no token', async () => {
    await expect(guard.canActivate(ctx({ params: {} }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(guard.canActivate(ctx({}))).rejects.toBeInstanceOf(UnauthorizedException);
    expect(verification.verify).not.toHaveBeenCalled();
  });

  it('lets a bad-signature failure through from the token service', async () => {
    verification.verify.mockRejectedValue(new UnauthorizedException('Invalid verification token'));
    await expect(guard.canActivate(ctx({ params: { token: 'bad' } }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});

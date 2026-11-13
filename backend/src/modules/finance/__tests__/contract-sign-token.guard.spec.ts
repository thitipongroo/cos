// D50 (2026-11-13): the guard asks for the tenant's database after verifying its token.
const tenantDbForRequest = jest.fn();
jest.mock('../../../shared/context/tenant-db-for-request', () => ({
  tenantDbForRequest: (id: string) => tenantDbForRequest(id),
}));
beforeEach(() => tenantDbForRequest.mockReset().mockResolvedValue(null));
const DEDICATED = 'postgresql://app_user:pw@tenant-db.internal:5432/cos';

import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { ContractSignTokenGuard } from '../contract-sign-token.guard';
import {
  CLS_DEDICATED_DB_URL,
  CLS_TENANT_ID,
  CLS_USER_ID,
  CLS_USER_ROLE,
} from '../../../shared/context/cls-context';

function ctxWith(req: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('ContractSignTokenGuard (ADR-058 CT-5)', () => {
  const claims = { tenantId: 'tenant-1', contractId: 'con-1' };
  const signLink = {
    verify: jest.fn(),
  } as unknown as import('../contract-sign-link.service').ContractSignLinkService;

  beforeEach(() => jest.clearAllMocks());

  it('verifies the token, sets CLS context + req.tenantId/contractId', async () => {
    (signLink.verify as jest.Mock).mockResolvedValue(claims);
    const set = jest.fn();
    const cls = { isActive: () => true, set } as unknown as import('nestjs-cls').ClsService;
    const guard = new ContractSignTokenGuard(cls, signLink);
    const req: Record<string, unknown> = { params: { token: 'tok-1' } };

    await expect(guard.canActivate(ctxWith(req))).resolves.toBe(true);
    expect(set).toHaveBeenCalledWith(CLS_TENANT_ID, 'tenant-1');
    expect(set).toHaveBeenCalledWith(CLS_USER_ID, 'urn:cos:contract-client:con-1');
    expect(set).toHaveBeenCalledWith(CLS_USER_ROLE, 'CONTRACT_CLIENT');
    expect(req.tenantId).toBe('tenant-1');
    expect(req.contractId).toBe('con-1');
  });

  it('401 when the token is missing from the path', async () => {
    const cls = {
      isActive: () => true,
      set: jest.fn(),
    } as unknown as import('nestjs-cls').ClsService;
    const guard = new ContractSignTokenGuard(cls, signLink);
    await expect(guard.canActivate(ctxWith({ params: {} }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('skips CLS writes when the CLS context is not active (still sets req)', async () => {
    (signLink.verify as jest.Mock).mockResolvedValue(claims);
    const set = jest.fn();
    const cls = { isActive: () => false, set } as unknown as import('nestjs-cls').ClsService;
    const guard = new ContractSignTokenGuard(cls, signLink);
    const req: Record<string, unknown> = { params: { token: 'tok-1' } };

    await expect(guard.canActivate(ctxWith(req))).resolves.toBe(true);
    expect(set).not.toHaveBeenCalled();
    expect(req.tenantId).toBe('tenant-1');
  });

  it("routes to the tenant's dedicated database (D50)", async () => {
    (signLink.verify as jest.Mock).mockResolvedValue(claims);
    tenantDbForRequest.mockResolvedValue(DEDICATED);
    const set = jest.fn();
    const cls = { isActive: () => true, set } as unknown as import('nestjs-cls').ClsService;
    await new ContractSignTokenGuard(cls, signLink).canActivate(
      ctxWith({ params: { token: 't' } }),
    );
    expect(tenantDbForRequest).toHaveBeenCalledWith('tenant-1');
    expect(set).toHaveBeenCalledWith(CLS_DEDICATED_DB_URL, DEDICATED);
  });

  it('401 for an inactive tenant, before any tenant context is published (D50)', async () => {
    (signLink.verify as jest.Mock).mockResolvedValue(claims);
    tenantDbForRequest.mockRejectedValue(new UnauthorizedException('inactive'));
    const set = jest.fn();
    const cls = { isActive: () => true, set } as unknown as import('nestjs-cls').ClsService;
    const req: Record<string, unknown> = { params: { token: 't' } };
    await expect(
      new ContractSignTokenGuard(cls, signLink).canActivate(ctxWith(req)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(set).not.toHaveBeenCalled();
    expect(req.tenantId).toBeUndefined();
  });
});

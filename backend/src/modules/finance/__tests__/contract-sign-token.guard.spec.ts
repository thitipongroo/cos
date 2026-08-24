import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { ContractSignTokenGuard } from '../contract-sign-token.guard';
import { CLS_TENANT_ID, CLS_USER_ID, CLS_USER_ROLE } from '../../../shared/context/cls-context';

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
});

import { ContractSignPublicController } from '../contract-sign-public.controller';

describe('ContractSignPublicController (ADR-058 CT-5)', () => {
  const svc = { signContractAsClient: jest.fn() };
  const ctrl = new ContractSignPublicController(svc as never);

  it('delegates to svc.signContractAsClient with token, dto, and client IP', () => {
    const dto = { client_name: 'Jane', client_email: 'jane@client.com' };
    ctrl.signAsClient('tok-1', dto as never, '198.51.100.7');
    expect(svc.signContractAsClient).toHaveBeenCalledWith('tok-1', dto, '198.51.100.7');
  });
});

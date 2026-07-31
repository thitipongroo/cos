// Unit tests for MyTenantController — the signed-in user reading their OWN tenant identity.
// The controller only delegates to TenantService.getMyTenant with the JWT's tenant_id, so it is
// instantiated directly with a mock service (no NestJS DI / guard wiring required).

import { MyTenantController } from '../my-tenant.controller';
import type { TenantService } from '../tenant.service';
import type { TenantRequest } from '../tenant.middleware';

describe('MyTenantController', () => {
  let controller: MyTenantController;
  let getMyTenant: jest.Mock;

  beforeEach(() => {
    getMyTenant = jest.fn();
    controller = new MyTenantController({ getMyTenant } as unknown as TenantService);
  });

  it('delegates to TenantService.getMyTenant with the request tenantId and returns its result', async () => {
    const identity = {
      tenant_name: 'ACME Construction',
      tenant_code: 'acme_corp',
      plan_type: 'STARTER',
    };
    getMyTenant.mockResolvedValue(identity);

    const req = { tenantId: 'tenant-1' } as TenantRequest;
    const result = await controller.myTenant(req);

    expect(getMyTenant).toHaveBeenCalledWith('tenant-1');
    expect(result).toEqual(identity);
  });
});

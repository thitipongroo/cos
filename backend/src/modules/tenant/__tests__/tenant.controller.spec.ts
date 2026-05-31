// Unit tests for TenantController — delegates to TenantService

const mockTenantService = {
  createTenant: jest.fn(),
  deactivateTenant: jest.fn(),
};

import { TenantController } from '../tenant.controller';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';

describe('TenantController', () => {
  let controller: TenantController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new TenantController(mockTenantService as never);
  });

  describe('create', () => {
    it('delegates to tenantService.createTenant with userId from request', async () => {
      const dto = { tenant_code: 'acme', tenant_name: 'Acme Corp' } as never;
      const req = { userId: 'admin-user' } as never;
      const tenant = { tenant_id: TENANT_ID };
      mockTenantService.createTenant.mockResolvedValue(tenant);

      const result = await controller.create(dto, req);
      expect(mockTenantService.createTenant).toHaveBeenCalledWith(dto, 'admin-user');
      expect(result).toBe(tenant);
    });

    it('falls back to "system" when userId missing from request', async () => {
      const dto = { tenant_code: 'acme', tenant_name: 'Acme Corp' } as never;
      const req = {} as never;
      mockTenantService.createTenant.mockResolvedValue({});

      await controller.create(dto, req);
      expect(mockTenantService.createTenant).toHaveBeenCalledWith(dto, 'system');
    });
  });

  describe('deactivate', () => {
    it('delegates to tenantService.deactivateTenant and returns message', async () => {
      const req = { userId: 'admin-user' } as never;
      mockTenantService.deactivateTenant.mockResolvedValue(undefined);

      const result = await controller.deactivate(TENANT_ID, req);
      expect(mockTenantService.deactivateTenant).toHaveBeenCalledWith(TENANT_ID, 'admin-user');
      expect(result).toEqual({ message: 'Tenant deactivated' });
    });

    it('falls back to "system" when userId missing', async () => {
      const req = {} as never;
      mockTenantService.deactivateTenant.mockResolvedValue(undefined);

      await controller.deactivate(TENANT_ID, req);
      expect(mockTenantService.deactivateTenant).toHaveBeenCalledWith(TENANT_ID, 'system');
    });
  });
});

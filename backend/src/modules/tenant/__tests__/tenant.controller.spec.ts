// Unit tests for TenantController — delegates to TenantService

const mockTenantService = {
  createTenant: jest.fn(),
  deactivateTenant: jest.fn(),
  assignDedicatedDb: jest.fn(),
  markAsEnterpriseContracted: jest.fn(),
  listTenants: jest.fn(),
  listProvisioning: jest.fn(),
  decideProvisioning: jest.fn(),
};

import { TenantController } from '../tenant.controller';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const JUSTIFICATION = 'Customer signed the enterprise contract (ticket OPS-4412).';

describe('TenantController', () => {
  let controller: TenantController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new TenantController(mockTenantService as never);
  });

  describe('list', () => {
    it('delegates to tenantService.listTenants', async () => {
      mockTenantService.listTenants.mockResolvedValue([{ tenant_id: 't1' }]);
      expect(await controller.list()).toHaveLength(1);
    });
  });

  describe('listProvisioning', () => {
    it('delegates to tenantService.listProvisioning', async () => {
      const rows = [{ tenant_id: 't1', workflow_state: 'AWAITING_APPROVAL' }];
      mockTenantService.listProvisioning.mockResolvedValue(rows);
      expect(await controller.listProvisioning()).toBe(rows);
    });
  });

  describe('create', () => {
    it('passes the dto, the actor and the justification', async () => {
      const dto = {
        tenantCode: 'acme',
        tenantName: 'Acme Corp',
        justification: JUSTIFICATION,
      } as never;
      const req = { userId: 'admin-user' } as never;
      const tenant = { tenant_id: TENANT_ID };
      mockTenantService.createTenant.mockResolvedValue(tenant);

      const result = await controller.create(dto, req);
      expect(mockTenantService.createTenant).toHaveBeenCalledWith(dto, 'admin-user', JUSTIFICATION);
      expect(result).toBe(tenant);
    });

    it('falls back to "system" when userId missing from request', async () => {
      const dto = { tenantCode: 'acme', justification: JUSTIFICATION } as never;
      mockTenantService.createTenant.mockResolvedValue({});

      await controller.create(dto, {} as never);
      expect(mockTenantService.createTenant).toHaveBeenCalledWith(dto, 'system', JUSTIFICATION);
    });
  });

  describe('deactivate', () => {
    it('delegates with the justification and returns message', async () => {
      mockTenantService.deactivateTenant.mockResolvedValue(undefined);

      const result = await controller.deactivate(TENANT_ID, { justification: JUSTIFICATION }, {
        userId: 'admin-user',
      } as never);
      expect(mockTenantService.deactivateTenant).toHaveBeenCalledWith(
        TENANT_ID,
        'admin-user',
        JUSTIFICATION,
      );
      expect(result).toEqual({ message: 'Tenant deactivated' });
    });

    it('falls back to "system" when userId missing', async () => {
      mockTenantService.deactivateTenant.mockResolvedValue(undefined);
      await controller.deactivate(TENANT_ID, { justification: JUSTIFICATION }, {} as never);
      expect(mockTenantService.deactivateTenant).toHaveBeenCalledWith(
        TENANT_ID,
        'system',
        JUSTIFICATION,
      );
    });
  });

  describe('assignDedicatedDb', () => {
    it('delegates to tenantService and returns success message', async () => {
      const dto = { dedicatedDbUrl: 'postgresql://host/db', justification: JUSTIFICATION } as never;
      mockTenantService.assignDedicatedDb.mockResolvedValue(undefined);

      const result = await controller.assignDedicatedDb(TENANT_ID, dto, {
        userId: 'admin-user',
      } as never);
      expect(mockTenantService.assignDedicatedDb).toHaveBeenCalledWith(
        TENANT_ID,
        'postgresql://host/db',
        'admin-user',
        JUSTIFICATION,
      );
      expect(result).toEqual({ message: 'Dedicated DB assigned' });
    });

    it('falls back to "system" when userId missing', async () => {
      const dto = { dedicatedDbUrl: 'postgresql://host/db', justification: JUSTIFICATION } as never;
      mockTenantService.assignDedicatedDb.mockResolvedValue(undefined);

      await controller.assignDedicatedDb(TENANT_ID, dto, {} as never);
      expect(mockTenantService.assignDedicatedDb).toHaveBeenCalledWith(
        TENANT_ID,
        'postgresql://host/db',
        'system',
        JUSTIFICATION,
      );
    });
  });

  describe('markContracted', () => {
    it('delegates to tenantService and returns workflowId response', async () => {
      const dto = { contractReference: 'CRM-001', justification: JUSTIFICATION } as never;
      const WORKFLOW_ID = `enterprise-provisioning-${TENANT_ID}`;
      mockTenantService.markAsEnterpriseContracted.mockResolvedValue({ workflowId: WORKFLOW_ID });

      const result = await controller.markContracted(TENANT_ID, dto, {
        userId: 'admin-user',
      } as never);
      expect(mockTenantService.markAsEnterpriseContracted).toHaveBeenCalledWith(
        TENANT_ID,
        'CRM-001',
        'admin-user',
        JUSTIFICATION,
      );
      expect(result).toEqual({
        message: 'Enterprise provisioning workflow started',
        workflowId: WORKFLOW_ID,
        tenantId: TENANT_ID,
      });
    });

    it('falls back to "system" when userId missing', async () => {
      const dto = { contractReference: undefined, justification: JUSTIFICATION } as never;
      mockTenantService.markAsEnterpriseContracted.mockResolvedValue({
        workflowId: `enterprise-provisioning-${TENANT_ID}`,
      });

      await controller.markContracted(TENANT_ID, dto, {} as never);
      expect(mockTenantService.markAsEnterpriseContracted).toHaveBeenCalledWith(
        TENANT_ID,
        undefined,
        'system',
        JUSTIFICATION,
      );
    });
  });

  describe.each([
    ['approveProvisioning', 'approve'],
    ['abortProvisioning', 'abort'],
  ] as const)('%s', (method, decision) => {
    it(`sends '${decision}' with the actor and the justification`, async () => {
      const out = { workflowId: `enterprise-provisioning-${TENANT_ID}`, decision };
      mockTenantService.decideProvisioning.mockResolvedValue(out);

      const result = await controller[method](TENANT_ID, { justification: JUSTIFICATION }, {
        userId: 'admin-user',
      } as never);
      expect(mockTenantService.decideProvisioning).toHaveBeenCalledWith(
        TENANT_ID,
        decision,
        'admin-user',
        JUSTIFICATION,
      );
      expect(result).toBe(out);
    });

    it('falls back to "system" when userId missing', async () => {
      await controller[method](TENANT_ID, { justification: JUSTIFICATION }, {} as never);
      expect(mockTenantService.decideProvisioning).toHaveBeenCalledWith(
        TENANT_ID,
        decision,
        'system',
        JUSTIFICATION,
      );
    });
  });
});

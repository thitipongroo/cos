// Unit tests for TenantController — delegates to TenantService

const mockTenantService = {
  createTenant: jest.fn(),
  createTrialTenant: jest.fn(),
  convertTenant: jest.fn(),
  deactivateTenant: jest.fn(),
  assignDedicatedDb: jest.fn(),
  markAsEnterpriseContracted: jest.fn(),
  listTenants: jest.fn(),
  listProvisioning: jest.fn(),
  decideProvisioning: jest.fn(),
};

const mockTenantAdmins = {
  bootstrap: jest.fn(),
  resendInvite: jest.fn(),
};

import { TenantController } from '../tenant.controller';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const JUSTIFICATION = 'Customer signed the enterprise contract (ticket OPS-4412).';

describe('TenantController', () => {
  let controller: TenantController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new TenantController(mockTenantService as never, mockTenantAdmins as never);
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

  // ADR-110 — both endpoints delegate to TenantAdminBootstrapService with the actor and the justification.
  describe('bootstrapAdmin', () => {
    it('passes the tenant, the account, the actor and the justification', async () => {
      const result = { user_id: 'u1', email: 'a@b.co', invite_sent: true, invite_expires_at: null };
      mockTenantAdmins.bootstrap.mockResolvedValue(result);

      expect(
        await controller.bootstrapAdmin(
          TENANT_ID,
          { email: 'a@b.co', display_name: 'Somchai', justification: JUSTIFICATION } as never,
          { userId: 'admin-user' } as never,
        ),
      ).toBe(result);
      expect(mockTenantAdmins.bootstrap).toHaveBeenCalledWith(
        TENANT_ID,
        { email: 'a@b.co', display_name: 'Somchai' },
        'admin-user',
        JUSTIFICATION,
      );
    });

    it("falls back to 'system' with no userId", async () => {
      await controller.bootstrapAdmin(
        TENANT_ID,
        { email: 'a@b.co', display_name: 'S', justification: JUSTIFICATION } as never,
        {} as never,
      );
      expect(mockTenantAdmins.bootstrap.mock.calls[0]![2]).toBe('system');
    });
  });

  describe('resendAdminInvite', () => {
    it('passes the tenant, the actor and the justification', async () => {
      mockTenantAdmins.resendInvite.mockResolvedValue({ invite_sent: true });
      await controller.resendAdminInvite(TENANT_ID, { justification: JUSTIFICATION }, {
        userId: 'admin-user',
      } as never);
      expect(mockTenantAdmins.resendInvite).toHaveBeenCalledWith(
        TENANT_ID,
        'admin-user',
        JUSTIFICATION,
      );
    });

    it("falls back to 'system' with no userId", async () => {
      await controller.resendAdminInvite(TENANT_ID, { justification: JUSTIFICATION }, {} as never);
      expect(mockTenantAdmins.resendInvite.mock.calls[0]![1]).toBe('system');
    });
  });

  describe('createTrial', () => {
    it('passes the body without the justification, the actor and the justification', async () => {
      const body = { tenantCode: 'somchai_build', tenantName: 'Somchai', planType: 'STARTER' };
      const row = { tenant_id: TENANT_ID, subscription_status: 'TRIAL' };
      mockTenantService.createTrialTenant.mockResolvedValue(row);

      const result = await controller.createTrial(
        { ...body, justification: JUSTIFICATION } as never,
        { userId: 'admin-user' } as never,
      );
      expect(mockTenantService.createTrialTenant).toHaveBeenCalledWith(
        body,
        'admin-user',
        JUSTIFICATION,
      );
      expect(result).toBe(row);
    });

    it('falls back to "system" when userId missing from request', async () => {
      await controller.createTrial({ justification: JUSTIFICATION } as never, {} as never);
      expect(mockTenantService.createTrialTenant).toHaveBeenCalledWith({}, 'system', JUSTIFICATION);
    });
  });

  describe('convert', () => {
    it('passes the tenant, the plan, the actor and the justification', async () => {
      const row = { tenant_id: TENANT_ID, subscription_status: 'ACTIVE' };
      mockTenantService.convertTenant.mockResolvedValue(row);

      const result = await controller.convert(
        TENANT_ID,
        { planType: 'PROFESSIONAL', justification: JUSTIFICATION } as never,
        { userId: 'admin-user' } as never,
      );
      expect(mockTenantService.convertTenant).toHaveBeenCalledWith(
        TENANT_ID,
        'PROFESSIONAL',
        'admin-user',
        JUSTIFICATION,
      );
      expect(result).toBe(row);
    });

    it('falls back to "system" when userId missing from request', async () => {
      await controller.convert(
        TENANT_ID,
        { planType: 'LITE', justification: JUSTIFICATION } as never,
        {} as never,
      );
      expect(mockTenantService.convertTenant).toHaveBeenCalledWith(
        TENANT_ID,
        'LITE',
        'system',
        JUSTIFICATION,
      );
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

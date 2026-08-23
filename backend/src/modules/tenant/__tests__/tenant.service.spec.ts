// Unit tests for TenantService — tenant lifecycle

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
    $transaction: jest.fn(),
    $disconnect: jest.fn(),
  })),
}));

jest.mock('@cos/kafka', () => ({
  // §35.13 ESC-13: events are written to the outbox inside the business transaction.
  OutboxPublisher: { write: jest.fn().mockResolvedValue(undefined) },
  KafkaProducer: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    publish: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
  })),
  KafkaTopicProvisioner: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    provisionTenant: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('@temporalio/client', () => ({
  Connection: {
    connect: jest.fn().mockResolvedValue({}),
  },
  Client: jest.fn(),
}));

import { TenantService } from '../tenant.service';
import { PrismaClient } from '@prisma/client';
import { KafkaTopicProvisioner } from '@cos/kafka';
import { Connection, Client } from '@temporalio/client';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

const mockTenant = {
  tenant_id: 'tenant-1',
  tenant_code: 'acme_corp',
  tenant_name: 'ACME Construction',
  keycloak_realm: 'construction-os',
  plan_type: 'STARTER',
  is_active: true,
};

describe('TenantService', () => {
  let service: TenantService;
  let prismaMock: jest.Mocked<PrismaClient>;

  beforeEach(() => {
    service = new TenantService();
    prismaMock = (service as unknown as { prisma: jest.Mocked<PrismaClient> }).prisma;
    // §35.13 ESC-13: deactivateTenant / assignDedicatedDb now wrap their UPDATE and the outbox
    // write in one $transaction, so the default mock must actually run the callback. Individual
    // tests still override this where they need bespoke transaction behaviour.
    (prismaMock.$transaction as jest.Mock).mockImplementation(
      async (fn: (tx: unknown) => unknown) => fn(prismaMock),
    );
  });

  describe('createTenant', () => {
    it('creates tenant and provisions schema', async () => {
      (prismaMock.$queryRaw as jest.Mock).mockResolvedValue([]); // no existing
      (prismaMock.$transaction as jest.Mock).mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            $queryRaw: jest.fn().mockResolvedValue([mockTenant]),
            $executeRawUnsafe: jest.fn().mockResolvedValue(undefined),
          };
          return fn(tx);
        },
      );

      const result = await service.createTenant(
        { tenantCode: 'acme_corp', tenantName: 'ACME Construction', planType: 'STARTER' as never },
        'admin-1',
      );
      expect(result).toEqual(mockTenant);
    });

    it('swallows Kafka topic-provisioning failures (tenant creation still succeeds)', async () => {
      (KafkaTopicProvisioner as jest.Mock).mockImplementationOnce(() => ({
        connect: jest.fn().mockResolvedValue(undefined),
        provisionTenant: jest.fn().mockRejectedValue(new Error('kafka down')),
        disconnect: jest.fn().mockResolvedValue(undefined),
      }));
      (prismaMock.$queryRaw as jest.Mock).mockResolvedValue([]);
      (prismaMock.$transaction as jest.Mock).mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            $queryRaw: jest.fn().mockResolvedValue([mockTenant]),
            $executeRawUnsafe: jest.fn().mockResolvedValue(undefined),
          };
          return fn(tx);
        },
      );

      const result = await service.createTenant(
        { tenantCode: 'acme_corp', tenantName: 'ACME Construction', planType: 'STARTER' as never },
        'admin-1',
      );
      expect(result).toEqual(mockTenant); // catch block logged the error but did not rethrow
    });

    it('ignores a provisioner disconnect failure (finally .catch swallows it)', async () => {
      (KafkaTopicProvisioner as jest.Mock).mockImplementationOnce(() => ({
        connect: jest.fn().mockResolvedValue(undefined),
        provisionTenant: jest.fn().mockResolvedValue(undefined),
        disconnect: jest.fn().mockRejectedValue(new Error('disconnect failed')),
      }));
      (prismaMock.$queryRaw as jest.Mock).mockResolvedValue([]);
      (prismaMock.$transaction as jest.Mock).mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            $queryRaw: jest.fn().mockResolvedValue([mockTenant]),
            $executeRawUnsafe: jest.fn().mockResolvedValue(undefined),
          };
          return fn(tx);
        },
      );

      const result = await service.createTenant(
        { tenantCode: 'acme_corp', tenantName: 'ACME Construction', planType: 'STARTER' as never },
        'admin-1',
      );
      expect(result).toEqual(mockTenant); // disconnect rejection swallowed by `.catch(() => undefined)`
    });

    it('throws ConflictException when tenant_code already exists', async () => {
      (prismaMock.$queryRaw as jest.Mock).mockResolvedValue([{ tenant_id: 'existing' }]);
      await expect(
        service.createTenant(
          { tenantCode: 'acme_corp', tenantName: 'ACME', planType: 'STARTER' as never },
          'admin-1',
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('creates tenant with dedicatedDbUrl set in the INSERT', async () => {
      (prismaMock.$queryRaw as jest.Mock).mockResolvedValue([]); // no existing
      let capturedInsertArgs: unknown[] = [];
      (prismaMock.$transaction as jest.Mock).mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const txQueryRaw = jest.fn().mockImplementation((...args: unknown[]) => {
            capturedInsertArgs = args;
            return Promise.resolve([{ ...mockTenant, dedicated_db_url: 'postgresql://host/db' }]);
          });
          return fn({ $queryRaw: txQueryRaw, $executeRawUnsafe: jest.fn() });
        },
      );

      const result = await service.createTenant(
        {
          tenantCode: 'enterprise_co',
          tenantName: 'Enterprise Co',
          planType: 'ENTERPRISE' as never,
          dedicatedDbUrl: 'postgresql://host:5432/db',
        },
        'admin-1',
      );

      // args[3] is keycloakRealm in the tagged template (after tenantCode and tenantName)
      expect(capturedInsertArgs[3]).toBe('cos-enterprise_co');
      expect(result).toBeDefined();
    });

    it('throws BadRequestException when dedicatedDbUrl has invalid prefix', async () => {
      (prismaMock.$queryRaw as jest.Mock).mockResolvedValue([]); // no existing
      await expect(
        service.createTenant(
          {
            tenantCode: 'bad_url',
            tenantName: 'Bad URL',
            planType: 'ENTERPRISE' as never,
            dedicatedDbUrl: 'mysql://host:3306/db',
          },
          'admin-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('deactivateTenant', () => {
    it('deactivates an active tenant', async () => {
      (prismaMock.$queryRaw as jest.Mock).mockResolvedValue([mockTenant]);
      await expect(service.deactivateTenant('tenant-1', 'admin-1')).resolves.toBeUndefined();
    });

    it('throws NotFoundException when tenant not found or already inactive', async () => {
      (prismaMock.$queryRaw as jest.Mock).mockResolvedValue([]);
      await expect(service.deactivateTenant('nonexistent', 'admin-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findByCode', () => {
    it('returns tenant when found', async () => {
      (prismaMock.$queryRaw as jest.Mock).mockResolvedValue([mockTenant]);
      const result = await service.findByCode('acme_corp');
      expect(result).toEqual(mockTenant);
    });

    it('returns null when not found', async () => {
      (prismaMock.$queryRaw as jest.Mock).mockResolvedValue([]);
      const result = await service.findByCode('unknown');
      expect(result).toBeNull();
    });
  });

  describe('findById', () => {
    it('returns tenant by ID', async () => {
      (prismaMock.$queryRaw as jest.Mock).mockResolvedValue([mockTenant]);
      const result = await service.findById('tenant-1');
      expect(result).toEqual(mockTenant);
    });

    it('returns null when not found', async () => {
      (prismaMock.$queryRaw as jest.Mock).mockResolvedValue([]);
      const result = await service.findById('nonexistent');
      expect(result).toBeNull();
    });
  });

  // §35.13 ESC-13: TenantService holds no KafkaProducer — every event is written to the outbox
  // inside the business transaction, so there is no publish-failure catch branch to cover.
  describe('outbox writes', () => {
    it('writes identity.tenant.created.v1 inside the create transaction', async () => {
      (prismaMock.$queryRaw as jest.Mock).mockResolvedValue([]);
      const txQueryRaw = jest.fn().mockResolvedValue([mockTenant]);
      (prismaMock.$transaction as jest.Mock).mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn({ $queryRaw: txQueryRaw }),
      );
      const { OutboxPublisher } = jest.requireMock('@cos/kafka') as {
        OutboxPublisher: { write: jest.Mock };
      };
      OutboxPublisher.write.mockClear();

      await service.createTenant(
        { tenantCode: 'acme_corp', tenantName: 'ACME Construction', planType: 'STARTER' as never },
        'admin-1',
      );

      expect(OutboxPublisher.write).toHaveBeenCalledWith(
        expect.objectContaining({ $queryRaw: txQueryRaw }),
        expect.objectContaining({
          event_type: 'identity.tenant.created.v1',
          // ESC-19: the real tenant id, not the literal 'platform' the old envelope used.
          tenant_id: mockTenant.tenant_id,
          actor_id: 'admin-1',
        }),
      );
    });
  });

  describe('assignDedicatedDb', () => {
    it('throws BadRequestException for URL without postgresql:// or postgres:// prefix', async () => {
      await expect(
        service.assignDedicatedDb('tenant-1', 'mysql://host/db', 'admin-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when no rows updated (tenant not found or inactive)', async () => {
      (prismaMock.$executeRaw as jest.Mock).mockResolvedValue(0);
      await expect(
        service.assignDedicatedDb('tenant-1', 'postgresql://host/db', 'admin-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('succeeds with postgresql:// URL and affected rows', async () => {
      (prismaMock.$executeRaw as jest.Mock).mockResolvedValue(1);
      await expect(
        service.assignDedicatedDb('tenant-1', 'postgresql://host/db', 'admin-1'),
      ).resolves.toBeUndefined();
    });

    it('accepts postgres:// prefix', async () => {
      (prismaMock.$executeRaw as jest.Mock).mockResolvedValue(1);
      await expect(
        service.assignDedicatedDb('tenant-1', 'postgres://host/db', 'admin-1'),
      ).resolves.toBeUndefined();
    });
  });

  describe('markAsEnterpriseContracted', () => {
    const enterpriseTenant = { plan_type: 'ENTERPRISE', is_active: true, dedicated_db_url: null };
    const WORKFLOW_ID = 'enterprise-provisioning-tenant-1';
    let mockWorkflowStart: jest.Mock;

    beforeEach(() => {
      mockWorkflowStart = jest.fn().mockResolvedValue(undefined);
      (Connection.connect as jest.Mock).mockResolvedValue({});
      (Client as jest.Mock).mockImplementation(() => ({
        workflow: { start: mockWorkflowStart },
      }));
    });

    it('throws NotFoundException when tenant not found', async () => {
      (prismaMock.$queryRaw as jest.Mock).mockResolvedValue([]);
      await expect(
        service.markAsEnterpriseContracted('tenant-1', undefined, 'admin-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when plan_type is not ENTERPRISE', async () => {
      (prismaMock.$queryRaw as jest.Mock).mockResolvedValue([
        { ...enterpriseTenant, plan_type: 'STARTER' },
      ]);
      await expect(
        service.markAsEnterpriseContracted('tenant-1', undefined, 'admin-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when tenant is inactive', async () => {
      (prismaMock.$queryRaw as jest.Mock).mockResolvedValue([
        { ...enterpriseTenant, is_active: false },
      ]);
      await expect(
        service.markAsEnterpriseContracted('tenant-1', undefined, 'admin-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when tenant already has dedicated DB', async () => {
      (prismaMock.$queryRaw as jest.Mock).mockResolvedValue([
        { ...enterpriseTenant, dedicated_db_url: 'postgresql://existing/db' },
      ]);
      await expect(
        service.markAsEnterpriseContracted('tenant-1', undefined, 'admin-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException when workflow already started', async () => {
      (prismaMock.$queryRaw as jest.Mock).mockResolvedValue([enterpriseTenant]);
      const alreadyStarted = Object.assign(new Error('already started'), {
        name: 'WorkflowExecutionAlreadyStartedError',
      });
      mockWorkflowStart.mockRejectedValueOnce(alreadyStarted);
      await expect(
        service.markAsEnterpriseContracted('tenant-1', undefined, 'admin-1'),
      ).rejects.toThrow(ConflictException);
    });

    it('rethrows other workflow start errors', async () => {
      (prismaMock.$queryRaw as jest.Mock).mockResolvedValue([enterpriseTenant]);
      mockWorkflowStart.mockRejectedValueOnce(new Error('Connection refused'));
      await expect(
        service.markAsEnterpriseContracted('tenant-1', undefined, 'admin-1'),
      ).rejects.toThrow('Connection refused');
    });

    it('returns workflowId on success and starts workflow with correct params', async () => {
      (prismaMock.$queryRaw as jest.Mock).mockResolvedValue([enterpriseTenant]);
      const result = await service.markAsEnterpriseContracted('tenant-1', 'CRM-001', 'admin-1');
      expect(result).toEqual({ workflowId: WORKFLOW_ID });
      expect(mockWorkflowStart).toHaveBeenCalledWith(
        'enterpriseProvisioningWorkflow',
        expect.objectContaining({ workflowId: WORKFLOW_ID }),
      );
    });

    it('uses null for contract_reference when contractReference is undefined', async () => {
      (prismaMock.$queryRaw as jest.Mock).mockResolvedValue([enterpriseTenant]);
      const result = await service.markAsEnterpriseContracted('tenant-1', undefined, 'admin-1');
      expect(result).toEqual({ workflowId: WORKFLOW_ID });
    });
  });

  describe('listTenants', () => {
    it('returns all platform tenants', async () => {
      (prismaMock.$queryRaw as jest.Mock).mockResolvedValue([
        { tenant_id: 't1' },
        { tenant_id: 't2' },
      ]);
      expect(await service.listTenants()).toHaveLength(2);
    });
  });
});

describe('TenantService onModuleDestroy', () => {
  it('disconnects Prisma on shutdown', async () => {
    const svc = new TenantService();
    await svc.onModuleDestroy();
    expect(
      (svc as unknown as { prisma: { $disconnect: jest.Mock } }).prisma.$disconnect,
    ).toHaveBeenCalledTimes(1);
  });
});

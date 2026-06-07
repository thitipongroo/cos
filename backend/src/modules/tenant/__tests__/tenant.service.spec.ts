// Unit tests for TenantService — tenant lifecycle

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
    $transaction: jest.fn(),
    $disconnect: jest.fn(),
  })),
}));

jest.mock('@cos/shared', () => ({
  KafkaProducer: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    publish: jest.fn().mockResolvedValue(undefined),
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
import { Connection, Client } from '@temporalio/client';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

const mockTenant = {
  tenant_id: 'tenant-1',
  tenant_code: 'acme_corp',
  tenant_name: 'ACME Construction',
  keycloak_realm: 'cos-acme_corp',
  plan_type: 'STARTER',
  is_active: true,
};

describe('TenantService', () => {
  let service: TenantService;
  let prismaMock: jest.Mocked<PrismaClient>;

  beforeEach(() => {
    service = new TenantService();
    prismaMock = (service as unknown as { prisma: jest.Mocked<PrismaClient> }).prisma;
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

    it('throws ConflictException when tenant_code already exists', async () => {
      (prismaMock.$queryRaw as jest.Mock).mockResolvedValue([{ tenant_id: 'existing' }]);
      await expect(
        service.createTenant(
          { tenantCode: 'acme_corp', tenantName: 'ACME', planType: 'STARTER' as never },
          'admin-1',
        ),
      ).rejects.toThrow(ConflictException);
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

  describe('publishEvent error handling', () => {
    it('logs error but does not throw when Kafka publish fails (covers catch branch)', async () => {
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
      const kafkaMock = (
        service as unknown as {
          kafka: { connect: jest.Mock; publish: jest.Mock; disconnect: jest.Mock };
        }
      ).kafka;
      kafkaMock.publish.mockRejectedValueOnce(new Error('Kafka unavailable'));

      await expect(
        service.createTenant(
          {
            tenantCode: 'acme_corp',
            tenantName: 'ACME Construction',
            planType: 'STARTER' as never,
          },
          'admin-1',
        ),
      ).resolves.toBeDefined();
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
});

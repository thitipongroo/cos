// Unit tests for TenantService — tenant lifecycle

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    $queryRaw: jest.fn(),
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

import { TenantService } from '../tenant.service';
import { PrismaClient } from '@prisma/client';
import { ConflictException, NotFoundException } from '@nestjs/common';

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
});

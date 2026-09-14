// Unit tests for TenantService — tenant lifecycle

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
    // The audit writer sets app.current_tenant_id with SET LOCAL (a GUC cannot be a bound parameter).
    $executeRawUnsafe: jest.fn(),
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

jest.mock('@temporalio/client', () => {
  class WorkflowNotFoundError extends Error {}
  return {
    Connection: {
      connect: jest.fn().mockResolvedValue({}),
    },
    Client: jest.fn(),
    WorkflowNotFoundError,
  };
});

import { TenantService, dedicatedDbHost, defaultTimezoneForRegion } from '../tenant.service';
import { PrismaClient } from '@prisma/client';
import { KafkaTopicProvisioner } from '@cos/kafka';
import { Connection, Client, WorkflowNotFoundError } from '@temporalio/client';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { approveSignal, abortSignal } from '../workflows/enterprise-provisioning.workflow';

// A real UUID: every audited action validates the target tenant id before it is interpolated into
// `SET LOCAL app.current_tenant_id` (QM-4), so the non-UUID ids these tests used to pass would now be
// refused — correctly.
const TENANT_UUID = '11111111-1111-4111-8111-111111111111';
const JUSTIFICATION = 'Customer signed the enterprise contract (ticket OPS-4412).';

const mockTenant = {
  tenant_id: TENANT_UUID,
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
    // FeatureFlagService gates encrypt-on-write for dedicated_db_url (security review F5b). Default
    // the flag OFF so these existing assertions keep comparing against the plaintext URL; the cipher
    // has its own dedicated spec.
    service = new TenantService({ isEnabled: () => false } as never);
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
            $executeRaw: jest.fn().mockResolvedValue(1),
            $executeRawUnsafe: jest.fn().mockResolvedValue(undefined),
          };
          return fn(tx);
        },
      );

      const result = await service.createTenant(
        { tenantCode: 'acme_corp', tenantName: 'ACME Construction', planType: 'STARTER' as never },
        'admin-1',
        JUSTIFICATION,
      );
      expect(result).toEqual(mockTenant);
    });

    // Regression: the payload was built from tenant.tenantId / .tenantCode / .tenantName /
    // .planType, but `$queryRaw` returns RAW column names — Prisma's @map is not applied — so all
    // four were undefined. identity.tenant.created.v1's Avro schema declares them non-null strings,
    // so every encode failed and publishEvent's catch swallowed it: the event was never delivered.
    it('writes identity.tenant.created.v1 with a fully populated payload', async () => {
      (prismaMock.$queryRaw as jest.Mock).mockResolvedValue([]);
      (prismaMock.$transaction as jest.Mock).mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            $queryRaw: jest.fn().mockResolvedValue([mockTenant]),
            $executeRaw: jest.fn().mockResolvedValue(1),
            $executeRawUnsafe: jest.fn().mockResolvedValue(undefined),
          };
          return fn(tx);
        },
      );
      const { OutboxPublisher } = jest.requireMock('@cos/kafka') as {
        OutboxPublisher: { write: jest.Mock };
      };
      OutboxPublisher.write.mockClear();

      await service.createTenant(
        { tenantCode: 'acme_corp', tenantName: 'ACME Construction', planType: 'STARTER' as never },
        'admin-1',
        JUSTIFICATION,
      );

      const created = OutboxPublisher.write.mock.calls.find(
        (c) => (c[1] as { event_type?: string })?.event_type === 'identity.tenant.created.v1',
      );
      expect(created).toBeDefined();
      const payload = (created![1] as { payload: Record<string, unknown> }).payload;
      expect(payload).toEqual({
        tenant_id: TENANT_UUID,
        tenant_code: 'acme_corp',
        tenant_name: 'ACME Construction',
        plan_type: 'STARTER',
      });
      // ESC-20: `$queryRaw` returns raw snake_case columns — Prisma's @map is not applied — so the
      // camelCase reads this envelope used to make were all undefined and every Avro encode failed.
      // Each required field is asserted present, which is exactly what that bug removed.
      for (const v of Object.values(payload)) {
        expect(v).toBeDefined();
      }
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
            $executeRaw: jest.fn().mockResolvedValue(1),
            $executeRawUnsafe: jest.fn().mockResolvedValue(undefined),
          };
          return fn(tx);
        },
      );

      const result = await service.createTenant(
        { tenantCode: 'acme_corp', tenantName: 'ACME Construction', planType: 'STARTER' as never },
        'admin-1',
        JUSTIFICATION,
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
            $executeRaw: jest.fn().mockResolvedValue(1),
            $executeRawUnsafe: jest.fn().mockResolvedValue(undefined),
          };
          return fn(tx);
        },
      );

      const result = await service.createTenant(
        { tenantCode: 'acme_corp', tenantName: 'ACME Construction', planType: 'STARTER' as never },
        'admin-1',
        JUSTIFICATION,
      );
      expect(result).toEqual(mockTenant); // disconnect rejection swallowed by `.catch(() => undefined)`
    });

    it('throws ConflictException when tenant_code already exists', async () => {
      (prismaMock.$queryRaw as jest.Mock).mockResolvedValue([{ tenant_id: 'existing' }]);
      await expect(
        service.createTenant(
          { tenantCode: 'acme_corp', tenantName: 'ACME', planType: 'STARTER' as never },
          'admin-1',
          JUSTIFICATION,
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
          return fn({
            $queryRaw: txQueryRaw,
            $executeRaw: jest.fn().mockResolvedValue(1),
            $executeRawUnsafe: jest.fn(),
          });
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
        JUSTIFICATION,
      );

      // args[3] is keycloakRealm in the tagged template (after tenantCode and tenantName)
      expect(capturedInsertArgs[3]).toBe('cos-enterprise_co');
      expect(result).toBeDefined();
    });

    it('seeds the Thailand WHT defaults inside the same transaction (§13.3)', async () => {
      // §13.3 says the Thai rates are "pre-seeded at tenant provisioning" and nothing did it, so
      // WhtService.calculate threw NotFoundException for every tenant ever created. The seed runs
      // on the transaction client, not the outer one: a tenant that exists without its statutory
      // defaults is the state being fixed and must not be reachable by a partial failure.
      let txExecuteRaw!: jest.Mock;
      (prismaMock.$queryRaw as jest.Mock).mockResolvedValue([]);
      (prismaMock.$transaction as jest.Mock).mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          txExecuteRaw = jest.fn().mockResolvedValue(2);
          return fn({
            $queryRaw: jest.fn().mockResolvedValue([mockTenant]),
            $executeRaw: txExecuteRaw,
            $executeRawUnsafe: jest.fn(),
          });
        },
      );

      await service.createTenant(
        { tenantCode: 'seed_co', tenantName: 'Seed Co', planType: 'STARTER' as never },
        'admin-1',
        JUSTIFICATION,
      );

      // Two statements on the transaction client since 2026-09-14: the WHT seed and the audit row.
      const whtCall = txExecuteRaw.mock.calls.find((c) =>
        (c[0] as string[]).join('?').includes('finance.wht_rules'),
      )!;
      expect(whtCall).toBeDefined();
      const sql = (whtCall[0] as string[]).join('?');
      expect(sql).toContain('finance.wht_rules');
      expect(sql).toContain("'TH', 'services', 3.00");
      expect(sql).toContain("'TH', 'rent',     5.00");
      // Idempotent: re-provisioning must not overwrite a TENANT_ADMIN's override.
      expect(sql).toContain('ON CONFLICT ON CONSTRAINT wht_rules_unique DO NOTHING');
      // Bound to the tenant just created, not to anything ambient.
      expect(whtCall).toContain(mockTenant.tenant_id);
    });

    it('defaults data_region to ap-southeast-1 when not provided (§5.6)', async () => {
      (prismaMock.$queryRaw as jest.Mock).mockResolvedValue([]); // no existing
      let capturedInsertArgs: unknown[] = [];
      (prismaMock.$transaction as jest.Mock).mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const txQueryRaw = jest.fn().mockImplementation((...args: unknown[]) => {
            capturedInsertArgs = args;
            return Promise.resolve([mockTenant]);
          });
          return fn({
            $queryRaw: txQueryRaw,
            $executeRaw: jest.fn().mockResolvedValue(1),
            $executeRawUnsafe: jest.fn(),
          });
        },
      );

      await service.createTenant(
        { tenantCode: 'acme_corp', tenantName: 'ACME Construction', planType: 'STARTER' as never },
        'admin-1',
        JUSTIFICATION,
      );

      // data_region is the 6th INSERT value (tenant_code, tenant_name, keycloak_realm, plan_type,
      // dedicated_db_url, data_region) -> tagged-template arg index 6; the `?? 'ap-southeast-1'` default.
      expect(capturedInsertArgs[6]).toBe('ap-southeast-1');
    });

    it('sets the explicit data_region in the INSERT when provided (§5.6)', async () => {
      (prismaMock.$queryRaw as jest.Mock).mockResolvedValue([]); // no existing
      let capturedInsertArgs: unknown[] = [];
      (prismaMock.$transaction as jest.Mock).mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const txQueryRaw = jest.fn().mockImplementation((...args: unknown[]) => {
            capturedInsertArgs = args;
            return Promise.resolve([{ ...mockTenant, data_region: 'ap-southeast-7' }]);
          });
          return fn({
            $queryRaw: txQueryRaw,
            $executeRaw: jest.fn().mockResolvedValue(1),
            $executeRawUnsafe: jest.fn(),
          });
        },
      );

      await service.createTenant(
        {
          tenantCode: 'thai_co',
          tenantName: 'Thai Construction',
          planType: 'STARTER' as never,
          dataRegion: 'ap-southeast-7',
        },
        'admin-1',
        JUSTIFICATION,
      );

      expect(capturedInsertArgs[6]).toBe('ap-southeast-7');
    });

    it('defaultTimezoneForRegion maps regions and falls back to Asia/Bangkok', () => {
      expect(defaultTimezoneForRegion('ap-southeast-7')).toBe('Asia/Bangkok');
      expect(defaultTimezoneForRegion('ap-southeast-1')).toBe('Asia/Singapore');
      expect(defaultTimezoneForRegion('eu-west-1')).toBe('Europe/Dublin');
      expect(defaultTimezoneForRegion('unknown-region')).toBe('Asia/Bangkok');
    });

    it('defaults timezone from data_region when not provided (§19.3/§19.6)', async () => {
      (prismaMock.$queryRaw as jest.Mock).mockResolvedValue([]); // no existing
      let capturedInsertArgs: unknown[] = [];
      (prismaMock.$transaction as jest.Mock).mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const txQueryRaw = jest.fn().mockImplementation((...args: unknown[]) => {
            capturedInsertArgs = args;
            return Promise.resolve([mockTenant]);
          });
          return fn({
            $queryRaw: txQueryRaw,
            $executeRaw: jest.fn().mockResolvedValue(1),
            $executeRawUnsafe: jest.fn(),
          });
        },
      );

      // Thai region -> Asia/Bangkok; timezone is the 7th INSERT value -> tagged-template arg index 7.
      await service.createTenant(
        {
          tenantCode: 'thai_co',
          tenantName: 'Thai Construction',
          planType: 'STARTER' as never,
          dataRegion: 'ap-southeast-7',
        },
        'admin-1',
        JUSTIFICATION,
      );
      expect(capturedInsertArgs[7]).toBe('Asia/Bangkok');
    });

    it('sets the explicit timezone in the INSERT when provided', async () => {
      (prismaMock.$queryRaw as jest.Mock).mockResolvedValue([]); // no existing
      let capturedInsertArgs: unknown[] = [];
      (prismaMock.$transaction as jest.Mock).mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const txQueryRaw = jest.fn().mockImplementation((...args: unknown[]) => {
            capturedInsertArgs = args;
            return Promise.resolve([mockTenant]);
          });
          return fn({
            $queryRaw: txQueryRaw,
            $executeRaw: jest.fn().mockResolvedValue(1),
            $executeRawUnsafe: jest.fn(),
          });
        },
      );

      await service.createTenant(
        {
          tenantCode: 'eu_co',
          tenantName: 'EU Construction',
          planType: 'STARTER' as never,
          dataRegion: 'ap-southeast-1',
          timezone: 'Europe/Paris',
        },
        'admin-1',
        JUSTIFICATION,
      );
      expect(capturedInsertArgs[7]).toBe('Europe/Paris');
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
          JUSTIFICATION,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('deactivateTenant', () => {
    it('deactivates an active tenant', async () => {
      (prismaMock.$queryRaw as jest.Mock).mockResolvedValue([mockTenant]);
      await expect(
        service.deactivateTenant(TENANT_UUID, 'admin-1', JUSTIFICATION),
      ).resolves.toBeUndefined();
    });

    it('throws NotFoundException when tenant not found or already inactive', async () => {
      (prismaMock.$queryRaw as jest.Mock).mockResolvedValue([]);
      await expect(
        service.deactivateTenant('nonexistent', 'admin-1', JUSTIFICATION),
      ).rejects.toThrow(NotFoundException);
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
      const txExecuteRaw = jest.fn().mockResolvedValue(2);
      (prismaMock.$transaction as jest.Mock).mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) =>
          fn({ $queryRaw: txQueryRaw, $executeRaw: txExecuteRaw, $executeRawUnsafe: jest.fn() }),
      );
      const { OutboxPublisher } = jest.requireMock('@cos/kafka') as {
        OutboxPublisher: { write: jest.Mock };
      };
      OutboxPublisher.write.mockClear();

      await service.createTenant(
        { tenantCode: 'acme_corp', tenantName: 'ACME Construction', planType: 'STARTER' as never },
        'admin-1',
        JUSTIFICATION,
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
        service.assignDedicatedDb(TENANT_UUID, 'mysql://host/db', 'admin-1', JUSTIFICATION),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when no rows updated (tenant not found or inactive)', async () => {
      (prismaMock.$executeRaw as jest.Mock).mockResolvedValue(0);
      await expect(
        service.assignDedicatedDb(TENANT_UUID, 'postgresql://host/db', 'admin-1', JUSTIFICATION),
      ).rejects.toThrow(NotFoundException);
    });

    it('succeeds with postgresql:// URL and affected rows', async () => {
      (prismaMock.$executeRaw as jest.Mock).mockResolvedValue(1);
      await expect(
        service.assignDedicatedDb(TENANT_UUID, 'postgresql://host/db', 'admin-1', JUSTIFICATION),
      ).resolves.toBeUndefined();
    });

    it('accepts postgres:// prefix', async () => {
      (prismaMock.$executeRaw as jest.Mock).mockResolvedValue(1);
      await expect(
        service.assignDedicatedDb(TENANT_UUID, 'postgres://host/db', 'admin-1', JUSTIFICATION),
      ).resolves.toBeUndefined();
    });
  });

  describe('markAsEnterpriseContracted', () => {
    const enterpriseTenant = { plan_type: 'ENTERPRISE', is_active: true, dedicated_db_url: null };
    const WORKFLOW_ID = `enterprise-provisioning-${TENANT_UUID}`;
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
        service.markAsEnterpriseContracted(TENANT_UUID, undefined, 'admin-1', JUSTIFICATION),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when plan_type is not ENTERPRISE', async () => {
      (prismaMock.$queryRaw as jest.Mock).mockResolvedValue([
        { ...enterpriseTenant, plan_type: 'STARTER' },
      ]);
      await expect(
        service.markAsEnterpriseContracted(TENANT_UUID, undefined, 'admin-1', JUSTIFICATION),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when tenant is inactive', async () => {
      (prismaMock.$queryRaw as jest.Mock).mockResolvedValue([
        { ...enterpriseTenant, is_active: false },
      ]);
      await expect(
        service.markAsEnterpriseContracted(TENANT_UUID, undefined, 'admin-1', JUSTIFICATION),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when tenant already has dedicated DB', async () => {
      (prismaMock.$queryRaw as jest.Mock).mockResolvedValue([
        { ...enterpriseTenant, dedicated_db_url: 'postgresql://existing/db' },
      ]);
      await expect(
        service.markAsEnterpriseContracted(TENANT_UUID, undefined, 'admin-1', JUSTIFICATION),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException when workflow already started', async () => {
      (prismaMock.$queryRaw as jest.Mock).mockResolvedValue([enterpriseTenant]);
      const alreadyStarted = Object.assign(new Error('already started'), {
        name: 'WorkflowExecutionAlreadyStartedError',
      });
      mockWorkflowStart.mockRejectedValueOnce(alreadyStarted);
      await expect(
        service.markAsEnterpriseContracted(TENANT_UUID, undefined, 'admin-1', JUSTIFICATION),
      ).rejects.toThrow(ConflictException);
    });

    it('rethrows other workflow start errors', async () => {
      (prismaMock.$queryRaw as jest.Mock).mockResolvedValue([enterpriseTenant]);
      mockWorkflowStart.mockRejectedValueOnce(new Error('Connection refused'));
      await expect(
        service.markAsEnterpriseContracted(TENANT_UUID, undefined, 'admin-1', JUSTIFICATION),
      ).rejects.toThrow('Connection refused');
    });

    it('returns workflowId on success and starts workflow with correct params', async () => {
      (prismaMock.$queryRaw as jest.Mock).mockResolvedValue([enterpriseTenant]);
      const result = await service.markAsEnterpriseContracted(
        TENANT_UUID,
        'CRM-001',
        'admin-1',
        JUSTIFICATION,
      );
      expect(result).toEqual({ workflowId: WORKFLOW_ID });
      expect(mockWorkflowStart).toHaveBeenCalledWith(
        'enterpriseProvisioningWorkflow',
        expect.objectContaining({ workflowId: WORKFLOW_ID }),
      );
    });

    it('uses null for contract_reference when contractReference is undefined', async () => {
      (prismaMock.$queryRaw as jest.Mock).mockResolvedValue([enterpriseTenant]);
      const result = await service.markAsEnterpriseContracted(
        TENANT_UUID,
        undefined,
        'admin-1',
        JUSTIFICATION,
      );
      expect(result).toEqual({ workflowId: WORKFLOW_ID });
    });
  });

  describe('listTenants', () => {
    const row = (over: Record<string, unknown>) => ({ ...mockTenant, ...over });

    it('returns every tenant with the dedicated DB HOST, and never the URL', async () => {
      (prismaMock.$queryRaw as jest.Mock).mockResolvedValue([
        row({
          tenant_id: 't1',
          dedicated_db_url: 'postgresql://db_admin:s3cret@db-ent-042.cos.internal:5432/bkk',
        }),
        row({ tenant_id: 't2', dedicated_db_url: null }),
      ]);

      const result = await service.listTenants();

      expect(result.map((r) => r.dedicated_db_host)).toEqual(['db-ent-042.cos.internal', null]);
      // §20.4.1 asks for the hostname; the URL carries the password and must not leave the server.
      for (const r of result) expect(r).not.toHaveProperty('dedicated_db_url');
      expect(JSON.stringify(result)).not.toContain('s3cret');
      expect(JSON.stringify(result)).not.toContain('db_admin');
    });

    it('throws rather than show an undecryptable tenant as pooled', async () => {
      (prismaMock.$queryRaw as jest.Mock).mockResolvedValue([
        row({ dedicated_db_url: 'not-a-url-and-not-ciphertext' }),
      ]);
      await expect(service.listTenants()).rejects.toThrow();
    });
  });

  describe('dedicatedDbHost', () => {
    it('reads the host from a plaintext postgres:// URL', () => {
      expect(dedicatedDbHost('postgres://u:p@10.0.0.5:5432/db')).toBe('10.0.0.5');
    });
  });

  // §6.7 + product-owner decision 2026-09-14: every SYSTEM_ADMIN tenant action writes one audit row,
  // with its justification, in the SAME transaction as the action.
  describe('admin audit', () => {
    const auditCalls = (mock: jest.Mock) =>
      mock.mock.calls.filter((c) => (c[0] as string[]).join('?').includes('platform.audit_logs'));
    const metadataOf = (call: unknown[]) =>
      JSON.parse(call[5] as string) as Record<string, unknown>;

    it('create writes tenant.create for the NEW tenant, with the justification', async () => {
      (prismaMock.$queryRaw as jest.Mock).mockResolvedValue([]);
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([mockTenant]),
        $executeRaw: jest.fn().mockResolvedValue(1),
        $executeRawUnsafe: jest.fn(),
      };
      (prismaMock.$transaction as jest.Mock).mockImplementation(async (fn) => fn(tx));

      await service.createTenant(
        { tenantCode: 'acme_corp', tenantName: 'ACME Construction', planType: 'STARTER' as never },
        'admin-1',
        JUSTIFICATION,
      );

      const [call] = auditCalls(tx.$executeRaw);
      expect(call).toBeDefined();
      expect(call).toEqual(expect.arrayContaining([TENANT_UUID, 'admin-1', 'tenant.create']));
      expect(metadataOf(call!)).toEqual({
        justification: JUSTIFICATION,
        tenant_code: 'acme_corp',
        plan_type: 'STARTER',
      });
      // RLS WITH CHECK on audit_logs: the GUC names the tenant the row is written for.
      expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(
        `SET LOCAL app.current_tenant_id = '${TENANT_UUID}'`,
      );
    });

    it('deactivate writes tenant.deactivate', async () => {
      (prismaMock.$queryRaw as jest.Mock).mockResolvedValue([{ tenant_id: TENANT_UUID }]);
      await service.deactivateTenant(TENANT_UUID, 'admin-1', JUSTIFICATION);
      const [call] = auditCalls(prismaMock.$executeRaw as jest.Mock);
      expect(call).toEqual(expect.arrayContaining(['tenant.deactivate']));
      expect(metadataOf(call!)).toEqual({ justification: JUSTIFICATION });
    });

    it('assign DB records the HOST, never the URL', async () => {
      (prismaMock.$executeRaw as jest.Mock).mockResolvedValue(1);
      await service.assignDedicatedDb(
        TENANT_UUID,
        'postgresql://db_admin:s3cret@db-ent-042.cos.internal:5432/bkk',
        'admin-1',
        JUSTIFICATION,
      );
      const [call] = auditCalls(prismaMock.$executeRaw as jest.Mock);
      expect(metadataOf(call!)).toEqual({
        justification: JUSTIFICATION,
        dedicated_db_host: 'db-ent-042.cos.internal',
      });
      expect(JSON.stringify(call)).not.toContain('s3cret');
    });

    it('refuses a non-UUID tenant id before any SQL runs (QM-4)', async () => {
      (prismaMock.$queryRaw as jest.Mock).mockResolvedValue([{ tenant_id: 'x' }]);
      await expect(
        service.deactivateTenant("x'; DROP TABLE t; --", 'admin-1', JUSTIFICATION),
      ).rejects.toThrow(UnauthorizedException);
      expect(prismaMock.$executeRawUnsafe as jest.Mock).not.toHaveBeenCalled();
    });

    describe('mark contracted', () => {
      const enterpriseTenant = {
        plan_type: 'ENTERPRISE',
        is_active: true,
        dedicated_db_url: null,
        tenant_name: 'ACME',
        tenant_code: 'acme_corp',
      };
      let start: jest.Mock;
      const order: string[] = [];

      beforeEach(() => {
        order.length = 0;
        start = jest.fn().mockImplementation(async () => order.push('start'));
        (Client as jest.Mock).mockImplementation(() => ({ workflow: { start } }));
        (prismaMock.$queryRaw as jest.Mock).mockResolvedValue([enterpriseTenant]);
        (prismaMock.$executeRaw as jest.Mock).mockImplementation(async () => order.push('audit'));
      });

      it('writes the audit row BEFORE starting the workflow, inside one transaction', async () => {
        await service.markAsEnterpriseContracted(TENANT_UUID, 'CRM-9', 'admin-1', JUSTIFICATION);
        expect(order).toEqual(['audit', 'start']);
        const [call] = auditCalls(prismaMock.$executeRaw as jest.Mock);
        expect(metadataOf(call!)).toEqual({
          justification: JUSTIFICATION,
          contract_reference: 'CRM-9',
          workflow_id: `enterprise-provisioning-${TENANT_UUID}`,
        });
        expect(prismaMock.$transaction).toHaveBeenCalledWith(expect.any(Function), {
          timeout: 15_000,
        });
      });

      it('records a null contract reference when none is given', async () => {
        await service.markAsEnterpriseContracted(TENANT_UUID, undefined, 'admin-1', JUSTIFICATION);
        const [call] = auditCalls(prismaMock.$executeRaw as jest.Mock);
        expect(metadataOf(call!)['contract_reference']).toBeNull();
      });

      it('writes NO admin audit row for the CRM webhook (justification null)', async () => {
        await service.markAsEnterpriseContracted(TENANT_UUID, 'CRM-9', 'system', null);
        expect(order).toEqual(['start']);
        expect(auditCalls(prismaMock.$executeRaw as jest.Mock)).toHaveLength(0);
      });
    });
  });

  describe('listProvisioning', () => {
    let query: jest.Mock;
    let close: jest.Mock;
    let getHandle: jest.Mock;

    beforeEach(() => {
      query = jest.fn();
      close = jest.fn().mockResolvedValue(undefined);
      getHandle = jest.fn().mockReturnValue({ query });
      (Connection.connect as jest.Mock).mockResolvedValue({
        close,
        withDeadline: (_deadline: number, fn: () => Promise<unknown>) => fn(),
      });
      (Client as jest.Mock).mockImplementation(() => ({ workflow: { getHandle } }));
    });

    it('returns [] without opening a Temporal connection when no tenant is ENTERPRISE', async () => {
      (Connection.connect as jest.Mock).mockClear(); // module mocks are shared across tests
      (prismaMock.$queryRaw as jest.Mock).mockResolvedValue([]);
      expect(await service.listProvisioning()).toEqual([]);
      expect(Connection.connect).not.toHaveBeenCalled();
    });

    it("reports each run's workflowState, skips tenants with no run, and closes the connection", async () => {
      (prismaMock.$queryRaw as jest.Mock).mockResolvedValue([
        { tenant_id: 'a' },
        { tenant_id: 'b' },
        { tenant_id: 'c' },
      ]);
      query
        .mockResolvedValueOnce('AWAITING_APPROVAL')
        .mockRejectedValueOnce(new WorkflowNotFoundError('nope', 'wf', undefined))
        .mockRejectedValueOnce(new Error('deadline exceeded'));

      const rows = await service.listProvisioning();

      expect(rows).toEqual([
        { tenant_id: 'a', workflow_state: 'AWAITING_APPROVAL' },
        // c EXISTS but did not answer — null, never a guessed state.
        { tenant_id: 'c', workflow_state: null },
      ]);
      expect(getHandle).toHaveBeenCalledWith('enterprise-provisioning-a');
      expect(close).toHaveBeenCalledTimes(1);
    });

    it('logs a non-Error rejection as a string and still reports null', async () => {
      (prismaMock.$queryRaw as jest.Mock).mockResolvedValue([{ tenant_id: 'a' }]);
      query.mockRejectedValueOnce('raw failure');
      expect(await service.listProvisioning()).toEqual([{ tenant_id: 'a', workflow_state: null }]);
    });
  });

  describe('decideProvisioning', () => {
    let query: jest.Mock;
    let signal: jest.Mock;
    let close: jest.Mock;

    beforeEach(() => {
      query = jest.fn().mockResolvedValue('AWAITING_APPROVAL');
      signal = jest.fn().mockResolvedValue(undefined);
      close = jest.fn().mockResolvedValue(undefined);
      (Connection.connect as jest.Mock).mockResolvedValue({
        close,
        withDeadline: (_deadline: number, fn: () => Promise<unknown>) => fn(),
      });
      (Client as jest.Mock).mockImplementation(() => ({
        workflow: { getHandle: jest.fn().mockReturnValue({ query, signal }) },
      }));
      (prismaMock.$executeRaw as jest.Mock).mockResolvedValue(1);
    });

    it('approve: audits tenant.provisioning.approve, then sends the approve signal', async () => {
      const result = await service.decideProvisioning(
        TENANT_UUID,
        'approve',
        'admin-1',
        JUSTIFICATION,
      );
      expect(result).toEqual({
        workflowId: `enterprise-provisioning-${TENANT_UUID}`,
        decision: 'approve',
      });
      expect(signal).toHaveBeenCalledWith(approveSignal);
      const call = (prismaMock.$executeRaw as jest.Mock).mock.calls.find((c) =>
        (c[0] as string[]).join('?').includes('platform.audit_logs'),
      )!;
      expect(call).toEqual(expect.arrayContaining(['tenant.provisioning.approve']));
      expect(close).toHaveBeenCalledTimes(1);
    });

    it('abort: audits tenant.provisioning.abort and sends the abort signal', async () => {
      await service.decideProvisioning(TENANT_UUID, 'abort', 'admin-1', JUSTIFICATION);
      expect(signal).toHaveBeenCalledWith(abortSignal);
      const call = (prismaMock.$executeRaw as jest.Mock).mock.calls.find((c) =>
        (c[0] as string[]).join('?').includes('platform.audit_logs'),
      )!;
      expect(call).toEqual(expect.arrayContaining(['tenant.provisioning.abort']));
    });

    it('404 when the tenant has no run', async () => {
      query.mockRejectedValueOnce(new WorkflowNotFoundError('nope', 'wf', undefined));
      await expect(
        service.decideProvisioning(TENANT_UUID, 'approve', 'admin-1', JUSTIFICATION),
      ).rejects.toThrow(NotFoundException);
      expect(signal).not.toHaveBeenCalled();
      expect(close).toHaveBeenCalledTimes(1);
    });

    it('503 when the state cannot be read — the decision is not sent blind', async () => {
      query.mockRejectedValueOnce(new Error('deadline exceeded'));
      await expect(
        service.decideProvisioning(TENANT_UUID, 'abort', 'admin-1', JUSTIFICATION),
      ).rejects.toThrow(ServiceUnavailableException);
      expect(signal).not.toHaveBeenCalled();
    });

    it('409 when the run is not at the gate, and nothing is audited', async () => {
      query.mockResolvedValueOnce('CREATING_RDS');
      await expect(
        service.decideProvisioning(TENANT_UUID, 'approve', 'admin-1', JUSTIFICATION),
      ).rejects.toThrow(ConflictException);
      expect(signal).not.toHaveBeenCalled();
      expect(prismaMock.$executeRaw as jest.Mock).not.toHaveBeenCalled();
    });

    it('a signal that throws fails the call (the transaction rolls the audit row back)', async () => {
      signal.mockRejectedValueOnce(new Error('temporal down'));
      await expect(
        service.decideProvisioning(TENANT_UUID, 'approve', 'admin-1', JUSTIFICATION),
      ).rejects.toThrow('temporal down');
      expect(close).toHaveBeenCalledTimes(1);
    });
  });

  describe('getMyTenant', () => {
    it('returns the caller own tenant identity (name, code, plan)', async () => {
      const row = {
        tenant_name: 'ACME Construction',
        tenant_code: 'acme_corp',
        plan_type: 'STARTER',
      };
      (prismaMock.$queryRaw as jest.Mock).mockResolvedValue([row]);
      const result = await service.getMyTenant('tenant-1');
      expect(result).toEqual(row);
    });

    it('throws NotFoundException (COS-TENANT-404) when the tenant is missing or inactive', async () => {
      (prismaMock.$queryRaw as jest.Mock).mockResolvedValue([]);
      await expect(service.getMyTenant('tenant-1')).rejects.toThrow(NotFoundException);
      await expect(service.getMyTenant('tenant-1')).rejects.toMatchObject({
        response: { error: { code: 'COS-TENANT-404', message: 'Tenant not found' } },
      });
    });
  });
});

describe('TenantService onModuleDestroy', () => {
  it('disconnects Prisma on shutdown', async () => {
    const svc = new TenantService({ isEnabled: () => false } as never);
    await svc.onModuleDestroy();
    expect(
      (svc as unknown as { prisma: { $disconnect: jest.Mock } }).prisma.$disconnect,
    ).toHaveBeenCalledTimes(1);
  });
});

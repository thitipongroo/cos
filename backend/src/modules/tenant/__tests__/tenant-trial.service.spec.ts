// Unit tests for the free-trial half of TenantService (§7.10, ADR-109): opening a trial and converting it.
// The SQL runs against a mocked client here; what is proven is the statement order, the values bound, the
// refusals and the audit row.

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
    $executeRawUnsafe: jest.fn(),
    $transaction: jest.fn(),
    $disconnect: jest.fn(),
  })),
}));

jest.mock('@cos/kafka', () => ({
  OutboxPublisher: { write: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock('@temporalio/client', () => ({
  Connection: { connect: jest.fn() },
  Client: jest.fn(),
  WorkflowNotFoundError: class extends Error {},
}));

import { ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { OutboxPublisher } from '@cos/kafka';
import { readFileSync } from 'fs';
import { join } from 'path';
import { TenantService } from '../tenant.service';
import { PLAN_ERROR, TRIAL_DAYS } from '../public/plan-limits';

const TENANT_UUID = '11111111-1111-4111-8111-111111111111';
const ADMIN_UUID = '22222222-2222-4222-8222-222222222222';
const JUSTIFICATION = 'Trial requested on construction-os.io (request 7c0e4d3a).';

type Mocked = jest.Mocked<PrismaClient>;

/** The SQL text of a tagged-template call, joined, so a test can assert on what was issued. */
const sqlOf = (call: unknown[]): string => (call[0] as TemplateStringsArray).join('?');

const trialRow = {
  tenant_id: TENANT_UUID,
  tenant_code: 'somchai_build',
  tenant_name: 'Somchai Build',
  keycloak_realm: 'construction-os',
  plan_type: 'STARTER',
  is_active: true,
  subscription_status: 'TRIAL',
  trial_started_at: new Date('2026-11-01T00:00:00Z'),
  trial_ends_at: new Date('2026-12-01T00:00:00Z'),
  trial_source: 'pricing',
  converted_at: null,
};

/**
 * The payload must match the committed .avsc field for field — a payload the schema rejects is an event that never
 * leaves the outbox. Structural, not an Avro encode: avsc is only a transitive dependency here.
 */
type AvroField = { name: string; type: unknown };
function expectMatchesSchema(eventType: string, envelope: unknown): void {
  const schema = JSON.parse(
    readFileSync(
      join(__dirname, `../../../../../packages/@cos/kafka/src/avro/${eventType}.avsc`),
      'utf8',
    ),
  ) as { fields: AvroField[] };
  const payloadType = schema.fields.find((f) => f.name === 'payload')!.type as {
    fields: AvroField[];
  };
  const payload = (envelope as { payload: Record<string, unknown> }).payload;
  expect(Object.keys(payload).sort()).toEqual(payloadType.fields.map((f) => f.name).sort());
  for (const { name, type } of payloadType.fields) {
    const value = payload[name];
    if (Array.isArray(type)) {
      expect(value === null || typeof value === 'string').toBe(true); // ["null","string"]
    } else if (typeof type === 'object' && (type as { type: string }).type === 'enum') {
      expect((type as { symbols: string[] }).symbols).toContain(value);
    } else {
      expect(typeof value).toBe(type === 'int' ? 'number' : type);
    }
  }
}

/** The audit INSERT's metadata, parsed. */
function auditMetadata(prisma: Mocked): Record<string, unknown> {
  const call = (prisma.$executeRaw as jest.Mock).mock.calls.find((c) =>
    sqlOf(c).includes('platform.audit_logs'),
  )!;
  // Values: tenant_id, actor_id, action, resource_id, metadata.
  return { action: call[3], ...JSON.parse(call[5] as string) };
}

describe('TenantService — free trial', () => {
  let service: TenantService;
  let prisma: Mocked;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TenantService({ isEnabled: () => false } as never);
    prisma = (service as unknown as { prisma: Mocked }).prisma;
    // The transaction client IS the mocked client, so one set of mocks records the whole sequence.
    (prisma.$transaction as jest.Mock).mockImplementation((fn: (tx: Mocked) => unknown) =>
      fn(prisma),
    );
    (prisma.$executeRaw as jest.Mock).mockResolvedValue(1);
    (prisma.$executeRawUnsafe as jest.Mock).mockResolvedValue(0);
  });

  describe('createTrialTenant', () => {
    const dto = {
      tenantCode: 'somchai_build',
      tenantName: 'Somchai Build',
      planType: 'STARTER' as const,
      dataRegion: 'ap-southeast-7',
      trialSource: 'pricing',
      trialRequestRef: '7c0e4d3a-2a51-4c38-9d1e-5f0a6f2b9e11',
    };

    beforeEach(() => {
      (prisma.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([]) // tenant_code is free
        .mockResolvedValueOnce([trialRow]); // INSERT … RETURNING
    });

    it('inserts a TRIAL tenant whose dates come from the database clock, TRIAL_DAYS apart', async () => {
      await expect(service.createTrialTenant(dto, ADMIN_UUID, JUSTIFICATION)).resolves.toBe(
        trialRow,
      );

      const insert = (prisma.$queryRaw as jest.Mock).mock.calls[1]!;
      const sql = sqlOf(insert);
      expect(sql).toContain('subscription_status, trial_started_at, trial_ends_at');
      expect(sql).toContain('THEN now() END');
      expect(sql).toContain('make_interval(days =>');
      expect(sql).toContain(
        'subscription_status, trial_started_at, trial_ends_at, trial_source, converted_at',
      );
      const values = insert.slice(1);
      expect(values).toEqual(
        expect.arrayContaining(['TRIAL', true, TRIAL_DAYS, 'pricing', dto.trialRequestRef]),
      );
      // Shared realm, shared database: a trial is never on a dedicated DB.
      expect(values).toContain('construction-os');
      expect(values[4]).toBeNull();
    });

    it('audits it as tenant.create_trial with where it came from, and still announces the tenant', async () => {
      await service.createTrialTenant(dto, ADMIN_UUID, JUSTIFICATION);

      expect(auditMetadata(prisma)).toEqual({
        action: 'tenant.create_trial',
        justification: JUSTIFICATION,
        tenant_code: 'somchai_build',
        plan_type: 'STARTER',
        trial_source: 'pricing',
        trial_request_ref: dto.trialRequestRef,
      });
      expect(OutboxPublisher.write).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({ event_type: 'identity.tenant.created.v1' }),
      );
      // §7.10: the trial's own event, platform-scope, from the inserted row.
      expect(OutboxPublisher.write).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({
          event_type: 'platform.tenant.trial_started.v1',
          tenant_id: 'platform',
          actor_id: ADMIN_UUID,
          payload: {
            tenant_id: TENANT_UUID,
            tenant_code: 'somchai_build',
            plan_type: 'STARTER',
            trial_started_at: '2026-11-01T00:00:00.000Z',
            trial_ends_at: '2026-12-01T00:00:00.000Z',
            trial_source: 'pricing',
          },
        }),
      );
      expectMatchesSchema(
        'platform.tenant.trial_started.v1',
        (OutboxPublisher.write as jest.Mock).mock.calls[1]![1],
      );
    });

    it('stores null for the optional origin fields when they are not given', async () => {
      await service.createTrialTenant(
        { tenantCode: 'somchai_build', tenantName: 'Somchai Build', planType: 'LITE' },
        ADMIN_UUID,
        JUSTIFICATION,
      );
      const values = (prisma.$queryRaw as jest.Mock).mock.calls[1]!.slice(1);
      expect(values.slice(-2)).toEqual([null, null]);
      const meta = auditMetadata(prisma);
      expect(meta['trial_source']).toBeNull();
      expect(meta['trial_request_ref']).toBeNull();
    });

    it('refuses a tenant code that is taken, before writing anything', async () => {
      (prisma.$queryRaw as jest.Mock).mockReset().mockResolvedValueOnce([{ tenant_id: 'x' }]);
      await expect(service.createTrialTenant(dto, ADMIN_UUID, JUSTIFICATION)).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('createTenant (paying customer)', () => {
    it('inserts ACTIVE with no trial dates and audits tenant.create', async () => {
      (prisma.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ ...trialRow, subscription_status: 'ACTIVE' }]);

      await service.createTenant(
        { tenantCode: 'paying_co', tenantName: 'Paying Co', planType: 'LITE' },
        ADMIN_UUID,
        JUSTIFICATION,
      );

      const values = (prisma.$queryRaw as jest.Mock).mock.calls[1]!.slice(1);
      expect(values).toEqual(expect.arrayContaining(['ACTIVE', false]));
      expect(values).not.toContain('TRIAL');
      expect(
        (OutboxPublisher.write as jest.Mock).mock.calls.map(
          (c) => (c[1] as { event_type: string }).event_type,
        ),
      ).toEqual(['identity.tenant.created.v1']);
      expect(auditMetadata(prisma)).toEqual({
        action: 'tenant.create',
        justification: JUSTIFICATION,
        tenant_code: 'somchai_build',
        plan_type: 'STARTER',
      });
    });
  });

  describe('convertTenant', () => {
    /** Queue: the locked status read, the project count, the UPDATE … RETURNING. */
    function queue(status: string, activeProjects: number) {
      (prisma.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([{ subscription_status: status, plan_type: 'STARTER' }])
        .mockResolvedValueOnce([{ active: activeProjects }])
        .mockResolvedValueOnce([
          {
            ...trialRow,
            plan_type: 'PROFESSIONAL',
            subscription_status: 'ACTIVE',
            converted_at: new Date('2026-11-15T00:00:00Z'),
          },
        ]);
    }

    it.each(['TRIAL', 'EXPIRED', 'PENDING_DELETION'])(
      'converts a %s tenant to ACTIVE on the paid plan',
      async (status) => {
        queue(status, 2);
        const res = await service.convertTenant(
          TENANT_UUID,
          'PROFESSIONAL',
          ADMIN_UUID,
          JUSTIFICATION,
        );
        expect(res.subscription_status).toBe('ACTIVE');

        const [lock, count, update] = (prisma.$queryRaw as jest.Mock).mock.calls;
        expect(sqlOf(lock!)).toContain('FOR UPDATE');
        expect(sqlOf(count!)).toContain('projects.projects');
        expect(count!.slice(1)).toEqual([TENANT_UUID]);
        expect(sqlOf(update!)).toContain("subscription_status = 'ACTIVE'");
        expect(sqlOf(update!)).toContain('converted_at = now()');
        expect(update!.slice(1)).toEqual(['PROFESSIONAL', TENANT_UUID]);

        expect(OutboxPublisher.write).toHaveBeenCalledWith(
          prisma,
          expect.objectContaining({
            event_type: 'platform.tenant.converted.v1',
            tenant_id: 'platform',
            actor_id: ADMIN_UUID,
            payload: {
              tenant_id: TENANT_UUID,
              tenant_code: 'somchai_build',
              from_status: status,
              from_plan: 'STARTER',
              plan_type: 'PROFESSIONAL',
              converted_at: '2026-11-15T00:00:00.000Z',
            },
          }),
        );
        expectMatchesSchema(
          'platform.tenant.converted.v1',
          (OutboxPublisher.write as jest.Mock).mock.calls[0]![1],
        );

        expect(auditMetadata(prisma)).toEqual({
          action: 'tenant.convert',
          justification: JUSTIFICATION,
          from_status: status,
          from_plan: 'STARTER',
          plan_type: 'PROFESSIONAL',
        });
      },
    );

    it('counts the projects as the target tenant (RLS on projects.projects)', async () => {
      queue('TRIAL', 0);
      await service.convertTenant(TENANT_UUID, 'LITE', ADMIN_UUID, JUSTIFICATION);
      expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
        `SET LOCAL app.current_tenant_id = '${TENANT_UUID}'`,
      );
    });

    it('allows a plan whose limit equals the active-project count', async () => {
      queue('TRIAL', 3);
      await expect(
        service.convertTenant(TENANT_UUID, 'STARTER', ADMIN_UUID, JUSTIFICATION),
      ).resolves.toBeDefined();
    });

    it('refuses a plan below the active-project count with COS-PLAN-002, changing nothing', async () => {
      queue('TRIAL', 2);
      const err = await service
        .convertTenant(TENANT_UUID, 'LITE', ADMIN_UUID, JUSTIFICATION)
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(ConflictException);
      expect((err as ConflictException).getResponse()).toEqual({
        error: expect.objectContaining({
          code: PLAN_ERROR.PLAN_BELOW_USAGE,
          messageKey: 'admin.tenant.error.planBelowUsage',
          details: { target_plan: 'LITE', limit: 1, active_projects: 2 },
        }),
      });
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(2); // no UPDATE
      expect(OutboxPublisher.write).not.toHaveBeenCalled();
      expect(prisma.$executeRaw).not.toHaveBeenCalled(); // no audit row
    });

    it('refuses an ACTIVE tenant with COS-PLAN-004 before counting anything', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValueOnce([
        { subscription_status: 'ACTIVE', plan_type: 'STARTER' },
      ]);
      const err = await service
        .convertTenant(TENANT_UUID, 'STARTER', ADMIN_UUID, JUSTIFICATION)
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(ConflictException);
      expect((err as ConflictException).getResponse()).toEqual({
        error: expect.objectContaining({
          code: PLAN_ERROR.NOT_CONVERTIBLE,
          messageKey: 'admin.tenant.error.notConvertible',
          details: { subscription_status: 'ACTIVE' },
        }),
      });
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    });

    it('404s an unknown tenant', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValueOnce([]);
      await expect(
        service.convertTenant(TENANT_UUID, 'STARTER', ADMIN_UUID, JUSTIFICATION),
      ).rejects.toThrow(NotFoundException);
    });

    it('refuses a tenant id that is not a UUID before any SQL (QM-4)', async () => {
      await expect(
        service.convertTenant("x'; DROP TABLE t; --", 'STARTER', ADMIN_UUID, JUSTIFICATION),
      ).rejects.toThrow(UnauthorizedException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });
});

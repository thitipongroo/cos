// Integration tests: Phase 8 Outbox Pattern — TC-P08-UNIT-010, the §30.4 critical test.
//
// The half that a unit test cannot prove: **DB rollback → no event emitted.** Every unit spec
// mocks the transaction, so "the outbox row joins the business transaction" is asserted by
// checking that both writes went through the same handle — a real rollback is never exercised.
// This spec runs both writes against a real PostgreSQL and aborts the transaction for real.
//
// It also covers the relay half end-to-end (OutboxPollerService claims the committed row, publishes
// it, marks it published) and asserts the ESC-17 orphan table is gone after migrations.
//
// Source: docs/specifications/30-testing-strategy.md §30.4; docs/architecture/test-design/README.md TC-P08-UNIT-010,
// §35.13 ESC-13 / ESC-17 / ESC-22.

import { OutboxPublisher } from '@cos/kafka';
import { OutboxPollerService } from '../../src/shared/events/outbox-poller.service';
import type { PrismaClient } from '@prisma/client';
import { buildOutboxEvent } from '../../src/shared/outbox/outbox.types';
import { startIntegrationInfra, stopIntegrationInfra } from '../helpers/integration-infra';
import type { IntegrationInfra } from '../helpers/integration-infra';

const TENANT_ID = 'ffffffff-0001-4000-8000-000000000001';
const ACTOR_ID = 'ffffffff-0002-4000-8000-000000000001';

/** A tenant INSERT — the same business write tenant.service.createTenant anchors its event to. */
async function insertTenant(tx: PrismaClient, code: string): Promise<Array<{ tenant_id: string }>> {
  return tx.$queryRaw<Array<{ tenant_id: string }>>`
    INSERT INTO platform.tenants (tenant_code, tenant_name, keycloak_realm, plan_type)
    VALUES (${code}, ${'Outbox Test ' + code}, ${'realm-' + code}, 'STARTER'::platform."PlanType")
    RETURNING tenant_id
  `;
}

function event(code: string) {
  return buildOutboxEvent({
    eventType: 'identity.tenant.created.v1',
    tenantId: TENANT_ID,
    actorId: ACTOR_ID,
    correlationId: 'ffffffff-0003-4000-8000-000000000001',
    payload: { tenant_code: code },
  });
}

const countOutbox = async (prisma: PrismaClient, code: string): Promise<number> => {
  const [row] = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT count(*) AS n FROM platform.outbox_events
    WHERE payload -> 'payload' ->> 'tenant_code' = ${code}
  `;
  return Number(row?.n ?? 0);
};

const countTenants = async (prisma: PrismaClient, code: string): Promise<number> => {
  const [row] = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT count(*) AS n FROM platform.tenants WHERE tenant_code = ${code}
  `;
  return Number(row?.n ?? 0);
};

describe('Outbox Pattern Integration (Testcontainers — PostgreSQL)', () => {
  let infra: IntegrationInfra;
  let prisma: PrismaClient;

  beforeAll(async () => {
    infra = await startIntegrationInfra();
    prisma = infra.prisma;
  }, 180_000);

  afterAll(async () => {
    await stopIntegrationInfra(infra ?? {});
  });

  // ── TC-P08-UNIT-010 ───────────────────────────────────────────────────────

  it('commits the business row and its outbox row together', async () => {
    const code = 'outbox_commit';

    await prisma.$transaction(async (tx) => {
      await insertTenant(tx as PrismaClient, code);
      await OutboxPublisher.write(tx as PrismaClient, event(code));
    });

    expect(await countTenants(prisma, code)).toBe(1);
    expect(await countOutbox(prisma, code)).toBe(1);
  });

  // THE critical test (§30.4): the event must not survive a rolled-back business write.
  it('emits NO event when the transaction rolls back', async () => {
    const code = 'outbox_rollback';

    await expect(
      prisma.$transaction(async (tx) => {
        await insertTenant(tx as PrismaClient, code);
        await OutboxPublisher.write(tx as PrismaClient, event(code));
        // Anything that fails after both writes — a constraint violation, a crashed downstream
        // call, an explicit guard — must take the outbox row down with the business row.
        throw new Error('business rule violated after both writes');
      }),
    ).rejects.toThrow('business rule violated after both writes');

    expect(await countTenants(prisma, code)).toBe(0);
    expect(await countOutbox(prisma, code)).toBe(0);
  });

  // The inverse failure: the outbox INSERT itself fails, so the business row must not survive
  // either. This is what makes the converted services propagate instead of swallowing (ESC-13).
  it('rolls the business row back when the outbox write fails', async () => {
    const code = 'outbox_write_fails';

    await expect(
      prisma.$transaction(async (tx) => {
        await insertTenant(tx as PrismaClient, code);
        // A duplicate event_id violates the primary key of platform.outbox_events.
        const duplicate = { ...event(code), event_id: 'ffffffff-0004-4000-8000-000000000001' };
        await OutboxPublisher.write(tx as PrismaClient, duplicate);
        await OutboxPublisher.write(tx as PrismaClient, duplicate);
      }),
    ).rejects.toThrow();

    expect(await countTenants(prisma, code)).toBe(0);
    expect(await countOutbox(prisma, code)).toBe(0);
  });

  // ── relay half ────────────────────────────────────────────────────────────

  it('OutboxPollerService publishes a committed row and marks it published', async () => {
    // The package-level OutboxPoller this used to drive was deleted on 2026-08-27: it duplicated
    // this service, which is the one EventsModule registers and the only one that has ever run in
    // production. Rule 34(c) names a DB-polling loop as exactly what must not live in a
    // client-importable package.
    const code = 'outbox_relay';
    const published: Array<{ event_type: string }> = [];
    const producer = {
      connect: jest.fn().mockResolvedValue(undefined),
      publish: jest.fn(async (envelope: { event_type: string }) => {
        published.push(envelope);
      }),
    };

    await prisma.$transaction(async (tx) => {
      await insertTenant(tx as PrismaClient, code);
      await OutboxPublisher.write(tx as PrismaClient, event(code));
    });

    const poller = new OutboxPollerService();
    // The service builds its own PrismaClient in a field initializer. Close that one (Rule 39 /
    // ADR-034 — nothing else will) and point it at the container this spec already migrated.
    const own = (poller as unknown as { prisma: PrismaClient }).prisma;
    await own.$disconnect();
    (poller as unknown as { prisma: PrismaClient }).prisma = prisma;
    (poller as unknown as { producer: typeof producer }).producer = producer;

    // poll() once rather than starting the timer: the claim + publish + mark sequence is what is
    // under test, and driving it directly removes the only source of flake in this case.
    await poller.poll();

    const [row] = await prisma.$queryRaw<Array<{ published: boolean }>>`
      SELECT published FROM platform.outbox_events
      WHERE payload -> 'payload' ->> 'tenant_code' = ${code}
    `;
    expect(row?.published).toBe(true);
    expect(published.map((e) => e.event_type)).toContain('identity.tenant.created.v1');
  }, 30_000);

  // ── ESC-17 ────────────────────────────────────────────────────────────────

  it('has no orphan projects.outbox_events after migrations (ESC-17)', async () => {
    const [row] = await prisma.$queryRaw<Array<{ reg: string | null }>>`
      SELECT to_regclass('projects.outbox_events')::text AS reg
    `;
    expect(row?.reg).toBeNull();
  });

  it('keeps platform.outbox_events as the one relay table (QM-4)', async () => {
    const rows = await prisma.$queryRaw<Array<{ table_schema: string }>>`
      SELECT table_schema FROM information_schema.tables
      WHERE table_name = 'outbox_events'
      ORDER BY table_schema
    `;
    expect(rows.map((r) => r.table_schema)).toEqual(['platform']);
  });
});

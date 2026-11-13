// Tenant sweeps reach dedicated databases and skip what moved (D54, 2026-11-13), on real Postgres.
//
// Two servers: the shared database, and one tenant's dedicated database. Both migrated. In the shared
// one, tenant S lives there and tenant E has moved (dedicated_db_url set) — E's old rows are still there,
// as the copy leaves them. E's live rows are in its dedicated database, reached as app_user.
//
// What has to hold, for a sweep that writes (permit expiry) and one that reads then marks (notification
// escalation):
//   - S's rows in the shared database are swept;
//   - E's stale rows in the shared database are left alone;
//   - E's live rows in its dedicated database are swept, there.

import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Client } from 'pg';
import { prismaMigrateDeploy } from '../../src/modules/tenant/workflows/prisma-migrate-deploy';
import { disconnectDedicatedClients } from '../../src/shared/prisma/tenant-databases';
// Both read DATABASE_URL when CONSTRUCTED (their superuser client is a field), after beforeAll sets it.
import { PermitExpiryService } from '../../src/modules/safety/permit-expiry.service';
import { NotificationRepository } from '../../src/modules/notification/notification.repository';
import { CashflowRiskService } from '../../src/modules/finance/cashflow-risk.service';
import { LedgerReconciliationService } from '../../src/modules/finance/ledger-reconciliation.service';
import type { EventOutboxService } from '../../src/shared/events/event-outbox.service';
import type { ScheduledJobLockService } from '../../src/shared/scheduling/scheduled-job-lock.service';
import type { NotificationPrismaService } from '../../src/modules/notification/notification-prisma.service';

const IMAGE = 'timescale/timescaledb:latest-pg16';
const S = 'aaaaaaaa-0000-4000-8000-0000000000a1';
const E = 'eeeeeeee-0000-4000-8000-0000000000e1';
const PROJECT = 'aaaaaaaa-1111-4000-8000-000000000001';
const USER = 'cccccccc-0000-4000-8000-000000000001';
const APP_USER_PASSWORD = 'app_user_dev_password'; // migration 20260623000001 (development value)
const EVENT = 'safety.incident.created.v1';
const P_S = 'aaaaaaaa-2222-4000-8000-000000000001';
const P_E_STALE = 'eeeeeeee-2222-4000-8000-000000000001';
const P_E_LIVE = 'eeeeeeee-2222-4000-8000-000000000002';
const runNow = {
  runExclusively: (_job: string, _ttl: number, fn: () => Promise<unknown>) => fn(),
} as unknown as ScheduledJobLockService;

describe('tenant sweeps cover dedicated databases (D54)', () => {
  let sharedPg: StartedPostgreSqlContainer;
  let dedicatedPg: StartedPostgreSqlContainer;
  let shared: Client;
  let dedicated: Client;

  const permitStatus = async (db: Client, number: string) =>
    (
      await db.query<{ status: string }>(
        `SELECT status FROM site_ops.permits WHERE permit_number = $1`,
        [number],
      )
    ).rows[0]?.status;

  async function seedPermit(db: Client, tenant: string, number: string) {
    await db.query(
      `INSERT INTO site_ops.permits (tenant_id, project_id, permit_type, permit_number, valid_until, status)
       VALUES ($1, $2, 'WORK_PERMIT', $3, CURRENT_DATE - 2, 'ACTIVE')`,
      [tenant, PROJECT, number],
    );
  }

  async function seedNotice(db: Client, tenant: string, subject: string) {
    await db.query(
      `INSERT INTO notifications.notifications
         (tenant_id, recipient_id, channel, event_type, subject, body, status, created_at)
       VALUES ($1, $2, 'IN_APP', $3, $4, 'b', 'SENT', now() - interval '2 hours')`,
      [tenant, USER, EVENT, subject],
    );
  }

  async function seedBudget(db: Client, tenant: string, project: string) {
    await db.query(
      `INSERT INTO finance.project_budgets (project_id, tenant_id, total_budget_amount, total_budget_currency)
       VALUES ($1, $2, 1000000, 'THB')`,
      [project, tenant],
    );
    await db.query(
      `INSERT INTO finance.payments (invoice_id, project_id, tenant_id, amount, currency_code, payment_date, recorded_by, status)
       VALUES (gen_random_uuid(), $1, $2, 500000, 'THB', CURRENT_DATE + 3, $3, 'PENDING')`,
      [project, tenant, USER],
    );
  }

  async function seedOrphan(db: Client, tenant: string, project: string) {
    await db.query(
      `INSERT INTO finance.cost_transactions (project_id, tenant_id, source_type, source_id, amount, currency_code, transaction_date)
       VALUES ($1, $2, 'PURCHASE_ORDER', gen_random_uuid(), 10, 'THB', CURRENT_DATE)`,
      [project, tenant],
    );
  }

  beforeAll(async () => {
    [sharedPg, dedicatedPg] = await Promise.all([
      new PostgreSqlContainer(IMAGE).start(),
      new PostgreSqlContainer(IMAGE).start(),
    ]);
    await Promise.all([
      prismaMigrateDeploy(sharedPg.getConnectionUri()),
      prismaMigrateDeploy(dedicatedPg.getConnectionUri()),
    ]);
    shared = new Client({ connectionString: sharedPg.getConnectionUri() });
    dedicated = new Client({ connectionString: dedicatedPg.getConnectionUri() });
    await shared.connect();
    await dedicated.connect();

    const eUrl = dedicatedPg
      .getConnectionUri()
      .replace(/\/\/[^@]+@/, `//app_user:${APP_USER_PASSWORD}@`);
    await shared.query(
      `INSERT INTO platform.tenants (tenant_id, tenant_code, tenant_name, keycloak_realm, plan_type, dedicated_db_url)
       VALUES ($1, 's', 's', 'cos', 'STARTER', NULL),
              ($2, 'e', 'e', 'cos-e', 'ENTERPRISE', $3)`,
      [S, E, eUrl],
    );

    await seedPermit(shared, S, 'P-S');
    await seedPermit(shared, E, 'P-E-STALE');
    await seedPermit(dedicated, E, 'P-E');
    await seedNotice(shared, S, 'N-S');
    await seedNotice(shared, E, 'N-E-STALE');
    await seedNotice(dedicated, E, 'N-E');
    // Cashflow: a budget with a large payment due in three days — a shortfall from the first week.
    await seedBudget(shared, S, P_S);
    await seedBudget(shared, E, P_E_STALE);
    await seedBudget(dedicated, E, P_E_LIVE);
    // Ledger: a cost transaction charged against a purchase order that does not exist (an orphan).
    await seedOrphan(shared, S, P_S);
    // Two in the stale copy, one live: counting the stale copy instead of the live one would show.
    await seedOrphan(shared, E, P_E_STALE);
    await seedOrphan(shared, E, P_E_STALE);
    await seedOrphan(dedicated, E, P_E_LIVE);

    // The services' own superuser client reads DATABASE_URL when constructed.
    process.env['DATABASE_URL'] = sharedPg.getConnectionUri();
  }, 600_000);

  afterAll(async () => {
    await disconnectDedicatedClients();
    await shared?.end();
    await dedicated?.end();
    await Promise.all([sharedPg?.stop(), dedicatedPg?.stop()]);
  });

  it('permit expiry: sweeps S on the shared database and E in its own, not E’s stale copy', async () => {
    const published: Array<{ tenant_id: string }> = [];
    const outbox = {
      publish: async (e: { tenant_id: string }) => void published.push(e),
    } as unknown as EventOutboxService;
    const svc = new PermitExpiryService(outbox, {} as ScheduledJobLockService);

    expect(await svc.sweep()).toBe(2);
    expect(await permitStatus(shared, 'P-S')).toBe('EXPIRED');
    expect(await permitStatus(shared, 'P-E-STALE')).toBe('ACTIVE');
    expect(await permitStatus(dedicated, 'P-E')).toBe('EXPIRED');
    expect(published.map((e) => e.tenant_id).sort()).toEqual([S, E].sort());
  });

  it('escalation: finds S on the shared database and E in its own, and marks E there', async () => {
    const repo = new NotificationRepository({} as NotificationPrismaService);
    try {
      const found = await repo.findEscalationCandidates(EVENT, 60);
      expect(found.map((c) => c.subject).sort()).toEqual(['N-E', 'N-S']);

      for (const c of found) await repo.markEscalated(c);
      const escalated = async (db: Client, subject: string) =>
        (
          await db.query<{ e: boolean }>(
            `SELECT escalated_at IS NOT NULL AS e FROM notifications.notifications WHERE subject = $1`,
            [subject],
          )
        ).rows[0]!.e;
      expect(await escalated(shared, 'N-S')).toBe(true);
      expect(await escalated(dedicated, 'N-E')).toBe(true);
      expect(await escalated(shared, 'N-E-STALE')).toBe(false);
    } finally {
      await repo.onModuleDestroy();
    }
  });

  it('cashflow risk: grades S on the shared database and E in its own, not E’s stale budget', async () => {
    const published: Array<{ tenant_id: string; payload: { project_id: string } }> = [];
    const outbox = {
      publish: async (e: { tenant_id: string; payload: { project_id: string } }) =>
        void published.push(e),
    } as unknown as EventOutboxService;
    const svc = new CashflowRiskService(outbox, runNow);
    try {
      expect(await svc.runRiskSweep()).toBe(2);
      expect(published.map((e) => e.payload.project_id).sort()).toEqual([P_E_LIVE, P_S].sort());
    } finally {
      await svc.onModuleDestroy();
    }
  });

  it('ledger reconciliation: finds S’s orphan and E’s live one, not E’s stale copy', async () => {
    const svc = new LedgerReconciliationService(runNow);
    try {
      const report = await svc.reconcile();
      const orphans = report?.findings.find(
        (f) => f.kind === 'orphan' && f.source === 'PURCHASE_ORDER',
      );
      expect(orphans?.count).toBe(2);
      expect(orphans?.sample.map((x) => x.tenant_id).sort()).toEqual([S, E].sort());
    } finally {
      await svc.onModuleDestroy();
    }
  });
});

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
import { TENANT_DATA_SCHEMAS } from '../../src/modules/tenant/workflows/tenant-data-copy';
import { VendorPortalRepository } from '../../src/modules/vendor-portal/vendor-portal.repository';
import { createPrismaClient } from '../../src/shared/prisma/create-prisma-client';
import { enterTenantTx } from '../../src/shared/prisma/tenant-tx';
import type { PrismaClient } from '@prisma/client';
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

  // D56 (2026-11-13): no foreign key crosses between platform and the tenant schemas, on either database —
  // in a dedicated one platform is empty, and the shared one cannot name a tenant row that moved.
  const crossing = async (db: Client) =>
    (
      await db.query<{ n: number }>(
        `
        WITH s(n) AS (SELECT unnest($1::text[]))
        SELECT count(*)::int AS n
          FROM pg_constraint c
          JOIN pg_class cl ON cl.oid = c.conrelid JOIN pg_namespace cn ON cn.oid = cl.relnamespace
          JOIN pg_class fc ON fc.oid = c.confrelid JOIN pg_namespace fn ON fn.oid = fc.relnamespace
         WHERE c.contype = 'f'
           AND ((cn.nspname IN (SELECT n FROM s)) <> (fn.nspname IN (SELECT n FROM s)))`,
        [[...TENANT_DATA_SCHEMAS]],
      )
    ).rows[0]!.n;

  it('no foreign key crosses between platform and the tenant schemas, on either database (D56)', async () => {
    expect(await crossing(shared)).toBe(0);
    expect(await crossing(dedicated)).toBe(0);
  });

  it('a trading relationship can name a vendor that lives only in the tenant’s dedicated database (D56)', async () => {
    const vendorD = 'eeeeeeee-3333-4000-8000-000000000001';
    const { rows } = await shared.query<{ id: string }>(
      `INSERT INTO platform.vendor_identities (email, display_name)
       VALUES ('vendor@example.com', 'Vendor') RETURNING vendor_identity_id AS id`,
    );
    await expect(
      shared.query(
        `INSERT INTO platform.vendor_trading_relationships (vendor_identity_id, tenant_id, vendor_id)
         VALUES ($1, $2, $3)`,
        [rows[0]!.id, E, vendorD],
      ),
    ).resolves.toBeDefined();
  });

  // D56: with the foreign key gone, VendorPortalService checks the vendor through the tenant's own database.
  // Run as app_user through the same transaction entry TenantPrismaService uses, so RLS decides.
  it("vendorExists sees the tenant's own vendors only — in the shared database and in a dedicated one (D56)", async () => {
    const T2 = 'aaaaaaaa-0000-4000-8000-0000000000a2';
    await shared.query(
      `INSERT INTO platform.tenants (tenant_id, tenant_code, tenant_name, keycloak_realm, plan_type)
       VALUES ($1, 't2', 't2', 'cos-t2', 'STARTER')`,
      [T2],
    );
    const vendor = async (db: Client, tenant: string, code: string) =>
      (
        await db.query<{ id: string }>(
          `INSERT INTO procurement.vendors (tenant_id, vendor_code, vendor_name)
           VALUES ($1, $2, $2) RETURNING vendor_id::text AS id`,
          [tenant, code],
        )
      ).rows[0]!.id;
    const vS = await vendor(shared, S, 'V-S');
    const vT2 = await vendor(shared, T2, 'V-T2');
    const vE = await vendor(dedicated, E, 'V-E');

    const asApp = (pg: StartedPostgreSqlContainer) =>
      createPrismaClient(
        pg.getConnectionUri().replace(/\/\/[^@]+@/, `//app_user:${APP_USER_PASSWORD}@`),
      );
    const sharedApp = asApp(sharedPg);
    const dedicatedApp = asApp(dedicatedPg);
    const repoFor = (client: PrismaClient, tenant: string, onShared: boolean) =>
      new VendorPortalRepository(
        {
          run: (fn: (tx: PrismaClient) => Promise<unknown>) =>
            client.$transaction(async (tx) => {
              await enterTenantTx(tx as PrismaClient, tenant, onShared);
              return fn(tx as PrismaClient);
            }),
        } as never,
        { tenantId: tenant },
      );
    try {
      const sRepo = repoFor(sharedApp, S, true);
      expect(await sRepo.vendorExists(vS)).toBe(true);
      expect(await sRepo.vendorExists(vT2)).toBe(false); // another tenant's vendor
      const eRepo = repoFor(dedicatedApp, E, false);
      expect(await eRepo.vendorExists(vE)).toBe(true);
      expect(await eRepo.vendorExists(vS)).toBe(false);
    } finally {
      await sharedApp.$disconnect();
      await dedicatedApp.$disconnect();
    }
  });

  // D57 (2026-11-13): reads by tenant alone — the provisioning copy's, and the RLS predicate — use a
  // tenant-leading index on the workforce telemetry hypertables instead of scanning every chunk.
  it('a read of one tenant’s workforce telemetry uses the tenant index (D57)', async () => {
    await shared.query(
      `INSERT INTO workforce_telemetry.attendance_logs (log_id, recorded_at, worker_id, project_id, tenant_id)
       SELECT gen_random_uuid(), d, $2, $3, $1
         FROM unnest(ARRAY[timestamptz '2026-11-01 07:00Z', '2026-11-02 07:00Z']) d`,
      [S, USER, PROJECT],
    );
    await shared.query(
      `INSERT INTO workforce_telemetry.timesheets (timesheet_id, period_date, worker_id, project_id, tenant_id)
       VALUES (gen_random_uuid(), '2026-11-01', $2, $3, $1)`,
      [S, USER, PROJECT],
    );
    // Tiny tables: with sequential scans allowed the planner may rightly prefer them, so they are switched
    // off — what is asserted is that the index exists for the planner to use.
    const plan = async (sql: string) => {
      await shared.query('BEGIN');
      try {
        await shared.query('SET LOCAL enable_seqscan = off');
        const { rows } = await shared.query<{ 'QUERY PLAN': string }>(`EXPLAIN ${sql}`, [S]);
        return rows.map((r) => r['QUERY PLAN']).join('\n');
      } finally {
        await shared.query('ROLLBACK');
      }
    };
    expect(
      await plan(`SELECT count(*) FROM workforce_telemetry.attendance_logs WHERE tenant_id = $1`),
    ).toContain('idx_attendance_tenant_time');
    expect(
      await plan(`SELECT count(*) FROM workforce_telemetry.timesheets WHERE tenant_id = $1`),
    ).toContain('idx_timesheet_tenant_period');
    // And both are valid — an index left invalid would still appear in a plan for the chunks it covers.
    const { rows } = await shared.query<{ name: string; valid: boolean }>(
      `SELECT c.relname AS name, i.indisvalid AS valid FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
        WHERE c.relname IN ('idx_attendance_tenant_time', 'idx_timesheet_tenant_period') ORDER BY 1`,
    );
    expect(rows).toEqual([
      { name: 'idx_attendance_tenant_time', valid: true },
      { name: 'idx_timesheet_tenant_period', valid: true },
    ]);
  });
});

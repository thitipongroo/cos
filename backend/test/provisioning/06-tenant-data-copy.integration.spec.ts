// Enterprise provisioning's two database steps against real Postgres (D45, D46 — 2026-11-13).
//
// Two servers stand in for the shared database and a tenant's new dedicated one. Both are migrated with
// prismaMigrateDeploy — the D45 path runMigrationsActivity takes: the prisma CLI by node, from backend/,
// with DIRECT_DATABASE_URL set to the target. Then the shared one is seeded for two tenants, and the D46
// copy moves one tenant's rows.
//
// What has to hold:
//   - a failure halfway (here: a CHECK the target adds) rejects promptly, leaves the target without any of
//     the tenant's rows and leaves no transaction open on the source — the first version hung there;
//   - a cancelled copy (Temporal's cancellation, through the AbortSignal) stops mid-stream and leaves the
//     target without any of the tenant's rows;
//   - a target role that does not bypass RLS is refused (it would copy nothing and agree on zero);
//   - rows of the tenant already in the target are never deleted: the copy refuses instead (routing
//     switches to the dedicated database before this step, so they can be the tenant's own writes) —
//     unless they are exactly an earlier attempt's committed copy, which counts as done;
//   - otherwise only that tenant's rows arrive, every one of them, across a foreign-key chain
//     (projects → boq_versions → boq_categories → boq_items) and a self-reference (a child category);
//   - a reference into platform keeps its value although platform is empty there (platform never moves).

import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Client } from 'pg';
import { prismaMigrateDeploy } from '../../src/modules/tenant/workflows/prisma-migrate-deploy';
import {
  assertBypassesRls,
  copyTenantRows,
  listForeignKeys,
  listTenantTables,
  orderByForeignKeys,
  TENANT_DATA_SCHEMAS,
  type CopyOptions,
} from '../../src/modules/tenant/workflows/tenant-data-copy';

const IMAGE = 'timescale/timescaledb:latest-pg16';
const TENANT_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const TENANT_B = 'bbbbbbbb-0000-4000-8000-000000000001';
const USER = 'cccccccc-0000-4000-8000-000000000001';
const ids = {
  projectA: 'aaaaaaaa-0001-4000-8000-000000000001',
  versionA: 'aaaaaaaa-0002-4000-8000-000000000001',
  catParentA: 'aaaaaaaa-0003-4000-8000-000000000001',
  catChildA: 'aaaaaaaa-0003-4000-8000-000000000002',
  itemA: 'aaaaaaaa-0004-4000-8000-000000000001',
  projectB: 'bbbbbbbb-0001-4000-8000-000000000001',
  staleA: 'aaaaaaaa-0001-4000-8000-0000000000ff',
  leadA: 'aaaaaaaa-0005-4000-8000-000000000001',
  leadB: 'bbbbbbbb-0005-4000-8000-000000000001',
  equipmentA: 'aaaaaaaa-0006-4000-8000-000000000001',
};

describe('enterprise provisioning: migrate and copy a tenant into a dedicated database', () => {
  let sharedPg: StartedPostgreSqlContainer;
  let dedicatedPg: StartedPostgreSqlContainer;
  let shared: Client;
  let dedicated: Client;
  let priceId: string;

  const client = (c: StartedPostgreSqlContainer) =>
    new Client({ connectionString: c.getConnectionUri() });

  async function copyOnce(dstUri = dedicatedPg.getConnectionUri(), options?: CopyOptions) {
    const src = client(sharedPg);
    const dst = new Client({ connectionString: dstUri });
    await src.connect();
    await dst.connect();
    try {
      const tables = await listTenantTables(src);
      const ordered = orderByForeignKeys(tables, await listForeignKeys(src, tables));
      return await copyTenantRows(src, dst, TENANT_A, ordered, options);
    } finally {
      await Promise.race([
        src.end().catch(() => undefined),
        new Promise((r) => setTimeout(r, 3000)),
      ]);
      await dst.end();
    }
  }

  beforeAll(async () => {
    [sharedPg, dedicatedPg] = await Promise.all([
      new PostgreSqlContainer(IMAGE).start(),
      new PostgreSqlContainer(IMAGE).start(),
    ]);
    // D45: both migrated by the same call runMigrationsActivity makes.
    await prismaMigrateDeploy(sharedPg.getConnectionUri());
    await prismaMigrateDeploy(dedicatedPg.getConnectionUri());

    shared = client(sharedPg);
    dedicated = client(dedicatedPg);
    await shared.connect();
    await dedicated.connect();

    const { rows } = await shared.query<{ price_id: string }>(
      `INSERT INTO platform.central_price_catalog
         (code, description, unit, central_price, currency_code, effective_period, source, published_at, is_active)
       VALUES ('CEM-1', 'Cement', 'bag', 150, 'THB', '2569', 'MANUAL_IMPORT', now(), true)
       RETURNING price_id`,
    );
    priceId = rows[0]!.price_id;

    for (const [tenant, project, code] of [
      [TENANT_A, ids.projectA, 'A-1'],
      [TENANT_B, ids.projectB, 'B-1'],
    ]) {
      await shared.query(
        `INSERT INTO projects.projects (project_id, tenant_id, project_code, project_name, project_type, status, created_by)
         VALUES ($1, $2, $3, $3, 'RESIDENTIAL'::"ProjectType", 'ACTIVE'::"ProjectStatus", $4)`,
        [project, tenant, code, USER],
      );
    }
    await shared.query(
      `INSERT INTO boq.boq_versions (version_id, project_id, tenant_id, version_number, status, total_estimated_currency, created_by)
       VALUES ($1, $2, $3, 1, 'DRAFT', 'THB', $4)`,
      [ids.versionA, ids.projectA, TENANT_A, USER],
    );
    await shared.query(
      `INSERT INTO boq.boq_categories (category_id, version_id, tenant_id, parent_category_id, category_code, category_name)
       VALUES ($1, $3, $4, NULL, 'C-1', 'Concrete'), ($2, $3, $4, $1, 'C-1.1', 'Footings')`,
      [ids.catParentA, ids.catChildA, ids.versionA, TENANT_A],
    );
    await shared.query(
      `INSERT INTO boq.boq_items (item_id, category_id, version_id, tenant_id, description, unit, quantity, unit_cost,
                                  estimated_total, currency_code, central_price_id)
       VALUES ($1, $2, $3, $4, 'Cement bag', 'bag', 10, 150, 1500, 'THB', $5)`,
      [ids.itemA, ids.catChildA, ids.versionA, TENANT_A, priceId],
    );

    // D55: crm and the two telemetry schemas (TimescaleDB hypertables). Telemetry spans three days, so
    // three chunks on each side; a crm row of tenant B must stay behind.
    for (const [tenant, lead] of [
      [TENANT_A, ids.leadA],
      [TENANT_B, ids.leadB],
    ]) {
      await shared.query(
        `INSERT INTO crm.leads (lead_id, tenant_id, company) VALUES ($1, $2, 'Acme')`,
        [lead, tenant],
      );
    }
    await shared.query(
      `INSERT INTO crm.contacts (tenant_id, lead_id, name) VALUES ($1, $2, 'Somchai')`,
      [TENANT_A, ids.leadA],
    );
    await shared.query(
      `INSERT INTO equipment_telemetry.equipment_utilization (recorded_at, equipment_id, tenant_id)
       SELECT d, $2, $1 FROM unnest(ARRAY[timestamptz '2026-11-01 08:00Z', '2026-11-02 08:00Z', '2026-11-05 08:00Z']) d`,
      [TENANT_A, ids.equipmentA],
    );
    await shared.query(
      `INSERT INTO workforce_telemetry.attendance_logs (log_id, recorded_at, worker_id, project_id, tenant_id)
       VALUES (gen_random_uuid(), '2026-11-01 07:00Z', $2, $3, $1)`,
      [TENANT_A, USER, ids.projectA],
    );
    await shared.query(
      `INSERT INTO workforce_telemetry.timesheets (timesheet_id, period_date, worker_id, project_id, tenant_id)
       VALUES (gen_random_uuid(), '2026-11-01', $2, $3, $1)`,
      [TENANT_A, USER, ids.projectA],
    );

    // A row of tenant A already in the target, as a partial earlier run would leave.
    await dedicated.query(
      `INSERT INTO projects.projects (project_id, tenant_id, project_code, project_name, project_type, status, created_by)
       VALUES ($1, $2, 'STALE', 'stale', 'RESIDENTIAL'::"ProjectType", 'ACTIVE'::"ProjectStatus", $3)`,
      [ids.staleA, TENANT_A, USER],
    );
  }, 600_000);

  afterAll(async () => {
    await shared?.end();
    await dedicated?.end();
    await Promise.all([sharedPg?.stop(), dedicatedPg?.stop()]);
  });

  it('migrated the dedicated database: the tables of every schema that moves exist there', async () => {
    const { rows } = await dedicated.query<{ n: string }>(
      `SELECT count(*) AS n FROM information_schema.tables
        WHERE table_type = 'BASE TABLE' AND table_schema = ANY($1::text[])`,
      [TENANT_DATA_SCHEMAS],
    );
    expect(Number(rows[0]!.n)).toBeGreaterThan(50);
  });

  it('a failure halfway rejects promptly, rolls the target back and leaves no source transaction open', async () => {
    await dedicated.query(`DELETE FROM projects.projects WHERE project_id = $1`, [ids.staleA]);
    // Enough rows that the source is still streaming when the target fails on the first one: the hang
    // only happens when COPY TO is cut off mid-stream. The failing row (A-1) was inserted first.
    await shared.query(
      `INSERT INTO projects.projects (project_id, tenant_id, project_code, project_name, project_type, status, created_by)
       SELECT gen_random_uuid(), $1, 'BULK-' || g, 'bulk', 'RESIDENTIAL'::"ProjectType", 'ACTIVE'::"ProjectStatus", $2
         FROM generate_series(1, 100000) g`,
      [TENANT_A, USER],
    );
    await dedicated.query(
      `ALTER TABLE projects.projects ADD CONSTRAINT zz_fail CHECK (project_code <> 'A-1')`,
    );
    try {
      const started = Date.now();
      await expect(copyOnce()).rejects.toThrow(/zz_fail/);
      expect(Date.now() - started).toBeLessThan(30_000);
      const left = await dedicated.query(`SELECT count(*)::int AS n FROM projects.projects`);
      expect(left.rows[0].n).toBe(0);
      const open = await shared.query(
        `SELECT count(*)::int AS n FROM pg_stat_activity
          WHERE datname = current_database() AND state LIKE 'idle in transaction%'`,
      );
      expect(open.rows[0].n).toBe(0);
    } finally {
      await dedicated.query(`ALTER TABLE projects.projects DROP CONSTRAINT zz_fail`);
      await shared.query(`DELETE FROM projects.projects WHERE project_code LIKE 'BULK-%'`);
    }
  });

  it('a copy cancelled mid-stream stops promptly and rolls the target back', async () => {
    await shared.query(
      `INSERT INTO projects.projects (project_id, tenant_id, project_code, project_name, project_type, status, created_by)
       SELECT gen_random_uuid(), $1, 'BULK-' || g, 'bulk', 'RESIDENTIAL'::"ProjectType", 'ACTIVE'::"ProjectStatus", $2
         FROM generate_series(1, 100000) g`,
      [TENANT_A, USER],
    );
    const cancel = new AbortController();
    const seen: string[] = [];
    let cancelledAt = -1;
    try {
      const started = Date.now();
      await expect(
        copyOnce(undefined, {
          signal: cancel.signal,
          // Cancel on the first streamed chunk of projects (its table call comes first, then chunks).
          onProgress: (table) => {
            seen.push(table);
            if (seen.filter((t) => t === 'projects.projects').length === 2) {
              cancelledAt = seen.length;
              cancel.abort();
            }
          },
        }),
      ).rejects.toThrow(/abort/i);
      expect(Date.now() - started).toBeLessThan(30_000);
      // The stream itself stopped, not only the next table: measured 0 chunks after the cancel, and 529
      // (the rest of the table) with the signal left off the pipeline.
      expect(seen.length - cancelledAt).toBeLessThan(10);
      const left = await dedicated.query(`SELECT count(*)::int AS n FROM projects.projects`);
      expect(left.rows[0].n).toBe(0);
      const open = await shared.query(
        `SELECT count(*)::int AS n FROM pg_stat_activity
          WHERE datname = current_database() AND state LIKE 'idle in transaction%'`,
      );
      expect(open.rows[0].n).toBe(0);
    } finally {
      await shared.query(`DELETE FROM projects.projects WHERE project_code LIKE 'BULK-%'`);
    }
  });

  it('refuses a target role that does not bypass row-level security', async () => {
    await dedicated.query(`CREATE ROLE rls_bound LOGIN PASSWORD 'x'`);
    const uri = dedicatedPg.getConnectionUri().replace(/\/\/[^@]+@/, '//rls_bound:x@');
    const c = new Client({ connectionString: uri });
    await c.connect();
    try {
      await expect(assertBypassesRls(c, 'target')).rejects.toThrow(
        /rls_bound is subject to row-level security/,
      );
    } finally {
      await c.end();
    }
  });

  it('refuses, and deletes nothing, when the target already has rows of the tenant', async () => {
    await dedicated.query(
      `INSERT INTO projects.projects (project_id, tenant_id, project_code, project_name, project_type, status, created_by)
       VALUES ($1, $2, 'WRITTEN', 'written after routing', 'RESIDENTIAL'::"ProjectType", 'ACTIVE'::"ProjectStatus", $3)`,
      [ids.staleA, TENANT_A, USER],
    );
    await expect(copyOnce()).rejects.toThrow(/already has rows of tenant/);
    const kept = await dedicated.query(`SELECT project_id FROM projects.projects`);
    expect(kept.rows).toEqual([{ project_id: ids.staleA }]);
    await dedicated.query(`DELETE FROM projects.projects WHERE project_id = $1`, [ids.staleA]);
  });

  it("copies tenant A's rows — all of them, only them", async () => {
    const { alreadyCopied, tables: copied } = await copyOnce();
    expect(alreadyCopied).toBe(false);
    // Every table of the schemas was in the list, not only those the role can see in information_schema.
    const all = await shared.query<{ n: string }>(
      `SELECT count(*) AS n FROM information_schema.tables
        WHERE table_type = 'BASE TABLE' AND table_schema = ANY($1::text[])`,
      [TENANT_DATA_SCHEMAS],
    );
    expect(copied).toHaveLength(Number(all.rows[0]!.n));
    const count = (t: string) => copied.find((c) => c.table === t)?.rows;
    expect(count('projects.projects')).toBe(1);
    expect(count('boq.boq_versions')).toBe(1);
    expect(count('boq.boq_categories')).toBe(2);
    expect(count('boq.boq_items')).toBe(1);
    // D55.
    expect(count('crm.leads')).toBe(1);
    expect(count('crm.contacts')).toBe(1);
    expect(count('equipment_telemetry.equipment_utilization')).toBe(3);
    expect(count('workforce_telemetry.attendance_logs')).toBe(1);
    expect(count('workforce_telemetry.timesheets')).toBe(1);
    expect(copied.reduce((n, c) => n + c.rows, 0)).toBe(12);

    const projects = await dedicated.query(
      `SELECT project_id, tenant_id FROM projects.projects ORDER BY project_id`,
    );
    expect(projects.rows).toEqual([{ project_id: ids.projectA, tenant_id: TENANT_A }]);
    const child = await dedicated.query(
      `SELECT parent_category_id FROM boq.boq_categories WHERE category_id = $1`,
      [ids.catChildA],
    );
    expect(child.rows).toEqual([{ parent_category_id: ids.catParentA }]);
  });

  it('telemetry lands in hypertable chunks in the dedicated database, not in the parent table (D55)', async () => {
    const q = async (sql: string) => (await dedicated.query<{ n: number }>(sql)).rows[0]!.n;
    expect(
      await q(`SELECT count(*)::int AS n FROM equipment_telemetry.equipment_utilization`),
    ).toBe(3);
    expect(
      await q(`SELECT count(*)::int AS n FROM ONLY equipment_telemetry.equipment_utilization`),
    ).toBe(0);
    expect(
      await q(
        `SELECT count(*)::int AS n FROM show_chunks('equipment_telemetry.equipment_utilization')`,
      ),
    ).toBeGreaterThanOrEqual(3);
    expect(
      await q(`SELECT count(*)::int AS n FROM crm.leads WHERE tenant_id <> '${TENANT_A}'`),
    ).toBe(0);
  });

  it('keeps the reference into platform, which is empty in the dedicated database', async () => {
    const item = await dedicated.query(
      `SELECT central_price_id FROM boq.boq_items WHERE item_id = $1`,
      [ids.itemA],
    );
    expect(item.rows).toEqual([{ central_price_id: priceId }]);
    const catalog = await dedicated.query(
      `SELECT count(*)::int AS n FROM platform.central_price_catalog`,
    );
    expect(catalog.rows[0].n).toBe(0);
  });

  it('a retry after a committed copy reports it done, writing nothing', async () => {
    const again = await copyOnce();
    expect(again.alreadyCopied).toBe(true);
    expect(again.tables.reduce((n, c) => n + c.rows, 0)).toBe(12);
    const n = await dedicated.query(`SELECT count(*)::int AS n FROM boq.boq_categories`);
    expect(n.rows[0].n).toBe(2);
  });

  it('refuses when the target has rows beyond the copy (the tenant wrote there after routing)', async () => {
    await dedicated.query(
      `INSERT INTO projects.projects (project_id, tenant_id, project_code, project_name, project_type, status, created_by)
       VALUES ($1, $2, 'WRITTEN', 'written after routing', 'RESIDENTIAL'::"ProjectType", 'ACTIVE'::"ProjectStatus", $3)`,
      [ids.staleA, TENANT_A, USER],
    );
    await expect(copyOnce()).rejects.toThrow(
      /differ from the shared one \(projects\.projects: 2 there, 1 here\)/,
    );
    const n = await dedicated.query(`SELECT count(*)::int AS n FROM projects.projects`);
    expect(n.rows[0].n).toBe(2);
  });
});

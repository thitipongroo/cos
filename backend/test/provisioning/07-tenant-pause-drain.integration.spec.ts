// The provisioning pause drains a tenant's transactions (D51, 2026-11-13), on real Postgres.
//
// The copy reads one snapshot of the shared database, so the pause must not commit while a transaction of
// the tenant is still writing, and nothing of the tenant may commit after it. Tenant transactions run as
// app_user — the role the app uses — through enterTenantTx; the pause runs setTenantActiveDrained as the
// admin role, as setTenantActiveActivity does.
//
// What has to hold:
//   - a tenant transaction open when the pause starts delays the pause until it commits, and its row is
//     in the database the copy then reads;
//   - a tenant transaction that starts after the pause is refused (TenantInactiveError), even one that
//     queued while the pause waited;
//   - a transaction on a dedicated database (no lock, no platform row) is unaffected;
//   - another tenant is unaffected.

import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Client } from 'pg';
import type { PrismaClient } from '@prisma/client';
import { prismaMigrateDeploy } from '../../src/modules/tenant/workflows/prisma-migrate-deploy';
import { createPrismaClient } from '../../src/shared/prisma/create-prisma-client';
import { enterTenantTx, setTenantActiveDrained } from '../../src/shared/prisma/tenant-tx';
import { TenantInactiveError, TenantMovedError } from '../../src/shared/prisma/get-db-url';

const IMAGE = 'timescale/timescaledb:latest-pg16';
const TENANT_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const TENANT_B = 'bbbbbbbb-0000-4000-8000-000000000001';
const USER = 'cccccccc-0000-4000-8000-000000000001';
// Set by migration 20260623000001_app_user_login_and_grants (a development value, replaced in real
// databases by secureAppUserActivity).
const APP_USER_PASSWORD = 'app_user_dev_password';

describe('provisioning pause drains the tenant (D51)', () => {
  let pg: StartedPostgreSqlContainer;
  let admin: Client;
  let app: PrismaClient;

  const appUrl = () =>
    pg.getConnectionUri().replace(/\/\/[^@]+@/, `//app_user:${APP_USER_PASSWORD}@`);

  async function pause(tenantId: string, active = false) {
    const c = new Client({ connectionString: pg.getConnectionUri() });
    await c.connect();
    try {
      return await setTenantActiveDrained(c, tenantId, active);
    } finally {
      await c.end();
    }
  }

  /** A tenant transaction (as app_user) that inserts a project once `release` resolves. */
  function tenantTx(tenantId: string, code: string, release: Promise<void>, shared = true) {
    return app.$transaction(
      async (tx) => {
        await enterTenantTx(tx, tenantId, shared);
        await release;
        await tx.$executeRaw`
          INSERT INTO projects.projects (project_id, tenant_id, project_code, project_name, project_type, status, created_by)
          VALUES (gen_random_uuid(), ${tenantId}::uuid, ${code}, ${code}, 'RESIDENTIAL'::"ProjectType", 'ACTIVE'::"ProjectStatus", ${USER}::uuid)
        `;
      },
      { timeout: 60_000, maxWait: 60_000 },
    );
  }

  const projects = async (code: string) =>
    (
      await admin.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM projects.projects WHERE project_code = $1`,
        [code],
      )
    ).rows[0]!.n;

  beforeAll(async () => {
    pg = await new PostgreSqlContainer(IMAGE).start();
    await prismaMigrateDeploy(pg.getConnectionUri());
    admin = new Client({ connectionString: pg.getConnectionUri() });
    await admin.connect();
    for (const [id, code] of [
      [TENANT_A, 'ta'],
      [TENANT_B, 'tb'],
    ]) {
      await admin.query(
        `INSERT INTO platform.tenants (tenant_id, tenant_code, tenant_name, keycloak_realm, plan_type)
         VALUES ($1, $2::varchar, $2::varchar, 'cos-' || $2::varchar, 'ENTERPRISE')`,
        [id, code],
      );
    }
    app = createPrismaClient(appUrl());
  }, 600_000);

  afterAll(async () => {
    await app?.$disconnect();
    await admin?.end();
    await pg?.stop();
  });

  it('a transaction open when the pause starts holds it until it commits, and its row is kept', async () => {
    let release!: () => void;
    const open = tenantTx(TENANT_A, 'IN-FLIGHT', new Promise<void>((r) => (release = r)));
    await new Promise((r) => setTimeout(r, 500)); // the transaction holds the lock, shared

    let paused = false;
    const pausing = pause(TENANT_A).then((n) => {
      paused = true;
      return n;
    });
    await new Promise((r) => setTimeout(r, 1_500));
    expect(paused).toBe(false); // still waiting for the open transaction

    release();
    await open;
    expect(await pausing).toBe(1);
    expect(await projects('IN-FLIGHT')).toBe(1);
  });

  it('a transaction that starts after the pause is refused', async () => {
    const err = await tenantTx(TENANT_A, 'AFTER', Promise.resolve()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TenantInactiveError);
    expect(await projects('AFTER')).toBe(0);
  });

  it('a transaction that queued while the pause waited is refused once it commits', async () => {
    await pause(TENANT_A, true);
    let release!: () => void;
    const open = tenantTx(TENANT_A, 'HOLDER', new Promise<void>((r) => (release = r)));
    await new Promise((r) => setTimeout(r, 500));
    const pausing = pause(TENANT_A);
    await new Promise((r) => setTimeout(r, 500));
    // Starts while the pause waits: queues behind it, then reads the committed pause.
    const queued = tenantTx(TENANT_A, 'QUEUED', Promise.resolve()).catch((e: unknown) => e);
    await new Promise((r) => setTimeout(r, 500));
    release();
    await open;
    await pausing;
    expect(await queued).toBeInstanceOf(TenantInactiveError);
    expect(await projects('QUEUED')).toBe(0);
  });

  it('another tenant, and a dedicated-database transaction, are unaffected', async () => {
    await expect(tenantTx(TENANT_B, 'OTHER', Promise.resolve())).resolves.toBeUndefined();
    // Same server standing in for a dedicated database: no lock, no is_active read.
    await expect(
      tenantTx(TENANT_A, 'DEDICATED', Promise.resolve(), false),
    ).resolves.toBeUndefined();
    expect(await projects('OTHER')).toBe(1);
    expect(await projects('DEDICATED')).toBe(1);
  });

  // A request routed before a pause can outlive it — the copy, the switch and the resume — and its
  // later transactions must not write to the shared database the tenant has left.
  it('refuses a shared-database transaction for a tenant already switched to its dedicated database', async () => {
    await admin.query(`UPDATE platform.tenants SET dedicated_db_url = 'x' WHERE tenant_id = $1`, [
      TENANT_B,
    ]);
    try {
      const err = await tenantTx(TENANT_B, 'MOVED', Promise.resolve()).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(TenantMovedError);
      expect(await projects('MOVED')).toBe(0);
    } finally {
      await admin.query(
        `UPDATE platform.tenants SET dedicated_db_url = NULL WHERE tenant_id = $1`,
        [TENANT_B],
      );
    }
  });
});

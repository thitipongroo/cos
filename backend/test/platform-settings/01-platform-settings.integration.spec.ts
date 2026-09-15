/**
 * ADR-108 — platform settings against a real database, over HTTP.
 *
 * The unit specs prove the statement order and the version arithmetic on a mocked client. What only a
 * running system can settle, and each is a test here:
 *
 *   1. the routes are SYSTEM_ADMIN only through the REAL RolesGuard — a 403, not a decorator's presence;
 *   2. the global ValidationPipe (main.ts options) refuses an http URL and an unknown key — a 400;
 *   3. a save writes version + 1 and one audit row with justification, before and after, IN the same
 *      transaction — an actor with no users row is refused by the foreign keys and nothing is saved;
 *   4. two saves naming the same version: exactly one wins, whether or not a row existed to lock;
 *   5. the audit INSERT passes audit_logs' RLS on a connection that does NOT bypass it (app_user);
 *   6. QM-9: the rollback drops the table, is re-runnable, and the migration applies again after it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Client } from 'pg';
import request from 'supertest';
import {
  clsAuthGuard,
  startIntegrationInfra,
  stopIntegrationInfra,
  type IntegrationInfra,
} from '../helpers/integration-infra';
import { AppModule } from '../../src/app.module';
import { JwtAuthGuard } from '../../src/shared/guards/jwt-auth.guard';
import { GlobalExceptionFilter } from '../../src/shared/filters/http-exception.filter';
import { PlatformSettingsService } from '../../src/modules/platform-settings/platform-settings.service';
import {
  defaultPlatformSettings,
  type PlatformSettings,
} from '../../src/modules/platform-settings/platform-settings.types';

const MIGRATION_NAME = '20260915000001_platform_settings';
const MIGRATION = readFileSync(
  join(__dirname, `../../prisma/migrations/${MIGRATION_NAME}/migration.sql`),
  'utf8',
);
const ROLLBACK = readFileSync(
  join(__dirname, `../../prisma/rollbacks/${MIGRATION_NAME}.rollback.sql`),
  'utf8',
);

const HOME_TENANT = '77777777-0000-4000-8000-000000000108';
const ADMIN_ID = '77777777-1111-4000-8000-000000000108';
const DEDICATED_TENANT = '77777777-0000-4000-8000-000000000208';
const INACTIVE_TENANT = '77777777-0000-4000-8000-000000000308';
const JUSTIFICATION = 'Primary e-GP gateway moved to its new endpoint (ticket OPS-6001).';

const roleOf = (req: Record<string, unknown>): string =>
  ((req['headers'] ?? {}) as Record<string, string>)['x-test-role'] ?? 'SYSTEM_ADMIN';
const userOf = (req: Record<string, unknown>): string =>
  ((req['headers'] ?? {}) as Record<string, string>)['x-test-user'] ?? ADMIN_ID;

function edited(cap: number): PlatformSettings {
  const s = defaultPlatformSettings();
  s.gateways.primary = { name: 'e-GP', url: 'https://gw.example.com/api', protocol: 'REST' };
  s.broadcast.channels = ['IN_APP_BANNER'];
  s.limits.shared_tenant_cap = cap;
  return s;
}

describe('ADR-108 · platform settings over HTTP', () => {
  let infra: IntegrationInfra;
  let app: INestApplication;

  const api = (): ReturnType<typeof request> => request(app.getHttpServer());

  const expectStatus = (res: request.Response, code: number): request.Response => {
    if (res.status !== code) {
      throw new Error(`expected ${code}, got ${res.status}: ${JSON.stringify(res.body)}`);
    }
    return res;
  };

  const auditRows = () =>
    infra.prisma.$queryRawUnsafe<
      Array<{
        tenant_id: string;
        actor_id: string;
        action: string;
        resource_type: string;
        metadata: Record<string, unknown>;
      }>
    >(
      `SELECT tenant_id::text, actor_id::text, action, resource_type, metadata FROM platform.audit_logs
        WHERE action = 'platform.settings.update' ORDER BY occurred_at, log_id`,
    );

  const storedVersion = async (): Promise<number | null> => {
    const rows = await infra.prisma.$queryRawUnsafe<Array<{ version: number }>>(
      `SELECT version FROM platform.platform_settings WHERE settings_key = 'global'`,
    );
    return rows[0]?.version ?? null;
  };

  beforeAll(async () => {
    infra = await startIntegrationInfra();

    const seedTenant = (id: string, code: string, dedicated: string | null, active: boolean) =>
      infra.prisma.$executeRawUnsafe(
        `INSERT INTO platform.tenants (tenant_id, tenant_code, tenant_name, keycloak_realm, plan_type, is_active, dedicated_db_url)
         VALUES ($1::uuid, $2, $2, $3, 'ENTERPRISE'::platform."PlanType", $4, $5)`,
        id,
        code,
        `realm-${code}`,
        active,
        dedicated,
      );
    await seedTenant(HOME_TENANT, 'pset-home', null, true);
    await seedTenant(
      DEDICATED_TENANT,
      'pset-dedicated',
      'postgresql://u:p@db-ent.internal:5432/x',
      true,
    );
    await seedTenant(INACTIVE_TENANT, 'pset-inactive', null, false);
    await infra.prisma.$executeRawUnsafe(
      `INSERT INTO platform.users (user_id, tenant_id, keycloak_user_id, email, display_name)
       VALUES ($1::uuid, $2::uuid, 'kc-pset-admin', 'sysadmin@example.com', 'Platform Operator')`,
      ADMIN_ID,
      HOME_TENANT,
    );

    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard(JwtAuthGuard)
      .useValue(clsAuthGuard((req) => (req['user'] ?? {}) as Record<string, string>))
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    // The same options as backend/src/main.ts — forbidNonWhitelisted is what turns an unknown key into a 400.
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: false },
      }),
    );
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.use((req: Record<string, unknown>, _res: unknown, next: () => void) => {
      req['user'] = {
        tenant_id: HOME_TENANT,
        user_id: userOf(req),
        role: roleOf(req),
        tenantCode: 'pset-home',
      };
      next();
    });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await stopIntegrationInfra(infra);
  });

  it('GET with nothing saved: version 0, the all-null defaults, and counts of ACTIVE tenants only', async () => {
    const [expected] = await infra.prisma.$queryRawUnsafe<
      Array<{ shared: number; dedicated: number }>
    >(
      `SELECT count(*) FILTER (WHERE dedicated_db_url IS NULL)::int AS shared,
              count(*) FILTER (WHERE dedicated_db_url IS NOT NULL)::int AS dedicated
         FROM platform.tenants WHERE is_active`,
    );
    const res = expectStatus(await api().get('/api/v1/admin/settings'), 200);

    expect(res.body).toEqual({
      version: 0,
      updated_at: null,
      updated_by: null,
      settings: defaultPlatformSettings(),
      counts: { shared_tenants: expected!.shared, dedicated_tenants: expected!.dedicated },
    });
    // The seeded dedicated tenant is counted; the inactive one is not.
    expect(expected!.dedicated).toBeGreaterThanOrEqual(1);
  });

  it.each(['TENANT_ADMIN', 'PROJECT_MANAGER'])(
    '%s is refused on both routes with 403',
    async (role) => {
      expectStatus(await api().get('/api/v1/admin/settings').set('x-test-role', role), 403);
      expectStatus(
        await api()
          .put('/api/v1/admin/settings')
          .set('x-test-role', role)
          .send({ version: 0, justification: JUSTIFICATION, settings: edited(10) }),
        403,
      );
      expect(await storedVersion()).toBeNull();
    },
  );

  it.each<[string, Record<string, unknown>]>([
    [
      'an http gateway URL',
      {
        version: 0,
        justification: JUSTIFICATION,
        settings: {
          ...edited(1),
          gateways: {
            ...edited(1).gateways,
            primary: { name: null, url: 'http://gw.example.com', protocol: null },
          },
        },
      },
    ],
    [
      'an unknown nested key',
      {
        version: 0,
        justification: JUSTIFICATION,
        settings: {
          ...edited(1),
          limits: { shared_tenant_cap: 1, default_max_pool_conns: null, max_tenants: 5 },
        },
      },
    ],
    ['a short justification', { version: 0, justification: 'because', settings: edited(1) }],
    [
      'a negative count',
      {
        version: 0,
        justification: JUSTIFICATION,
        settings: { ...edited(1), limits: { shared_tenant_cap: -1, default_max_pool_conns: null } },
      },
    ],
  ])(
    'PUT with %s is a 400 in the QM-10 envelope, and nothing is saved',
    async (_label, payload) => {
      const res = expectStatus(await api().put('/api/v1/admin/settings').send(payload), 400);
      expect(res.body.error.code).toBe('COS-GENERAL-400');
      expect(await storedVersion()).toBeNull();
      expect(await auditRows()).toHaveLength(0);
    },
  );

  it('PUT version 0 saves version 1 and writes one audit row: home tenant, actor, reason, before and after', async () => {
    const settings = edited(400);
    const res = expectStatus(
      await api()
        .put('/api/v1/admin/settings')
        .send({ version: 0, justification: `  ${JUSTIFICATION}  `, settings }),
      200,
    );

    expect(res.body).toMatchObject({
      version: 1,
      updated_by: { user_id: ADMIN_ID, email: 'sysadmin@example.com', name: 'Platform Operator' },
      settings,
    });
    expect(Number.isNaN(Date.parse(res.body.updated_at))).toBe(false);
    expect(await storedVersion()).toBe(1);

    const rows = await auditRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      tenant_id: HOME_TENANT,
      actor_id: ADMIN_ID,
      action: 'platform.settings.update',
      resource_type: 'platform_settings',
      metadata: {
        justification: JUSTIFICATION,
        before: defaultPlatformSettings(),
        after: settings,
      },
    });

    // GET now reads the same document back.
    const read = expectStatus(await api().get('/api/v1/admin/settings'), 200);
    expect(read.body).toMatchObject({ version: 1, settings });
  });

  it('PUT naming a stale version is a 409 COS-PSET-001, and the stored document is untouched', async () => {
    const res = expectStatus(
      await api()
        .put('/api/v1/admin/settings')
        .send({ version: 0, justification: JUSTIFICATION, settings: edited(999) }),
      409,
    );
    expect(res.body.error).toMatchObject({
      code: 'COS-PSET-001',
      messageKey: 'admin.settings.error.versionConflict',
      details: { expected_version: 0, stored_version: 1 },
    });
    expect(await storedVersion()).toBe(1);
    expect(await auditRows()).toHaveLength(1);
  });

  it('a later save audits the stored document as `before`', async () => {
    const next = edited(500);
    expectStatus(
      await api()
        .put('/api/v1/admin/settings')
        .send({ version: 1, justification: JUSTIFICATION, settings: next }),
      200,
    );
    const rows = await auditRows();
    expect(rows).toHaveLength(2);
    expect(rows[1]!.metadata.before).toEqual(edited(400));
    expect(rows[1]!.metadata.after).toEqual(next);
  });

  // updated_by and audit_logs.actor_id are both foreign keys to platform.users; whichever refuses first,
  // the transaction rolls back whole.
  it('an actor with no users row cannot save: the foreign keys refuse, and neither the version nor the audit trail moves', async () => {
    const before = await storedVersion();
    const res = await api()
      .put('/api/v1/admin/settings')
      .set('x-test-user', '77777777-9999-4000-8000-000000000999')
      .send({ version: before, justification: JUSTIFICATION, settings: edited(1) });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await storedVersion()).toBe(before);
    expect(await auditRows()).toHaveLength(2);
  });

  it('two saves naming the same version: exactly one succeeds and exactly one audit row is added', async () => {
    const version = (await storedVersion())!;
    const results = await Promise.all(
      [701, 702].map((cap) =>
        api()
          .put('/api/v1/admin/settings')
          .send({ version, justification: JUSTIFICATION, settings: edited(cap) }),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await storedVersion()).toBe(version + 1);
    expect(await auditRows()).toHaveLength(3);
  });

  // (4) with no row to lock: the upsert's WHERE is the only arbiter. Called on the service directly so the
  // two transactions start as close together as the pool allows.
  it('two FIRST saves (no row yet): exactly one succeeds', async () => {
    await infra.prisma.$executeRawUnsafe(`DELETE FROM platform.platform_settings`);
    const service = new PlatformSettingsService();
    try {
      const outcomes = await Promise.allSettled(
        [801, 802, 803].map((cap) =>
          service.update(0, edited(cap), JUSTIFICATION, {
            userId: ADMIN_ID,
            tenantId: HOME_TENANT,
          }),
        ),
      );
      expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
      const rejected = outcomes.filter((o): o is PromiseRejectedResult => o.status === 'rejected');
      expect(rejected).toHaveLength(2);
      for (const r of rejected) expect(r.reason.getResponse().error.code).toBe('COS-PSET-001');
      expect(await storedVersion()).toBe(1);
      expect(await auditRows()).toHaveLength(4);
    } finally {
      await service.onModuleDestroy();
    }
  });

  // (5) The container user is a superuser and bypasses RLS, so the whole save is run once as app_user,
  // which does not. The control shows the policy is live: the same INSERT without SET LOCAL is refused.
  describe('audit_logs RLS, as app_user (does not bypass RLS)', () => {
    let asAppUser: PlatformSettingsService;
    let appUrl: string;

    beforeAll(() => {
      const url = new URL(infra.pgUrl);
      url.username = 'app_user';
      url.password = 'app_user_dev_password';
      appUrl = url.toString();
      const saved = process.env['DATABASE_URL'];
      process.env['DATABASE_URL'] = appUrl;
      asAppUser = new PlatformSettingsService();
      process.env['DATABASE_URL'] = saved;
    });

    afterAll(async () => {
      await asAppUser?.onModuleDestroy();
    });

    it('the save succeeds and its audit row lands: SET LOCAL satisfies the WITH CHECK', async () => {
      const version = (await storedVersion())!;
      const result = await asAppUser.update(version, edited(900), JUSTIFICATION, {
        userId: ADMIN_ID,
        tenantId: HOME_TENANT,
      });
      expect(result.version).toBe(version + 1);
      expect(await auditRows()).toHaveLength(5);
    });

    it('CONTROL: the same audit INSERT without SET LOCAL is refused by the policy', async () => {
      const client = new Client({ connectionString: appUrl });
      await client.connect();
      try {
        await expect(
          client.query(
            `INSERT INTO platform.audit_logs (tenant_id, actor_id, action, resource_type, metadata)
             VALUES ($1::uuid, $2::uuid, 'platform.settings.update', 'platform_settings', '{}'::jsonb)`,
            [HOME_TENANT, ADMIN_ID],
          ),
        ).rejects.toThrow(/row-level security/);
      } finally {
        await client.end();
      }
      expect(await auditRows()).toHaveLength(5);
    });
  });

  // (6) QM-9 verified rollback. LAST: it removes the table the tests above use.
  it('the rollback drops the table, runs twice, and the migration applies again afterwards', async () => {
    const client = new Client({ connectionString: infra.pgUrl });
    await client.connect();
    const exists = async () =>
      (await client.query(`SELECT to_regclass('platform.platform_settings') AS t`)).rows[0].t !==
      null;
    try {
      expect(await exists()).toBe(true);
      await client.query(ROLLBACK);
      await client.query(ROLLBACK);
      expect(await exists()).toBe(false);
      // The audit history is not part of the rollback.
      expect(await auditRows()).toHaveLength(5);

      await client.query(MIGRATION);
      expect(await exists()).toBe(true);
      // And the constraints came back with it: a second document key is refused.
      await expect(
        client.query(
          `INSERT INTO platform.platform_settings (settings_key, value, version) VALUES ('other', '{}'::jsonb, 1)`,
        ),
      ).rejects.toThrow(/platform_settings_single_document/);
    } finally {
      await client.end();
    }
  });
});

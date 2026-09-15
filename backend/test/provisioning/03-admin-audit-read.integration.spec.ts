/**
 * R17.4 / R17.6 — the SYSTEM_ADMIN audit-log reads, over HTTP, on a real PostgreSQL.
 *
 * The unit spec proves which SQL is issued. What only a database and the real route stack can prove,
 * and what each block below is for:
 *
 *   1. keyset paging does not skip rows that share a millisecond — occurred_at has microseconds;
 *   2. `q` is a literal substring: `%` in the search does not become a wildcard;
 *   3. every read and export writes its own audit row, against the right tenant, in the same request;
 *   4. the CSV is injection-safe and a credentialed URL in a justification never reaches the wire;
 *   5. the guards and validation refuse what they should (403, 400, 404);
 *   6. on a connection subject to RLS the cross-tenant read refuses (503) instead of returning one
 *      tenant's rows — the container user is a superuser, so that case runs as `app_user`.
 */
jest.mock('@aws-sdk/client-sns', () => ({
  SNSClient: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({ MessageId: 'mock-msg-id' }),
  })),
  PublishCommand: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ServiceUnavailableException, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import {
  startIntegrationInfra,
  stopIntegrationInfra,
  clsAuthGuard,
  type IntegrationInfra,
} from '../helpers/integration-infra';
import { AppModule } from '../../src/app.module';
import { JwtAuthGuard } from '../../src/shared/guards/jwt-auth.guard';
import { AdminAuditLogService } from '../../src/modules/tenant/admin-audit-log.service';

const HOME = '77777777-0000-4000-8000-000000000001';
const T1 = '77777777-0000-4000-8000-000000000002';
const T2 = '77777777-0000-4000-8000-000000000003';
const ADMIN = '77777777-1111-4000-8000-000000000001';
const OTHER = '77777777-1111-4000-8000-000000000002';
const MISSING = '77777777-9999-4000-8000-000000000999';

const roleOf = (req: Record<string, unknown>): string =>
  ((req['headers'] ?? {}) as Record<string, string>)['x-test-role'] ?? 'SYSTEM_ADMIN';

describe('Admin audit-log reads · HTTP + real database (R17.4, R17.6)', () => {
  let infra: IntegrationInfra;
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  async function seedTenant(id: string, code: string): Promise<void> {
    await infra.prisma.$executeRawUnsafe(
      `INSERT INTO platform.tenants (tenant_id, tenant_code, tenant_name, keycloak_realm, plan_type, is_active)
       VALUES ($1::uuid, $2, $3, $4, 'ENTERPRISE'::platform."PlanType", true)`,
      id,
      code,
      `Tenant ${code}`,
      `realm-${code}`,
    );
  }

  async function seedUser(
    id: string,
    tenantId: string,
    email: string,
    name: string,
  ): Promise<void> {
    await infra.prisma.$executeRawUnsafe(
      `INSERT INTO platform.users (user_id, tenant_id, keycloak_user_id, email, display_name)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5)`,
      id,
      tenantId,
      `kc-${id}`,
      email,
      name,
    );
  }

  /** One audit row; `at` is a SQL expression for occurred_at, so rows can share a millisecond. */
  async function seedAudit(
    tenantId: string,
    actorId: string,
    action: string,
    at: string,
    metadata: Record<string, unknown> | null,
    ip: string | null = null,
  ): Promise<void> {
    await infra.prisma.$executeRawUnsafe(
      `INSERT INTO platform.audit_logs (tenant_id, actor_id, action, resource_type, resource_id, ip_address, user_agent, occurred_at, metadata)
       VALUES ($1::uuid, $2::uuid, $3, 'tenant', $1::uuid, $4::inet, 'jest-agent', ${at}, $5::jsonb)`,
      tenantId,
      actorId,
      action,
      ip,
      metadata === null ? null : JSON.stringify(metadata),
    );
  }

  async function auditReads(action: 'audit.read' | 'audit.export') {
    return infra.prisma.$queryRawUnsafe<
      Array<{
        tenant_id: string;
        actor_id: string;
        resource_type: string;
        metadata: Record<string, unknown>;
      }>
    >(
      `SELECT tenant_id::text, actor_id::text, resource_type, metadata FROM platform.audit_logs
        WHERE action = $1 ORDER BY occurred_at`,
      action,
    );
  }

  // ONE millisecond instant, fixed here: `now()` inside each INSERT is that statement's own clock, so a
  // per-statement expression would not guarantee the three rows share a millisecond.
  const SAME_MS = `'${new Date(Date.now() - 86_400_000).toISOString()}'::timestamptz`;

  beforeAll(async () => {
    infra = await startIntegrationInfra();

    await seedTenant(HOME, 'aud-home');
    await seedTenant(T1, 'aud-t1');
    await seedTenant(T2, 'aud-t2');
    await seedUser(ADMIN, HOME, 'sysadmin@example.com', 'Platform Operator');
    await seedUser(OTHER, HOME, 'B-Ops@Example.com', 'Second Operator');

    // T1 — six rows. Three share one millisecond and differ only in microseconds (paging, 1).
    await seedAudit(T1, ADMIN, 'tenant.create', `now() - interval '2 days'`, {
      justification: 'Opened for ACME',
    });
    await seedAudit(
      T1,
      ADMIN,
      'tenant.assign_dedicated_db',
      `now() - interval '2 days' + interval '1 microsecond'`,
      {
        justification: 'Moved from postgresql://db_admin:s3cret@db-old.internal/acme',
        dedicated_db_host: 'db-ent-042.cos.internal',
      },
    );
    for (const us of [1, 2, 3]) {
      await seedAudit(
        T1,
        ADMIN,
        'tenant.provisioning.approve',
        `${SAME_MS} + interval '${us} microsecond'`,
        { justification: `Gate OK 100% run ${us}` },
      );
    }
    await seedAudit(
      T1,
      ADMIN,
      'POST /api/v1/projects',
      `now() - interval '40 days'`,
      null,
      '10.1.2.3',
    );

    // T2 — a formula-shaped justification (4), and an old row with a blank one.
    await seedAudit(T2, OTHER, 'tenant.deactivate', `now() - interval '3 days'`, {
      justification: '=HYPERLINK("http://x/","Open")',
    });
    await seedAudit(T2, OTHER, 'tenant.create', `'2020-01-05T00:00:00Z'::timestamptz`, {
      justification: '   ',
    });

    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard(JwtAuthGuard)
      .useValue(
        clsAuthGuard((req) => ({
          tenant_id: HOME,
          user_id: ADMIN,
          role: roleOf(req),
          tenantCode: 'aud-home',
        })),
      )
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: false },
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await stopIntegrationInfra(infra);
  });

  describe('GET /admin/tenants/:tenantId/audit-logs (R17.4)', () => {
    it('walks every row newest first in pages of 2 — none skipped at a shared millisecond', async () => {
      const seen: Array<{ action: string; justification: string | null }> = [];
      let cursor: string | null = null;
      let pages = 0;
      let first: { summary: { total_30d: number } } | null = null;
      do {
        const res = await http()
          .get(`/api/v1/admin/tenants/${T1}/audit-logs`)
          .query(cursor ? { limit: '2', cursor } : { limit: '2' });
        expect(res.status).toBe(200);
        first ??= res.body;
        seen.push(...res.body.rows);
        cursor = res.body.next_cursor;
        pages += 1;
      } while (cursor && pages < 10);

      expect(pages).toBe(3);
      expect(seen.map((r) => r.justification)).toEqual([
        'Gate OK 100% run 3',
        'Gate OK 100% run 2',
        'Gate OK 100% run 1',
        'Moved from [REDACTED]',
        'Opened for ACME',
        null,
      ]);
      // Five rows fall inside 30 days; the 40-day-old one does not. Counted before this read's own row.
      expect(first!.summary).toEqual({ total_30d: 5 });
    });

    it('returns the documented row shape, joined to the tenant and the actor, and no credential', async () => {
      const res = await http()
        .get(`/api/v1/admin/tenants/${T1}/audit-logs`)
        .query({ q: 'projects' });
      expect(res.status).toBe(200);
      expect(res.body.rows).toHaveLength(1);
      expect(res.body.rows[0]).toEqual({
        log_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        occurred_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
        tenant_id: T1,
        tenant_code: 'aud-t1',
        tenant_name: 'Tenant aud-t1',
        action: 'POST /api/v1/projects',
        resource_type: 'tenant',
        resource_id: T1,
        actor_id: ADMIN,
        actor_email: 'sysadmin@example.com',
        actor_name: 'Platform Operator',
        ip_address: '10.1.2.3',
        user_agent: 'jest-agent',
        justification: null,
        metadata: {},
      });

      const all = await http()
        .get(`/api/v1/admin/tenants/${T1}/audit-logs`)
        .query({ limit: '100' });
      expect(JSON.stringify(all.body)).not.toContain('s3cret');
      expect(JSON.stringify(all.body)).not.toContain('postgresql://');
    });

    it('q is a case-insensitive literal substring: `%` matches only a percent sign', async () => {
      const percent = await http().get(`/api/v1/admin/tenants/${T1}/audit-logs`).query({ q: '%' });
      expect(percent.body.rows.map((r: { action: string }) => r.action)).toEqual(
        Array(3).fill('tenant.provisioning.approve'),
      );
      const mixedCase = await http()
        .get(`/api/v1/admin/tenants/${T1}/audit-logs`)
        .query({ q: 'gATE ok' });
      expect(mixedCase.body.rows).toHaveLength(3);
    });

    it('writes one audit.read row per call — against the TARGET tenant, by the caller, filters in metadata', async () => {
      const before = (await auditReads('audit.read')).length;
      const res = await http()
        .get(`/api/v1/admin/tenants/${T1}/audit-logs`)
        .query({ q: 'ACME', limit: '7' });
      expect(res.status).toBe(200);

      const after = await auditReads('audit.read');
      expect(after).toHaveLength(before + 1);
      expect(after[after.length - 1]).toEqual({
        tenant_id: T1,
        actor_id: ADMIN,
        resource_type: 'audit_log',
        metadata: {
          scope: 'tenant',
          view: 'list',
          filters: { tenant_id: T1, actor_id: null, action: null, from: null, to: null, q: 'ACME' },
          limit: 7,
          after_cursor: false,
        },
      });
    });

    it.each([
      [
        'a role other than SYSTEM_ADMIN',
        `/api/v1/admin/tenants/${T1}/audit-logs`,
        {},
        'TENANT_ADMIN',
        403,
      ],
      [
        'a tenant id that is not a UUID',
        '/api/v1/admin/tenants/nope/audit-logs',
        {},
        undefined,
        400,
      ],
      [
        'a tenant that does not exist',
        `/api/v1/admin/tenants/${MISSING}/audit-logs`,
        {},
        undefined,
        404,
      ],
      [
        'limit above 100',
        `/api/v1/admin/tenants/${T1}/audit-logs`,
        { limit: '101' },
        undefined,
        400,
      ],
      [
        'a forged cursor',
        `/api/v1/admin/tenants/${T1}/audit-logs`,
        { cursor: 'Zm9vfGJhcg' },
        undefined,
        400,
      ],
      [
        'an unknown parameter',
        `/api/v1/admin/tenants/${T1}/audit-logs`,
        { tenant: T2 },
        undefined,
        400,
      ],
    ])('refuses %s', async (_label, path, query, role, status) => {
      const before = (await auditReads('audit.read')).length;
      const req = http().get(path).query(query);
      const res = await (role ? req.set('x-test-role', role) : req);
      expect(res.status).toBe(status);
      expect(await auditReads('audit.read')).toHaveLength(before);
    });
  });

  describe('GET /admin/tenants/:tenantId/audit-logs/export.csv (R17.4)', () => {
    it('is an RFC 4180 attachment, injection-safe, and audited as audit.export', async () => {
      const before = (await auditReads('audit.export')).length;
      const res = await http().get(`/api/v1/admin/tenants/${T2}/audit-logs/export.csv`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/^text\/csv/);
      expect(res.headers['content-disposition']).toBe(`attachment; filename="audit-log-${T2}.csv"`);
      expect(res.headers['x-export-row-cap']).toBe('50000');
      expect(res.headers['x-export-truncated']).toBe('false');

      const lines = res.text.split('\r\n');
      expect(lines[0]).toBe(
        'occurred_at,log_id,tenant_id,tenant_code,tenant_name,action,resource_type,resource_id,' +
          'actor_id,actor_email,actor_name,ip_address,user_agent,justification,metadata',
      );
      expect(lines).toHaveLength(3); // header + T2's two rows
      expect(lines[1]).toContain(`"'=HYPERLINK(""http://x/"",""Open"")"`);

      const after = await auditReads('audit.export');
      expect(after).toHaveLength(before + 1);
      expect(after[after.length - 1]).toMatchObject({
        tenant_id: T2,
        actor_id: ADMIN,
        resource_type: 'audit_log',
        metadata: { scope: 'tenant', view: 'export', format: 'csv' },
      });
    });

    it('never writes a credentialed URL into the file', async () => {
      const res = await http().get(`/api/v1/admin/tenants/${T1}/audit-logs/export.csv`);
      expect(res.status).toBe(200);
      expect(res.text).toContain('Moved from [REDACTED]');
      expect(res.text).not.toContain('s3cret');
    });

    it('403 for a role other than SYSTEM_ADMIN', async () => {
      const res = await http()
        .get(`/api/v1/admin/tenants/${T1}/audit-logs/export.csv`)
        .set('x-test-role', 'EXECUTIVE');
      expect(res.status).toBe(403);
    });
  });

  describe('GET /admin/audit-logs (R17.6)', () => {
    const actions = (body: { rows: Array<{ action: string }> }) => body.rows.map((r) => r.action);

    it('spans tenants; with no tenantId filter the audit row is recorded against the caller`s tenant', async () => {
      const before = (await auditReads('audit.read')).length;
      const res = await http()
        .get('/api/v1/admin/audit-logs')
        .query({ action: 'tenant.', limit: '100' });
      expect(res.status).toBe(200);
      expect(new Set(res.body.rows.map((r: { tenant_id: string }) => r.tenant_id))).toEqual(
        new Set([T1, T2]),
      );
      expect(res.body.rows).toHaveLength(7);
      expect(res.body.next_cursor).toBeNull();

      const after = await auditReads('audit.read');
      expect(after).toHaveLength(before + 1);
      expect(after[after.length - 1]).toMatchObject({
        tenant_id: HOME,
        actor_id: ADMIN,
        metadata: {
          scope: 'global',
          view: 'list',
          filters: { action: 'tenant.', tenant_id: null },
        },
      });
    });

    it('filters by tenant, actor, exact action and window — and audits against the filtered tenant', async () => {
      const byTenant = await http()
        .get('/api/v1/admin/audit-logs')
        .query({ tenantId: T2, action: 'tenant.' });
      expect(actions(byTenant.body)).toEqual(['tenant.deactivate', 'tenant.create']);
      const [last] = (await auditReads('audit.read')).slice(-1);
      expect(last!.tenant_id).toBe(T2);

      const byActor = await http().get('/api/v1/admin/audit-logs').query({ actorId: OTHER });
      expect(actions(byActor.body)).toEqual(['tenant.deactivate', 'tenant.create']);

      const exact = await http()
        .get('/api/v1/admin/audit-logs')
        .query({ action: 'tenant.provisioning.approve' });
      expect(exact.body.rows).toHaveLength(3);

      const window = await http()
        .get('/api/v1/admin/audit-logs')
        .query({ from: '2019-12-31', to: '2020-01-31' });
      expect(actions(window.body)).toEqual(['tenant.create']);
    });

    it('q matches the actor email case-insensitively', async () => {
      const res = await http().get('/api/v1/admin/audit-logs').query({ q: 'b-ops@EXAMPLE' });
      expect(res.body.rows.map((r: { actor_id: string }) => r.actor_id)).toEqual([OTHER, OTHER]);
    });

    it.each([
      ['from after to', { from: '2026-09-15', to: '2026-09-01' }, 400],
      ['a malformed actorId', { actorId: 'x' }, 400],
      ['a tenantId that names no tenant', { tenantId: MISSING }, 404],
    ])('refuses %s', async (_l, query, status) => {
      expect((await http().get('/api/v1/admin/audit-logs').query(query)).status).toBe(status);
    });

    it('403 for a role other than SYSTEM_ADMIN', async () => {
      const res = await http().get('/api/v1/admin/audit-logs').set('x-test-role', 'TENANT_ADMIN');
      expect(res.status).toBe(403);
    });
  });

  describe('GET /admin/audit-logs/summary (R17.6)', () => {
    it('counts exactly as documented', async () => {
      const [{ total, audit }] = await infra.prisma.$queryRawUnsafe<
        Array<{ total: bigint; audit: bigint }>
      >(
        `SELECT count(*) AS total, count(*) FILTER (WHERE action LIKE 'audit.%') AS audit
           FROM platform.audit_logs`,
      );

      const all = await http().get('/api/v1/admin/audit-logs/summary');
      expect(all.status).toBe(200);
      expect(all.body).toEqual({
        total: Number(total),
        // Every seeded row is at least a day old; only this run's audit reads fall on today (UTC).
        today: Number(audit),
        // tenant.* with a non-blank justification: T1 × 5 and T2's deactivate. The blank one is not.
        with_justification: 6,
        // Every tenant.* row, the blank-justification 2020 one included: T1 × 5 and T2 × 2.
        privileged: 7,
        // tenant.* within 7 × 24 h: the same six; the 2020 row is outside.
        privileged_7d: 6,
      });

      const windowed = await http()
        .get('/api/v1/admin/audit-logs/summary')
        .query({ from: '2020-01-01', to: '2020-02-01' });
      expect(windowed.body).toMatchObject({
        total: 1,
        with_justification: 0,
        privileged: 1,
        privileged_7d: 6,
      });

      const [last] = (await auditReads('audit.read')).slice(-1);
      expect(last).toMatchObject({ tenant_id: HOME, metadata: { view: 'summary' } });
    });

    it('refuses a parameter it does not take', async () => {
      expect((await http().get('/api/v1/admin/audit-logs/summary').query({ q: 'x' })).status).toBe(
        400,
      );
    });
  });

  describe('GET /admin/audit-logs/export (R17.6)', () => {
    it('CSV by default, as an attachment with the cap headers', async () => {
      const res = await http().get('/api/v1/admin/audit-logs/export').query({ actorId: OTHER });
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/^text\/csv/);
      expect(res.headers['content-disposition']).toMatch(
        /^attachment; filename="audit-log-.+\.csv"$/,
      );
      expect(res.text.split('\r\n')).toHaveLength(3);
    });

    it('JSON on request, carrying row_cap and truncated, and audited with its format', async () => {
      const before = (await auditReads('audit.export')).length;
      const res = await http()
        .get('/api/v1/admin/audit-logs/export')
        .query({ format: 'json', tenantId: T1, action: 'tenant.' });
      expect(res.status).toBe(200);
      expect(res.headers['content-disposition']).toMatch(/\.json"$/);
      expect(res.body).toMatchObject({ row_cap: 50000, truncated: false });
      expect(res.body.rows).toHaveLength(5);
      expect(JSON.stringify(res.body)).not.toContain('s3cret');

      const after = await auditReads('audit.export');
      expect(after).toHaveLength(before + 1);
      expect(after[after.length - 1]).toMatchObject({
        tenant_id: T1,
        metadata: { scope: 'global', view: 'export', format: 'json' },
      });
    });

    it('refuses a format it does not produce', async () => {
      expect(
        (await http().get('/api/v1/admin/audit-logs/export').query({ format: 'xml' })).status,
      ).toBe(400);
    });
  });

  // (6) The platform connection is what makes a cross-tenant read possible. Built on app_user — the
  // login migration 20260623000001 creates — the service must refuse rather than return what RLS lets
  // through. CONTROL: the same role really does see only one tenant, so the refusal is not decorative.
  describe('on a connection subject to RLS (app_user)', () => {
    let asAppUser: AdminAuditLogService;

    beforeAll(() => {
      const url = new URL(infra.pgUrl);
      url.username = 'app_user';
      url.password = 'app_user_dev_password';
      const saved = process.env['DATABASE_URL'];
      process.env['DATABASE_URL'] = url.toString();
      asAppUser = new AdminAuditLogService();
      process.env['DATABASE_URL'] = saved;
    });

    afterAll(async () => {
      await asAppUser?.onModuleDestroy();
    });

    it('the global list is 503, and writes no audit row', async () => {
      const before = (await auditReads('audit.read')).length;
      await expect(asAppUser.listAuditLogs(HOME, ADMIN, {})).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(await auditReads('audit.read')).toHaveLength(before);
    });

    it('CONTROL: as app_user with the GUC set, another tenant`s audit rows are invisible', async () => {
      const prisma = (asAppUser as unknown as { prisma: IntegrationInfra['prisma'] }).prisma;
      const visible = await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${T1}'`);
        const rows = await tx.$queryRawUnsafe<Array<{ n: bigint }>>(
          `SELECT count(*) AS n FROM platform.audit_logs WHERE tenant_id = $1::uuid`,
          T2,
        );
        return Number(rows[0]!.n);
      });
      expect(visible).toBe(0);
    });
  });
});

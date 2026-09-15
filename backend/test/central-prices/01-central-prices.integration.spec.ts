// Integration tests: ราคากลาง central prices (ADR-061; R17.12-R17.17) against real PostgreSQL.
//
// Runs on the FASTIFY adapter with @fastify/multipart registered exactly as main.ts does
// (registerMultipart): the import route reads the form through the plugin's decorators, which the default
// Express test adapter does not have. Covers the file import (CSV and .xlsx), the register listing,
// sync-status, the adapter sync (the stub reports NOT_CONFIGURED), the tenant read, the BOQ feed
// (Mode A and B) and the price-variance report, the audit rows and outbox rows each write leaves, and the
// migration's privilege claim that app_user can read the catalog but never write it.

import { Test, TestingModule } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { JwtAuthGuard } from '../../src/shared/guards/jwt-auth.guard';
import { registerMultipart } from '../../src/shared/http/register-multipart';
import { GlobalExceptionFilter } from '../../src/shared/filters/http-exception.filter';
import { AppModule } from '../../src/app.module';
import {
  startIntegrationInfra,
  stopIntegrationInfra,
  clsAuthGuard,
  type IntegrationInfra,
} from '../helpers/integration-infra';
import { buildXlsx } from '../helpers/xlsx-fixture';

const TENANT_ID = 'cccccccc-0001-4000-8000-000000000001';
const ADMIN_ID = 'cccccccc-0002-4000-8000-000000000001';
const PM_ID = 'cccccccc-0002-4000-8000-000000000002';
const PROJECT_ID = 'cccccccc-0003-4000-8000-000000000001';
const JUSTIFICATION = 'Comptroller General circular for 2569 published';

const HEADER = 'code,description,category,unit,central_price,currency_code';

function csv(...lines: string[]): Buffer {
  return Buffer.from([HEADER, ...lines].join('\r\n'), 'utf8');
}

describe('Central prices (ADR-061) — integration', () => {
  let infra: IntegrationInfra;
  let app: NestFastifyApplication;

  beforeAll(async () => {
    infra = await startIntegrationInfra();
    await infra.prisma.$executeRaw`
      INSERT INTO platform.tenants (tenant_id, tenant_code, tenant_name, keycloak_realm, plan_type, is_active)
      VALUES (${TENANT_ID}::uuid, 'cp-int', 'Central Price Tenant', 'cp-realm', 'STARTER'::platform."PlanType", true)
    `;
    await infra.prisma.$executeRaw`
      INSERT INTO platform.users (user_id, tenant_id, keycloak_user_id, email, display_name)
      VALUES (${ADMIN_ID}::uuid, ${TENANT_ID}::uuid, 'kc-cp-admin', 'admin@cp-int.test', 'Admin'),
             (${PM_ID}::uuid, ${TENANT_ID}::uuid, 'kc-cp-pm', 'pm@cp-int.test', 'PM')
    `;
    await infra.prisma.$executeRaw`
      INSERT INTO projects.projects (project_id, tenant_id, project_code, project_name, project_type, status, created_by)
      VALUES (${PROJECT_ID}::uuid, ${TENANT_ID}::uuid, 'CP-1', 'Central Price Project',
              'INFRASTRUCTURE'::"ProjectType", 'ACTIVE'::"ProjectStatus", ${PM_ID}::uuid)
    `;

    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard(JwtAuthGuard)
      .useValue(
        clsAuthGuard((req) => {
          const headers = (req['headers'] ?? {}) as Record<string, string>;
          const role = headers['x-test-role'] ?? 'SYSTEM_ADMIN';
          return {
            tenant_id: TENANT_ID,
            user_id: role === 'SYSTEM_ADMIN' ? ADMIN_ID : PM_ID,
            role,
            tenantCode: 'cp-int',
          };
        }),
      )
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({ logger: false }),
    );
    await registerMultipart(app);
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await stopIntegrationInfra(infra);
  });

  const api = () => request(app.getHttpServer());

  const importFile = (bytes: Buffer, filename: string, period = '2569', role = 'SYSTEM_ADMIN') =>
    api()
      .post('/api/v1/admin/central-prices/import')
      .set('x-test-role', role)
      .field('effective_period', period)
      .field('source_ref', 'กค 0433.2/ว 123')
      .field('justification', JUSTIFICATION)
      .attach('file', bytes, filename);

  // ── import ───────────────────────────────────────────────────────────────

  describe('POST /api/v1/admin/central-prices/import', () => {
    it('imports a CSV: valid rows written, bad rows reported, run + audit + outbox rows committed', async () => {
      const res = await importFile(
        csv(
          'STR-001,คอนกรีตผสมเสร็จ 240 ksc,งานโครงสร้าง,ลบ.ม.,2450.5,THB',
          'STR-002,เหล็กเสริม DB16,งานโครงสร้าง,kg,28.75,',
          'STR-003,Bad price,,kg,-1,THB',
          'STR-001,Duplicate,,kg,1,THB',
        ),
        'ราคากลาง-2569.csv',
      ).expect(200);

      expect(res.body).toEqual({
        run_id: expect.any(String),
        outcome: 'SUCCEEDED',
        records_total: 4,
        inserted: 2,
        updated: 0,
        rejected: [
          {
            row: 4,
            reason: expect.stringContaining('central_price must be a non-negative decimal'),
          },
          { row: 5, reason: 'duplicate code "STR-001" (first on row 2)' },
        ],
      });

      const rows = await infra.prisma.$queryRaw<
        Array<{ code: string; central_price: string; source: string; published: boolean }>
      >`
        SELECT code, central_price::text AS central_price, source, published_at IS NOT NULL AS published
          FROM platform.central_price_catalog WHERE effective_period = '2569' ORDER BY code
      `;
      expect(rows).toEqual([
        { code: 'STR-001', central_price: '2450.5000', source: 'MANUAL_IMPORT', published: true },
        { code: 'STR-002', central_price: '28.7500', source: 'MANUAL_IMPORT', published: true },
      ]);

      const [audit] = await infra.prisma.$queryRaw<
        Array<{
          tenant_id: string;
          actor_id: string;
          resource_id: string;
          metadata: Record<string, unknown>;
        }>
      >`
        SELECT tenant_id::text, actor_id::text, resource_id::text, metadata
          FROM platform.audit_logs WHERE action = 'central_prices.import' AND resource_type = 'central_price_catalog'
      `;
      expect(audit).toMatchObject({
        tenant_id: TENANT_ID,
        actor_id: ADMIN_ID,
        resource_id: res.body.run_id,
        metadata: expect.objectContaining({
          justification: JUSTIFICATION,
          records_inserted: 2,
          records_rejected: 2,
          file_name: 'ราคากลาง-2569.csv',
        }),
      });

      const [outbox] = await infra.prisma.$queryRaw<
        Array<{ tenant_id: string; payload: Record<string, unknown> }>
      >`
        SELECT tenant_id, payload FROM platform.outbox_events
         WHERE event_type = 'platform.central_price_catalog.updated.v1'
      `;
      expect(outbox!.tenant_id).toBe('platform');
      expect(outbox!.payload).toMatchObject({
        tenant_id: 'platform',
        actor_id: ADMIN_ID,
        payload: {
          run_id: res.body.run_id,
          source: 'MANUAL_IMPORT',
          effective_period: '2569',
          records_inserted: 2,
          records_updated: 0,
        },
      });
    });

    it('re-imports the same period as updates, and imports .xlsx with numbers kept exact', async () => {
      const bytes = await buildXlsx([
        ['code', 'description', 'category', 'unit', 'central_price', 'currency_code'],
        [
          'STR-001',
          'คอนกรีตผสมเสร็จ 240 ksc',
          'งานโครงสร้าง',
          'ลบ.ม.',
          { number: '2500.1234' },
          'THB',
        ],
        ['STR-004', 'ทรายหยาบ', 'งานดิน', 'ลบ.ม.', { number: '0.1' }, null],
      ]);
      const res = await importFile(bytes, 'prices.xlsx').expect(200);
      expect(res.body).toMatchObject({
        outcome: 'SUCCEEDED',
        inserted: 1,
        updated: 1,
        rejected: [],
      });

      const rows = await infra.prisma.$queryRaw<Array<{ code: string; central_price: string }>>`
        SELECT code, central_price::text AS central_price FROM platform.central_price_catalog
         WHERE code IN ('STR-001', 'STR-004') AND effective_period = '2569' ORDER BY code
      `;
      expect(rows).toEqual([
        { code: 'STR-001', central_price: '2500.1234' },
        { code: 'STR-004', central_price: '0.1000' },
      ]);
    });

    it('a second, newer period becomes the reference for its codes', async () => {
      await importFile(
        csv('STR-001,คอนกรีตผสมเสร็จ 240 ksc,งานโครงสร้าง,ลบ.ม.,2600,THB'),
        'p2570.csv',
        '2570',
      ).expect(200);
    });

    it('whole-file refusal: 422 COS-CPRICE-004 with a FAILED run the register can show', async () => {
      const res = await importFile(Buffer.from('code,unit\r\nX,m3'), 'broken.csv').expect(422);
      expect(res.body.error).toMatchObject({
        code: 'COS-CPRICE-004',
        details: { reason: 'MISSING_COLUMNS', run_id: expect.any(String) },
      });
      const [run] = await infra.prisma.$queryRaw<Array<{ outcome: string; error_code: string }>>`
        SELECT outcome, error_code FROM platform.central_price_sync_runs WHERE run_id = ${res.body.error.details.run_id}::uuid
      `;
      expect(run).toEqual({ outcome: 'FAILED', error_code: 'MISSING_COLUMNS' });
    });

    it('415 for an unsupported file, 400 for missing justification, 400 without a file', async () => {
      await importFile(Buffer.from('%PDF-1.7'), 'prices.pdf').expect(415);
      await api()
        .post('/api/v1/admin/central-prices/import')
        .field('effective_period', '2569')
        .attach('file', csv('A,d,,u,1,THB'), 'a.csv')
        .expect(400);
      await api()
        .post('/api/v1/admin/central-prices/import')
        .field('effective_period', '2569')
        .field('justification', JUSTIFICATION)
        .expect(400);
    });

    it('413 for a file over the limit', async () => {
      const big = Buffer.alloc(5 * 1024 * 1024 + 1, 'a');
      const res = await importFile(big, 'big.csv');
      expect(res.status).toBe(413);
    });

    it('403 for a tenant role', async () => {
      await importFile(csv('A,d,,u,1,THB'), 'a.csv', '2569', 'TENANT_ADMIN').expect(403);
    });
  });

  // ── register, template, sync ─────────────────────────────────────────────

  describe('admin reads and sync', () => {
    it('GET /admin/central-prices lists every row with total, periods and paging', async () => {
      const first = await api()
        .get('/api/v1/admin/central-prices?limit=2')
        .set('x-test-role', 'SYSTEM_ADMIN')
        .expect(200);
      expect(first.body.total).toBe(4);
      expect(first.body.periods).toEqual(['2570', '2569']);
      expect(first.body.rows).toHaveLength(2);
      // code ASC, then newest period first within a code.
      expect(
        first.body.rows.map(
          (r: { code: string; effective_period: string }) => `${r.code}@${r.effective_period}`,
        ),
      ).toEqual(['STR-001@2570', 'STR-001@2569']);
      expect(first.body.rows[0]).toMatchObject({ central_price: '2600.0000', status: 'ACTIVE' });
      expect(first.body.next_cursor).toEqual(expect.any(String));

      const second = await api()
        .get(`/api/v1/admin/central-prices?limit=2&cursor=${first.body.next_cursor}`)
        .set('x-test-role', 'SYSTEM_ADMIN')
        .expect(200);
      expect(second.body.rows.map((r: { code: string }) => r.code)).toEqual(['STR-002', 'STR-004']);
      expect(second.body.next_cursor).toBeNull();

      const filtered = await api()
        .get(
          `/api/v1/admin/central-prices?category=${encodeURIComponent('งานดิน')}&effective_period=2569&q=${encodeURIComponent('ทราย')}`,
        )
        .set('x-test-role', 'SYSTEM_ADMIN')
        .expect(200);
      expect(filtered.body).toMatchObject({ total: 1, rows: [{ code: 'STR-004' }] });

      await api()
        .get('/api/v1/admin/central-prices?cursor=forged')
        .set('x-test-role', 'SYSTEM_ADMIN')
        .expect(400);
      await api()
        .get('/api/v1/admin/central-prices')
        .set('x-test-role', 'PROJECT_MANAGER')
        .expect(403);
    });

    it('GET /admin/central-prices/template.csv is the header row', async () => {
      const res = await api()
        .get('/api/v1/admin/central-prices/template.csv')
        .set('x-test-role', 'SYSTEM_ADMIN')
        .expect(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.text).toBe(`${HEADER}\r\n`);
    });

    it('POST /admin/central-prices/sync records NOT_CONFIGURED honestly (D9), audited, no event', async () => {
      const before = await infra.prisma.$queryRaw<Array<{ n: number }>>`
        SELECT count(*)::int AS n FROM platform.outbox_events WHERE event_type = 'platform.central_price_catalog.updated.v1'
      `;
      const res = await api()
        .post('/api/v1/admin/central-prices/sync')
        .set('x-test-role', 'SYSTEM_ADMIN')
        .send({ justification: JUSTIFICATION })
        .expect(200);
      expect(res.body).toMatchObject({
        kind: 'GOV_API',
        outcome: 'NOT_CONFIGURED',
        error_code: 'ADAPTER_NOT_CONFIGURED',
        actor_id: ADMIN_ID,
      });
      const [audit] = await infra.prisma.$queryRaw<Array<{ n: number }>>`
        SELECT count(*)::int AS n FROM platform.audit_logs WHERE action = 'central_prices.sync' AND resource_id = ${res.body.run_id}::uuid
      `;
      expect(audit!.n).toBe(1);
      const after = await infra.prisma.$queryRaw<Array<{ n: number }>>`
        SELECT count(*)::int AS n FROM platform.outbox_events WHERE event_type = 'platform.central_price_catalog.updated.v1'
      `;
      expect(after[0]!.n).toBe(before[0]!.n);

      await api()
        .post('/api/v1/admin/central-prices/sync')
        .set('x-test-role', 'SYSTEM_ADMIN')
        .send({ justification: 'short' })
        .expect(400);
    });

    it('GET /admin/central-prices/sync-status reads the recorded runs', async () => {
      const res = await api()
        .get('/api/v1/admin/central-prices/sync-status')
        .set('x-test-role', 'SYSTEM_ADMIN')
        .expect(200);
      expect(res.body.adapter).toEqual({ name: 'e-GP (กรมบัญชีกลาง)', configured: false });
      expect(res.body.last_run).toMatchObject({ outcome: 'NOT_CONFIGURED' });
      expect(res.body.last_success).toMatchObject({
        kind: 'FILE_IMPORT',
        outcome: 'SUCCEEDED',
        effective_period: '2570',
      });
      expect(res.body.last_failure).toMatchObject({
        outcome: 'FAILED',
        error_code: 'MISSING_COLUMNS',
      });
    });
  });

  // ── tenant read ──────────────────────────────────────────────────────────

  describe('GET /api/v1/central-prices (tenant read)', () => {
    it('serves active published rows to a tenant role, never pending or inactive ones', async () => {
      await infra.prisma.$executeRaw`
        INSERT INTO platform.central_price_catalog (code, description, unit, central_price, currency_code, effective_period, source, published_at, is_active)
        VALUES ('PEND-1', 'Pending', 'u', 1, 'THB', '2569', 'MANUAL_IMPORT', NULL, true),
               ('OFF-1', 'Withdrawn', 'u', 1, 'THB', '2569', 'MANUAL_IMPORT', now(), false)
      `;
      const res = await api()
        .get('/api/v1/central-prices?q=STR-00')
        .set('x-test-role', 'SITE_ENGINEER')
        .expect(200);
      const codes = res.body.rows.map((r: { code: string }) => r.code);
      expect(codes).toEqual(['STR-001', 'STR-001', 'STR-002', 'STR-004']);
      expect(res.body.next_cursor).toBeNull();

      const byCode = await api()
        .get('/api/v1/central-prices?code=PEND-1')
        .set('x-test-role', 'VIEWER')
        .expect(200);
      expect(byCode.body.rows).toEqual([]);
      const off = await api()
        .get('/api/v1/central-prices?code=OFF-1')
        .set('x-test-role', 'VIEWER')
        .expect(200);
      expect(off.body.rows).toEqual([]);

      await api().get('/api/v1/central-prices').set('x-test-role', 'SYSTEM_ADMIN').expect(403);
    });

    it('app_user can read the catalog but not write it (migration 20260915000002 grants)', async () => {
      const readable = await infra.prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SET LOCAL ROLE app_user');
        return tx.$queryRaw<
          Array<{ n: number }>
        >`SELECT count(*)::int AS n FROM platform.central_price_catalog`;
      });
      expect(readable[0]!.n).toBeGreaterThan(0);

      await expect(
        infra.prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe('SET LOCAL ROLE app_user');
          await tx.$executeRaw`UPDATE platform.central_price_catalog SET central_price = 0`;
        }),
      ).rejects.toThrow(/permission denied/);
    });
  });

  // ── BOQ feed + price variance ────────────────────────────────────────────

  describe('BOQ feed (Mode A / Mode B) and GET /api/v1/boq/projects/:projectId/price-variance', () => {
    let versionId: string;
    let categoryId: string;

    beforeAll(async () => {
      const version = await api()
        .post(`/api/v1/projects/${PROJECT_ID}/boq/versions`)
        .set('x-test-role', 'PROJECT_MANAGER')
        .send({ currency_code: 'THB' })
        .expect(201);
      versionId = version.body.version_id;
      const category = await api()
        .post(`/api/v1/boq/versions/${versionId}/categories`)
        .set('x-test-role', 'PROJECT_MANAGER')
        .send({ category_code: 'STR', category_name: 'Structure' })
        .expect(201);
      categoryId = category.body.category_id;
    });

    it('Mode A: links a line to the NEWEST period and stores reference + variance', async () => {
      const res = await api()
        .post(`/api/v1/boq/versions/${versionId}/items`)
        .set('x-test-role', 'PROJECT_MANAGER')
        .send({
          category_id: categoryId,
          item_code: 'STR-001',
          description: 'Concrete',
          unit: 'm3',
          quantity: '10.0000',
          unit_cost: '2550.0000',
        })
        .expect(201);

      const [row] = await infra.prisma.$queryRaw<
        Array<{ reference_price: string; price_variance: string; period: string }>
      >`
        SELECT i.reference_price::text, i.price_variance::text, c.effective_period AS period
          FROM boq.boq_items i JOIN platform.central_price_catalog c ON c.price_id = i.central_price_id
         WHERE i.item_id = ${res.body.item_id}::uuid
      `;
      expect(row).toEqual({
        reference_price: '2600.0000',
        price_variance: '-50.0000',
        period: '2570',
      });
    });

    it('Mode A: a line whose code has no active price stays unlinked', async () => {
      const res = await api()
        .post(`/api/v1/boq/versions/${versionId}/items`)
        .set('x-test-role', 'PROJECT_MANAGER')
        .send({
          category_id: categoryId,
          item_code: 'PEND-1',
          description: 'Pending code',
          unit: 'u',
          quantity: '1.0000',
          unit_cost: '5.0000',
        })
        .expect(201);
      expect(res.body.central_price_id).toBeNull();
    });

    it('Mode B: pre-fills unit_cost from the central price; 422 when no price exists', async () => {
      const res = await api()
        .post(`/api/v1/boq/versions/${versionId}/items`)
        .set('x-test-role', 'PROJECT_MANAGER')
        .send({
          category_id: categoryId,
          item_code: 'STR-002',
          description: 'Rebar',
          unit: 'kg',
          quantity: '100.0000',
          use_central_price: true,
        })
        .expect(201);
      const [row] = await infra.prisma.$queryRaw<
        Array<{ unit_cost: string; price_variance: string }>
      >`
        SELECT unit_cost::text, price_variance::text FROM boq.boq_items WHERE item_id = ${res.body.item_id}::uuid
      `;
      expect(row).toEqual({ unit_cost: '28.7500', price_variance: '0.0000' });

      const refused = await api()
        .post(`/api/v1/boq/versions/${versionId}/items`)
        .set('x-test-role', 'PROJECT_MANAGER')
        .send({
          category_id: categoryId,
          item_code: 'NOPE',
          description: 'x',
          unit: 'u',
          quantity: '1.0000',
          use_central_price: true,
        })
        .expect(422);
      expect(refused.body.error.code).toBe('COS-CPRICE-006');

      await api()
        .post(`/api/v1/boq/versions/${versionId}/items`)
        .set('x-test-role', 'PROJECT_MANAGER')
        .send({
          category_id: categoryId,
          item_code: 'STR-002',
          description: 'x',
          unit: 'u',
          quantity: '1.0000',
        })
        .expect(400); // no unit_cost and no use_central_price
    });

    it('update keeps the snapshot and recomputes the variance', async () => {
      const [item] = await infra.prisma.$queryRaw<Array<{ item_id: string }>>`
        SELECT item_id::text FROM boq.boq_items WHERE item_code = 'STR-001' AND version_id = ${versionId}::uuid
      `;
      await api()
        .patch(`/api/v1/boq/items/${item!.item_id}`)
        .set('x-test-role', 'PROJECT_MANAGER')
        .send({ unit_cost: '2700.0000' })
        .expect(200);
      const [row] = await infra.prisma.$queryRaw<
        Array<{ reference_price: string; price_variance: string }>
      >`
        SELECT reference_price::text, price_variance::text FROM boq.boq_items WHERE item_id = ${item!.item_id}::uuid
      `;
      expect(row).toEqual({ reference_price: '2600.0000', price_variance: '100.0000' });
    });

    it('price-variance reports per item and totals for the newest version', async () => {
      const res = await api()
        .get(`/api/v1/boq/projects/${PROJECT_ID}/price-variance`)
        .set('x-test-role', 'FINANCE')
        .expect(200);

      expect(res.body).toMatchObject({
        project_id: PROJECT_ID,
        version_id: versionId,
        currency_code: 'THB',
      });
      const byCode = Object.fromEntries(
        res.body.items.map((i: { item_code: string }) => [i.item_code, i]),
      );
      expect(byCode['STR-001']).toMatchObject({
        unit_cost: '2700.0000',
        reference_price: '2600.0000',
        price_variance: '100.0000',
        reference_total: '26000.0000',
        variance_total: '1000.0000',
      });
      expect(byCode['PEND-1']).toMatchObject({ reference_price: null, price_variance: null });
      expect(res.body.totals).toEqual({
        items: 3,
        items_with_reference: 2,
        estimated_total: '29880.0000', // 27000 + 5 + 2875
        referenced_estimated_total: '29875.0000',
        reference_total: '28875.0000',
        variance_total: '1000.0000',
      });

      await api()
        .get(
          `/api/v1/boq/projects/${PROJECT_ID}/price-variance?version_id=cccccccc-9999-4000-8000-000000000001`,
        )
        .set('x-test-role', 'FINANCE')
        .expect(404);
      await api()
        .get(`/api/v1/boq/projects/${PROJECT_ID}/price-variance`)
        .set('x-test-role', 'SITE_WORKER')
        .expect(403);
    });
  });
});

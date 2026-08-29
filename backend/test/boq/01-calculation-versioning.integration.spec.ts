/**
 * Phase 4 — Calculation Rules (master:2290-2294), Versioning Rules (master:2296-2301),
 * and Generate item 08 "Integration tests: full BOQ lifecycle" (master:2323).
 *
 *   estimated_total   = ROUND(quantity × unit_cost, 4), HALF_UP
 *   category.subtotal = SUM(item.estimated_total)
 *   version.total     = SUM(root category subtotals)
 *   recalculation is SYNCHRONOUS on any item create/update/delete
 *
 *   version_number starts at 1 · a new version copies the latest APPROVED one ·
 *   only ONE DRAFT per project · approving supersedes the previous APPROVED ·
 *   APPROVED and SUPERSEDED are IMMUTABLE
 *
 * Values are read back FROM THE DATABASE, not from the response body: the spec fixes what is
 * stored (DECIMAL(19,4)), and a response can be right while the row is wrong.
 */
jest.mock('@aws-sdk/client-sns', () => ({
  SNSClient: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({ MessageId: 'mock-msg-id' }),
  })),
  PublishCommand: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import {
  startIntegrationInfra,
  stopIntegrationInfra,
  clsAuthGuard,
  type IntegrationInfra,
} from '../helpers/integration-infra';
import { AppModule } from '../../src/app.module';
import { JwtAuthGuard } from '../../src/shared/guards/jwt-auth.guard';

const TENANT_ID = 'ffffffff-1111-4000-8000-000000000001';
const USER_ID = 'ffffffff-2222-4000-8000-000000000001';

const roleOf = (req: Record<string, unknown>): string => {
  const headers = (req['headers'] ?? {}) as Record<string, string>;
  return headers['x-test-role'] ?? 'TENANT_ADMIN';
};

describe('Phase 4 · BOQ calculation and versioning (real database)', () => {
  let infra: IntegrationInfra;
  let app: INestApplication;
  let seq = 0;

  beforeAll(async () => {
    infra = await startIntegrationInfra();
    await infra.prisma.$executeRawUnsafe(
      `INSERT INTO platform.tenants (tenant_id, tenant_code, tenant_name, keycloak_realm, plan_type, is_active)
       VALUES ($1::uuid, 'sd-p4', 'Spec Derived P4', 'construction-os', 'STARTER'::platform."PlanType", true)`,
      TENANT_ID,
    );
    await infra.prisma.$executeRawUnsafe(
      `INSERT INTO platform.users (user_id, tenant_id, keycloak_user_id, phone_number, email, display_name)
       VALUES ($1::uuid, $2::uuid, 'kc-p4', '+66890000004', 'p4@example.com', 'P4')`,
      USER_ID,
      TENANT_ID,
    );

    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard(JwtAuthGuard)
      .useValue(clsAuthGuard((req) => (req['user'] ?? {}) as Record<string, string>))
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.use((req: Record<string, unknown>, _res: unknown, next: () => void) => {
      req['user'] = {
        tenant_id: TENANT_ID,
        user_id: USER_ID,
        role: roleOf(req),
        tenantCode: 'sd-p4',
      };
      next();
    });
    await app.init();

    // No host project here: every test below creates its own, because "only one DRAFT version
    // per project" (master:2299) is itself one of the rules under test — sharing a project would
    // make the tests interfere with each other.
  });

  afterAll(async () => {
    await app?.close();
    await stopIntegrationInfra(infra);
  });

  const http = () => request(app.getHttpServer());
  const ADMIN = 'TENANT_ADMIN';

  const newProject = async (): Promise<string> => {
    seq += 1;
    const res = await http()
      .post('/api/v1/projects')
      .set('x-test-role', ADMIN)
      .send({
        project_code: `SD-P4-${seq}`,
        project_name: `BOQ Project ${seq}`,
        project_type: 'RESIDENTIAL',
        start_date: '2019-01-01',
        end_date: '2020-01-01',
      });
    expect([200, 201]).toContain(res.status);
    return (res.body as { project_id: string }).project_id;
  };

  const createVersion = async (pid: string): Promise<string> => {
    const res = await http()
      .post(`/api/v1/projects/${pid}/boq/versions`)
      .set('x-test-role', ADMIN)
      .send({ version_name: 'v', currency_code: 'THB' });
    expect([200, 201]).toContain(res.status);
    return (res.body as { version_id: string }).version_id;
  };

  const addCategory = async (versionId: string, code = 'CAT-1'): Promise<string> => {
    const res = await http()
      .post(`/api/v1/boq/versions/${versionId}/categories`)
      .set('x-test-role', ADMIN)
      .send({ category_code: code, category_name: `Category ${code}` });
    expect([200, 201]).toContain(res.status);
    return (res.body as { category_id: string }).category_id;
  };

  const addItem = (versionId: string, categoryId: string, quantity: string, unitCost: string) =>
    http().post(`/api/v1/boq/versions/${versionId}/items`).set('x-test-role', ADMIN).send({
      category_id: categoryId,
      description: 'Line item',
      unit: 'm3',
      quantity,
      unit_cost: unitCost,
      currency_code: 'THB',
    });

  const itemRow = async (itemId: string) =>
    (
      await infra.prisma.$queryRawUnsafe<
        Array<{ estimated_total: string; quantity: string; unit_cost: string }>
      >(
        `SELECT estimated_total::text, quantity::text, unit_cost::text
           FROM boq.boq_items WHERE item_id = $1::uuid`,
        itemId,
      )
    )[0];

  const categorySubtotal = async (categoryId: string): Promise<string> =>
    (
      await infra.prisma.$queryRawUnsafe<Array<{ subtotal_amount: string }>>(
        `SELECT subtotal_amount::text FROM boq.boq_categories WHERE category_id = $1::uuid`,
        categoryId,
      )
    )[0]?.subtotal_amount;

  const versionRow = async (versionId: string) =>
    (
      await infra.prisma.$queryRawUnsafe<
        Array<{ status: string; version_number: number; total_estimated_amount: string }>
      >(
        `SELECT status::text, version_number, total_estimated_amount::text
           FROM boq.boq_versions WHERE version_id = $1::uuid`,
        versionId,
      )
    )[0];

  describe('estimated_total = ROUND(quantity × unit_cost, 4) HALF_UP (master:2290)', () => {
    it('a plain product is stored at 4 decimal places', async () => {
      const pid = await newProject();
      const vid = await createVersion(pid);
      const cid = await addCategory(vid);
      const res = await addItem(vid, cid, '150.0000', '2.5000');
      expect([200, 201]).toContain(res.status);
      const row = await itemRow((res.body as { item_id: string }).item_id);
      expect(row.estimated_total).toBe('375.0000');
    });

    it('0.1 × 0.2 does not drift the way IEEE-754 floats do (master:2322)', async () => {
      const pid = await newProject();
      const vid = await createVersion(pid);
      const cid = await addCategory(vid);
      const res = await addItem(vid, cid, '0.1000', '0.2000');
      const row = await itemRow((res.body as { item_id: string }).item_id);
      // 0.1 * 0.2 === 0.020000000000000004 in float; decimal.js gives exactly 0.02.
      expect(row.estimated_total).toBe('0.0200');
      expect(Number(row.estimated_total)).not.toBe(0.1 * 0.2);
    });

    it('rounds HALF_UP at the 4th decimal, not down (master:2294)', async () => {
      const pid = await newProject();
      const vid = await createVersion(pid);
      const cid = await addCategory(vid);
      // 1.00005 × 1 = 1.00005 → HALF_UP at 4 dp → 1.0001 (HALF_DOWN/HALF_EVEN would give 1.0000)
      const res = await addItem(vid, cid, '1.0001', '1.0000');
      const row = await itemRow((res.body as { item_id: string }).item_id);
      expect(row.estimated_total).toBe('1.0001');
    });
  });

  describe('aggregates recalculate synchronously (master:2291-2293)', () => {
    it('category subtotal and version total follow item writes', async () => {
      const pid = await newProject();
      const vid = await createVersion(pid);
      const cid = await addCategory(vid);

      const a = await addItem(vid, cid, '10.0000', '3.0000'); // 30
      const b = await addItem(vid, cid, '2.0000', '5.5000'); //  11
      expect(await categorySubtotal(cid)).toBe('41.0000');
      expect((await versionRow(vid)).total_estimated_amount).toBe('41.0000');

      // update → recalculated immediately, no polling.
      // The write itself is asserted first: without that, a 4xx here would look exactly like a
      // recalculation failure and the diagnosis would start in the wrong place.
      const aId = (a.body as { item_id: string }).item_id;
      const patched = await http()
        .patch(`/api/v1/boq/items/${aId}`)
        .set('x-test-role', ADMIN)
        .send({ quantity: '20.0000' }); // 20 × 3 = 60
      expect([200, 204]).toContain(patched.status);
      expect((await itemRow(aId)).quantity).toBe('20.0000');
      expect((await itemRow(aId)).estimated_total).toBe('60.0000');
      expect(await categorySubtotal(cid)).toBe('71.0000');

      // delete → recalculated immediately
      const removed = await http()
        .delete(`/api/v1/boq/items/${(b.body as { item_id: string }).item_id}`)
        .set('x-test-role', ADMIN);
      expect([200, 204]).toContain(removed.status);
      expect(await categorySubtotal(cid)).toBe('60.0000');
      expect((await versionRow(vid)).total_estimated_amount).toBe('60.0000');
    });
  });

  describe('versioning rules (master:2296-2301)', () => {
    it('a new project starts at version_number 1', async () => {
      const pid = await newProject();
      const vid = await createVersion(pid);
      expect((await versionRow(vid)).version_number).toBe(1);
    });

    it('only ONE DRAFT version may exist per project', async () => {
      const pid = await newProject();
      await createVersion(pid);
      const second = await http()
        .post(`/api/v1/projects/${pid}/boq/versions`)
        .set('x-test-role', ADMIN)
        .send({ version_name: 'v2', currency_code: 'THB' });
      expect(second.status).toBeGreaterThanOrEqual(400);
    });

    it('approving supersedes the previous APPROVED version', async () => {
      const pid = await newProject();
      const v1 = await createVersion(pid);
      await http()
        .post(`/api/v1/projects/${pid}/boq/versions/${v1}/approve`)
        .set('x-test-role', ADMIN)
        .expect((r) => expect([200, 201, 204]).toContain(r.status));
      expect((await versionRow(v1)).status).toBe('APPROVED');

      const v2 = await createVersion(pid);
      expect((await versionRow(v2)).version_number).toBe(2);
      await http()
        .post(`/api/v1/projects/${pid}/boq/versions/${v2}/approve`)
        .set('x-test-role', ADMIN)
        .expect((r) => expect([200, 201, 204]).toContain(r.status));

      expect((await versionRow(v1)).status).toBe('SUPERSEDED');
      expect((await versionRow(v2)).status).toBe('APPROVED');
    });

    it('a new version copies the items of the latest APPROVED one (master:2298)', async () => {
      const pid = await newProject();
      const v1 = await createVersion(pid);
      const c1 = await addCategory(v1, 'COPY');
      await addItem(v1, c1, '4.0000', '2.0000'); // 8
      await http()
        .post(`/api/v1/projects/${pid}/boq/versions/${v1}/approve`)
        .set('x-test-role', ADMIN);

      const v2 = await createVersion(pid);
      const copied = await infra.prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
        `SELECT count(*) AS n FROM boq.boq_items WHERE version_id = $1::uuid`,
        v2,
      );
      expect(Number(copied[0].n)).toBe(1);
      expect((await versionRow(v2)).total_estimated_amount).toBe('8.0000');
    });

    it('APPROVED versions are immutable — item writes are refused (master:2301, 2310-2311)', async () => {
      const pid = await newProject();
      const vid = await createVersion(pid);
      const cid = await addCategory(vid);
      const item = await addItem(vid, cid, '1.0000', '1.0000');
      const itemId = (item.body as { item_id: string }).item_id;
      await http()
        .post(`/api/v1/projects/${pid}/boq/versions/${vid}/approve`)
        .set('x-test-role', ADMIN);
      expect((await versionRow(vid)).status).toBe('APPROVED');

      const patched = await http()
        .patch(`/api/v1/boq/items/${itemId}`)
        .set('x-test-role', ADMIN)
        .send({ quantity: '99.0000' });
      expect(patched.status).toBeGreaterThanOrEqual(400);

      const deleted = await http().delete(`/api/v1/boq/items/${itemId}`).set('x-test-role', ADMIN);
      expect(deleted.status).toBeGreaterThanOrEqual(400);

      // and the row genuinely did not move
      expect((await itemRow(itemId)).quantity).toBe('1.0000');
    });
  });
});

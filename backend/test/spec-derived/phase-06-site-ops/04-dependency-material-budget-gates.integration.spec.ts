/**
 * Phase 6 — the two completion gates and the two budget warnings that 01 left untested
 * (master:2632-2657).
 *
 *   3. Dependencies — all predecessor tasks derived from BOQ parent-child hierarchy
 *                     (boq_item_id parent → child = DEPENDS_ON) have status = 'COMPLETED'
 *   7. Material     — linked BOQ item's purchase order has at least one delivery record
 *   8. Budget 85%–99%  — warning level ORANGE, HTTP 200
 *   9. Budget >= 100%  — warning level RED; requires { acknowledge_budget_overrun: true }
 *
 * A NOTE ON GATE 7, so the assertions below are not mistaken for a weaker reading of the spec.
 * master:2653 and docs/specifications/11-database-schema.md:389 both write the gate as "at least one
 * delivery record with status != 'PENDING'". `procurement.deliveries` has no `status` column — and
 * master's OWN entity definition at 2434-2441 does not declare one either, so the two halves of the
 * spec disagree with each other rather than the schema having drifted from the spec. With no pending
 * state to represent, the existence of a delivery row IS receipt: `delivered_at` and `received_by`
 * are both NOT NULL, so a row cannot be filed for goods that have not arrived. These tests pin that
 * reading; the discrepancy is reported separately rather than decided here.
 *
 * Every gate is exercised ALONE, and each blocking case is paired with the same fixture cleared, so
 * a gate that never fires cannot be mistaken for a gate that passed.
 */
jest.mock('@aws-sdk/client-sns', () => ({
  SNSClient: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({ MessageId: 'mock-msg-id' }),
  })),
  PublishCommand: jest.fn(),
}));

import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import {
  startIntegrationInfra,
  stopIntegrationInfra,
  clsAuthGuard,
  type IntegrationInfra,
} from '../../helpers/integration-infra';
import { AppModule } from '../../../src/app.module';
import { JwtAuthGuard } from '../../../src/modules/identity/guards/jwt-auth.guard';

jest.setTimeout(900_000);

const TENANT_ID = 'bbbb1111-1111-4000-8000-000000000064';
const USER_ID = 'bbbb2222-2222-4000-8000-000000000064';

const roleOf = (req: Record<string, unknown>): string => {
  const headers = (req['headers'] ?? {}) as Record<string, string>;
  return headers['x-test-role'] ?? 'SITE_ENGINEER';
};

describe('Phase 6 · dependency / material gates + budget warnings (real database)', () => {
  let infra: IntegrationInfra;
  let app: INestApplication;
  let projectId = '';
  let versionId = '';
  let vendorId = '';
  let budgetId = '';
  let seq = 0;

  const sql = (q: string, ...p: unknown[]) => infra.prisma.$executeRawUnsafe(q, ...p);

  beforeAll(async () => {
    infra = await startIntegrationInfra();
    await sql(
      `INSERT INTO platform.tenants (tenant_id, tenant_code, tenant_name, keycloak_realm, plan_type, is_active)
       VALUES ($1::uuid, 'sd-p64', 'Spec Derived P6 Gates', 'construction-os', 'STARTER'::platform."PlanType", true)`,
      TENANT_ID,
    );
    await sql(
      `INSERT INTO platform.users (user_id, tenant_id, keycloak_user_id, phone_number, email, display_name)
       VALUES ($1::uuid, $2::uuid, 'kc-p64', '+66890000064', 'p64@example.com', 'P64')`,
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
        tenantCode: 'sd-p64',
      };
      next();
    });
    await app.init();

    const proj = await request(app.getHttpServer())
      .post('/api/v1/projects')
      .set('x-test-role', 'TENANT_ADMIN')
      .send({
        project_code: 'SD-P64-HOST',
        project_name: 'Gate Host',
        project_type: 'RESIDENTIAL',
        start_date: '2019-01-01',
        end_date: '2020-01-01',
      });
    expect([200, 201]).toContain(proj.status);
    projectId = (proj.body as { project_id: string }).project_id;

    versionId = randomUUID();
    await sql(
      `INSERT INTO boq.boq_versions
         (version_id, project_id, tenant_id, version_number, status,
          total_estimated_amount, total_estimated_currency, created_by)
       VALUES ($1::uuid, $2::uuid, $3::uuid, 1, 'DRAFT', 0, 'THB', $4::uuid)`,
      versionId,
      projectId,
      TENANT_ID,
      USER_ID,
    );

    vendorId = randomUUID();
    await sql(
      `INSERT INTO procurement.vendors (vendor_id, tenant_id, vendor_code, vendor_name)
       VALUES ($1::uuid, $2::uuid, 'V-P64', 'Gate Vendor')`,
      vendorId,
      TENANT_ID,
    );

    budgetId = randomUUID();
    await sql(
      `INSERT INTO finance.project_budgets
         (budget_id, project_id, tenant_id, total_budget_amount, total_budget_currency)
       VALUES ($1::uuid, $2::uuid, $3::uuid, 100000000, 'THB')`,
      budgetId,
      projectId,
      TENANT_ID,
    );
  });

  afterAll(async () => {
    await app?.close();
    await stopIntegrationInfra(infra);
  });

  const http = () => request(app.getHttpServer());

  const newCategory = async (parentCategoryId: string | null): Promise<string> => {
    const id = randomUUID();
    seq += 1;
    await sql(
      `INSERT INTO boq.boq_categories
         (category_id, version_id, tenant_id, parent_category_id, category_code, category_name,
          sort_order, subtotal_amount)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7, 0)`,
      id,
      versionId,
      TENANT_ID,
      parentCategoryId,
      `CAT-${seq}`,
      `Category ${seq}`,
      seq,
    );
    return id;
  };

  const newBoqItem = async (categoryId: string): Promise<string> => {
    const id = randomUUID();
    seq += 1;
    await sql(
      `INSERT INTO boq.boq_items
         (item_id, category_id, version_id, tenant_id, description, unit, quantity, unit_cost,
          estimated_total, currency_code, sort_order)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'Item', 'm3', 1, 1000, 1000, 'THB', $5)`,
      id,
      categoryId,
      versionId,
      TENANT_ID,
      seq,
    );
    return id;
  };

  const newTask = async (boqItemId: string | null, status = 'IN_PROGRESS'): Promise<string> => {
    const rows = await infra.prisma.$queryRawUnsafe<Array<{ task_id: string }>>(
      `INSERT INTO projects.tasks (tenant_id, project_id, task_name, status, boq_item_id)
       VALUES ($1::uuid, $2::uuid, 'Gate task', $3, $4::uuid) RETURNING task_id`,
      TENANT_ID,
      projectId,
      status,
      boqItemId,
    );
    return rows[0].task_id;
  };

  /** A task on its own top-level category: no parent, no PO, no budget line — every gate clear. */
  const newCleanTask = async (): Promise<{
    taskId: string;
    itemId: string;
    categoryId: string;
  }> => {
    const categoryId = await newCategory(null);
    const itemId = await newBoqItem(categoryId);
    return { taskId: await newTask(itemId), itemId, categoryId };
  };

  const complete = (taskId: string, body: Record<string, unknown> = {}) =>
    http()
      .patch(`/api/v1/tasks/${taskId}`)
      .set('x-test-role', 'SITE_ENGINEER')
      .send({ status: 'COMPLETED', ...body });

  const statusOf = async (taskId: string): Promise<string> => {
    const rows = await infra.prisma.$queryRawUnsafe<Array<{ status: string }>>(
      `SELECT status FROM projects.tasks WHERE task_id = $1::uuid`,
      taskId,
    );
    return rows[0]?.status ?? '(missing)';
  };

  const blockingGates = (body: unknown): string[] =>
    ((body as { error?: { blocking_gates?: string[] } }).error?.blocking_gates ?? []) as string[];

  // ---------------------------------------------------------------------------------------------
  // The control
  // ---------------------------------------------------------------------------------------------
  it('the control — a task with a BOQ item and no blockers completes', async () => {
    const { taskId } = await newCleanTask();
    const res = await complete(taskId);
    expect([200, 204]).toContain(res.status);
    expect(await statusOf(taskId)).toBe('COMPLETED');
  });

  // ---------------------------------------------------------------------------------------------
  // Gate 3 — dependencies
  // ---------------------------------------------------------------------------------------------
  describe('gate 3 · dependencies (master:2644)', () => {
    /** parent category holds the predecessor's item; the child category holds the task's own. */
    const buildDependency = async (
      predecessorStatus: string,
    ): Promise<{ taskId: string; predecessorTaskId: string }> => {
      const parentCat = await newCategory(null);
      const childCat = await newCategory(parentCat);
      const predItem = await newBoqItem(parentCat);
      const ownItem = await newBoqItem(childCat);
      return {
        taskId: await newTask(ownItem),
        predecessorTaskId: await newTask(predItem, predecessorStatus),
      };
    };

    it('blocks with 422 / COS-TASK-001 while a predecessor is not COMPLETED', async () => {
      const { taskId } = await buildDependency('IN_PROGRESS');
      const res = await complete(taskId);

      expect(res.status).toBe(422);
      expect((res.body as { error: { code: string } }).error.code).toBe('COS-TASK-001');
      expect(blockingGates(res.body)).toContain('dependencies');
      expect(await statusOf(taskId)).not.toBe('COMPLETED');
    });

    it('clears once every predecessor is COMPLETED', async () => {
      const { taskId, predecessorTaskId } = await buildDependency('IN_PROGRESS');
      await sql(
        `UPDATE projects.tasks SET status = 'COMPLETED' WHERE task_id = $1::uuid`,
        predecessorTaskId,
      );

      const res = await complete(taskId);
      expect([200, 204]).toContain(res.status);
      expect(await statusOf(taskId)).toBe('COMPLETED');
    });

    it('one incomplete predecessor among several still blocks', async () => {
      const parentCat = await newCategory(null);
      const childCat = await newCategory(parentCat);
      const ownItem = await newBoqItem(childCat);
      const taskId = await newTask(ownItem);
      await newTask(await newBoqItem(parentCat), 'COMPLETED');
      await newTask(await newBoqItem(parentCat), 'IN_PROGRESS');

      const res = await complete(taskId);
      expect(res.status).toBe(422);
      expect(blockingGates(res.body)).toContain('dependencies');
    });
  });

  // ---------------------------------------------------------------------------------------------
  // Gate 7 — material
  // ---------------------------------------------------------------------------------------------
  describe('gate 7 · material (master:2653)', () => {
    const newPo = async (): Promise<string> => {
      const id = randomUUID();
      seq += 1;
      await sql(
        `INSERT INTO procurement.purchase_orders
           (po_id, vendor_id, project_id, tenant_id, po_number, status, total_amount,
            currency_code, delivery_date, created_by)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, 'APPROVED', 1000, 'THB',
                 DATE '2019-06-01', $6::uuid)`,
        id,
        vendorId,
        projectId,
        TENANT_ID,
        `PO-P64-${seq}`,
        USER_ID,
      );
      return id;
    };

    const orderMaterialFor = async (boqItemId: string): Promise<string> => {
      const poId = await newPo();
      await sql(
        `INSERT INTO procurement.po_line_items
           (line_id, po_id, tenant_id, boq_item_id, description, quantity, unit, unit_price, line_total)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'Rebar', 1, 'ton', 1000, 1000)`,
        randomUUID(),
        poId,
        TENANT_ID,
        boqItemId,
      );
      return poId;
    };

    const receive = (poId: string) =>
      sql(
        `INSERT INTO procurement.deliveries
           (delivery_id, po_id, tenant_id, delivered_at, received_by)
         VALUES ($1::uuid, $2::uuid, $3::uuid, now(), $4::uuid)`,
        randomUUID(),
        poId,
        TENANT_ID,
        USER_ID,
      );

    it('blocks while the ordered material has not been received', async () => {
      const { taskId, itemId } = await newCleanTask();
      await orderMaterialFor(itemId);

      const res = await complete(taskId);
      expect(res.status).toBe(422);
      expect(blockingGates(res.body)).toContain('material');
      expect(await statusOf(taskId)).not.toBe('COMPLETED');
    });

    it('clears once a delivery is recorded against the order', async () => {
      const { taskId, itemId } = await newCleanTask();
      const poId = await orderMaterialFor(itemId);
      await receive(poId);

      const res = await complete(taskId);
      expect([200, 204]).toContain(res.status);
      expect(await statusOf(taskId)).toBe('COMPLETED');
    });

    it('a delivery against a DIFFERENT order does not clear the gate', async () => {
      // Otherwise any receipt anywhere in the tenant would unblock every task — the gate has to be
      // about THIS task's material.
      const { taskId, itemId } = await newCleanTask();
      await orderMaterialFor(itemId);
      await receive(await newPo());

      const res = await complete(taskId);
      expect(res.status).toBe(422);
      expect(blockingGates(res.body)).toContain('material');
    });

    it('a task with no ordered material is not blocked by this gate', async () => {
      const { taskId } = await newCleanTask();
      const res = await complete(taskId);
      expect([200, 204]).toContain(res.status);
    });
  });

  // ---------------------------------------------------------------------------------------------
  // Warnings 8 and 9 — budget
  // ---------------------------------------------------------------------------------------------
  describe('warnings 8-9 · budget (master:2655-2657)', () => {
    /** Attach a budget line to the task's BOQ category and spend `actual` against it. */
    const spend = async (categoryId: string, allocated: string, actual: string): Promise<void> => {
      const lineId = randomUUID();
      seq += 1;
      await sql(
        `INSERT INTO finance.budget_lines
           (line_id, budget_id, project_id, tenant_id, boq_category_id, line_name,
            allocated_amount, currency_code)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6, $7::numeric, 'THB')`,
        lineId,
        budgetId,
        projectId,
        TENANT_ID,
        categoryId,
        `Line ${seq}`,
        allocated,
      );
      if (actual !== '0') {
        await sql(
          `INSERT INTO finance.cost_transactions
             (transaction_id, project_id, tenant_id, source_type, source_id, budget_line_id,
              amount, currency_code, transaction_date, recorded_by)
           VALUES ($1::uuid, $2::uuid, $3::uuid, 'ADJUSTMENT'::finance."CostSourceType", $4::uuid,
                   $5::uuid, $6::numeric, 'THB', DATE '2019-06-01', $7::uuid)`,
          randomUUID(),
          projectId,
          TENANT_ID,
          randomUUID(),
          lineId,
          actual,
          USER_ID,
        );
      }
    };

    const warningsOf = (body: unknown): string[] =>
      ((body as { warnings?: string[] }).warnings ?? []) as string[];

    it('below 85% completes with no warning at all', async () => {
      const { taskId, categoryId } = await newCleanTask();
      await spend(categoryId, '1000000.00', '840000.00'); // 84%

      const res = await complete(taskId);
      expect(res.status).toBe(200);
      expect(warningsOf(res.body)).toHaveLength(0);
    });

    it('at exactly 85% the task still completes, with a warning (gate 8 is warn-only)', async () => {
      const { taskId, categoryId } = await newCleanTask();
      await spend(categoryId, '1000000.00', '850000.00'); // 85% exactly — the boundary

      const res = await complete(taskId);
      expect(res.status).toBe(200);
      expect(warningsOf(res.body).length).toBeGreaterThan(0);
      expect(await statusOf(taskId)).toBe('COMPLETED');
    });

    it('between 85% and 99% warns without blocking', async () => {
      const { taskId, categoryId } = await newCleanTask();
      await spend(categoryId, '1000000.00', '990000.00'); // 99%

      const res = await complete(taskId);
      expect(res.status).toBe(200);
      expect(warningsOf(res.body).length).toBeGreaterThan(0);
    });

    it('at 100% an unacknowledged completion is refused', async () => {
      // master:2657 makes the PM's acknowledgement a REQUIREMENT. A requirement that can be ignored
      // without consequence is not one, so the request cannot simply succeed.
      const { taskId, categoryId } = await newCleanTask();
      await spend(categoryId, '1000000.00', '1000000.00');

      const res = await complete(taskId);
      expect(res.status).toBe(422);
      expect(blockingGates(res.body)).toContain('budget_overrun');
      expect(await statusOf(taskId)).not.toBe('COMPLETED');
    });

    it('acknowledging the overrun lets it through, still carrying the warning', async () => {
      const { taskId, categoryId } = await newCleanTask();
      await spend(categoryId, '1000000.00', '1200000.00'); // 120%

      const res = await complete(taskId, { acknowledge_budget_overrun: true });
      expect(res.status).toBe(200);
      expect(warningsOf(res.body).length).toBeGreaterThan(0);
      expect(await statusOf(taskId)).toBe('COMPLETED');
    });

    it('fires at a boundary that binary floating point gets wrong (master:991)', async () => {
      // 4.59 / 5.40 is EXACTLY 85%. As doubles the quotient lands just below 0.85, so the warning
      // did not fire — the reason this comparison may not be done with JavaScript Number. The
      // amounts are small because that is where the divergence lives; the rule is not about size.
      const { taskId, categoryId } = await newCleanTask();
      await spend(categoryId, '5.40', '4.59');

      const res = await complete(taskId);
      expect(res.status).toBe(200);
      expect(warningsOf(res.body).length).toBeGreaterThan(0);
    });

    it('does not fire one satang below the boundary', async () => {
      // The pair to the test above: an exact comparison must not simply be a looser one.
      const { taskId, categoryId } = await newCleanTask();
      await spend(categoryId, '5.40', '4.58');

      const res = await complete(taskId);
      expect(res.status).toBe(200);
      expect(warningsOf(res.body)).toHaveLength(0);
    });

    it('the two levels are distinguishable — ORANGE and RED are different warnings', async () => {
      // master:2655-2656 names two DIFFERENT levels. A single undifferentiated warning cannot tell a
      // PM which one they are looking at.
      const orange = await newCleanTask();
      await spend(orange.categoryId, '1000000.00', '900000.00'); // 90%
      const orangeRes = await complete(orange.taskId);

      const red = await newCleanTask();
      await spend(red.categoryId, '1000000.00', '1100000.00'); // 110%
      const redRes = await complete(red.taskId, { acknowledge_budget_overrun: true });

      expect(warningsOf(orangeRes.body)).not.toEqual(warningsOf(redRes.body));
    });

    it('acknowledgement does not suppress the other hard gates', async () => {
      // The flag acknowledges the BUDGET. It must not become a general override.
      const parentCat = await newCategory(null);
      const childCat = await newCategory(parentCat);
      await newTask(await newBoqItem(parentCat), 'IN_PROGRESS');
      const taskId = await newTask(await newBoqItem(childCat));
      await spend(childCat, '1000000.00', '1500000.00');

      const res = await complete(taskId, { acknowledge_budget_overrun: true });
      expect(res.status).toBe(422);
      expect(blockingGates(res.body)).toContain('dependencies');
      expect(blockingGates(res.body)).not.toContain('budget_overrun');
    });
  });
});

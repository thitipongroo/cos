/**
 * Phase 7 — procurement event consumption, budget aggregation and variance
 * (master:2937-2940, 2973-2974, 2990-2991).
 *
 * The handlers are driven directly rather than through Kafka: the integration harness runs no
 * broker, and what matters here is what a handler DOES to the budget, not whether kafkajs delivers.
 * They are invoked through `withFinance`, which reproduces FinanceConsumer.withTenantContext
 * exactly — a CLS store carrying the tenant, plus a synthetic request for the REQUEST-scoped
 * service. That fidelity is the point: the first version of this file resolved the service the way
 * the consumer used to, and every DB call raised "Tenant context missing from request".
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
import { ContextIdFactory, ModuleRef } from '@nestjs/core';
import { ClsServiceManager } from 'nestjs-cls';
import request from 'supertest';
import {
  startIntegrationInfra,
  stopIntegrationInfra,
  clsAuthGuard,
  type IntegrationInfra,
} from '../helpers/integration-infra';
import { AppModule } from '../../src/app.module';
import { JwtAuthGuard } from '../../src/modules/identity/guards/jwt-auth.guard';
import { FinanceService } from '../../src/modules/finance/finance.service';

jest.setTimeout(900_000);

const TENANT_ID = 'bbbb1111-1111-4000-8000-000000000071';
const USER_ID = 'bbbb2222-2222-4000-8000-000000000071';

const roleOf = (req: Record<string, unknown>): string => {
  const headers = (req['headers'] ?? {}) as Record<string, string>;
  return headers['x-test-role'] ?? 'FINANCE';
};

const thb = (amount: string) => ({ amount, currency_code: 'THB' });

describe('Phase 7 · budget aggregation from procurement events (real database)', () => {
  let infra: IntegrationInfra;
  let app: INestApplication;
  let refs: ModuleRef;
  let seq = 0;

  beforeAll(async () => {
    infra = await startIntegrationInfra();
    await infra.prisma.$executeRawUnsafe(
      `INSERT INTO platform.tenants (tenant_id, tenant_code, tenant_name, keycloak_realm, plan_type, is_active)
       VALUES ($1::uuid, 'sd-p71', 'Spec Derived P7', 'construction-os', 'STARTER'::platform."PlanType", true)`,
      TENANT_ID,
    );
    await infra.prisma.$executeRawUnsafe(
      `INSERT INTO platform.users (user_id, tenant_id, keycloak_user_id, phone_number, email, display_name)
       VALUES ($1::uuid, $2::uuid, 'kc-p71', '+66890000071', 'p71@example.com', 'P71')`,
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
        tenantCode: 'sd-p71',
      };
      next();
    });
    await app.init();
    refs = app.get(ModuleRef);
  });

  afterAll(async () => {
    await app?.close();
    await stopIntegrationInfra(infra);
  });

  const http = () => request(app.getHttpServer());

  /** FinanceConsumer.withTenantContext, reproduced. */
  const withFinance = async (fn: (svc: FinanceService) => Promise<void>): Promise<void> => {
    const cls = ClsServiceManager.getClsService();
    await cls.run(async () => {
      cls.set('tenantId', TENANT_ID);
      cls.set('userId', USER_ID);
      const contextId = ContextIdFactory.create();
      refs.registerRequestByContextId({ tenantId: TENANT_ID, userId: USER_ID } as never, contextId);
      const svc = await refs.resolve(FinanceService, contextId, { strict: false });
      await fn(svc);
    });
  };

  const poCreated = (projectId: string, amount: string, poId = randomUUID()): Promise<void> =>
    withFinance((svc) =>
      svc.handlePoCreated({
        po_id: poId,
        project_id: projectId,
        tenant_id: TENANT_ID,
        total_amount: thb(amount),
      }),
    );

  const invoiceReceived = (projectId: string, amount: string): Promise<void> =>
    withFinance((svc) =>
      svc.handleInvoiceReceived({
        po_id: randomUUID(),
        invoice_id: randomUUID(),
        project_id: projectId,
        tenant_id: TENANT_ID,
        amount: thb(amount),
      }),
    );

  const poStatusChanged = (projectId: string, poId: string, to: string): Promise<void> =>
    withFinance((svc) =>
      svc.handlePoStatusChanged({
        po_id: poId,
        project_id: projectId,
        tenant_id: TENANT_ID,
        from_status: 'APPROVED',
        to_status: to,
      }),
    );

  const newProject = async (): Promise<string> => {
    seq += 1;
    const res = await http()
      .post('/api/v1/projects')
      .set('x-test-role', 'TENANT_ADMIN')
      .send({
        project_code: `SD-P71-${seq}`,
        project_name: `Finance Host ${seq}`,
        project_type: 'RESIDENTIAL',
        start_date: '2019-01-01',
        end_date: '2020-01-01',
      });
    expect([200, 201]).toContain(res.status);
    return (res.body as { project_id: string }).project_id;
  };

  /** A project with a budget and one allocated line. */
  const newBudgetedProject = async (
    allocated = '1000000.0000',
    // A percentage, not money: CreateBudgetDto types the amount as a string (master:991) and the
    // threshold as a number, which is the right split.
    threshold?: number,
  ): Promise<string> => {
    const projectId = await newProject();
    const budget = await http()
      .post(`/api/v1/finance/budget/${projectId}`)
      .set('x-test-role', 'FINANCE')
      .send({
        total_budget_amount: allocated,
        total_budget_currency: 'THB',
        ...(threshold === undefined ? {} : { variance_alert_threshold: threshold }),
      });
    expect([200, 201]).toContain(budget.status);

    const line = await http()
      .post(`/api/v1/finance/budget/${projectId}/lines`)
      .set('x-test-role', 'FINANCE')
      .send({ line_name: 'Structure', allocated_amount: allocated, currency_code: 'THB' });
    expect([200, 201]).toContain(line.status);
    return projectId;
  };

  const budgetRow = async (projectId: string) => {
    const rows = await infra.prisma.$queryRawUnsafe<
      Array<{
        allocated_amount: string;
        committed_amount: string;
        actual_amount: string;
        variance_alert_threshold: string;
      }>
    >(
      `SELECT allocated_amount::text, committed_amount::text, actual_amount::text,
              variance_alert_threshold::text
         FROM finance.project_budgets WHERE project_id = $1::uuid`,
      projectId,
    );
    return rows[0];
  };

  const transactionsOf = (projectId: string) =>
    infra.prisma.$queryRawUnsafe<
      Array<{ source_type: string; source_id: string; amount: string; recorded_by: string | null }>
    >(
      `SELECT source_type::text, source_id::text, amount::text, recorded_by
         FROM finance.cost_transactions WHERE project_id = $1::uuid ORDER BY recorded_at`,
      projectId,
    );

  const varianceAlerts = (projectId: string) =>
    infra.prisma.$queryRawUnsafe<Array<{ payload: Record<string, unknown> }>>(
      `SELECT payload->'payload' AS payload FROM platform.outbox_events
        WHERE event_type = 'finance.variance.alert.v1'
          AND payload->'payload'->>'project_id' = $1`,
      projectId,
    );

  // ---------------------------------------------------------------------------------------------
  describe('procurement.po.created → a COMMITTED cost transaction (master:2938)', () => {
    it('records the PO and raises committed_amount, not actual', async () => {
      const projectId = await newBudgetedProject();
      const poId = randomUUID();
      await poCreated(projectId, '250000.0000', poId);

      const txs = await transactionsOf(projectId);
      expect(txs).toHaveLength(1);
      expect(txs[0].source_type).toBe('PURCHASE_ORDER');
      expect(txs[0].source_id).toBe(poId);
      expect(txs[0].amount).toBe('250000.0000');

      const budget = await budgetRow(projectId);
      expect(budget.committed_amount).toBe('250000.0000');
      // A commitment is not a cost — nothing has been invoiced yet.
      expect(budget.actual_amount).toBe('0.0000');
    });

    it('records the event actor as recorded_by (master:2910)', async () => {
      // "recorded_by UUID — actor_id from event, or user for manual entry". An anonymous cost row
      // cannot be traced back to the approval that caused it.
      const projectId = await newBudgetedProject();
      await poCreated(projectId, '10000.0000');
      expect((await transactionsOf(projectId))[0].recorded_by).toBe(USER_ID);
    });
  });

  describe('procurement.invoice.received → an ACTUAL cost transaction (master:2939)', () => {
    it('records the invoice and raises actual_amount, not committed', async () => {
      const projectId = await newBudgetedProject();
      await invoiceReceived(projectId, '120000.0000');

      const budget = await budgetRow(projectId);
      expect(budget.actual_amount).toBe('120000.0000');
      expect(budget.committed_amount).toBe('0.0000');
      expect((await transactionsOf(projectId))[0].source_type).toBe('INVOICE');
    });
  });

  describe('procurement.po.status_changed → release the commitment (master:2940)', () => {
    it('a CANCELLED PO releases its committed amount', async () => {
      const projectId = await newBudgetedProject();
      const poId = randomUUID();
      await poCreated(projectId, '300000.0000', poId);
      expect((await budgetRow(projectId)).committed_amount).toBe('300000.0000');

      await poStatusChanged(projectId, poId, 'CANCELLED');

      expect((await budgetRow(projectId)).committed_amount).toBe('0.0000');
      expect(await transactionsOf(projectId)).toHaveLength(0);
    });

    it('a status change that is NOT a cancellation leaves the commitment alone', async () => {
      // The control. Without it, a handler that deleted on every status change would pass above.
      const projectId = await newBudgetedProject();
      const poId = randomUUID();
      await poCreated(projectId, '300000.0000', poId);
      await poStatusChanged(projectId, poId, 'APPROVED');

      expect((await budgetRow(projectId)).committed_amount).toBe('300000.0000');
    });
  });

  describe('the budget is recalculated on every transaction (master:2973)', () => {
    it('accumulates several events exactly, without floating drift', async () => {
      // 0.1 + 0.2 is 0.30000000000000004 in binary floating point; in decimal it is 0.3.
      const projectId = await newBudgetedProject();
      for (const amount of ['0.1000', '0.2000', '0.3000']) {
        await invoiceReceived(projectId, amount);
      }
      expect((await budgetRow(projectId)).actual_amount).toBe('0.6000');
    });
  });

  describe('variance is (actual + committed) vs allocated (master:2974)', () => {
    it('the project-level figure follows the formula', async () => {
      const projectId = await newBudgetedProject('1000000.0000');
      await poCreated(projectId, '400000.0000');
      await invoiceReceived(projectId, '800000.0000');

      // (800000 + 400000 - 1000000) / 1000000 x 100 = 20
      const res = await http()
        .get(`/api/v1/finance/budget/${projectId}`)
        .set('x-test-role', 'FINANCE');
      expect(res.status).toBe(200);
      expect(Number((res.body as { variance_percentage: string }).variance_percentage)).toBeCloseTo(
        20,
        4,
      );
    });

    it('returns the budget lines alongside it', async () => {
      // master:2974 used to say the calculation was "per budget_line". It cannot be: the Event
      // Contract (spec 32, rows 3-4) gives Finance no `boq_item_id` and no budget-line reference on
      // either procurement event, and master:3010 forbids reading Procurement's tables to find one.
      // `cost_transactions.budget_line_id` exists for manual assignment, but no spec defines an
      // endpoint that assigns it, so a per-line figure would read 0.0000 for every line in every
      // project — an authoritative-looking number that is always wrong.
      //
      // Product-owner decision 2026-08-22: master:2974 was corrected to project level, with the note
      // that carrying the attribution on the event is the prerequisite for changing that. So what is
      // asserted here is what the endpoint is actually for: the lines are returned, and the variance
      // that accompanies them is the project's.
      const projectId = await newBudgetedProject();
      await invoiceReceived(projectId, '500000.0000');

      const res = await http()
        .get(`/api/v1/finance/budget/${projectId}`)
        .set('x-test-role', 'FINANCE');
      const body = res.body as {
        lines: Array<Record<string, unknown>>;
        variance_percentage: string;
      };
      expect(body.lines.length).toBeGreaterThan(0);
      for (const line of body.lines) {
        expect(Object.keys(line)).toEqual(
          expect.arrayContaining(['line_name', 'allocated_amount']),
        );
      }
      expect(body.variance_percentage).toBeDefined();
    });
  });

  describe('finance.variance.alert (master:2989-2991)', () => {
    it('defaults to a 10% threshold when the project sets none', async () => {
      const projectId = await newBudgetedProject('1000000.0000');
      expect((await budgetRow(projectId)).variance_alert_threshold).toBe('10.00');
    });

    it('stays quiet inside the threshold', async () => {
      const projectId = await newBudgetedProject('1000000.0000');
      await invoiceReceived(projectId, '1050000.0000'); // 5% over
      expect(await varianceAlerts(projectId)).toHaveLength(0);
    });

    it('fires beyond it, carrying the fields master names', async () => {
      const projectId = await newBudgetedProject('1000000.0000');
      await invoiceReceived(projectId, '1200000.0000'); // 20% over

      const alerts = await varianceAlerts(projectId);
      expect(alerts.length).toBeGreaterThan(0);
      expect(alerts[0].payload).toMatchObject({ project_id: projectId });
      expect(alerts[0].payload).toHaveProperty('variance_percentage');
      expect(alerts[0].payload).toHaveProperty('threshold_exceeded');
    });

    it('honours a per-project override (master:2991)', async () => {
      // TENANT_ADMIN raises the tolerance to 25%; a 20% overrun must now stay quiet where the
      // default would have alerted.
      const projectId = await newBudgetedProject('1000000.0000', 25);
      expect((await budgetRow(projectId)).variance_alert_threshold).toBe('25.00');
      await invoiceReceived(projectId, '1200000.0000');
      expect(await varianceAlerts(projectId)).toHaveLength(0);
    });
  });

  // ── DTO validation at the HTTP boundary ─────────────────────────────────
  //
  // Absorbed from backend/test/finance.integration.spec.ts (deleted 2026-08-25). Of that file's six
  // cases only these three asserted anything this suite does not: the other three ("returns 201 with
  // a valid budget payload", "returns a budget summary", "returns 200") are the happy paths the
  // aggregation tests above already drive end to end, and two of them accepted a 500.
  //
  // Money DTOs are worth guarding at this level specifically: the amounts are STRINGS (master:991,
  // DECIMAL(19,4)), so a missing one is not a type error anywhere — it is a NULL reaching a NOT NULL
  // column, or worse, a silent zero.

  describe('rejects an incomplete money payload', () => {
    it('refuses a budget with no total_budget_amount', async () => {
      const projectId = await newProject();
      const res = await http()
        .post(`/api/v1/finance/budget/${projectId}`)
        .set('x-test-role', 'FINANCE')
        .send({ total_budget_currency: 'THB' });
      expect(res.status).toBe(400);
    });

    it('refuses a budget line with no line_name', async () => {
      const projectId = await newBudgetedProject();
      const res = await http()
        .post(`/api/v1/finance/budget/${projectId}/lines`)
        .set('x-test-role', 'FINANCE')
        .send({ allocated_amount: '100000.0000', currency_code: 'THB' });
      expect(res.status).toBe(400);
    });

    it('refuses a payment with no invoice_id', async () => {
      const res = await http()
        .post('/api/v1/finance/payments')
        .set('x-test-role', 'FINANCE')
        .send({ amount: '50000.0000', currency_code: 'THB', payment_date: '2026-06-01' });
      expect(res.status).toBe(400);
    });
  });
});

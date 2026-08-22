/**
 * Phase 7 — AR client billing, AR receipts and the 13-week cash flow forecast
 * (master:2865-2867, 2962-2967; ADR-024).
 *
 * The approval rule (master:2965, §15, §06.5) is tested from BOTH sides. "PM approves up to a
 * configured limit" is only half a rule; the half that protects anything is the refusal above it,
 * and a limit check that never refuses looks exactly like one that works.
 *
 * The limit itself is `BILLING_PM_APPROVAL_MAX`, default 500,000 THB — ADR-024 §4, which is where
 * §06/§15's "configured limit" is actually pinned down. It is deliberately NOT re-stated as a
 * literal here beyond the two amounts that straddle it.
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
} from '../../helpers/integration-infra';
import { AppModule } from '../../../src/app.module';
import { JwtAuthGuard } from '../../../src/modules/identity/guards/jwt-auth.guard';

jest.setTimeout(900_000);

const TENANT_ID = 'bbbb1111-1111-4000-8000-000000000072';
const USER_ID = 'bbbb2222-2222-4000-8000-000000000072';

/** ADR-024 §1 — thirteen weekly buckets, no more and no fewer. */
const FORECAST_WEEKS = 13;

const roleOf = (req: Record<string, unknown>): string => {
  const headers = (req['headers'] ?? {}) as Record<string, string>;
  return headers['x-test-role'] ?? 'FINANCE';
};

const isoDaysFromNow = (days: number): string =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

interface Period {
  period_start: string;
  period_end: string;
  inflow: string;
  outflow: string;
  net_flow: string;
  cumulative_net: string;
}

describe('Phase 7 · AR billing lifecycle and cash flow forecast (real database)', () => {
  let infra: IntegrationInfra;
  let app: INestApplication;
  let customerId = '';
  let seq = 0;

  beforeAll(async () => {
    infra = await startIntegrationInfra();
    await infra.prisma.$executeRawUnsafe(
      `INSERT INTO platform.tenants (tenant_id, tenant_code, tenant_name, keycloak_realm, plan_type, is_active)
       VALUES ($1::uuid, 'sd-p72', 'Spec Derived P7 AR', 'construction-os', 'STARTER'::platform."PlanType", true)`,
      TENANT_ID,
    );
    await infra.prisma.$executeRawUnsafe(
      `INSERT INTO platform.users (user_id, tenant_id, keycloak_user_id, phone_number, email, display_name)
       VALUES ($1::uuid, $2::uuid, 'kc-p72', '+66890000072', 'p72@example.com', 'P72')`,
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
        tenantCode: 'sd-p72',
      };
      next();
    });
    await app.init();

    const cust = await request(app.getHttpServer())
      .post('/api/v1/finance/customers')
      .set('x-test-role', 'FINANCE')
      .send({ company_name: 'Client Co', customer_type: 'DEVELOPER' });
    expect([200, 201]).toContain(cust.status);
    customerId = (cust.body as { customer_id: string }).customer_id;
  });

  afterAll(async () => {
    await app?.close();
    await stopIntegrationInfra(infra);
  });

  const http = () => request(app.getHttpServer());

  const newProject = async (): Promise<string> => {
    seq += 1;
    const res = await http()
      .post('/api/v1/projects')
      .set('x-test-role', 'TENANT_ADMIN')
      .send({
        project_code: `SD-P72-${seq}`,
        project_name: `AR Host ${seq}`,
        project_type: 'RESIDENTIAL',
        start_date: '2019-01-01',
        end_date: '2020-01-01',
      });
    expect([200, 201]).toContain(res.status);
    return (res.body as { project_id: string }).project_id;
  };

  const newContract = async (projectId: string): Promise<string> => {
    const res = await http()
      .post('/api/v1/finance/contracts')
      .set('x-test-role', 'PROJECT_MANAGER')
      .send({
        project_id: projectId,
        contract_type: 'MAIN_CONTRACT',
        contract_value: '5000000.0000',
        customer_id: customerId,
      });
    expect([200, 201]).toContain(res.status);
    return (res.body as { contract_id: string }).contract_id;
  };

  const newBilling = async (
    projectId: string,
    amount: string,
    dueDate = isoDaysFromNow(10),
  ): Promise<string> => {
    seq += 1;
    const res = await http()
      .post('/api/v1/finance/billing')
      .set('x-test-role', 'FINANCE')
      .send({
        project_id: projectId,
        contract_id: await newContract(projectId),
        billing_number: `BILL-P72-${seq}`,
        amount,
        due_date: dueDate,
      });
    expect([200, 201]).toContain(res.status);
    return (res.body as { billing_id: string }).billing_id;
  };

  const approve = (billingId: string, tier: string, role: string) =>
    http()
      .patch(`/api/v1/finance/billing/${billingId}/approve`)
      .set('x-test-role', role)
      .send({ tier });

  const billingStatus = async (billingId: string): Promise<string> => {
    const rows = await infra.prisma.$queryRawUnsafe<Array<{ status: string }>>(
      `SELECT status::text FROM finance.billings WHERE billing_id = $1::uuid`,
      billingId,
    );
    return rows[0]?.status ?? '(missing)';
  };

  // ---------------------------------------------------------------------------------------------
  describe('the billing lifecycle DRAFT → ISSUED → PAID (ADR-024)', () => {
    it('a new billing starts as DRAFT', async () => {
      const billingId = await newBilling(await newProject(), '100000.0000');
      expect(await billingStatus(billingId)).toBe('DRAFT');
    });

    it('approval moves it to ISSUED and emits finance.billing.approved', async () => {
      const billingId = await newBilling(await newProject(), '100000.0000');
      const res = await approve(billingId, 'PM', 'PROJECT_MANAGER');

      expect(res.status).toBe(200);
      expect(await billingStatus(billingId)).toBe('ISSUED');

      const events = await infra.prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id FROM platform.outbox_events
          WHERE event_type = 'finance.billing.approved.v1'
            AND payload->'payload'->>'billing_id' = $1`,
        billingId,
      );
      expect(events).toHaveLength(1);
    });

    it('an already-ISSUED billing cannot be approved twice', async () => {
      // Otherwise a second approval re-issues the document and re-fires the event to the client.
      const billingId = await newBilling(await newProject(), '100000.0000');
      await approve(billingId, 'PM', 'PROJECT_MANAGER');
      const again = await approve(billingId, 'PM', 'PROJECT_MANAGER');
      expect(again.status).toBe(422);
    });

    it('an AR receipt settles the billing to PAID (master:2866)', async () => {
      const projectId = await newProject();
      const billingId = await newBilling(projectId, '100000.0000');
      await approve(billingId, 'PM', 'PROJECT_MANAGER');

      const receipt = await http()
        .post('/api/v1/finance/ar-receipts')
        .set('x-test-role', 'FINANCE')
        .send({
          project_id: projectId,
          billing_id: billingId,
          customer_id: customerId,
          amount_received: '100000.0000',
          received_date: isoDaysFromNow(0),
          payment_method: 'BANK_TRANSFER',
        });

      expect([200, 201]).toContain(receipt.status);
      expect(await billingStatus(billingId)).toBe('PAID');
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('the PM approval limit (master:2965; §15; ADR-024 §4)', () => {
    it('a PM may approve at the limit', async () => {
      const billingId = await newBilling(await newProject(), '500000.0000');
      const res = await approve(billingId, 'PM', 'PROJECT_MANAGER');
      expect(res.status).toBe(200);
      expect(await billingStatus(billingId)).toBe('ISSUED');
    });

    it('a PM is REFUSED above it', async () => {
      // The half of the rule that protects anything.
      const billingId = await newBilling(await newProject(), '500000.0001');
      const res = await approve(billingId, 'PM', 'PROJECT_MANAGER');
      expect(res.status).toBe(403);
      expect(await billingStatus(billingId)).toBe('DRAFT');
    });

    it('an Executive may approve above the PM limit', async () => {
      const billingId = await newBilling(await newProject(), '5000000.0000');
      const res = await approve(billingId, 'EXECUTIVE', 'EXECUTIVE');
      expect(res.status).toBe(200);
      expect(await billingStatus(billingId)).toBe('ISSUED');
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('the 13-week cash flow forecast (ADR-024 §1)', () => {
    const forecast = async (projectId: string): Promise<Period[]> => {
      const res = await http()
        .get(`/api/v1/finance/cashflow-forecast/${projectId}`)
        .set('x-test-role', 'FINANCE');
      expect(res.status).toBe(200);
      return res.body as Period[];
    };

    it('returns exactly thirteen weekly buckets', async () => {
      const periods = await forecast(await newProject());
      expect(periods).toHaveLength(FORECAST_WEEKS);
      for (const p of periods) {
        const days = (Date.parse(p.period_end) - Date.parse(p.period_start)) / 86_400_000;
        expect(days).toBe(7);
      }
    });

    it('an ISSUED billing appears as inflow in the week it falls due', async () => {
      const projectId = await newProject();
      const billingId = await newBilling(projectId, '250000.0000', isoDaysFromNow(10));
      await approve(billingId, 'PM', 'PROJECT_MANAGER');

      const periods = await forecast(projectId);
      // Day 10 lands in the second weekly bucket (days 7-13).
      expect(periods[1].inflow).toBe('250000.0000');
      expect(periods[0].inflow).toBe('0.0000');
    });

    it('a DRAFT billing is not forecast — only ISSUED is receivable', async () => {
      // The control for the test above. An unapproved billing has not been sent to the client, so
      // forecasting it as incoming cash would be forecasting money nobody has been asked for.
      const projectId = await newProject();
      await newBilling(projectId, '250000.0000', isoDaysFromNow(10));

      const periods = await forecast(projectId);
      expect(periods.every((p) => p.inflow === '0.0000')).toBe(true);
    });

    it('an overdue billing collapses into the first bucket (ADR-024 §1)', async () => {
      const projectId = await newProject();
      const billingId = await newBilling(projectId, '90000.0000', isoDaysFromNow(-30));
      await approve(billingId, 'PM', 'PROJECT_MANAGER');

      const periods = await forecast(projectId);
      expect(periods[0].inflow).toBe('90000.0000');
    });

    it('anything beyond the horizon is excluded, not folded into week 13', async () => {
      const projectId = await newProject();
      const billingId = await newBilling(projectId, '77000.0000', isoDaysFromNow(200));
      await approve(billingId, 'PM', 'PROJECT_MANAGER');

      const periods = await forecast(projectId);
      expect(periods.every((p) => p.inflow === '0.0000')).toBe(true);
    });

    it('a PENDING payment appears as outflow', async () => {
      const projectId = await newProject();
      const res = await http()
        .post('/api/v1/finance/payments')
        .set('x-test-role', 'FINANCE')
        .send({
          project_id: projectId,
          invoice_id: '00000000-0000-4000-8000-0000000000aa',
          amount: '40000.0000',
          currency_code: 'THB',
          payment_date: isoDaysFromNow(3),
        });
      expect([200, 201]).toContain(res.status);

      const periods = await forecast(projectId);
      expect(periods[0].outflow).toBe('40000.0000');
      expect(periods[0].net_flow).toBe('-40000.0000');
    });

    it('cumulative_net runs forward across the buckets', async () => {
      const projectId = await newProject();
      const near = await newBilling(projectId, '100000.0000', isoDaysFromNow(3));
      await approve(near, 'PM', 'PROJECT_MANAGER');
      const far = await newBilling(projectId, '50000.0000', isoDaysFromNow(31));
      await approve(far, 'PM', 'PROJECT_MANAGER');

      const periods = await forecast(projectId);
      expect(periods[0].cumulative_net).toBe('100000.0000');
      // Still 100000 until the second billing falls due, then 150000 from there on.
      expect(periods[FORECAST_WEEKS - 1].cumulative_net).toBe('150000.0000');
      // Monotone here because there are no outflows: no bucket may lose what an earlier one added.
      for (let i = 1; i < periods.length; i += 1) {
        expect(Number(periods[i].cumulative_net)).toBeGreaterThanOrEqual(
          Number(periods[i - 1].cumulative_net),
        );
      }
    });

    it('is scoped to its project', async () => {
      // Two projects under one tenant must not see each other's cash.
      const projectA = await newProject();
      const projectB = await newProject();
      const billingId = await newBilling(projectA, '123000.0000', isoDaysFromNow(5));
      await approve(billingId, 'PM', 'PROJECT_MANAGER');

      const periods = await forecast(projectB);
      expect(periods.every((p) => p.inflow === '0.0000')).toBe(true);
    });
  });
});

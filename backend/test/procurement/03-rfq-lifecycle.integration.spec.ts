/**
 * Phase 5 checklist items 03, 08 and 14 — master:1500-1506, 2469, 2491, 774/1541.
 *
 *   RFQ state machine: DRAFT -> PUBLISHED -> CLOSED -> EVALUATED -> [AWARDED | CANCELLED]
 *   "Quotation comparison service (sort by total_amount, mark is_selected)"
 *   "Emit a Kafka event for every workflow state transition" (master:774, 1541)
 *
 * The event rule is asserted by counting platform.outbox_events — the outbox IS the publish — and
 * is paired with the negative direction: a REFUSED transition must not leave an event behind.
 *
 * WHAT THIS FILE CAN AND CANNOT REACH
 * ----------------------------------
 * Every RFQ transition SIGNALS Temporal (procurement.service.ts:257,264,277,291), and creating an
 * RFQ starts the workflow — so the success paths need a Temporal server, which this harness does
 * not provide (the repo's own procurement.integration.spec.ts says the container stack lands in
 * Phase 18, and only ever tests the 400 path plus SQL-seeded rows for the same reason).
 *
 * What IS reachable here is everything guarded BEFORE the signal: `assertRfqStatus` rejects an
 * illegal transition without touching Temporal, and quotation submission and comparison are plain
 * database work. So this file owns the REFUSAL half of the state machine and the comparison rule;
 * the success half is owned by rfq.workflow.spec.ts against a real time-skipping server.
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

const TENANT_ID = 'aaaa1111-1111-4000-8000-000000000005';
const USER_ID = 'aaaa2222-2222-4000-8000-000000000005';

const roleOf = (req: Record<string, unknown>): string => {
  const headers = (req['headers'] ?? {}) as Record<string, string>;
  return headers['x-test-role'] ?? 'PROCUREMENT_OFFICER';
};

describe('Phase 5 · RFQ lifecycle, quotation comparison and event emission', () => {
  let infra: IntegrationInfra;
  let app: INestApplication;
  let projectId = '';
  let seq = 0;

  beforeAll(async () => {
    infra = await startIntegrationInfra();
    await infra.prisma.$executeRawUnsafe(
      `INSERT INTO platform.tenants (tenant_id, tenant_code, tenant_name, keycloak_realm, plan_type, is_active)
       VALUES ($1::uuid, 'sd-p5', 'Spec Derived P5', 'construction-os', 'STARTER'::platform."PlanType", true)`,
      TENANT_ID,
    );
    await infra.prisma.$executeRawUnsafe(
      `INSERT INTO platform.users (user_id, tenant_id, keycloak_user_id, phone_number, email, display_name)
       VALUES ($1::uuid, $2::uuid, 'kc-p5', '+66890000005', 'p5@example.com', 'P5')`,
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
        tenantCode: 'sd-p5',
      };
      next();
    });
    await app.init();

    const proj = await request(app.getHttpServer())
      .post('/api/v1/projects')
      .set('x-test-role', 'TENANT_ADMIN')
      .send({
        project_code: 'SD-P5-HOST',
        project_name: 'Procurement Host',
        project_type: 'INFRASTRUCTURE',
        start_date: '2019-01-01',
        end_date: '2020-01-01',
      });
    expect([200, 201]).toContain(proj.status);
    projectId = (proj.body as { project_id: string }).project_id;
  });

  afterAll(async () => {
    await app?.close();
    await stopIntegrationInfra(infra);
  });

  const http = () => request(app.getHttpServer());
  const PO_ROLE = 'PROCUREMENT_OFFICER';

  const outboxCount = async (): Promise<number> => {
    const rows = await infra.prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
      `SELECT count(*) AS n FROM platform.outbox_events WHERE tenant_id = $1`,
      TENANT_ID,
    );
    return Number(rows[0]?.n ?? 0);
  };

  const rfqStatus = async (rfqId: string): Promise<string> => {
    const rows = await infra.prisma.$queryRawUnsafe<Array<{ status: string }>>(
      `SELECT status::text AS status FROM procurement.rfqs WHERE rfq_id = $1::uuid`,
      rfqId,
    );
    return rows[0]?.status ?? '(missing)';
  };

  /**
   * Run the workflow's evaluation activity (CLOSED → EVALUATED, with the selection — plan CQ) against this
   * database. Loaded through the Jest resolver at call time, not imported: the activity reads the database URL
   * from the environment startIntegrationInfra sets.
   */
  const evaluate = async (rfqId: string): Promise<void> => {
    const acts = jest.requireActual('../../src/modules/procurement/workflows/rfq.activities') as {
      markQuotationsEvaluated: (p: {
        rfq_id: string;
        tenant_id: string;
        correlation_id: string;
      }) => Promise<void>;
    };
    await acts.markQuotationsEvaluated({
      rfq_id: rfqId,
      tenant_id: TENANT_ID,
      correlation_id: '00000000-0000-4000-8000-0000000000cc',
    });
  };

  const createVendor = async (): Promise<string> => {
    seq += 1;
    const res = await http()
      .post('/api/v1/procurement/vendors')
      .set('x-test-role', PO_ROLE)
      .send({ vendor_code: `V-${seq}`, vendor_name: `Vendor ${seq}` });
    expect([200, 201]).toContain(res.status);
    return (res.body as { vendor_id: string }).vendor_id;
  };

  /**
   * Seed an RFQ straight into the database at a chosen status.
   *
   * POST /procurement/rfqs starts a Temporal workflow, so it cannot be used here — the same reason
   * backend/test/procurement.integration.spec.ts seeds `procurement.rfqs` with raw SQL.
   */
  const seedRfq = async (status: string): Promise<string> => {
    seq += 1;
    const rows = await infra.prisma.$queryRawUnsafe<Array<{ rfq_id: string }>>(
      `INSERT INTO procurement.rfqs
         (rfq_id, project_id, tenant_id, rfq_number, status, deadline, created_by)
       -- status is VARCHAR + CHECK here, not a pg ENUM (verified in 01-entities via
       -- pg_constraint), so it takes a plain string with no type cast.
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3,
               $4, now() + interval '7 days', $5::uuid)
       RETURNING rfq_id`,
      projectId,
      TENANT_ID,
      `RFQ-SD-${seq}`,
      status,
      USER_ID,
    );
    return rows[0].rfq_id;
  };

  const act = (rfqId: string, action: string, role = PO_ROLE) =>
    http().post(`/api/v1/procurement/rfqs/${rfqId}/${action}`).set('x-test-role', role).send({});

  describe('RFQ state machine — the refusals (master:1500-1506)', () => {
    /**
     * These are the edges the spec does NOT define. `assertRfqStatus` rejects them before any
     * Temporal signal, so they are observable here — and they are the half that matters most:
     * master:1536 closes the machine, and a machine that only accepts is not the specified one.
     */
    it('DRAFT -> CLOSED is refused', async () => {
      const id = await seedRfq('DRAFT');
      expect((await act(id, 'close')).status).toBeGreaterThanOrEqual(400);
      expect(await rfqStatus(id)).toBe('DRAFT');
    });

    it('CLOSED -> PUBLISHED is refused', async () => {
      const id = await seedRfq('CLOSED');
      expect((await act(id, 'publish')).status).toBeGreaterThanOrEqual(400);
      expect(await rfqStatus(id)).toBe('CLOSED');
    });

    it.each(['AWARDED', 'CANCELLED'])('%s is terminal — cancel is refused', async (terminal) => {
      const id = await seedRfq(terminal);
      expect((await act(id, 'cancel')).status).toBeGreaterThanOrEqual(400);
      expect(await rfqStatus(id)).toBe(terminal);
    });

    it('a quotation cannot be submitted to an RFQ that is not PUBLISHED', async () => {
      const id = await seedRfq('DRAFT');
      const vendorId = await createVendor();
      const res = await http()
        .post(`/api/v1/procurement/rfqs/${id}/quotations`)
        .set('x-test-role', PO_ROLE)
        .send({
          vendor_id: vendorId,
          total_amount: '1000.0000',
          currency_code: 'THB',
          validity_days: 30,
          submitted_at: '2026-01-01T00:00:00.000Z',
        });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('quotation comparison (master:2469, 2491)', () => {
    it('sorts by total_amount and marks exactly the lowest as is_selected', async () => {
      const rfqId = await seedRfq('PUBLISHED');

      for (const amount of ['900000.0000', '120000.5000', '450000.0000']) {
        const vendorId = await createVendor();
        const res = await http()
          .post(`/api/v1/procurement/rfqs/${rfqId}/quotations`)
          .set('x-test-role', PO_ROLE)
          .send({
            vendor_id: vendorId,
            total_amount: amount,
            currency_code: 'THB',
            validity_days: 30,
            submitted_at: '2026-01-01T00:00:00.000Z',
          });
        expect([200, 201]).toContain(res.status);
      }

      // "compare; RFQ CLOSED" (master:2491) — comparison happens once quoting is over. Moved by SQL
      // because the close transition itself is a Temporal signal.
      await infra.prisma.$executeRawUnsafe(
        `UPDATE procurement.rfqs SET status = 'CLOSED' WHERE rfq_id = $1::uuid`,
        rfqId,
      );

      // plan CQ: the selection is the evaluation's (the workflow's activity), not the GET's.
      await evaluate(rfqId);
      expect(await rfqStatus(rfqId)).toBe('EVALUATED');
      const compared = await http()
        .get(`/api/v1/procurement/rfqs/${rfqId}/quotations`)
        .set('x-test-role', PO_ROLE);
      expect(compared.status).toBe(200);
      expect(
        (compared.body as Array<{ total_amount: string }>).map((q) => Number(q.total_amount)),
      ).toEqual([120000.5, 450000, 900000]);

      const rows = await infra.prisma.$queryRawUnsafe<
        Array<{ total_amount: string; is_selected: boolean }>
      >(
        `SELECT total_amount::text, is_selected FROM procurement.quotations
          WHERE rfq_id = $1::uuid ORDER BY total_amount ASC`,
        rfqId,
      );
      expect(rows.map((r) => r.total_amount)).toEqual([
        '120000.5000',
        '450000.0000',
        '900000.0000',
      ]);
      // Exactly one, and the cheapest: marking several would still satisfy "the cheapest is marked".
      expect(rows.filter((r) => r.is_selected)).toHaveLength(1);
      expect(rows[0].is_selected).toBe(true);
    });
  });

  describe('a refused transition emits nothing (master:774, 1541)', () => {
    /**
     * The positive direction — "every transition emits an event" — is owned by the workflow specs,
     * because the transition itself is a Temporal signal. The negative direction belongs here and
     * is the one that silently goes wrong: an event announcing a status change that never happened
     * would be believed by every downstream consumer (Finance, Analytics, the knowledge graph).
     */
    it('a rejected DRAFT -> CLOSED leaves the outbox untouched', async () => {
      const id = await seedRfq('DRAFT');
      const before = await outboxCount();
      expect((await act(id, 'close')).status).toBeGreaterThanOrEqual(400);
      expect(await rfqStatus(id)).toBe('DRAFT');
      expect(await outboxCount()).toBe(before);
    });
  });

  // fix/proc-quotation-vendor-check: a quotation is for one of the tenant's ACTIVE vendors. The id used to go straight
  // to the INSERT — a deactivated vendor was quoted for, and the foreign key (checked without RLS) took another
  // tenant's vendor.
  describe("a quotation names one of the tenant's active vendors", () => {
    const quote = (rfqId: string, vendorId: string) =>
      http().post(`/api/v1/procurement/rfqs/${rfqId}/quotations`).set('x-test-role', PO_ROLE).send({
        vendor_id: vendorId,
        total_amount: '1000.0000',
        currency_code: 'THB',
        validity_days: 30,
        submitted_at: '2026-01-01T00:00:00.000Z',
      });
    const quotationsOn = async (rfqId: string): Promise<number> => {
      const rows = await infra.prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
        `SELECT count(*) AS n FROM procurement.quotations WHERE rfq_id = $1::uuid`,
        rfqId,
      );
      return Number(rows[0]!.n);
    };

    // fix/quotation-duplicate-and-closed-rfq: one per vendor per RFQ, the first standing. It was a 500 (the unique key).
    it('a second quotation from the same vendor: 409, the first standing', async () => {
      const rfqId = await seedRfq('PUBLISHED');
      const vendorId = await createVendor();
      expect((await quote(rfqId, vendorId)).status).toBe(201);
      const again = await quote(rfqId, vendorId);
      expect(again.status).toBe(409);
      expect(await quotationsOn(rfqId)).toBe(1);
    });

    it('an active vendor: 201, as before', async () => {
      const rfqId = await seedRfq('PUBLISHED');
      expect((await quote(rfqId, await createVendor())).status).toBe(201);
      expect(await quotationsOn(rfqId)).toBe(1);
    });

    it('a deactivated vendor: 404, nothing written', async () => {
      const rfqId = await seedRfq('PUBLISHED');
      const vendorId = await createVendor();
      const gone = await http()
        .delete(`/api/v1/procurement/vendors/${vendorId}`)
        .set('x-test-role', 'PROC_MANAGER');
      expect(gone.status).toBe(204);
      const res = await quote(rfqId, vendorId);
      expect(res.status).toBe(404);
      expect(await quotationsOn(rfqId)).toBe(0);
    });

    it('a vendor id that does not exist: 404, nothing written', async () => {
      const rfqId = await seedRfq('PUBLISHED');
      const res = await quote(rfqId, '00000000-0000-4000-8000-000000000999');
      expect(res.status).toBe(404);
      expect(await quotationsOn(rfqId)).toBe(0);
    });

    it("another tenant's vendor: 404, nothing written", async () => {
      const rfqId = await seedRfq('PUBLISHED');
      const otherTenant = 'aaaa3333-3333-4000-8000-000000000005';
      await infra.prisma.$executeRawUnsafe(
        `INSERT INTO platform.tenants (tenant_id, tenant_code, tenant_name, keycloak_realm, plan_type, is_active)
         VALUES ($1::uuid, 'sd-p5b', 'Other Tenant P5', 'construction-os', 'STARTER'::platform."PlanType", true)
         ON CONFLICT DO NOTHING`,
        otherTenant,
      );
      const [other] = await infra.prisma.$queryRawUnsafe<Array<{ vendor_id: string }>>(
        `INSERT INTO procurement.vendors (tenant_id, vendor_code, vendor_name)
         VALUES ($1::uuid, 'V-OTHER', 'Other Tenant Vendor') RETURNING vendor_id::text AS vendor_id`,
        otherTenant,
      );
      const res = await quote(rfqId, other!.vendor_id);
      expect(res.status).toBe(404);
      expect(await quotationsOn(rfqId)).toBe(0);
    });
  });

  // plan CP (product owner, 2026-11-20): a deactivated vendor is not awarded, nor auto-selected by the comparison.
  describe('a vendor deactivated after it quoted', () => {
    const quoteAs = async (rfqId: string, vendorId: string, amount: string): Promise<string> => {
      const res = await http()
        .post(`/api/v1/procurement/rfqs/${rfqId}/quotations`)
        .set('x-test-role', PO_ROLE)
        .send({
          vendor_id: vendorId,
          total_amount: amount,
          currency_code: 'THB',
          validity_days: 30,
          submitted_at: '2026-01-01T00:00:00.000Z',
        });
      expect(res.status).toBe(201);
      return (res.body as { quotation_id: string }).quotation_id;
    };
    const deactivate = async (vendorId: string) => {
      const res = await http()
        .delete(`/api/v1/procurement/vendors/${vendorId}`)
        .set('x-test-role', 'PROC_MANAGER');
      expect(res.status).toBe(204);
    };
    // Moved by SQL: the close and evaluate transitions are Temporal signals.
    const setStatus = (rfqId: string, status: string) =>
      infra.prisma.$executeRawUnsafe(
        `UPDATE procurement.rfqs SET status = $2 WHERE rfq_id = $1::uuid`,
        rfqId,
        status,
      );
    const selection = async (rfqId: string) =>
      infra.prisma.$queryRawUnsafe<Array<{ quotation_id: string; is_selected: boolean }>>(
        `SELECT quotation_id::text, is_selected FROM procurement.quotations
          WHERE rfq_id = $1::uuid ORDER BY total_amount ASC`,
        rfqId,
      );

    it('award to its quotation: 404, nothing selected, the RFQ still EVALUATED', async () => {
      const rfqId = await seedRfq('PUBLISHED');
      const vendorId = await createVendor();
      const quotationId = await quoteAs(rfqId, vendorId, '1000.0000');
      await setStatus(rfqId, 'EVALUATED');
      await deactivate(vendorId);

      const res = await http()
        .post(`/api/v1/procurement/rfqs/${rfqId}/award`)
        .set('x-test-role', PO_ROLE)
        .send({ quotation_id: quotationId });

      expect(res.status).toBe(404);
      expect(JSON.stringify(res.body)).toContain(`Vendor ${vendorId} not found`);
      expect(await selection(rfqId)).toEqual([{ quotation_id: quotationId, is_selected: false }]);
      expect(await rfqStatus(rfqId)).toBe('EVALUATED');
    });

    it('the evaluation skips it for the cheapest ACTIVE vendor; none active → none selected', async () => {
      const rfqId = await seedRfq('PUBLISHED');
      const cheapVendor = await createVendor();
      const dearVendor = await createVendor();
      const cheap = await quoteAs(rfqId, cheapVendor, '1000.0000');
      const dear = await quoteAs(rfqId, dearVendor, '2000.0000');
      await setStatus(rfqId, 'CLOSED');
      await deactivate(cheapVendor);

      await evaluate(rfqId);
      expect(await rfqStatus(rfqId)).toBe('EVALUATED');
      expect(await selection(rfqId)).toEqual([
        { quotation_id: cheap, is_selected: false },
        { quotation_id: dear, is_selected: true },
      ]);

      // The other vendor deactivated too: evaluated again, the earlier selection is cleared.
      await deactivate(dearVendor);
      await setStatus(rfqId, 'CLOSED');
      await evaluate(rfqId);
      expect(await selection(rfqId)).toEqual([
        { quotation_id: cheap, is_selected: false },
        { quotation_id: dear, is_selected: false },
      ]);
    });
  });

  // plan CQ (product owner, 2026-11-20): the system selects at evaluation; the GET reads once quoting is over.
  describe('quotations after the RFQ closes', () => {
    const quoteAt = async (rfqId: string, amount: string, submittedAt: string): Promise<string> => {
      const res = await http()
        .post(`/api/v1/procurement/rfqs/${rfqId}/quotations`)
        .set('x-test-role', PO_ROLE)
        .send({
          vendor_id: await createVendor(),
          total_amount: amount,
          currency_code: 'THB',
          validity_days: 30,
          submitted_at: submittedAt,
        });
      expect(res.status).toBe(201);
      return (res.body as { quotation_id: string }).quotation_id;
    };
    const selected = async (rfqId: string) =>
      (
        await infra.prisma.$queryRawUnsafe<Array<{ quotation_id: string }>>(
          `SELECT quotation_id::text FROM procurement.quotations WHERE rfq_id = $1::uuid AND is_selected`,
          rfqId,
        )
      ).map((r) => r.quotation_id);
    const list = (rfqId: string) =>
      http().get(`/api/v1/procurement/rfqs/${rfqId}/quotations`).set('x-test-role', PO_ROLE);

    it('a tie on the lowest price goes to the quotation submitted first', async () => {
      const rfqId = await seedRfq('PUBLISHED');
      // Submitted later but entered first, so neither insertion order nor id order decides it by accident.
      const later = await quoteAt(rfqId, '500.0000', '2026-01-02T00:00:00.000Z');
      const first = await quoteAt(rfqId, '500.0000', '2026-01-01T00:00:00.000Z');
      await quoteAt(rfqId, '700.0000', '2025-12-31T00:00:00.000Z');
      await infra.prisma.$executeRawUnsafe(
        `UPDATE procurement.rfqs SET status = 'CLOSED' WHERE rfq_id = $1::uuid`,
        rfqId,
      );
      await evaluate(rfqId);
      expect(await selected(rfqId)).toEqual([first]);
      expect(later).not.toBe(first);
    });

    it('the GET on an EVALUATED RFQ: 200, the rows as stored, nothing written', async () => {
      const rfqId = await seedRfq('PUBLISHED');
      const dear = await quoteAt(rfqId, '900.0000', '2026-01-01T00:00:00.000Z');
      const cheap = await quoteAt(rfqId, '100.0000', '2026-01-01T00:00:00.000Z');
      // The evaluation's choice overridden by hand: a GET that re-selected would put it back on the cheapest.
      await infra.prisma.$executeRawUnsafe(
        `UPDATE procurement.quotations SET is_selected = (quotation_id = $2::uuid) WHERE rfq_id = $1::uuid`,
        rfqId,
        dear,
      );
      await infra.prisma.$executeRawUnsafe(
        `UPDATE procurement.rfqs SET status = 'EVALUATED' WHERE rfq_id = $1::uuid`,
        rfqId,
      );
      const res = await list(rfqId);
      expect(res.status).toBe(200);
      expect(
        (res.body as Array<{ quotation_id: string; is_selected: boolean }>).map((q) => [
          q.quotation_id,
          q.is_selected,
        ]),
      ).toEqual([
        [cheap, false],
        [dear, true],
      ]);
      expect(await selected(rfqId)).toEqual([dear]);
    });

    // A Temporal retry after a commit whose result was lost finds the RFQ EVALUATED: nothing re-selected.
    it('the evaluation on an RFQ no longer CLOSED changes nothing (a retry after a lost commit)', async () => {
      const rfqId = await seedRfq('PUBLISHED');
      const dear = await quoteAt(rfqId, '900.0000', '2026-01-01T00:00:00.000Z');
      await quoteAt(rfqId, '100.0000', '2026-01-01T00:00:00.000Z');
      await infra.prisma.$executeRawUnsafe(
        `UPDATE procurement.quotations SET is_selected = (quotation_id = $2::uuid) WHERE rfq_id = $1::uuid`,
        rfqId,
        dear,
      );
      await infra.prisma.$executeRawUnsafe(
        `UPDATE procurement.rfqs SET status = 'EVALUATED' WHERE rfq_id = $1::uuid`,
        rfqId,
      );
      const before = await outboxCount();
      await evaluate(rfqId);
      expect(await selected(rfqId)).toEqual([dear]);
      expect(await rfqStatus(rfqId)).toBe('EVALUATED');
      expect(await outboxCount()).toBe(before);
    });

    it('sealed while PUBLISHED: 422; an RFQ closed with no quotations: 200 []', async () => {
      const open = await seedRfq('PUBLISHED');
      await quoteAt(open, '100.0000', '2026-01-01T00:00:00.000Z');
      expect((await list(open)).status).toBe(422);

      const empty = await seedRfq('CLOSED');
      const res = await list(empty);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });
});

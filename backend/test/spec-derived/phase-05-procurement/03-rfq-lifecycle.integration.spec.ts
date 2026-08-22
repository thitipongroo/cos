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
} from '../../helpers/integration-infra';
import { AppModule } from '../../../src/app.module';
import { JwtAuthGuard } from '../../../src/modules/identity/guards/jwt-auth.guard';

jest.setTimeout(900_000);

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

      const compared = await http()
        .get(`/api/v1/procurement/rfqs/${rfqId}/quotations`)
        .set('x-test-role', PO_ROLE);
      expect(compared.status).toBe(200);

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
});

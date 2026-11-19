/**
 * One e-mail acts for one vendor of a tenant (fix/vendor-reinvite-refuse, product owner 2026-11-16).
 *
 * The tenant's trading relationship with a vendor identity is unique per (tenant, identity). Inviting the same
 * e-mail for a second vendor used to re-activate that row and keep its first vendor: the invitation went out,
 * and the person's quotations were filed under the first vendor (`resolveVendorId`). The second invitation is
 * now refused — 409 COS-VND-007, before any invitation row exists — and re-inviting for the same vendor still
 * works, revoked or not.
 *
 * Asserted on the real database: the relationship rows and the invitation rows.
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
import { GlobalExceptionFilter } from '../../src/shared/filters/http-exception.filter';

const TENANT_ID = 'cccc1111-1111-4000-8000-000000000105';
const USER_ID = 'cccc2222-2222-4000-8000-000000000105';
// A second tenant, for "the rule is per tenant": the same e-mail may act for one vendor in each.
const TENANT_2 = 'cccc3333-3333-4000-8000-000000000105';
const USER_2 = 'cccc4444-4444-4000-8000-000000000105';
const ROLE = 'PROCUREMENT_OFFICER';

describe('Vendor invitations: one e-mail, one vendor per tenant (real database)', () => {
  let infra: IntegrationInfra;
  let app: INestApplication;
  const projectOf: Record<string, string> = {};
  let seq = 0;

  beforeAll(async () => {
    infra = await startIntegrationInfra();
    for (const [tenant, user, n] of [
      [TENANT_ID, USER_ID, ''],
      [TENANT_2, USER_2, 'b'],
    ] as const) {
      await infra.prisma.$executeRawUnsafe(
        `INSERT INTO platform.tenants (tenant_id, tenant_code, tenant_name, keycloak_realm, plan_type, is_active)
         VALUES ($1::uuid, $2, 'Vendor Reinvite', 'construction-os', 'STARTER'::platform."PlanType", true)`,
        tenant,
        `sd-p105${n}`,
      );
      await infra.prisma.$executeRawUnsafe(
        `INSERT INTO platform.users (user_id, tenant_id, keycloak_user_id, phone_number, email, display_name)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5, 'P105')`,
        user,
        tenant,
        `kc-p105${n}`,
        n ? '+66890001105' : '+66890000105',
        `p105${n}@example.com`,
      );
    }

    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard(JwtAuthGuard)
      .useValue(clsAuthGuard((req) => (req['user'] ?? {}) as Record<string, string>))
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    // The app's own filter, so the error body asserted below is the one clients get.
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.use((req: Record<string, unknown>, _res: unknown, next: () => void) => {
      const headers = (req['headers'] ?? {}) as Record<string, string>;
      const second = headers['x-test-tenant'] === TENANT_2;
      req['user'] = {
        tenant_id: second ? TENANT_2 : TENANT_ID,
        user_id: second ? USER_2 : USER_ID,
        role: headers['x-test-role'] ?? ROLE,
        tenantCode: second ? 'sd-p105b' : 'sd-p105',
      };
      next();
    });
    await app.init();

    for (const tenant of [TENANT_ID, TENANT_2]) {
      const proj = await request(app.getHttpServer())
        .post('/api/v1/projects')
        .set('x-test-role', 'TENANT_ADMIN')
        .set('x-test-tenant', tenant)
        .send({
          project_code: 'SD-P105-HOST',
          project_name: 'Vendor Reinvite Host',
          project_type: 'COMMERCIAL',
          start_date: '2019-01-01',
          end_date: '2020-01-01',
        });
      expect([200, 201]).toContain(proj.status);
      projectOf[tenant] = (proj.body as { project_id: string }).project_id;
    }
  });

  afterAll(async () => {
    await app?.close();
    await stopIntegrationInfra(infra);
  });

  const http = () => request(app.getHttpServer());

  const createVendor = async (tenant = TENANT_ID): Promise<string> => {
    seq += 1;
    const res = await http()
      .post('/api/v1/procurement/vendors')
      .set('x-test-role', ROLE)
      .set('x-test-tenant', tenant)
      .send({ vendor_code: `VR-${seq}`, vendor_name: `Reinvite Vendor ${seq}` });
    expect([200, 201]).toContain(res.status);
    return (res.body as { vendor_id: string }).vendor_id;
  };

  /** POST /procurement/rfqs starts a Temporal workflow this harness lacks, so the RFQ is seeded (as 03 does). */
  const seedRfq = async (tenant = TENANT_ID): Promise<string> => {
    seq += 1;
    const rows = await infra.prisma.$queryRawUnsafe<Array<{ rfq_id: string }>>(
      `INSERT INTO procurement.rfqs (rfq_id, project_id, tenant_id, rfq_number, status, deadline, created_by)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3, 'PUBLISHED', now() + interval '7 days', $4::uuid)
       RETURNING rfq_id`,
      projectOf[tenant],
      tenant,
      `RFQ-VR-${seq}`,
      tenant === TENANT_2 ? USER_2 : USER_ID,
    );
    return rows[0]!.rfq_id;
  };

  const invite = (rfqId: string, vendorId: string, email: string, tenant = TENANT_ID) =>
    http()
      .post(`/api/v1/procurement/rfqs/${rfqId}/invitations`)
      .set('x-test-role', ROLE)
      .set('x-test-tenant', tenant)
      .send({ vendor_id: vendorId, email, display_name: 'Somchai' });

  const relationshipsOf = (
    email: string,
    tenant = TENANT_ID,
  ): Promise<Array<{ vendor_id: string; status: string }>> =>
    infra.prisma.$queryRawUnsafe(
      `SELECT r.vendor_id::text AS vendor_id, r.status
         FROM platform.vendor_trading_relationships r
         JOIN platform.vendor_identities i ON i.vendor_identity_id = r.vendor_identity_id
        WHERE lower(i.email) = lower($1) AND r.tenant_id = $2::uuid`,
      email,
      tenant,
    );

  const invitationsFor = async (rfqId: string): Promise<number> => {
    const rows = await infra.prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
      `SELECT count(*) AS n FROM procurement.rfq_invitations WHERE rfq_id = $1::uuid`,
      rfqId,
    );
    return Number(rows[0]!.n);
  };

  it('a second vendor for the same e-mail is refused with COS-VND-007, and nothing is written', async () => {
    const vendorA = await createVendor();
    const vendorB = await createVendor();
    const rfq = await seedRfq();
    const email = 'somchai.reinvite@example.com';

    const first = await invite(rfq, vendorA, email);
    expect(first.status).toBe(201);

    const second = await invite(rfq, vendorB, email);
    expect(second.status).toBe(409);
    // Through GlobalExceptionFilter: the QM-10 envelope, with its own code (not COS-GENERAL-409).
    expect(second.body).toEqual({
      error: expect.objectContaining({
        code: 'COS-VND-007',
        message: 'This e-mail is already linked to another vendor of this tenant',
        traceId: expect.any(String),
        timestamp: expect.any(String),
      }),
    });

    expect(await relationshipsOf(email)).toEqual([{ vendor_id: vendorA, status: 'ACTIVE' }]);
    expect(await invitationsFor(rfq)).toBe(1); // the refused one wrote no invitation
  });

  it('re-inviting for the same vendor still works, and re-activates a revoked relationship', async () => {
    const vendorA = await createVendor();
    const vendorB = await createVendor();
    const rfq = await seedRfq();
    const email = 'malee.reinvite@example.com';

    expect((await invite(rfq, vendorA, email)).status).toBe(201);
    // Nothing in the app revokes; an operator does it by hand.
    await infra.prisma.$executeRawUnsafe(
      `UPDATE platform.vendor_trading_relationships r SET status = 'REVOKED'
         FROM platform.vendor_identities i
        WHERE i.vendor_identity_id = r.vendor_identity_id AND i.email = $1 AND r.tenant_id = $2::uuid`,
      email,
      TENANT_ID,
    );

    // A revoked relationship for vendor A does not free the e-mail for vendor B.
    const other = await invite(rfq, vendorB, email);
    expect(other.status).toBe(409);
    expect(await relationshipsOf(email)).toEqual([{ vendor_id: vendorA, status: 'REVOKED' }]);

    expect((await invite(rfq, vendorA, email)).status).toBe(201);
    expect(await relationshipsOf(email)).toEqual([{ vendor_id: vendorA, status: 'ACTIVE' }]);
    expect(await invitationsFor(rfq)).toBe(2);
  });

  it('the same address in another letter case is the same person: refused for another vendor', async () => {
    const vendorA = await createVendor();
    const vendorB = await createVendor();
    const rfq = await seedRfq();

    expect((await invite(rfq, vendorA, 'pim.reinvite@example.com')).status).toBe(201);
    const other = await invite(rfq, vendorB, 'Pim.Reinvite@EXAMPLE.com');
    expect(other.status).toBe(409);

    const identities = await infra.prisma.$queryRawUnsafe<Array<{ email: string }>>(
      `SELECT email FROM platform.vendor_identities WHERE lower(email) = 'pim.reinvite@example.com'`,
    );
    expect(identities).toEqual([{ email: 'pim.reinvite@example.com' }]);
    expect(await relationshipsOf('pim.reinvite@example.com')).toEqual([
      { vendor_id: vendorA, status: 'ACTIVE' },
    ]);
  });

  it('the rule is per tenant: another tenant may invite the same e-mail for its own vendor', async () => {
    const email = 'nok.reinvite@example.com';
    const vendorA = await createVendor();
    expect((await invite(await seedRfq(), vendorA, email)).status).toBe(201);

    const vendorOther = await createVendor(TENANT_2);
    const res = await invite(await seedRfq(TENANT_2), vendorOther, email, TENANT_2);
    expect(res.status).toBe(201);

    expect(await relationshipsOf(email)).toEqual([{ vendor_id: vendorA, status: 'ACTIVE' }]);
    expect(await relationshipsOf(email, TENANT_2)).toEqual([
      { vendor_id: vendorOther, status: 'ACTIVE' },
    ]);
  });

  // fix/vendor-identity-upsert-race: the identity was found-then-inserted, so two first invitations of one e-mail
  // at once could both insert, and one failed on the e-mail's UNIQUE with a 500 (3 rounds in 10 when measured).
  it('two first invitations of a new e-mail at once both succeed, with one identity', async () => {
    const vendorA = await createVendor();
    const rfq = await seedRfq();
    for (let round = 0; round < 10; round++) {
      const email = `race${round}.reinvite@example.com`;
      const answers = await Promise.all([invite(rfq, vendorA, email), invite(rfq, vendorA, email)]);
      expect({ round, statuses: answers.map((a) => a.status) }).toEqual({
        round,
        statuses: [201, 201],
      });
      const identities = await infra.prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
        `SELECT count(*) AS n FROM platform.vendor_identities WHERE email = $1`,
        email,
      );
      expect(Number(identities[0]!.n)).toBe(1);
      expect(await relationshipsOf(email)).toEqual([{ vendor_id: vendorA, status: 'ACTIVE' }]);
    }
  });

  // The same race for two different vendors used to answer 500 too; now one invitation wins and the other is the
  // ordinary refusal.
  it('two first invitations of a new e-mail for two vendors at once: one 201, one 409', async () => {
    const vendorA = await createVendor();
    const vendorB = await createVendor();
    const rfq = await seedRfq();
    for (let round = 0; round < 10; round++) {
      const email = `race-two${round}.reinvite@example.com`;
      const answers = await Promise.all([invite(rfq, vendorA, email), invite(rfq, vendorB, email)]);
      const statuses = answers.map((a) => a.status);
      expect({ round, statuses: [...statuses].sort() }).toEqual({ round, statuses: [201, 409] });
      const winner = statuses[0] === 201 ? vendorA : vendorB;
      expect(await relationshipsOf(email)).toEqual([{ vendor_id: winner, status: 'ACTIVE' }]);
      const identities = await infra.prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
        `SELECT count(*) AS n FROM platform.vendor_identities WHERE email = $1`,
        email,
      );
      expect(Number(identities[0]!.n)).toBe(1);
    }
  });
});

/**
 * One e-mail acts for one vendor of a tenant (fix/vendor-reinvite-refuse, product owner 2026-11-16).
 *
 * The tenant's trading relationship with a vendor identity is unique per (tenant, identity). Inviting the same
 * e-mail for a second vendor used to re-activate that row and keep its first vendor: the invitation went out,
 * and the person's quotations were filed under the first vendor (`resolveVendorId`). The second invitation is
 * now refused — 409 COS-VND-007, before any invitation row exists. Re-inviting for the same vendor works while the
 * relationship is ACTIVE; a REVOKED one is refused too — 409 COS-VND-008 — since an invitation does not undo a
 * revocation (fix/vendor-revoked-reinvite, product owner 2026-11-19).
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
import { MagicLinkService } from '../../src/modules/vendor-portal/magic-link.service';

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

  it('re-inviting for the same vendor works while ACTIVE; once revoked, no invitation re-activates it', async () => {
    const vendorA = await createVendor();
    const vendorB = await createVendor();
    const rfq = await seedRfq();
    const email = 'malee.reinvite@example.com';

    expect((await invite(rfq, vendorA, email)).status).toBe(201);
    expect((await invite(rfq, vendorA, email)).status).toBe(201); // ACTIVE: re-invited as before
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
    expect((other.body as { error: { code: string } }).error.code).toBe('COS-VND-007');

    // Nor does re-inviting for vendor A restore it: refused, still REVOKED, no invitation written.
    const again = await invite(rfq, vendorA, email);
    expect(again.status).toBe(409);
    expect(again.body).toEqual({
      error: expect.objectContaining({
        code: 'COS-VND-008',
        message: "This e-mail's link to this vendor was revoked",
        traceId: expect.any(String),
      }),
    });
    expect(await relationshipsOf(email)).toEqual([{ vendor_id: vendorA, status: 'REVOKED' }]);
    expect(await invitationsFor(rfq)).toBe(2); // the two issued while ACTIVE
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
      // The loser is the other-vendor refusal, not the revoked one.
      const loser = answers.find((a) => a.status === 409)!;
      expect((loser.body as { error: { code: string } }).error.code).toBe('COS-VND-007');
      const winner = statuses[0] === 201 ? vendorA : vendorB;
      expect(await relationshipsOf(email)).toEqual([{ vendor_id: winner, status: 'ACTIVE' }]);
      const identities = await infra.prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
        `SELECT count(*) AS n FROM platform.vendor_identities WHERE email = $1`,
        email,
      );
      expect(Number(identities[0]!.n)).toBe(1);
    }
  });

  // Plan DS (product owner 2026-11-21): the guard's own token check answers an invitation link with its code —
  // COS-VND-004 expired, COS-VND-002 not a valid link — so the vendor's page can tell them apart.
  it('an expired or tampered invitation link: 401 COS-VND-004 / COS-VND-002', async () => {
    const rfq = await seedRfq();
    const issued = await invite(rfq, await createVendor(), 'ken.expired@example.com');
    expect(issued.status).toBe(201);
    const token = (issued.body as { magicLinkToken: string }).magicLinkToken;
    const [body, sig] = token.split('.');
    const claims = JSON.parse(Buffer.from(body!, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >;
    // The same claims, expired, signed with the server's own key (MagicLinkService's private signer).
    const magicLink = app.get(MagicLinkService) as unknown as {
      sign(p: Record<string, unknown>): string;
    };
    const expired = magicLink.sign({ ...claims, exp: Date.now() - 1000 });
    const tampered = `${body}.${sig![0] === 'A' ? 'B' : 'A'}${sig!.slice(1)}`;

    const late = await http().get(`/api/v1/vendor/rfq/${encodeURIComponent(expired)}`);
    expect(late.status).toBe(401);
    expect(late.body).toMatchObject({
      error: { code: 'COS-VND-004', messageKey: 'vendor.invitation.expired' },
    });
    const forged = await http().get(`/api/v1/vendor/rfq/${encodeURIComponent(tampered)}`);
    expect(forged.status).toBe(401);
    expect(forged.body).toMatchObject({
      error: { code: 'COS-VND-002', messageKey: 'vendor.invitation.tokenMismatch' },
    });
  });

  // fix/vendor-open-rfq-relationship: opening an RFQ through its magic link now needs the same standing as quoting.
  // A vendor revoked after it was invited could still read the RFQ until the invitation expired.
  it('a revoked vendor can no longer open the RFQ it was invited to', async () => {
    const vendorA = await createVendor();
    const rfq = await seedRfq();
    const email = 'dao.reinvite@example.com';
    const issued = await invite(rfq, vendorA, email);
    expect(issued.status).toBe(201);
    const token = (issued.body as { magicLinkToken: string }).magicLinkToken;

    const open = () => http().get(`/api/v1/vendor/rfq/${encodeURIComponent(token)}`);
    const before = await open();
    expect(before.status).toBe(200);
    expect((before.body as { rfq_id: string }).rfq_id).toBe(rfq);

    await infra.prisma.$executeRawUnsafe(
      `UPDATE platform.vendor_trading_relationships r SET status = 'REVOKED'
         FROM platform.vendor_identities i
        WHERE i.vendor_identity_id = r.vendor_identity_id AND i.email = $1 AND r.tenant_id = $2::uuid`,
      email,
      TENANT_ID,
    );

    const after = await open();
    expect(after.status).toBe(403);
    expect(after.body).toMatchObject({
      error: { code: 'COS-VND-005', messageKey: 'vendor.relationship.inactive' },
    });
  });

  it('a vendor identity disabled network-wide can no longer open the RFQ either', async () => {
    const vendorA = await createVendor();
    const rfq = await seedRfq();
    const email = 'kaew.reinvite@example.com';
    const issued = await invite(rfq, vendorA, email);
    expect(issued.status).toBe(201);
    const token = (issued.body as { magicLinkToken: string }).magicLinkToken;
    const open = () => http().get(`/api/v1/vendor/rfq/${encodeURIComponent(token)}`);
    expect((await open()).status).toBe(200);

    // The relationship stays ACTIVE; the identity is disabled across the network (an operator edit).
    await infra.prisma.$executeRawUnsafe(
      `UPDATE platform.vendor_identities SET is_active = false WHERE email = $1`,
      email,
    );
    expect(await relationshipsOf(email)).toEqual([{ vendor_id: vendorA, status: 'ACTIVE' }]);
    const after = await open();
    expect(after.status).toBe(403);
    expect(after.body).toMatchObject({
      error: { code: 'COS-VND-005', messageKey: 'vendor.relationship.inactive' },
    });
  });

  // fix/vendor-invite-inactive: a deactivated (soft-deleted) vendor is not one to invite, and an identity disabled
  // across the network gets no invitation it could neither open nor answer.
  it('a deactivated vendor cannot be invited: 404 COS-VND-006, nothing written', async () => {
    const vendor = await createVendor();
    const rfq = await seedRfq();
    const gone = await http()
      .delete(`/api/v1/procurement/vendors/${vendor}`)
      .set('x-test-role', 'PROC_MANAGER');
    expect(gone.status).toBe(204);

    const email = 'ploy.reinvite@example.com';
    const res = await invite(rfq, vendor, email);
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({
      error: {
        code: 'COS-VND-006',
        message: 'Vendor not found',
        messageKey: 'vendor.vendor.notFound',
      },
    }); // plan DR
    expect(await relationshipsOf(email)).toEqual([]);
    expect(await invitationsFor(rfq)).toBe(0);
  });

  it('an identity disabled across the network cannot be invited: 409 COS-VND-009, nothing written', async () => {
    const vendorA = await createVendor();
    const vendorB = await createVendor();
    const rfq = await seedRfq();
    const email = 'fon.reinvite@example.com';
    expect((await invite(rfq, vendorA, email)).status).toBe(201);
    await infra.prisma.$executeRawUnsafe(
      `UPDATE platform.vendor_identities SET is_active = false WHERE email = $1`,
      email,
    );

    for (const vendor of [vendorA, vendorB]) {
      const res = await invite(rfq, vendor, email);
      expect(res.status).toBe(409);
      expect(res.body).toEqual({
        error: expect.objectContaining({
          code: 'COS-VND-009',
          message: 'This e-mail is disabled across the vendor network',
        }),
      });
    }
    expect(await relationshipsOf(email)).toEqual([{ vendor_id: vendorA, status: 'ACTIVE' }]);
    expect(await invitationsFor(rfq)).toBe(1); // the one issued before it was disabled
  });

  // fix/vendor-portal-inactive-vendor: a vendor deactivated after it was invited keeps no standing — on the
  // invitation's magic link (Tier 1) or with the session it was given on quoting (Tier 2).
  it('a vendor deactivated after it was invited can no longer open, quote or use its session', async () => {
    const vendor = await createVendor();
    const rfq = await seedRfq();
    const email = 'mint.reinvite@example.com';
    const tokenOf = async (): Promise<string> => {
      const res = await invite(rfq, vendor, email);
      expect(res.status).toBe(201);
      return (res.body as { magicLinkToken: string }).magicLinkToken;
    };
    const first = await tokenOf();
    const second = await tokenOf(); // ACTIVE: re-invited as before
    const quote = (token: string) =>
      http()
        .post(`/api/v1/vendor/rfq/${encodeURIComponent(token)}/quotation`)
        .send({ total_amount: '1000.00', currency_code: 'THB', validity_days: 30 });
    const quoted = await quote(first);
    expect(quoted.status).toBe(201);
    const session = (quoted.body as { vendorSession: string }).vendorSession;
    const tier2 = () =>
      http()
        .get('/api/v1/vendor/quotations')
        .set('authorization', `Bearer ${session}`)
        .set('x-vendor-tenant-id', TENANT_ID);
    expect((await tier2()).status).toBe(200);
    expect((await http().get(`/api/v1/vendor/rfq/${encodeURIComponent(second)}`)).status).toBe(200);

    const gone = await http()
      .delete(`/api/v1/procurement/vendors/${vendor}`)
      .set('x-test-role', 'PROC_MANAGER');
    expect(gone.status).toBe(204);

    const opened = await http().get(`/api/v1/vendor/rfq/${encodeURIComponent(second)}`);
    expect(opened.status).toBe(403);
    expect(opened.body).toMatchObject({
      error: { code: 'COS-VND-005', messageKey: 'vendor.relationship.inactive' },
    });
    const again = await quote(second);
    expect(again.status).toBe(403);
    const quotations = await infra.prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
      `SELECT count(*) AS n FROM procurement.quotations WHERE rfq_id = $1::uuid`,
      rfq,
    );
    expect(Number(quotations[0]!.n)).toBe(1); // the one quoted while ACTIVE
    const session403 = await tier2();
    expect(session403.status).toBe(403);
    expect(session403.body).toMatchObject({
      error: {
        code: 'COS-VND-005',
        message: 'No active trading relationship with this tenant',
        messageKey: 'vendor.relationship.inactive',
      },
    });
  });

  // fix/quotation-duplicate-and-closed-rfq: through the portal, one quotation per vendor per RFQ (a second invitation
  // to the same RFQ answered → 409, was a 500), and only while the RFQ is PUBLISHED (was taken for a closed one).
  describe('portal quotations: one per vendor per RFQ, while the RFQ is open', () => {
    const quoteWith = (token: string) =>
      http()
        .post(`/api/v1/vendor/rfq/${encodeURIComponent(token)}/quotation`)
        .send({ total_amount: '500.00', currency_code: 'THB', validity_days: 30 });
    const tokenFor = async (rfq: string, vendor: string, email: string): Promise<string> => {
      const res = await invite(rfq, vendor, email);
      expect(res.status).toBe(201);
      return (res.body as { magicLinkToken: string }).magicLinkToken;
    };
    const quotationsOn = async (rfq: string): Promise<number> => {
      const rows = await infra.prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
        `SELECT count(*) AS n FROM procurement.quotations WHERE rfq_id = $1::uuid`,
        rfq,
      );
      return Number(rows[0]!.n);
    };
    const invitationStatus = async (rfq: string): Promise<string[]> => {
      const rows = await infra.prisma.$queryRawUnsafe<Array<{ status: string }>>(
        `SELECT status FROM procurement.rfq_invitations WHERE rfq_id = $1::uuid ORDER BY created_at`,
        rfq,
      );
      return rows.map((r) => r.status);
    };

    it('a second invitation to the same RFQ, answered: 409 COS-VND-010, one quotation, that invitation still PENDING', async () => {
      const vendor = await createVendor();
      const rfq = await seedRfq();
      const email = 'yai.reinvite@example.com';
      const first = await tokenFor(rfq, vendor, email);
      const second = await tokenFor(rfq, vendor, email);
      expect((await quoteWith(first)).status).toBe(201);

      const again = await quoteWith(second);
      expect(again.status).toBe(409);
      expect(again.body).toEqual({
        error: expect.objectContaining({
          code: 'COS-VND-010',
          message: 'A quotation from this vendor already exists for this RFQ',
        }),
      });
      expect(await quotationsOn(rfq)).toBe(1);
      expect(await invitationStatus(rfq)).toEqual(['RESPONDED', 'PENDING']);
    });

    it('an RFQ no longer PUBLISHED: 422 COS-VND-011, nothing written', async () => {
      const vendor = await createVendor();
      const rfq = await seedRfq();
      const token = await tokenFor(rfq, vendor, 'som.reinvite@example.com');
      await infra.prisma.$executeRawUnsafe(
        `UPDATE procurement.rfqs SET status = 'CLOSED' WHERE rfq_id = $1::uuid`,
        rfq,
      );
      const res = await quoteWith(token);
      expect(res.status).toBe(422);
      expect((res.body as { error: { code: string } }).error.code).toBe('COS-VND-011');
      expect(await quotationsOn(rfq)).toBe(0);
      expect(await invitationStatus(rfq)).toEqual(['PENDING']);
    });

    // plan CT (product owner, 2026-11-20): past its deadline the RFQ is not open, though the workflow has not closed it.
    it('a PUBLISHED RFQ past its deadline: 422 COS-VND-011, nothing written', async () => {
      const vendor = await createVendor();
      const rfq = await seedRfq();
      const token = await tokenFor(rfq, vendor, 'chai.deadline@example.com');
      await infra.prisma.$executeRawUnsafe(
        `UPDATE procurement.rfqs SET deadline = now() - interval '1 minute' WHERE rfq_id = $1::uuid`,
        rfq,
      );
      const res = await quoteWith(token);
      expect(res.status).toBe(422);
      expect((res.body as { error: { code: string } }).error.code).toBe('COS-VND-011');
      expect(await quotationsOn(rfq)).toBe(0);
      expect(await invitationStatus(rfq)).toEqual(['PENDING']);
    });
  });
});

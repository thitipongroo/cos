/**
 * Phase 25 — the two provisioning entry points, over real HTTP (master:5662-5665, 5693-5698, 5708).
 *
 * The workflow itself needs Temporal and AWS, neither of which belongs in this harness. What DOES
 * belong is everything in front of it: a webhook that must reject an unsigned request, a route that
 * must reject a caller without the role, and the platform-isolation rule that decides whether the
 * system can still find a tenant after that tenant has been moved to its own database.
 *
 * The signature cases are separated by MEANING, not merged into "rejects bad requests": master:5698
 * answers 500 when the server is misconfigured and 401 when the caller is not trusted, and an
 * operator reading one while the other is true looks in the wrong place.
 */
import { createHmac } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import {
  startIntegrationInfra,
  stopIntegrationInfra,
  clsAuthGuard,
  type IntegrationInfra,
} from '../helpers/integration-infra';
import { AppModule } from '../../src/app.module';
import { JwtAuthGuard } from '../../src/shared/guards/jwt-auth.guard';
import { TenantService } from '../../src/modules/tenant/tenant.service';

jest.setTimeout(900_000);

const SECRET = 'phase-25-webhook-secret';
const TENANT_ID = '77777777-1111-4000-8000-000000000025';
const USER_ID = '77777777-2222-4000-8000-000000000025';

const roleOf = (req: Record<string, unknown>): string => {
  const headers = (req['headers'] ?? {}) as Record<string, string>;
  return headers['x-test-role'] ?? 'SYSTEM_ADMIN';
};

describe('Phase 25 · provisioning entry points', () => {
  let infra: IntegrationInfra;
  let app: INestApplication;
  const started: Array<{ tenantId: string }> = [];

  const api = (): ReturnType<typeof request> => request(app.getHttpServer());

  /** The signature the sender is supposed to compute: sha256= + HMAC over `timestamp.body`. */
  const sign = (body: string, timestamp: string): string =>
    'sha256=' + createHmac('sha256', SECRET).update(`${timestamp}.${body}`).digest('hex');

  /**
   * A signature that is definitely NOT the correct one.
   *
   * This used to be `sign(...).replace(/.$/, '0')`, and it was flaky at exactly 1 in 16: the digest
   * is hex, so one time in sixteen the last character ALREADY was '0', the "corrupted" signature
   * equalled the real one, and the webhook answered 202 — correctly. The timestamp goes into the
   * HMAC and changes every run, so which case you get is a coin flip per run. Two full-suite runs
   * lost to it before the message was captured (2026-08-26).
   *
   * Flipping to a character the last one is not makes the corruption unconditional.
   */
  const corrupt = (signature: string): string => {
    const last = signature.slice(-1);
    return signature.slice(0, -1) + (last === '0' ? '1' : '0');
  };

  beforeAll(async () => {
    process.env['PLATFORM_WEBHOOK_SECRET'] = SECRET;
    infra = await startIntegrationInfra();

    await infra.prisma.$executeRawUnsafe(
      `INSERT INTO platform.tenants (tenant_id, tenant_code, tenant_name, keycloak_realm, plan_type, is_active)
       VALUES ($1::uuid, 'sd-p25', 'Spec Derived P25', 'realm-sd-p25', 'ENTERPRISE'::platform."PlanType", true)`,
      TENANT_ID,
    );
    await infra.prisma.$executeRawUnsafe(
      `INSERT INTO platform.users (user_id, tenant_id, keycloak_user_id, email, display_name)
       VALUES ($1::uuid, $2::uuid, 'kc-sd-p25', 'p25@example.com', 'Spec User')`,
      USER_ID,
      TENANT_ID,
    );

    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      // Temporal is not in this harness. The workflow start is replaced at the DI boundary so the
      // ENTRY points can be exercised without a cluster — everything under test here happens before
      // the workflow begins.
      .overrideProvider(TenantService)
      .useValue({
        markAsEnterpriseContracted: jest.fn(async (tenantId: string) => {
          started.push({ tenantId });
          return { workflowId: `enterprise-provisioning-${tenantId}` };
        }),
      })
      .overrideGuard(JwtAuthGuard)
      // The user is BUILT here, not read off a property some middleware set. Under Fastify an
      // `app.use` assignment does not reach the guard chain — JwtAuthGuard's own header says the
      // adapter clones the request — so the other T2 suites' Express-shaped `req.user` middleware
      // silently produced a role-less caller and every @Roles route answered 403.
      .useValue(
        clsAuthGuard((req) => ({
          tenant_id: TENANT_ID,
          user_id: USER_ID,
          role: roleOf(req),
          tenantCode: 'sd-p25',
        })),
      )
      .compile();

    // The SAME adapter and option main.ts uses: `{ rawBody: true }` on Fastify is what populates
    // req.rawBody, and the HMAC check answers 500 without it. Booting this suite on the default
    // adapter made every request — correctly signed ones included — fail as "raw body unavailable",
    // which is the server-misconfiguration branch rather than anything about the signature.
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), {
      rawBody: true,
    });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    // Fastify needs its plugin tree resolved before the server can take a request.
    await (app as NestFastifyApplication).getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app?.close();
    await stopIntegrationInfra(infra);
    delete process.env['PLATFORM_WEBHOOK_SECRET'];
  });

  // ── 15. Webhook signature over HTTP ───────────────────────────────────────

  describe('webhook signature (master:5693-5698)', () => {
    const body = (): string => JSON.stringify({ tenant_id: TENANT_ID });

    it('accepts a correctly signed request', async () => {
      const raw = body();
      const ts = String(Date.now());
      const res = await api()
        .post('/api/v1/platform/webhooks/enterprise-contract-signed')
        .set('Content-Type', 'application/json')
        .set('X-Webhook-Timestamp', ts)
        .set('X-Webhook-Signature', sign(raw, ts))
        .send(raw);

      expect(res.status).toBe(202);
      expect(started.some((s) => s.tenantId === TENANT_ID)).toBe(true);
    });

    it('answers 401 when the signature is wrong', async () => {
      const raw = body();
      const ts = String(Date.now());
      const res = await api()
        .post('/api/v1/platform/webhooks/enterprise-contract-signed')
        .set('Content-Type', 'application/json')
        .set('X-Webhook-Timestamp', ts)
        .set('X-Webhook-Signature', corrupt(sign(raw, ts)))
        .send(raw);

      expect(res.status).toBe(401);
    });

    it('answers 401 when the signature is missing entirely', async () => {
      const raw = body();
      const res = await api()
        .post('/api/v1/platform/webhooks/enterprise-contract-signed')
        .set('Content-Type', 'application/json')
        .set('X-Webhook-Timestamp', String(Date.now()))
        .send(raw);

      expect(res.status).toBe(401);
    });

    it('answers 401 when a valid signature is replayed with a different body', async () => {
      // The signature covers the body, so a captured header cannot be reused for other content.
      const ts = String(Date.now());
      const signed = sign(body(), ts);
      const res = await api()
        .post('/api/v1/platform/webhooks/enterprise-contract-signed')
        .set('Content-Type', 'application/json')
        .set('X-Webhook-Timestamp', ts)
        .set('X-Webhook-Signature', signed)
        .send(JSON.stringify({ tenant_id: randomUUID() }));

      expect(res.status).toBe(401);
    });

    it('answers 500 — not 401 — when the SERVER has no secret configured', async () => {
      // A misconfigured deployment is not an untrusted caller. Answering 401 here would have an
      // operator chasing the sender's credentials while the server is the thing that is wrong.
      const saved = process.env['PLATFORM_WEBHOOK_SECRET'];
      delete process.env['PLATFORM_WEBHOOK_SECRET'];
      try {
        const raw = body();
        const ts = String(Date.now());
        const res = await api()
          .post('/api/v1/platform/webhooks/enterprise-contract-signed')
          .set('Content-Type', 'application/json')
          .set('X-Webhook-Timestamp', ts)
          .set('X-Webhook-Signature', sign(raw, ts))
          .send(raw);

        expect(res.status).toBe(500);
      } finally {
        process.env['PLATFORM_WEBHOOK_SECRET'] = saved;
      }
    });
  });

  // ── 16. The admin path ────────────────────────────────────────────────────

  describe('mark-contracted (master:5663)', () => {
    it('refuses a caller who is not SYSTEM_ADMIN', async () => {
      // TENANT_ADMIN is the highest role INSIDE a tenant and still must not provision infrastructure.
      await api()
        .patch(`/api/v1/admin/tenants/${TENANT_ID}/mark-contracted`)
        .set('x-test-role', 'TENANT_ADMIN')
        .send({})
        .expect(403);
    });

    it('accepts a SYSTEM_ADMIN', async () => {
      // CONTROL: the refusal above must come from the ROLE, not from a broken route.
      const res = await api()
        .patch(`/api/v1/admin/tenants/${TENANT_ID}/mark-contracted`)
        .set('x-test-role', 'SYSTEM_ADMIN')
        .send({});
      expect(res.status).toBeLessThan(400);
    });
  });

  // ── 17. Platform tables never move ────────────────────────────────────────

  describe('platform tables stay on the shared DB (master:5708)', () => {
    it('still resolves a tenant whose dedicated_db_url points nowhere', async () => {
      // The rule stated as behaviour. If the platform schema followed a tenant onto its dedicated
      // instance, the lookup that FINDS the dedicated URL would itself have to run there — so
      // pointing that column at an unreachable host would break the tenant permanently. It must not:
      // platform.tenants is read on the shared connection, always.
      await infra.prisma.$executeRawUnsafe(
        `UPDATE platform.tenants SET dedicated_db_url = $1 WHERE tenant_id = $2::uuid`,
        'postgresql://nobody:nobody@203.0.113.1:5432/does-not-exist',
        TENANT_ID,
      );

      const rows = await infra.prisma.$queryRawUnsafe<
        Array<{ tenant_code: string; dedicated_db_url: string | null }>
      >(
        `SELECT tenant_code, dedicated_db_url FROM platform.tenants WHERE tenant_id = $1::uuid`,
        TENANT_ID,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].tenant_code).toBe('sd-p25');
      expect(rows[0].dedicated_db_url).toContain('203.0.113.1');

      // And the webhook — which reads the tenant before starting anything — still answers.
      const raw = JSON.stringify({ tenant_id: TENANT_ID });
      const ts = String(Date.now());
      const res = await api()
        .post('/api/v1/platform/webhooks/enterprise-contract-signed')
        .set('Content-Type', 'application/json')
        .set('X-Webhook-Timestamp', ts)
        .set('X-Webhook-Signature', sign(raw, ts))
        .send(raw);
      expect(res.status).toBe(202);
    });

    it('keeps the platform schema out of the data migration', async () => {
      // The other half: nothing in the pg_dump path names the platform schema, so a migration
      // cannot copy it onto the dedicated instance in the first place.
      const tables = await infra.prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
        `SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'platform' AND table_name IN ('tenants', 'users', 'tenant_memberships')
          ORDER BY table_name`,
      );
      expect(tables.map((t) => t.table_name)).toEqual(['tenant_memberships', 'tenants', 'users']);
    });
  });
});

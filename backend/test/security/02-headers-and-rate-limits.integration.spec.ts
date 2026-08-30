/**
 * Phase 16 — secure headers and rate limiting, observed on real responses
 * (master:4486-4488, 4514-4519, 4535-4541).
 *
 * WHY TRUSTED_PROXY_CIDRS IS SET HERE. `resolveTrustProxy()` returns false when the variable is
 * unset, so Fastify reports the TCP peer as `request.ip` — which for every supertest call is
 * 127.0.0.1. All requests would then share ONE rate-limit bucket and no per-IP behaviour could be
 * observed at all. Trusting the loopback peer lets each test choose its own X-Forwarded-For, and in
 * doing so exercises the security property itself: the limit must key on the caller, not the edge.
 */
process.env['TRUSTED_PROXY_CIDRS'] = '127.0.0.1/32,::1/128';

jest.mock('@aws-sdk/client-sns', () => ({
  SNSClient: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({ MessageId: 'mock-msg-id' }),
  })),
  PublishCommand: jest.fn(),
}));

import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import {
  startIntegrationInfra,
  stopIntegrationInfra,
  clsAuthGuard,
  type IntegrationInfra,
} from '../helpers/integration-infra';
import { AppModule } from '../../src/app.module';
import { JwtAuthGuard } from '../../src/shared/guards/jwt-auth.guard';
import { resolveTrustProxy } from '../../src/shared/net/trusted-proxy';

const TENANT_ID = 'bbbb1111-1111-4000-8000-000000000160';
const USER_ID = 'bbbb2222-2222-4000-8000-000000000160';

/** A fresh caller address per test — each gets its own rate-limit bucket. */
let ipCounter = 0;
const nextIp = (): string => {
  ipCounter += 1;
  return `203.0.113.${ipCounter}`;
};

describe('Phase 16 · secure headers and rate limits on live responses', () => {
  let infra: IntegrationInfra;
  let app: NestFastifyApplication;

  beforeAll(async () => {
    infra = await startIntegrationInfra();
    await infra.prisma.$executeRawUnsafe(
      `INSERT INTO platform.tenants (tenant_id, tenant_code, tenant_name, keycloak_realm, plan_type, is_active)
       VALUES ($1::uuid, 'sd-p160', 'Spec Derived P16', 'realm-p160', 'STARTER'::platform."PlanType", true)`,
      TENANT_ID,
    );
    await infra.prisma.$executeRawUnsafe(
      `INSERT INTO platform.users (user_id, tenant_id, keycloak_user_id, phone_number, email, display_name)
       VALUES ($1::uuid, $2::uuid, 'kc-p160', '+66890000160', 'p160@example.com', 'P160')`,
      USER_ID,
      TENANT_ID,
    );

    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard(JwtAuthGuard)
      .useValue(clsAuthGuard((req) => (req['user'] ?? {}) as Record<string, string>))
      .compile();

    // A Fastify adapter, not the default — trustProxy is a Fastify option and the whole point here
    // is that request.ip comes from the forwarded header rather than the peer.
    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({ logger: false, trustProxy: resolveTrustProxy() }),
    );
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.use((req: Record<string, unknown>, _res: unknown, next: () => void) => {
      req['user'] = {
        tenant_id: TENANT_ID,
        user_id: USER_ID,
        role: 'TENANT_ADMIN',
        tenantCode: 'sd-p160',
      };
      next();
    });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app?.close();
    await stopIntegrationInfra(infra);
  });

  const http = () => request(app.getHttpServer());

  describe('secure headers (master:4535-4541)', () => {
    it.each([
      ['strict-transport-security', 'max-age=31536000; includeSubDomains'],
      ['x-content-type-options', 'nosniff'],
      ['x-frame-options', 'DENY'],
      ['content-security-policy', "default-src 'self'"],
      ['referrer-policy', 'strict-origin-when-cross-origin'],
    ])('%s is present on a real response', async (header, value) => {
      // Asserted on the RESPONSE, not on the middleware source: a header set by a middleware that
      // is never registered looks identical in code review.
      const res = await http().get('/api/v1/projects').set('x-forwarded-for', nextIp());
      expect(res.headers[header]).toBe(value);
    });

    it('sets them on an error response too', async () => {
      // An error path that skipped the headers would leave exactly the responses an attacker is
      // most likely to be probing unprotected.
      const res = await http()
        .get(`/api/v1/no-such-route-${randomUUID()}`)
        .set('x-forwarded-for', nextIp());
      expect(res.status).toBe(404);
      expect(res.headers['x-frame-options']).toBe('DENY');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });

    it('leaks no server fingerprint', async () => {
      // Not in the spec's list, but the same middleware owns it: an x-powered-by tells a scanner
      // which CVE list to try first.
      const res = await http().get('/api/v1/projects').set('x-forwarded-for', nextIp());
      expect(res.headers['x-powered-by']).toBeUndefined();
    });
  });

  describe('rate limiting (master:4486-4488)', () => {
    /**
     * Fire `n` OTP requests from one address, each for a DIFFERENT phone number.
     *
     * The phone must vary. OtpService keeps its own per-phone resend cooldown in Redis (§5.5
     * send-rate cap) plus a per-phone daily cap, so repeating one number returns 429 from the
     * SERVICE on the second call — a first draft of this test measured that and would have passed
     * with the IP throttler switched off entirely. Varying the number leaves the per-IP limit as the
     * only thing that can produce a 429.
     */
    let phoneSeq = 0;
    const burst = async (ip: string, n: number): Promise<number[]> => {
      const statuses: number[] = [];
      for (let i = 0; i < n; i += 1) {
        phoneSeq += 1;
        const phoneNumber = `+6681${String(2000000 + phoneSeq).padStart(7, '0')}`;
        const res = await http()
          .post('/api/v1/auth/otp/request')
          .set('x-forwarded-for', ip)
          .send({ phoneNumber });
        statuses.push(res.status);
      }
      return statuses;
    };

    it('auth endpoints refuse the eleventh request in a minute', async () => {
      // "Auth endpoints: 10 req/min per IP (brute force protection)". The tier that matters most:
      // at the general 100/min default an attacker gets ten times as many password guesses.
      const statuses = await burst(nextIp(), 12);
      expect(statuses.filter((s) => s === 429).length).toBeGreaterThan(0);
      // And the first ten were NOT throttled. Without this the test would also pass at a limit of
      // one — which is what a per-phone cooldown looks like, and is not the control under test.
      expect(statuses.slice(0, 10).every((s) => s !== 429)).toBe(true);
    });

    it('throttles per caller, not per edge', async () => {
      // THE F3 FIX, asserted as behaviour. Without trustProxy every user behind one Cloudflare
      // address shares a bucket, so one attacker exhausting /auth locks out everyone behind that
      // edge — a self-inflicted denial of service.
      const attacker = nextIp();
      await burst(attacker, 12);

      const bystander = nextIp();
      const fresh = await burst(bystander, 1);
      expect(fresh[0]).not.toBe(429);
    });

    it('does not apply the auth limit to ordinary API traffic', async () => {
      // The general tier is 100/min. Twelve requests must pass, or the strict auth limit has leaked
      // onto every route and normal use would break at the eleventh click.
      const ip = nextIp();
      const statuses: number[] = [];
      for (let i = 0; i < 12; i += 1) {
        const res = await http().get('/api/v1/projects').set('x-forwarded-for', ip);
        statuses.push(res.status);
      }
      expect(statuses.filter((s) => s === 429)).toHaveLength(0);
    });

    it('answers 429, not 500, when the limit is reached', async () => {
      // master:4516-4519 fixes the code: a throttled caller must be told to slow down, not shown a
      // server error — and APIHighErrorRate counts 5xx, so a 500 here would page on-call for
      // working rate limiting.
      const statuses = await burst(nextIp(), 12);
      expect(statuses).not.toContain(500);
      expect(statuses).toContain(429);
    });
  });
});

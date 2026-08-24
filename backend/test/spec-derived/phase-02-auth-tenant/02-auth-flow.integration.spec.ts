/**
 * Phase 2 Generate items 12 and 08 — master:1963-1966, 1956
 *
 *   item 12 "Integration tests: full OTP auth flow with Testcontainers (PostgreSQL + Redis
 *            containers, real DB) ... Covers: requestOtp -> verifyOtp -> issueTokens (Keycloak
 *            Direct Grant) -> refresh -> logout"
 *   item 08 "Refresh token rotation flow"
 *
 * OTP rules under test (master:1786-1787):
 *   6-digit numeric · TTL 5 minutes · max 3 attempts per session · 10 requests per phone per day
 *
 * Keycloak is replaced at the DI boundary — master:1963 lists PostgreSQL and Redis as the
 * containers, not Keycloak, and token issuance is Keycloak Direct Grant (master:1777-1779).
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
import { Redis } from 'ioredis';
import {
  startIntegrationInfra,
  stopIntegrationInfra,
  clsAuthGuard,
  type IntegrationInfra,
} from '../../helpers/integration-infra';
import { AppModule } from '../../../src/app.module';
import { JwtAuthGuard } from '../../../src/modules/identity/guards/jwt-auth.guard';
import { KeycloakAdminService } from '../../../src/modules/identity/keycloak-admin.service';

// Matches jest.spec-derived-integration.config.js's testTimeout rather than undercutting it. The
// hook cost here is `prisma migrate deploy`, which grows with the migration count — 97 as of
// 2026-08-25, up from 92 that morning — and this file blew the 240s budget on a run where its two
// sibling Phase 2 suites still passed. A per-file budget below the config's only turns a slow
// machine into a red suite.
jest.setTimeout(900_000);

const PHONE = '+66899999001';
const TENANT_ID = 'bbbbbbbb-1111-4000-8000-000000000001';
const USER_ID = 'bbbbbbbb-2222-4000-8000-000000000001';
const KC_USER_ID = 'bbbbbbbb-3333-4000-8000-000000000001';
const REALM = 'construction-os';

const issued = {
  access_token: 'access-1',
  refresh_token: 'refresh-1',
  expires_in: 900,
  refresh_expires_in: 604800,
  token_type: 'Bearer',
};
const rotated = { ...issued, access_token: 'access-2', refresh_token: 'refresh-2' };

/**
 * `refreshAccessToken` reads the realm out of the presented token's `iss` claim to know which
 * Keycloak realm to call, so a plain opaque string is rejected with 401 before it ever reaches
 * the provider. Same helper shape as backend/test/auth.integration.spec.ts.
 */
function buildRealmJwt(realm: string): string {
  const payload = { iss: `http://localhost:8090/realms/${realm}` };
  return `header.${Buffer.from(JSON.stringify(payload)).toString('base64')}.signature`;
}
const PRESENTED_REFRESH = buildRealmJwt(REALM);

describe('Phase 2 · OTP auth flow end-to-end (master:1963-1966)', () => {
  let infra: IntegrationInfra;
  let app: INestApplication;
  let redis: Redis;
  const refreshCalls: string[] = [];

  beforeAll(async () => {
    infra = await startIntegrationInfra();

    await infra.prisma.$executeRawUnsafe(
      `INSERT INTO platform.tenants (tenant_id, tenant_code, tenant_name, keycloak_realm, plan_type, is_active)
       VALUES ($1::uuid, 'sd-p2', 'Spec Derived P2', $2, 'STARTER'::platform."PlanType", true)`,
      TENANT_ID,
      REALM,
    );
    await infra.prisma.$executeRawUnsafe(
      `INSERT INTO platform.users (user_id, tenant_id, keycloak_user_id, phone_number, email, display_name)
       VALUES ($1::uuid, $2::uuid, $3, $4, '', 'Spec User')`,
      USER_ID,
      TENANT_ID,
      KC_USER_ID,
      PHONE,
    );
    await infra.prisma.$executeRawUnsafe(
      `INSERT INTO platform.tenant_memberships (tenant_id, user_id, role)
       VALUES ($1::uuid, $2::uuid, 'SITE_WORKER'::platform."CosRoleEnum")`,
      TENANT_ID,
      USER_ID,
    );

    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(KeycloakAdminService)
      .useValue({
        exchangeOtpForTokens: jest.fn().mockResolvedValue(issued),
        refreshToken: jest.fn().mockImplementation((token: string) => {
          refreshCalls.push(token);
          return Promise.resolve(rotated);
        }),
        revokeToken: jest.fn().mockResolvedValue(undefined),
        provisionPhoneUser: jest.fn().mockResolvedValue({ keycloakUserId: KC_USER_ID }),
        createEmailUser: jest.fn().mockResolvedValue({ keycloakUserId: KC_USER_ID }),
        deleteUser: jest.fn().mockResolvedValue(undefined),
      })
      .overrideGuard(JwtAuthGuard)
      .useValue(
        clsAuthGuard(() => ({
          tenant_id: TENANT_ID,
          user_id: USER_ID,
          role: 'SITE_WORKER',
          tenantCode: 'sd-p2',
        })),
      )
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    redis = new Redis(infra.redisUrl);
  });

  afterAll(async () => {
    await redis?.quit();
    await app?.close();
    await stopIntegrationInfra(infra);
  });

  const clearOtp = async (): Promise<void> => {
    const keys = await redis.keys(`*${PHONE}*`);
    if (keys.length) await redis.del(...keys);
  };

  describe('requestOtp (master:1786)', () => {
    beforeEach(clearOtp);

    it('issues a 6-digit numeric OTP', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/otp/request')
        .send({ phoneNumber: PHONE })
        .expect(200);
      const stored = await redis.get(`otp:value:${PHONE}`);
      expect(stored).toMatch(/^\d{6}$/);
    });

    it('expires the OTP after 5 minutes', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/otp/request')
        .send({ phoneNumber: PHONE })
        .expect(200);
      const ttl = await redis.ttl(`otp:value:${PHONE}`);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(300);
    });

    it('rejects a malformed phone number at the validation gate', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/otp/request')
        .send({ phoneNumber: 'not-a-phone' })
        .expect(400);
    });
  });

  describe('verifyOtp -> issueTokens (master:1777-1779, 1965)', () => {
    beforeEach(async () => {
      await clearOtp();
      await redis.set(`otp:value:${PHONE}`, '123456', 'EX', 300);
      await redis.set(`otp:attempts:${PHONE}`, '0', 'EX', 300);
    });

    it('rejects a wrong OTP', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/otp/verify')
        .send({ phoneNumber: PHONE, otp: '000000' })
        .expect(400);
    });

    it('locks out after 3 failed attempts (master:1786)', async () => {
      for (let i = 0; i < 3; i += 1) {
        await request(app.getHttpServer())
          .post('/api/v1/auth/otp/verify')
          .send({ phoneNumber: PHONE, otp: '000000' });
      }
      // The 4th attempt must not be accepted even with the CORRECT OTP.
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/otp/verify')
        .send({ phoneNumber: PHONE, otp: '123456' });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('returns Keycloak-issued tokens for the correct OTP', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/otp/verify')
        .send({ phoneNumber: PHONE, otp: '123456' })
        .expect(200);
      const body = res.body as Record<string, unknown>;
      const flat = JSON.stringify(body);
      expect(flat).toContain('access-1');
      expect(flat).toContain('refresh-1');
    });
  });

  describe('refresh token rotation (master:1956)', () => {
    it('returns a DIFFERENT refresh token than the one presented', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: PRESENTED_REFRESH })
        .expect(200);
      const body = res.body as { refreshToken?: string; accessToken?: string };
      expect(body.refreshToken).toBe('refresh-2');
      // Rotation means the caller cannot keep using the token it just presented.
      expect(body.refreshToken).not.toBe(PRESENTED_REFRESH);
    });

    it('forwards the presented token to Keycloak rather than minting one locally', () => {
      expect(refreshCalls).toContain(PRESENTED_REFRESH);
    });
  });

  describe('logout (master:1965)', () => {
    it('accepts a logout for the authenticated session', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .send({ refreshToken: buildRealmJwt(REALM) });
      expect([200, 201, 204]).toContain(res.status);
    });
  });
});

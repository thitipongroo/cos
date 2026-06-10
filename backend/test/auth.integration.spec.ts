// Auth integration tests — PostgreSQL + Redis Testcontainers; Keycloak mocked.
// Tests: OTP stored in real Redis, user looked up from real PostgreSQL, token flow end-to-end.
// Run via: pnpm test:integration

jest.mock('@aws-sdk/client-sns', () => ({
  SNSClient: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({ MessageId: 'mock-msg-id' }),
  })),
  PublishCommand: jest.fn(),
}));

import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, StartedRedisContainer } from '@testcontainers/redis';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Redis } from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { KeycloakAdminService } from '../src/modules/identity/keycloak-admin.service';
import type { KeycloakTokenResponse } from '../src/modules/identity/keycloak-admin.service';

const PHONE = '+66812345678';
const TEST_OTP = '654321';
const TENANT_ID = 'aaaaaaaa-1111-4000-8000-000000000001';
const USER_ID = 'aaaaaaaa-2222-4000-8000-000000000001';
const KC_USER_ID = 'aaaaaaaa-3333-4000-8000-000000000001';
const REALM = 'test-realm';

const mockTokens: KeycloakTokenResponse = {
  access_token: 'mock-access-token',
  refresh_token: 'mock-refresh-token',
  expires_in: 900,
  refresh_expires_in: 604800,
  token_type: 'Bearer',
};

const rotatedTokens: KeycloakTokenResponse = {
  access_token: 'rotated-access-token',
  refresh_token: 'rotated-refresh-token',
  expires_in: 900,
  refresh_expires_in: 604800,
  token_type: 'Bearer',
};

// Build a minimal JWT with a real-looking iss claim for realm extraction
function buildRealmJwt(realm: string): string {
  const payload = { iss: `http://localhost:8090/realms/${realm}` };
  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64');
  return `header.${b64}.signature`;
}

describe('Auth Integration (Testcontainers — PostgreSQL + Redis)', () => {
  let pgContainer: StartedPostgreSqlContainer;
  let redisContainer: StartedRedisContainer;
  let app: INestApplication;
  let redis: Redis;
  let prisma: PrismaClient;

  beforeAll(async () => {
    [pgContainer, redisContainer] = await Promise.all([
      new PostgreSqlContainer('postgres:16-alpine').start(),
      new RedisContainer('redis:7-alpine').start(),
    ]);

    const pgUrl = pgContainer.getConnectionUri();
    const redisUrl = `redis://${redisContainer.getHost()}:${redisContainer.getMappedPort(6379)}`;

    process.env['DATABASE_URL'] = pgUrl;
    process.env['REDIS_URL'] = redisUrl;

    // Run Prisma migrations — inline require avoids top-level import of node built-ins
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { execSync } = require('child_process') as typeof import('child_process');
    const backendDir = `${__dirname}/..`;
    execSync('pnpm prisma migrate deploy', {
      cwd: backendDir,
      env: { ...process.env, DATABASE_URL: pgUrl },
      stdio: 'inherit',
    });

    // Seed: tenant → user → membership
    prisma = new PrismaClient({ datasources: { db: { url: pgUrl } } });
    await prisma.$executeRaw`
      INSERT INTO platform.tenants (tenant_id, tenant_code, tenant_name, keycloak_realm, plan_type, is_active)
      VALUES (${TENANT_ID}::uuid, 'test-tenant', 'Test Tenant', ${REALM}, 'STARTER'::"PlanType", true)
    `;
    await prisma.$executeRaw`
      INSERT INTO platform.users (user_id, tenant_id, keycloak_user_id, phone_number, email, display_name)
      VALUES (${USER_ID}::uuid, ${TENANT_ID}::uuid, ${KC_USER_ID}, ${PHONE}, '', 'Test User')
    `;
    await prisma.$executeRaw`
      INSERT INTO platform.tenant_memberships (tenant_id, user_id, role)
      VALUES (${TENANT_ID}::uuid, ${USER_ID}::uuid, 'SITE_WORKER'::"CosRoleEnum")
    `;

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(KeycloakAdminService)
      .useValue({
        exchangeOtpForTokens: jest.fn().mockResolvedValue(mockTokens),
        refreshToken: jest.fn().mockResolvedValue(rotatedTokens),
        revokeToken: jest.fn().mockResolvedValue(undefined),
        provisionPhoneUser: jest.fn().mockResolvedValue({ keycloakUserId: KC_USER_ID }),
        createEmailUser: jest.fn().mockResolvedValue({ keycloakUserId: KC_USER_ID }),
        deleteUser: jest.fn().mockResolvedValue(undefined),
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    redis = new Redis(redisUrl);
  }, 120_000);

  afterAll(async () => {
    await redis.quit();
    await prisma.$disconnect();
    await app.close();
    await Promise.all([pgContainer.stop(), redisContainer.stop()]);
  });

  // ─── Health check ──────────────────────────────────────────────────────────

  describe('GET /api/v1/health/live', () => {
    it('returns 200 ok', () => {
      return request(app.getHttpServer())
        .get('/api/v1/health/live')
        .expect(200)
        .expect((res) => expect(res.body.status).toBe('ok'));
    });
  });

  // ─── OTP request ──────────────────────────────────────────────────────────

  describe('POST /api/v1/auth/otp/request', () => {
    it('rejects invalid phone number format', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/otp/request')
        .send({ phoneNumber: 'not-a-phone' })
        .expect(400);
    });

    it('stores OTP in real Redis and returns expiresInSeconds', async () => {
      await redis.del(`otp:value:${PHONE}`, `otp:attempts:${PHONE}`);

      await request(app.getHttpServer())
        .post('/api/v1/auth/otp/request')
        .send({ phoneNumber: PHONE })
        .expect(200)
        .expect((res) => expect(res.body.expiresInSeconds).toBe(300));

      const storedOtp = await redis.get(`otp:value:${PHONE}`);
      expect(storedOtp).toMatch(/^\d{6}$/);
    });
  });

  // ─── OTP verify → real DB lookup → Keycloak tokens ────────────────────────

  describe('POST /api/v1/auth/otp/verify', () => {
    beforeEach(async () => {
      // Seed a known OTP so verify tests are deterministic
      await redis.set(`otp:value:${PHONE}`, TEST_OTP, 'EX', 300);
      await redis.set(`otp:attempts:${PHONE}`, '0', 'EX', 300);
    });

    it('rejects OTP with wrong length (validation gate)', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/otp/verify')
        .send({ phoneNumber: PHONE, otp: '12345' }) // 5 digits
        .expect(400);
    });

    it('rejects wrong 6-digit OTP with 400', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/otp/verify')
        .send({ phoneNumber: PHONE, otp: '000000' })
        .expect(400);
    });

    it('verifies correct OTP → real PostgreSQL lookup → returns Keycloak RS256 tokens', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/otp/verify')
        .send({ phoneNumber: PHONE, otp: TEST_OTP })
        .expect(200)
        .expect((res) => {
          expect(res.body.accessToken).toBe('mock-access-token');
          expect(res.body.refreshToken).toBe('mock-refresh-token');
          expect(res.body.expiresIn).toBe(900);
          expect(res.body.refreshExpiresIn).toBe(604800);
        });
    });
  });

  // ─── Token refresh (Keycloak proxy with rotation) ─────────────────────────

  describe('POST /api/v1/auth/refresh', () => {
    it('proxies refresh grant to Keycloak and returns rotated tokens', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: buildRealmJwt(REALM) })
        .expect(200)
        .expect((res) => {
          expect(res.body.accessToken).toBe('rotated-access-token');
          expect(res.body.refreshToken).toBe('rotated-refresh-token');
        });
    });
  });

  // ─── Logout (Keycloak revocation) ─────────────────────────────────────────

  describe('POST /api/v1/auth/logout', () => {
    it('revokes refresh token and returns 200', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .send({ refreshToken: buildRealmJwt(REALM) })
        .expect(200);
    });
  });
});

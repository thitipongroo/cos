/**
 * Phase 2 Generate items 13 and 09 — master:1967-1991, 1957-1960
 *
 *   item 13 "User management API (TENANT_ADMIN only)":
 *             GET    /api/v1/users                    — list users in tenant (paginated)
 *             POST   /api/v1/users                    — Path A: phone; Path B: email+Keycloak
 *             PATCH  /api/v1/users/:userId/role       — change user role
 *             PATCH  /api/v1/users/:userId/deactivate — deactivate user
 *           "Guards: JwtAuthGuard + RolesGuard (TENANT_ADMIN only)"
 *           Path A/B both: Keycloak first, then platform.users + platform.tenant_memberships
 *   item 09 MFA/TOTP — "required for TENANT_ADMIN and FINANCE roles"
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
import { KeycloakAdminService } from '../../src/modules/identity/keycloak-admin.service';

// Set here rather than left to the config: backend/jest.integration.config.js defaults to 120s for
// the older route-shaped specs, and a container start plus `prisma migrate deploy` does not fit. The
// hook cost here is `prisma migrate deploy`, which grows with the migration count — 97 as of
// 2026-08-25, up from 92 that morning — and this file blew the 240s budget on a run where its two
// sibling Phase 2 suites still passed. A per-file budget below the config's only turns a slow
// machine into a red suite.
jest.setTimeout(900_000);

const TENANT_ID = 'cccccccc-1111-4000-8000-000000000001';
const ADMIN_ID = 'cccccccc-2222-4000-8000-000000000001';
// platform.users.keycloak_user_id is UNIQUE (master:1893), so Path A and Path B must come back
// with DIFFERENT Keycloak ids — a real Keycloak never returns the same subject for two users.
const KC_PATH_A = 'cccccccc-4444-4000-8000-00000000000a';
const KC_PATH_B = 'cccccccc-4444-4000-8000-00000000000b';
const REALM = 'construction-os';

/** The spec's guard rule is role-based, so the test user's role varies per request. */
const roleHeader = (req: Record<string, unknown>): string => {
  const headers = (req['headers'] ?? {}) as Record<string, string>;
  return headers['x-test-role'] ?? 'TENANT_ADMIN';
};

describe('Phase 2 · user management + MFA (master:1967-1991, 1957-1960)', () => {
  let infra: IntegrationInfra;
  let app: INestApplication;
  const provisionPhoneUser = jest.fn().mockResolvedValue({ keycloakUserId: KC_PATH_A });
  const createEmailUser = jest.fn().mockResolvedValue({ keycloakUserId: KC_PATH_B });

  beforeAll(async () => {
    infra = await startIntegrationInfra();

    await infra.prisma.$executeRawUnsafe(
      `INSERT INTO platform.tenants (tenant_id, tenant_code, tenant_name, keycloak_realm, plan_type, is_active)
       VALUES ($1::uuid, 'sd-p2-um', 'Spec Derived UM', $2, 'STARTER'::platform."PlanType", true)`,
      TENANT_ID,
      REALM,
    );
    await infra.prisma.$executeRawUnsafe(
      `INSERT INTO platform.users (user_id, tenant_id, keycloak_user_id, phone_number, email, display_name)
       VALUES ($1::uuid, $2::uuid, 'kc-admin-um', '+66899999900', 'admin@example.com', 'Admin')`,
      ADMIN_ID,
      TENANT_ID,
    );
    await infra.prisma.$executeRawUnsafe(
      `INSERT INTO platform.tenant_memberships (tenant_id, user_id, role)
       VALUES ($1::uuid, $2::uuid, 'TENANT_ADMIN'::platform."CosRoleEnum")`,
      TENANT_ID,
      ADMIN_ID,
    );

    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(KeycloakAdminService)
      // Method names taken from KeycloakAdminService itself, not guessed: user.service.ts calls
      // provisionPhoneUser, createEmailUser, syncUserRole, disableUser, setTemporaryPassword and
      // sendPasswordResetEmail. A missing name is `undefined` at the call site and surfaces as a
      // 500, which is how the first draft of this file failed.
      .useValue({
        provisionPhoneUser,
        createEmailUser,
        syncUserRole: jest.fn().mockResolvedValue(undefined),
        disableUser: jest.fn().mockResolvedValue(undefined),
        setTemporaryPassword: jest.fn().mockResolvedValue(undefined),
        sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
        deleteUser: jest.fn().mockResolvedValue(undefined),
        exchangeOtpForTokens: jest.fn(),
        refreshToken: jest.fn(),
        revokeToken: jest.fn(),
      })
      .overrideGuard(JwtAuthGuard)
      .useValue(
        clsAuthGuard((req) => ({
          tenant_id: TENANT_ID,
          user_id: ADMIN_ID,
          role: roleHeader(req),
          tenantCode: 'sd-p2-um',
        })),
      )
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await stopIntegrationInfra(infra);
  });

  describe('RBAC: TENANT_ADMIN only (master:1975)', () => {
    it('TENANT_ADMIN may list users', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/users')
        .set('x-test-role', 'TENANT_ADMIN');
      expect(res.status).toBe(200);
    });

    it.each(['SITE_WORKER', 'PROJECT_MANAGER', 'FINANCE'])('%s is refused', async (role) => {
      const res = await request(app.getHttpServer()).get('/api/v1/users').set('x-test-role', role);
      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/v1/users — Path A phone (master:1977-1983)', () => {
    it('provisions in Keycloak first, then persists user + membership', async () => {
      provisionPhoneUser.mockClear();
      const res = await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('x-test-role', 'TENANT_ADMIN')
        // CreateUserDto is snake_case (display_name / phone_number) and the app runs
        // ValidationPipe({ whitelist: true }), so camelCase keys are stripped and the request
        // fails validation with 400 rather than being accepted.
        .send({
          phone_number: '+66899999911',
          display_name: 'Path A User',
          role: 'SITE_WORKER',
        });
      expect([200, 201]).toContain(res.status);
      expect(provisionPhoneUser).toHaveBeenCalled();

      const rows = await infra.prisma.$queryRawUnsafe<Array<{ keycloak_user_id: string }>>(
        `SELECT keycloak_user_id FROM platform.users WHERE phone_number = $1`,
        '+66899999911',
      );
      expect(rows.length).toBe(1);
      expect(rows[0].keycloak_user_id).toBe(KC_PATH_A);

      const memberships = await infra.prisma.$queryRawUnsafe<Array<{ role: string }>>(
        `SELECT m.role::text AS role
           FROM platform.tenant_memberships m
           JOIN platform.users u ON u.user_id = m.user_id
          WHERE u.phone_number = $1`,
        '+66899999911',
      );
      expect(memberships.map((m) => m.role)).toEqual(['SITE_WORKER']);
    });
  });

  describe('POST /api/v1/users — Path B email (master:1984-1989)', () => {
    it('creates the Keycloak email user, then persists user + membership', async () => {
      createEmailUser.mockClear();
      const res = await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('x-test-role', 'TENANT_ADMIN')
        .send({
          email: 'pathb@example.com',
          display_name: 'Path B User',
          role: 'PROJECT_MANAGER',
        });
      expect([200, 201]).toContain(res.status);
      expect(createEmailUser).toHaveBeenCalled();

      const rows = await infra.prisma.$queryRawUnsafe<Array<{ user_id: string }>>(
        `SELECT user_id FROM platform.users WHERE email = $1`,
        'pathb@example.com',
      );
      expect(rows.length).toBe(1);
    });
  });

  describe('PATCH role and deactivate (master:1972-1973)', () => {
    let targetId = '';

    beforeAll(async () => {
      const rows = await infra.prisma.$queryRawUnsafe<Array<{ user_id: string }>>(
        `SELECT user_id FROM platform.users WHERE email = $1`,
        'pathb@example.com',
      );
      targetId = rows[0]?.user_id ?? '';
    });

    it('changes the role', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/users/${targetId}/role`)
        .set('x-test-role', 'TENANT_ADMIN')
        .send({ role: 'FINANCE' });
      expect([200, 204]).toContain(res.status);

      const rows = await infra.prisma.$queryRawUnsafe<Array<{ role: string }>>(
        `SELECT role::text AS role FROM platform.tenant_memberships WHERE user_id = $1::uuid`,
        targetId,
      );
      expect(rows.map((r) => r.role)).toEqual(['FINANCE']);
    });

    it('deactivates the user', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/users/${targetId}/deactivate`)
        .set('x-test-role', 'TENANT_ADMIN')
        .send({});
      expect([200, 204]).toContain(res.status);

      const rows = await infra.prisma.$queryRawUnsafe<Array<{ is_active: boolean }>>(
        `SELECT is_active FROM platform.users WHERE user_id = $1::uuid`,
        targetId,
      );
      expect(rows[0]?.is_active).toBe(false);
    });
  });

  describe('MFA TOTP endpoints (master:1957-1960)', () => {
    it('POST /auth/mfa/enroll returns a TOTP setup URI', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/mfa/enroll')
        .set('x-test-role', 'TENANT_ADMIN')
        .send({});
      expect([200, 201]).toContain(res.status);
      // "returns QR code URI" (master:1958) — the otpauth:// URI is what a QR encodes.
      expect(JSON.stringify(res.body)).toMatch(/otpauth:\/\/|qr/i);
    });

    it('POST /auth/mfa/verify rejects a wrong code', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/mfa/verify')
        .set('x-test-role', 'TENANT_ADMIN')
        .send({ code: '000000' });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });
});

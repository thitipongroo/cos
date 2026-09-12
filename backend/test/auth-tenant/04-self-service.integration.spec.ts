/**
 * §14 self-service surface — the `users/me` routes, against a real database.
 *
 * SEPARATE FROM 03-user-management: that file is the TENANT_ADMIN estate (master:1967-1991) and
 * every route in it is role-gated. These routes are the opposite case — no @Roles at all, scoped
 * only by the JWT's own user_id — and the two properties worth proving here cannot be proved by a
 * unit test:
 *
 *   1. the SQL runs against the SHIPPED schema, including `password_changed_at` (migration
 *      20260913000001). A unit test mocks $queryRaw and would pass over a column that does not
 *      exist — which is exactly how a SELECT drifts from its row type in raw SQL;
 *   2. a non-admin role really does reach them through the live guard stack.
 *
 * KeycloakAdminService is doubled, as in 03: no Keycloak runs here, and the assertion is that COS
 * asks it for the right thing, not that Keycloak delivers mail.
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

const TENANT_ID = 'cccccccc-1111-4000-8000-000000000021';
const REALM = 'construction-os';

// Two accounts, because the whole point of the Path A branch is that it is a real account shape and
// not an error state. Path B carries an email and a Keycloak password credential; Path A carries a
// phone number and `email = ''` — one identifier per account for its lifetime (§5.4.4).
const PATH_B_USER = 'cccccccc-2222-4000-8000-000000000021';
const PATH_A_USER = 'cccccccc-2222-4000-8000-000000000022';
const KC_PATH_B = 'cccccccc-4444-4000-8000-00000000002b';
const KC_PATH_A = 'cccccccc-4444-4000-8000-00000000002a';

/** Which seeded account the request is signed in as. Defaults to the Path B one. */
const userHeader = (req: Record<string, unknown>): string => {
  const headers = (req['headers'] ?? {}) as Record<string, string>;
  return headers['x-test-user'] ?? PATH_B_USER;
};

describe('§14 self-service · users/me (any authenticated role)', () => {
  let infra: IntegrationInfra;
  let app: INestApplication;
  const sendPasswordResetEmail = jest.fn().mockResolvedValue(undefined);

  beforeAll(async () => {
    infra = await startIntegrationInfra();

    await infra.prisma.$executeRawUnsafe(
      `INSERT INTO platform.tenants (tenant_id, tenant_code, tenant_name, keycloak_realm, plan_type, is_active)
       VALUES ($1::uuid, 'sd-p2-self', 'Spec Derived Self Service', $2, 'STARTER'::platform."PlanType", true)`,
      TENANT_ID,
      REALM,
    );
    await infra.prisma.$executeRawUnsafe(
      `INSERT INTO platform.users (user_id, tenant_id, keycloak_user_id, phone_number, email, display_name)
       VALUES ($1::uuid, $2::uuid, $3, '+66899999921', 'engineer@example.com', 'สมชาย ใจดี')`,
      PATH_B_USER,
      TENANT_ID,
      KC_PATH_B,
    );
    // email = '' is what provisionPhoneUser writes, not NULL — the refusal must catch both.
    await infra.prisma.$executeRawUnsafe(
      `INSERT INTO platform.users (user_id, tenant_id, keycloak_user_id, phone_number, email, display_name)
       VALUES ($1::uuid, $2::uuid, $3, '+66899999922', '', 'สมหญิง ตั้งใจ')`,
      PATH_A_USER,
      TENANT_ID,
      KC_PATH_A,
    );
    for (const userId of [PATH_B_USER, PATH_A_USER]) {
      await infra.prisma.$executeRawUnsafe(
        `INSERT INTO platform.tenant_memberships (tenant_id, user_id, role)
         VALUES ($1::uuid, $2::uuid, 'SITE_ENGINEER'::platform."CosRoleEnum")`,
        TENANT_ID,
        userId,
      );
    }

    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(KeycloakAdminService)
      .useValue({
        sendPasswordResetEmail,
        provisionPhoneUser: jest.fn(),
        createEmailUser: jest.fn(),
        syncUserRole: jest.fn().mockResolvedValue(undefined),
        disableUser: jest.fn().mockResolvedValue(undefined),
        setTemporaryPassword: jest.fn().mockResolvedValue(undefined),
        deleteUser: jest.fn().mockResolvedValue(undefined),
        exchangeOtpForTokens: jest.fn(),
        refreshToken: jest.fn(),
        revokeToken: jest.fn(),
      })
      .overrideGuard(JwtAuthGuard)
      .useValue(
        clsAuthGuard((req) => ({
          tenant_id: TENANT_ID,
          user_id: userHeader(req),
          // SITE_ENGINEER, deliberately: if any of these routes ever grew a @Roles(TENANT_ADMIN)
          // by copy-paste from UserController, every case below turns 403.
          role: 'SITE_ENGINEER',
          tenantCode: 'sd-p2-self',
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

  beforeEach(() => {
    sendPasswordResetEmail.mockClear();
  });

  describe('GET /api/v1/users/me', () => {
    it('returns the caller’s own row including password_changed_at, unset', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/users/me');

      expect(res.status).toBe(200);
      expect(res.body.user_id).toBe(PATH_B_USER);
      // The column is SELECTed by name, so this proves it exists in the deployed schema. NULL is
      // the ordinary case — nothing has ever set a password through this API for this account —
      // and the surface prints nothing rather than "never".
      expect(res.body).toHaveProperty('password_changed_at', null);
      // Already on the wire before the mobile type declared it (§14); the profile screen reads it.
      expect(res.body.phone_number).toBe('+66899999921');
    });
  });

  describe('POST /api/v1/users/me/password-reset-email', () => {
    it('asks Keycloak for a 15-minute link for the caller’s own account', async () => {
      const res = await request(app.getHttpServer()).post('/api/v1/users/me/password-reset-email');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ email: 'engineer@example.com' });
      // The Keycloak id comes from the caller's own row, never from the request — there is no body
      // and no path parameter on this route for it to come from.
      expect(sendPasswordResetEmail).toHaveBeenCalledWith(KC_PATH_B, REALM, 900);
    });

    it('leaves password_changed_at untouched — the flow finishes inside Keycloak', async () => {
      await request(app.getHttpServer()).post('/api/v1/users/me/password-reset-email');

      const rows = await infra.prisma.$queryRawUnsafe<Array<{ password_changed_at: Date | null }>>(
        `SELECT password_changed_at FROM platform.users WHERE user_id = $1::uuid`,
        PATH_B_USER,
      );
      // Stamping on SEND would record a change the user may never finish making.
      expect(rows[0]?.password_changed_at).toBeNull();
    });

    it('refuses a Path A account with COS-AUTH-003 and sends nothing', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/users/me/password-reset-email')
        .set('x-test-user', PATH_A_USER);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('COS-AUTH-003');
      expect(res.body.error.messageKey).toBe('user.password.pathAHasNoPassword');
      // The refusal is the whole point: reporting a send here is only discoverable as false by
      // waiting for mail that can never arrive.
      expect(sendPasswordResetEmail).not.toHaveBeenCalled();
    });
  });
});

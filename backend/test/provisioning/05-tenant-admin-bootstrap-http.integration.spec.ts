/**
 * ADR-110 over HTTP — the full Nest pipeline (global FeatureFlagGuard, TrialReadOnlyInterceptor, ValidationPipe,
 * RolesGuard) in front of the first-TENANT_ADMIN endpoint, on a real PostgreSQL. Keycloak is a double.
 *
 * What the service-level spec (03) cannot show:
 *
 *   1. with `s1.tenant.trial-lifecycle` ON, a SYSTEM_ADMIN can still give an EXPIRED trial its administrator — the
 *      read-only rule applies to the CALLER's tenant, and the caller's is not a trial. A control request from a
 *      caller whose OWN tenant is EXPIRED is refused with COS-PLAN-003, proving the interceptor is live here;
 *   2. with `s1.tenant.bootstrap-admin` OFF, the endpoint answers 503;
 *   3. a non-SYSTEM_ADMIN is refused by RolesGuard.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import {
  startIntegrationInfra,
  stopIntegrationInfra,
  clsAuthGuard,
  type IntegrationInfra,
  type TestUser,
} from '../helpers/integration-infra';
import { AppModule } from '../../src/app.module';
import { JwtAuthGuard } from '../../src/shared/guards/jwt-auth.guard';
import { KeycloakAdminService } from '../../src/modules/identity/keycloak-admin.service';
import {
  DEFAULT_FLAGS,
  FeatureFlagService,
} from '../../src/shared/feature-flags/feature-flag.service';

const HOME_TENANT = '77777777-0000-4000-8000-000000000001';
const OPERATOR_ID = '77777777-1111-4000-8000-000000000001';
const TARGET = '77777777-2222-4000-8000-000000000001';
const JUSTIFICATION = 'Trial request TR-0077 from construction-os.io — first admin.';

describe('Tenant admin bootstrap · HTTP · real database', () => {
  let infra: IntegrationInfra;
  let app: INestApplication;
  const flags: Record<string, boolean> = {
    ...DEFAULT_FLAGS,
    's1.tenant.trial-lifecycle': true,
    's1.tenant.bootstrap-admin': true,
  };
  // The caller, varied per request: role and the caller's OWN tenant status (what TrialReadOnlyInterceptor reads).
  let caller: { role: string; subscriptionStatus: string } = {
    role: 'SYSTEM_ADMIN',
    subscriptionStatus: 'ACTIVE',
  };
  let kcSeq = 0;

  beforeAll(async () => {
    infra = await startIntegrationInfra();
    await infra.prisma.$executeRawUnsafe(
      `INSERT INTO platform.tenants (tenant_id, tenant_code, tenant_name, keycloak_realm, plan_type, is_active)
       VALUES ($1::uuid, 'http-home', 'Operator Home', 'construction-os', 'STARTER'::platform."PlanType", true),
              ($2::uuid, 'http-expired', 'Expired Trial', 'construction-os', 'STARTER'::platform."PlanType", true)`,
      HOME_TENANT,
      TARGET,
    );
    await infra.prisma.$executeRawUnsafe(
      `UPDATE platform.tenants
          SET subscription_status = 'EXPIRED',
              trial_started_at = now() - interval '35 days',
              trial_ends_at = now() - interval '5 days'
        WHERE tenant_id = $1::uuid`,
      TARGET,
    );
    await infra.prisma.$executeRawUnsafe(
      `INSERT INTO platform.users (user_id, tenant_id, keycloak_user_id, email, display_name)
       VALUES ($1::uuid, $2::uuid, 'kc-http-operator', 'operator@http.example', 'Operator')`,
      OPERATOR_ID,
      HOME_TENANT,
    );

    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(KeycloakAdminService)
      .useValue({
        createEmailUser: jest.fn(async () => ({ keycloakUserId: `kc-http-${++kcSeq}` })),
        sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
        hasAnyCredential: jest.fn().mockResolvedValue(false),
        deleteUser: jest.fn().mockResolvedValue(undefined),
      })
      .overrideProvider(FeatureFlagService)
      .useValue({
        isEnabled: (name: string) => flags[name] ?? false,
        allFlags: () => ({ ...flags }),
        onModuleDestroy: () => undefined,
      })
      .overrideGuard(JwtAuthGuard)
      .useValue(
        clsAuthGuard(
          () =>
            ({
              tenant_id: HOME_TENANT,
              user_id: OPERATOR_ID,
              tenantCode: 'http-home',
              ...caller,
            }) as TestUser,
        ),
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
    caller = { role: 'SYSTEM_ADMIN', subscriptionStatus: 'ACTIVE' };
    flags['s1.tenant.bootstrap-admin'] = true;
  });

  const post = (email: string) =>
    request(app.getHttpServer())
      .post(`/api/v1/admin/tenants/${TARGET}/tenant-admin`)
      .send({ email, display_name: 'Owner', justification: JUSTIFICATION });

  it('control: a caller whose own tenant is EXPIRED is refused by the read-only rule', async () => {
    caller.subscriptionStatus = 'EXPIRED';
    const res = await post('control@http.example');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('COS-PLAN-003');
  });

  it('503 while s1.tenant.bootstrap-admin is off', async () => {
    flags['s1.tenant.bootstrap-admin'] = false;
    expect((await post('off@http.example')).status).toBe(503);
  });

  it('cancel and resend also answer 503 while the flag is off', async () => {
    flags['s1.tenant.bootstrap-admin'] = false;
    for (const path of ['cancel', 'invite']) {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/tenants/${TARGET}/tenant-admin/${path}`)
        .send({ justification: JUSTIFICATION });
      expect(res.status).toBe(503);
    }
  });

  it('403 for a caller who is not SYSTEM_ADMIN', async () => {
    caller.role = 'TENANT_ADMIN';
    expect((await post('role@http.example')).status).toBe(403);
  });

  it('a SYSTEM_ADMIN gives an EXPIRED trial its administrator with the trial lifecycle on', async () => {
    const res = await post('owner@http.example');

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ email: 'owner@http.example', invite_sent: true });
    const rows = await infra.prisma.$queryRawUnsafe<Array<{ role: string }>>(
      `SELECT m.role::text AS role FROM platform.users u
         JOIN platform.tenant_memberships m ON m.user_id = u.user_id AND m.tenant_id = u.tenant_id
        WHERE u.tenant_id = $1::uuid`,
      TARGET,
    );
    expect(rows).toEqual([{ role: 'TENANT_ADMIN' }]);
  });
});

// Cross-tenant isolation integration tests — spec §30.6 "Multi-tenant Isolation Testing"
// Tests two isolation layers:
//   1. PostgreSQL RLS: querying with wrong tenant context → zero rows returned
//   2. API layer: user from tenant A trying to access tenant B resource → 403 Forbidden
//
// Run via: pnpm test:integration
// Uses @testcontainers/postgresql — real PostgreSQL with migrations applied.

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { ClsServiceManager } from 'nestjs-cls';
import {
  startIntegrationInfra,
  stopIntegrationInfra,
  type IntegrationInfra,
} from './helpers/integration-infra';
import { AppModule } from '../src/app.module';
import { JwtAuthGuard } from '../src/shared/guards/jwt-auth.guard';
import { TenantMiddleware, TenantRequest } from '../src/modules/tenant/tenant.middleware';
import type { NextFunction } from 'express';

const TENANT_A_ID = 'aaaaaaaa-0001-4000-8000-000000000001';
const TENANT_B_ID = 'bbbbbbbb-0002-4000-8000-000000000002';
const USER_A_ID = 'aaaaaaaa-0001-4000-8000-000000000011';
const USER_B_ID = 'bbbbbbbb-0002-4000-8000-000000000022';

describe('Cross-tenant Isolation (Integration — Testcontainers)', () => {
  let infra: IntegrationInfra;
  let prisma: PrismaClient;
  let app: INestApplication;

  beforeAll(async () => {
    infra = await startIntegrationInfra();
    prisma = infra.prisma;

    // Seed: two tenants with one user each (enums live in the platform schema)
    await prisma.$executeRaw`
      INSERT INTO platform.tenants (tenant_id, tenant_code, tenant_name, keycloak_realm, plan_type, is_active)
      VALUES
        (${TENANT_A_ID}::uuid, 'tenant-a', 'Tenant A', 'realm-a', 'STARTER'::platform."PlanType", true),
        (${TENANT_B_ID}::uuid, 'tenant-b', 'Tenant B', 'realm-b', 'STARTER'::platform."PlanType", true)
    `;
    await prisma.$executeRaw`
      INSERT INTO platform.users (user_id, tenant_id, keycloak_user_id, phone_number, email, display_name)
      VALUES
        (${USER_A_ID}::uuid, ${TENANT_A_ID}::uuid, 'kc-a', '+66811111111', 'a@test.com', 'User A'),
        (${USER_B_ID}::uuid, ${TENANT_B_ID}::uuid, 'kc-b', '+66822222222', 'b@test.com', 'User B')
    `;
    await prisma.$executeRaw`
      INSERT INTO platform.tenant_memberships (tenant_id, user_id, role)
      VALUES
        (${TENANT_A_ID}::uuid, ${USER_A_ID}::uuid, 'PROJECT_MANAGER'::platform."CosRoleEnum"),
        (${TENANT_B_ID}::uuid, ${USER_B_ID}::uuid, 'PROJECT_MANAGER'::platform."CosRoleEnum")
    `;

    // Build NestJS app with mocked auth + tenant middleware
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: {
          switchToHttp: () => {
            getRequest: () => TenantRequest & { headers: Record<string, string> };
          };
        }) => {
          const req = ctx.switchToHttp().getRequest();
          // Determine which tenant to impersonate from test header
          const impersonate = req.headers['x-test-tenant'] ?? TENANT_A_ID;
          const userId = impersonate === TENANT_A_ID ? USER_A_ID : USER_B_ID;
          req.user = {
            user_id: userId,
            tenant_id: impersonate,
            role: 'PROJECT_MANAGER',
            sub: impersonate === TENANT_A_ID ? 'kc-a' : 'kc-b',
          };
          // Publish context into CLS like the real JwtAuthGuard (ADR-031) so services resolve tenant.
          const cls = ClsServiceManager.getClsService();
          if (cls.isActive()) {
            cls.set('tenantId', impersonate);
            cls.set('userId', userId);
            cls.set('userRole', 'PROJECT_MANAGER');
            cls.set('tenantCode', impersonate === TENANT_A_ID ? 'tenant-a' : 'tenant-b');
            cls.set('dedicatedDbUrl', undefined);
          }
          return true;
        },
      })
      // Override TenantMiddleware to set req.tenantId from the impersonation header
      .overrideProvider(TenantMiddleware)
      .useValue({
        use: (
          req: TenantRequest & { headers: Record<string, string>; user?: { tenant_id: string } },
          _res: unknown,
          next: NextFunction,
        ) => {
          req.tenantId = req.user?.tenant_id;
          next();
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await stopIntegrationInfra(infra);
  });

  // ── Layer 1: PostgreSQL RLS ────────────────────────────────────────────────

  // Layer 1 — PostgreSQL RLS — is NOT here. backend/test/phase-16-security/01 asserts the same rule
  // against the same database and goes further: that app_user is neither superuser nor BYPASSRLS
  // (without which every RLS assertion is vacuous), that an UNSET tenant sees nothing rather than
  // everything, and that WITH CHECK refuses an insert stamped with another tenant. The two cases
  // that used to sit here were a strict subset, so they were dropped rather than kept in duplicate
  // (2026-08-25). What remains below is the HTTP layer, which that suite does not boot.

  // ── Layer 2: API layer isolation ──────────────────────────────────────────

  describe('API layer isolation', () => {
    it('returns 200 when tenant A user accesses tenant A projects', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/projects')
        .set('Authorization', 'Bearer test-token-a')
        .set('x-test-tenant', TENANT_A_ID);

      // The point is that the request is NOT refused. Listing a tenant's own projects answers 200
      // with an empty page when none are seeded — a 404 here would mean the route itself is wrong.
      expect(res.status).toBe(200);
    });

    it('returns 403 when user attempts cross-tenant access via PolicyGuard', async () => {
      // Simulate: user is from TENANT_A but request arrives with a tenantId param for TENANT_B.
      // PolicyGuard checks: request.tenantId (TENANT_A) !== request.params.tenantId (TENANT_B) → 403.
      // We test via admin/tenants route which exposes :tenantId param outside the auth bypass path.
      // The TenantMiddleware bypass applies to admin routes, so tenantId comes from params.
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/admin/tenants/${TENANT_B_ID}/dedicated-db`)
        .set('Authorization', 'Bearer test-token-a')
        .set('x-test-tenant', TENANT_A_ID)
        .send({ dedicatedDbUrl: 'postgresql://test' });

      // PolicyGuard: request.params.tenantId = TENANT_B ≠ user.tenant_id = TENANT_A → 403
      expect(res.status).toBe(403);
    });
  });
});

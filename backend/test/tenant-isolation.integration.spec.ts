// Cross-tenant isolation integration tests — spec §30.6 "Multi-tenant Isolation Testing"
// Tests two isolation layers:
//   1. PostgreSQL RLS: querying with wrong tenant context → zero rows returned
//   2. API layer: user from tenant A trying to access tenant B resource → 403 Forbidden
//
// Run via: pnpm test:integration
// Uses @testcontainers/postgresql — real PostgreSQL with migrations applied.

import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, StartedRedisContainer } from '@testcontainers/redis';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { JwtAuthGuard } from '../src/modules/identity/guards/jwt-auth.guard';
import { TenantMiddleware, TenantRequest } from '../src/modules/tenant/tenant.middleware';
import type { NextFunction } from 'express';

const TENANT_A_ID = 'aaaaaaaa-0001-4000-8000-000000000001';
const TENANT_B_ID = 'bbbbbbbb-0002-4000-8000-000000000002';
const USER_A_ID = 'aaaaaaaa-0001-4000-8000-000000000011';
const USER_B_ID = 'bbbbbbbb-0002-4000-8000-000000000022';

describe('Cross-tenant Isolation (Integration — Testcontainers)', () => {
  let pgContainer: StartedPostgreSqlContainer;
  let redisContainer: StartedRedisContainer;
  let prisma: PrismaClient;
  let app: INestApplication;
  let pgUrl: string;

  beforeAll(async () => {
    [pgContainer, redisContainer] = await Promise.all([
      new PostgreSqlContainer('postgres:16-alpine').start(),
      new RedisContainer('redis:7-alpine').start(),
    ]);

    pgUrl = pgContainer.getConnectionUri();
    const redisUrl = `redis://${redisContainer.getHost()}:${redisContainer.getMappedPort(6379)}`;

    process.env['DATABASE_URL'] = pgUrl;
    process.env['REDIS_URL'] = redisUrl;

    // Run all Prisma migrations (including Phase 16 RLS policies)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { execSync } = require('child_process') as typeof import('child_process');
    execSync('pnpm prisma migrate deploy', {
      cwd: `${__dirname}/..`,
      env: { ...process.env, DATABASE_URL: pgUrl },
      stdio: 'inherit',
    });

    prisma = new PrismaClient({ datasources: { db: { url: pgUrl } } });

    // Seed: two tenants with one user each
    await prisma.$executeRaw`
      INSERT INTO platform.tenants (tenant_id, tenant_code, tenant_name, keycloak_realm, plan_type, is_active)
      VALUES
        (${TENANT_A_ID}::uuid, 'tenant-a', 'Tenant A', 'realm-a', 'STARTER'::"PlanType", true),
        (${TENANT_B_ID}::uuid, 'tenant-b', 'Tenant B', 'realm-b', 'STARTER'::"PlanType", true)
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
        (${TENANT_A_ID}::uuid, ${USER_A_ID}::uuid, 'PROJECT_MANAGER'::"CosRoleEnum"),
        (${TENANT_B_ID}::uuid, ${USER_B_ID}::uuid, 'PROJECT_MANAGER'::"CosRoleEnum")
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
          req.user = {
            user_id: impersonate === TENANT_A_ID ? USER_A_ID : USER_B_ID,
            tenant_id: impersonate,
            role: 'PROJECT_MANAGER',
            sub: impersonate === TENANT_A_ID ? 'kc-a' : 'kc-b',
          };
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
    await prisma.$disconnect();
    await app.close();
    await Promise.all([pgContainer.stop(), redisContainer.stop()]);
  });

  // ── Layer 1: PostgreSQL RLS ────────────────────────────────────────────────

  describe('PostgreSQL RLS isolation', () => {
    it('returns zero rows when querying tenant B user records with tenant A context', async () => {
      // Set current_tenant_id = TENANT_A via session variable
      await prisma.$executeRaw`SET LOCAL app.current_tenant_id = ${TENANT_A_ID}`;

      // Query for tenant B's user — RLS must filter this out
      const rows = await prisma.$queryRaw<{ user_id: string }[]>`
        SELECT user_id FROM platform.users
        WHERE tenant_id = ${TENANT_B_ID}::uuid
      `;

      // RLS policy: USING (tenant_id = current_setting('app.current_tenant_id')::uuid OR tenant_id IS NULL)
      // tenant_id = TENANT_B ≠ current_tenant_id = TENANT_A → filtered out
      expect(rows).toHaveLength(0);
    });

    it('returns rows belonging to the current tenant context', async () => {
      await prisma.$executeRaw`SET LOCAL app.current_tenant_id = ${TENANT_A_ID}`;

      const rows = await prisma.$queryRaw<{ user_id: string }[]>`
        SELECT user_id FROM platform.users
        WHERE tenant_id = ${TENANT_A_ID}::uuid
      `;

      expect(rows.length).toBeGreaterThan(0);
    });
  });

  // ── Layer 2: API layer isolation ──────────────────────────────────────────

  describe('API layer isolation', () => {
    it('returns 200 when tenant A user accesses tenant A projects', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/projects')
        .set('Authorization', 'Bearer test-token-a')
        .set('x-test-tenant', TENANT_A_ID);

      // 200 or 404 (no projects seeded) — NOT 401 or 403
      expect([200, 404]).toContain(res.status);
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

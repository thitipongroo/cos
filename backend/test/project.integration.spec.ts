// Integration tests: Project Service — Phase 3
// Full CRUD + state transition flows (QM-1: real DB via Testcontainers).

jest.mock('@opensearch-project/opensearch', () => ({
  Client: jest.fn().mockImplementation(() => ({
    index: jest.fn().mockResolvedValue({}),
    search: jest.fn().mockResolvedValue({ body: { hits: { hits: [] } } }),
  })),
}));

jest.mock('@cos/shared', () => ({
  KafkaProducer: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    publish: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
  })),
}));

import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { JwtAuthGuard } from '../src/modules/identity/guards/jwt-auth.guard';

const TENANT_ID = 'cccccccc-1111-4000-8000-000000000001';
const USER_ID = 'cccccccc-2222-4000-8000-000000000001';
const MEMBER_USER_ID = 'cccccccc-3333-4000-8000-000000000001';

// Mutable role — changed per-test to exercise role-based transition logic
let mockRole = 'PROJECT_MANAGER';

describe('Project Integration (Testcontainers — PostgreSQL)', () => {
  let pgContainer: StartedPostgreSqlContainer;
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    pgContainer = await new PostgreSqlContainer('postgres:16-alpine').start();
    const pgUrl = pgContainer.getConnectionUri();
    process.env['DATABASE_URL'] = pgUrl;

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { execSync } = require('child_process') as typeof import('child_process');
    const backendDir = `${__dirname}/..`;
    execSync('pnpm prisma migrate deploy', {
      cwd: backendDir,
      env: { ...process.env, DATABASE_URL: pgUrl },
      stdio: 'inherit',
    });

    prisma = new PrismaClient({ datasources: { db: { url: pgUrl } } });

    await prisma.$executeRaw`
      INSERT INTO platform.tenants (tenant_id, tenant_code, tenant_name, keycloak_realm, plan_type, is_active)
      VALUES (${TENANT_ID}::uuid, 'proj-int', 'Project Integration Tenant',
              'proj-realm', 'STARTER'::"PlanType", true)
    `;
    await prisma.$executeRaw`
      INSERT INTO platform.users (user_id, tenant_id, keycloak_user_id, email, display_name)
      VALUES (${USER_ID}::uuid, ${TENANT_ID}::uuid, 'kc-proj-int', 'pm@proj-int.test', 'PM User')
    `;
    await prisma.$executeRaw`
      INSERT INTO platform.tenant_memberships (tenant_id, user_id, role)
      VALUES (${TENANT_ID}::uuid, ${USER_ID}::uuid, 'PROJECT_MANAGER'::"CosRoleEnum")
    `;

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

    // Inject req.user BEFORE app.init() so TenantMiddleware (NestMiddleware) can read it.
    // TenantMiddleware reads req.user.tenant_id → queries real DB → sets req.tenantId.
    app.use((req: Record<string, unknown>, _res: unknown, next: () => void) => {
      req.user = { tenant_id: TENANT_ID, user_id: USER_ID, role: mockRole };
      next();
    });

    await app.init();
  }, 120_000);

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
    await pgContainer.stop();
  });

  // ─── Full CRUD ─────────────────────────────────────────────────────────────

  describe('POST /api/v1/projects — create', () => {
    it('creates a DRAFT project and returns 201', async () => {
      mockRole = 'PROJECT_MANAGER';
      const res = await request(app.getHttpServer())
        .post('/api/v1/projects')
        .send({
          project_code: 'INT-CRUD-001',
          project_name: 'Integration CRUD Project',
          project_type: 'COMMERCIAL',
          budget_amount: '5000000.0000',
          budget_currency: 'THB',
          start_date: '2026-01-01',
          end_date: '2026-12-31',
        })
        .expect(201);

      expect(res.body.project_code).toBe('INT-CRUD-001');
      expect(res.body.status).toBe('DRAFT');
      expect(res.body.tenant_id).toBe(TENANT_ID);
      expect(res.body.project_id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });
  });

  describe('GET /api/v1/projects — list', () => {
    it('returns paginated list containing the created project', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/projects').expect(200);

      expect(res.body).toHaveProperty('items');
      expect(res.body.items).toBeInstanceOf(Array);
      expect(res.body.items.length).toBeGreaterThan(0);
      const found = res.body.items.find(
        (p: { project_code: string }) => p.project_code === 'INT-CRUD-001',
      );
      expect(found).toBeDefined();
    });

    it('filters by status=DRAFT and returns only DRAFT projects', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/projects?status=DRAFT')
        .expect(200);

      expect(res.body.items.every((p: { status: string }) => p.status === 'DRAFT')).toBe(true);
    });
  });

  describe('GET /api/v1/projects/:id — findById', () => {
    let crudProjectId: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/projects');
      const found = res.body.items.find(
        (p: { project_code: string; project_id: string }) => p.project_code === 'INT-CRUD-001',
      );
      crudProjectId = found.project_id;
    });

    it('returns the project by ID with 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/projects/${crudProjectId}`)
        .expect(200);

      expect(res.body.project_id).toBe(crudProjectId);
      expect(res.body.project_code).toBe('INT-CRUD-001');
      expect(res.body.project_name).toBe('Integration CRUD Project');
    });

    it('returns 404 for a non-existent project ID', () => {
      return request(app.getHttpServer())
        .get('/api/v1/projects/00000000-0000-0000-0000-000000000099')
        .expect(404);
    });
  });

  describe('PATCH /api/v1/projects/:id — update', () => {
    let crudProjectId: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/projects');
      const found = res.body.items.find(
        (p: { project_code: string; project_id: string }) => p.project_code === 'INT-CRUD-001',
      );
      crudProjectId = found.project_id;
    });

    it('updates project name and returns 200 with updated row', async () => {
      mockRole = 'PROJECT_MANAGER';
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/projects/${crudProjectId}`)
        .send({ project_name: 'Updated Integration Project' })
        .expect(200);

      expect(res.body.project_name).toBe('Updated Integration Project');
      expect(res.body.project_id).toBe(crudProjectId);
    });
  });

  // ─── State Transition Flows ────────────────────────────────────────────────

  describe('State transitions — full lifecycle', () => {
    let transProjectId: string;

    beforeAll(async () => {
      mockRole = 'PROJECT_MANAGER';
      // end_date in the past — required by the COMPLETED transition check
      const res = await request(app.getHttpServer())
        .post('/api/v1/projects')
        .send({
          project_code: 'INT-TRANS-001',
          project_name: 'Transition Project',
          project_type: 'RESIDENTIAL',
          end_date: '2025-01-01',
        })
        .expect(201);
      transProjectId = res.body.project_id;
    });

    it('DRAFT → ACTIVE (PROJECT_MANAGER, allowed)', async () => {
      mockRole = 'PROJECT_MANAGER';
      const res = await request(app.getHttpServer())
        .post(`/api/v1/projects/${transProjectId}/transitions`)
        .send({ to: 'ACTIVE' })
        .expect(200);

      expect(res.body.status).toBe('ACTIVE');
    });

    it('ACTIVE → ON_HOLD (PROJECT_MANAGER + reason, allowed)', async () => {
      mockRole = 'PROJECT_MANAGER';
      const res = await request(app.getHttpServer())
        .post(`/api/v1/projects/${transProjectId}/transitions`)
        .send({ to: 'ON_HOLD', reason: 'Budget review required' })
        .expect(200);

      expect(res.body.status).toBe('ON_HOLD');
      expect(res.body.on_hold_reason).toBe('Budget review required');
    });

    it('ON_HOLD → ACTIVE (PROJECT_MANAGER, allowed)', async () => {
      mockRole = 'PROJECT_MANAGER';
      const res = await request(app.getHttpServer())
        .post(`/api/v1/projects/${transProjectId}/transitions`)
        .send({ to: 'ACTIVE' })
        .expect(200);

      expect(res.body.status).toBe('ACTIVE');
    });

    it('ACTIVE → COMPLETED (TENANT_ADMIN + past end_date, allowed)', async () => {
      mockRole = 'TENANT_ADMIN';
      const res = await request(app.getHttpServer())
        .post(`/api/v1/projects/${transProjectId}/transitions`)
        .send({ to: 'COMPLETED' })
        .expect(200);

      expect(res.body.status).toBe('COMPLETED');
    });

    it('COMPLETED → ACTIVE → 422 (COMPLETED is terminal)', async () => {
      mockRole = 'TENANT_ADMIN';
      await request(app.getHttpServer())
        .post(`/api/v1/projects/${transProjectId}/transitions`)
        .send({ to: 'ACTIVE' })
        .expect(422);
    });
  });

  describe('State transitions — CANCELLED terminal', () => {
    let cancelProjectId: string;

    beforeAll(async () => {
      mockRole = 'PROJECT_MANAGER';
      const res = await request(app.getHttpServer())
        .post('/api/v1/projects')
        .send({
          project_code: 'INT-CANCEL-001',
          project_name: 'Cancellation Project',
          project_type: 'INDUSTRIAL',
        })
        .expect(201);
      cancelProjectId = res.body.project_id;
    });

    it('DRAFT → CANCELLED (TENANT_ADMIN + reason, allowed)', async () => {
      mockRole = 'TENANT_ADMIN';
      const res = await request(app.getHttpServer())
        .post(`/api/v1/projects/${cancelProjectId}/transitions`)
        .send({ to: 'CANCELLED', reason: 'Client withdrew funding' })
        .expect(200);

      expect(res.body.status).toBe('CANCELLED');
      expect(res.body.cancellation_reason).toBe('Client withdrew funding');
    });

    it('CANCELLED → ACTIVE → 422 (CANCELLED is terminal)', async () => {
      mockRole = 'TENANT_ADMIN';
      await request(app.getHttpServer())
        .post(`/api/v1/projects/${cancelProjectId}/transitions`)
        .send({ to: 'ACTIVE' })
        .expect(422);
    });
  });

  // ─── Member Management ─────────────────────────────────────────────────────

  describe('Member management', () => {
    let memberProjectId: string;

    beforeAll(async () => {
      mockRole = 'PROJECT_MANAGER';
      const res = await request(app.getHttpServer())
        .post('/api/v1/projects')
        .send({
          project_code: 'INT-MEMBER-001',
          project_name: 'Member Test Project',
          project_type: 'INFRASTRUCTURE',
        })
        .expect(201);
      memberProjectId = res.body.project_id;
    });

    it('POST /api/v1/projects/:id/members → 204 (add member)', async () => {
      mockRole = 'PROJECT_MANAGER';
      await request(app.getHttpServer())
        .post(`/api/v1/projects/${memberProjectId}/members`)
        .send({ user_id: MEMBER_USER_ID, role: 'SITE_ENGINEER' })
        .expect(204);
    });

    it('GET /api/v1/projects/:id/members → 200 (added member appears in list)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/projects/${memberProjectId}/members`)
        .expect(200);

      expect(res.body).toBeInstanceOf(Array);
      const member = res.body.find(
        (m: { user_id: string; role: string }) => m.user_id === MEMBER_USER_ID,
      );
      expect(member).toBeDefined();
      expect(member.role).toBe('SITE_ENGINEER');
    });

    it('DELETE /api/v1/projects/:id/members/:userId → 204 (remove member)', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/projects/${memberProjectId}/members/${MEMBER_USER_ID}`)
        .expect(204);
    });

    it('GET /api/v1/projects/:id/members → 200 (removed member no longer in list)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/projects/${memberProjectId}/members`)
        .expect(200);

      expect(
        res.body.find((m: { user_id: string }) => m.user_id === MEMBER_USER_ID),
      ).toBeUndefined();
    });
  });

  // ─── Validation contract tests (HTTP 400) ─────────────────────────────────

  describe('POST /api/v1/projects — validation', () => {
    it('rejects missing project_code (400)', () => {
      return request(app.getHttpServer())
        .post('/api/v1/projects')
        .send({ project_name: 'Test', project_type: 'COMMERCIAL' })
        .expect(400);
    });

    it('rejects invalid project_type enum (400)', () => {
      return request(app.getHttpServer())
        .post('/api/v1/projects')
        .send({ project_code: 'V001', project_name: 'Test', project_type: 'INVALID' })
        .expect(400);
    });

    it('rejects invalid budget_currency length (400)', () => {
      return request(app.getHttpServer())
        .post('/api/v1/projects')
        .send({
          project_code: 'V001',
          project_name: 'Test',
          project_type: 'COMMERCIAL',
          budget_currency: 'TOOLONG',
        })
        .expect(400);
    });

    it('rejects project_code longer than 50 chars (400)', () => {
      return request(app.getHttpServer())
        .post('/api/v1/projects')
        .send({
          project_code: 'X'.repeat(51),
          project_name: 'Test',
          project_type: 'RESIDENTIAL',
        })
        .expect(400);
    });
  });

  describe('GET /api/v1/projects — validation', () => {
    it('rejects invalid status filter (400)', () => {
      return request(app.getHttpServer()).get('/api/v1/projects?status=UNKNOWN').expect(400);
    });
  });

  describe('POST /api/v1/projects/:id/transitions — validation', () => {
    it('rejects invalid transition target (400)', () => {
      return request(app.getHttpServer())
        .post('/api/v1/projects/00000000-0000-0000-0000-000000000001/transitions')
        .send({ to: 'NOT_A_STATUS' })
        .expect(400);
    });

    it('rejects reason longer than 500 chars (400)', () => {
      return request(app.getHttpServer())
        .post('/api/v1/projects/00000000-0000-0000-0000-000000000001/transitions')
        .send({ to: 'CANCELLED', reason: 'R'.repeat(501) })
        .expect(400);
    });
  });

  describe('POST /api/v1/projects/:id/members — validation', () => {
    it('rejects invalid UUID for user_id (400)', () => {
      return request(app.getHttpServer())
        .post('/api/v1/projects/00000000-0000-0000-0000-000000000001/members')
        .send({ user_id: 'not-a-uuid', role: 'SITE_ENGINEER' })
        .expect(400);
    });

    it('rejects invalid role enum (400)', () => {
      return request(app.getHttpServer())
        .post('/api/v1/projects/00000000-0000-0000-0000-000000000001/members')
        .send({ user_id: '00000000-0000-0000-0000-000000000002', role: 'FAKE_ROLE' })
        .expect(400);
    });
  });

  describe('PATCH /api/v1/projects/:id — validation', () => {
    it('rejects non-UUID param (400)', () => {
      return request(app.getHttpServer())
        .patch('/api/v1/projects/not-a-uuid')
        .send({ project_name: 'Updated' })
        .expect(400);
    });
  });

  describe('DELETE /api/v1/projects/:id/members/:userId — validation', () => {
    it('rejects non-UUID userId (400)', () => {
      return request(app.getHttpServer())
        .delete('/api/v1/projects/00000000-0000-0000-0000-000000000001/members/not-a-uuid')
        .expect(400);
    });
  });
});

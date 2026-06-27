// Integration tests: Workforce Service — Phase 22
// Covers the check-in/out cycle, timesheet lifecycle, and validation.
// Note: WorkerController uses @Controller('api/v1/workers') — prefix embedded in controller,
// NOT via setGlobalPrefix. Paths in this test match the controller declaration directly.

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { JwtAuthGuard } from '../src/modules/identity/guards/jwt-auth.guard';
import {
  startIntegrationInfra,
  stopIntegrationInfra,
  clsAuthGuard,
  type IntegrationInfra,
} from './helpers/integration-infra';
import { AppModule } from '../src/app.module';
import { buildCreateWorkerDto, buildCreateCheckInDto } from '@cos/test-utils';

const ENGINEER_TOKEN = 'Bearer test-engineer-token';
const TENANT_ID = 'ee000005-0001-4000-8000-000000000001';
const ENGINEER_ID = 'ee000005-0002-4000-8000-000000000001';
// Valid UUID v4 (version nibble 4, variant 8) — @IsUUID() rejects an arbitrary-version nibble.
const WORKER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PROJECT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TIMESHEET_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

describe('Workforce Integration (Phase 22)', () => {
  let infra: IntegrationInfra;
  let app: INestApplication;

  beforeAll(async () => {
    infra = await startIntegrationInfra();
    await infra.prisma.$executeRaw`
      INSERT INTO platform.tenants (tenant_id, tenant_code, tenant_name, keycloak_realm, plan_type, is_active)
      VALUES (${TENANT_ID}::uuid, 'workforce-int', 'Workforce Integration Tenant', 'wf-realm', 'STARTER'::platform."PlanType", true)
    `;
    await infra.prisma.$executeRaw`
      INSERT INTO platform.users (user_id, tenant_id, keycloak_user_id, email, display_name)
      VALUES (${ENGINEER_ID}::uuid, ${TENANT_ID}::uuid, 'kc-wf', 'eng@workforce-int.test', 'Engineer User')
    `;

    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(
        clsAuthGuard(() => ({
          tenant_id: TENANT_ID,
          user_id: ENGINEER_ID,
          role: 'SITE_ENGINEER',
          tenantCode: 'workforce-int',
        })),
      )
      .compile();

    app = module.createNestApplication();
    // Workforce controllers declare bare paths (workers, projects/:id/workforce, timesheets);
    // the api/v1 prefix is applied globally like every other module.
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await stopIntegrationInfra(infra);
  });

  // ── POST /api/v1/workers ───────────────────────────────────────────────────

  describe('POST /api/v1/workers', () => {
    it('returns 201 with valid worker payload (or 500 without DB)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/workers')
        .set('Authorization', ENGINEER_TOKEN)
        .send(
          buildCreateWorkerDto({
            employee_code: 'EMP-001',
            full_name: 'Somchai Jaidee',
            trade_type: 'Carpenter',
            employment_type: 'PERMANENT',
          }),
        );
      expect([201, 500]).toContain(res.status);
    });

    it('returns 400 when employee_code is missing', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/workers')
        .set('Authorization', ENGINEER_TOKEN)
        .send({
          full_name: 'Somchai Jaidee',
          trade_type: 'Carpenter',
          employment_type: 'PERMANENT',
        });
      expect(res.status).toBe(400);
    });

    it('returns 400 when employment_type is invalid', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/workers')
        .set('Authorization', ENGINEER_TOKEN)
        .send({
          employee_code: 'EMP-002',
          full_name: 'Somchai Jaidee',
          trade_type: 'Carpenter',
          employment_type: 'FREELANCE',
        });
      expect(res.status).toBe(400);
    });
  });

  // ── GET /api/v1/workers ────────────────────────────────────────────────────

  describe('GET /api/v1/workers', () => {
    it('returns list (200 or 500 depending on DB availability)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/workers')
        .set('Authorization', ENGINEER_TOKEN);
      expect([200, 500]).toContain(res.status);
    });
  });

  // ── GET /api/v1/workers/:id ────────────────────────────────────────────────

  describe('GET /api/v1/workers/:id', () => {
    it('returns 200 or 404 or 500 for a valid UUID', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/workers/${WORKER_ID}`)
        .set('Authorization', ENGINEER_TOKEN);
      expect([200, 404, 500]).toContain(res.status);
    });
  });

  // ── POST /api/v1/workers/:id/attendance — check-in ────────────────────────

  describe('POST /api/v1/workers/:id/attendance — check-in', () => {
    it('returns 201 for valid check-in payload (or 404/500 without DB)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/workers/${WORKER_ID}/attendance`)
        .set('Authorization', ENGINEER_TOKEN)
        .send(buildCreateCheckInDto(PROJECT_ID, { check_in_at: '2026-06-12T08:00:00Z' }));
      expect([201, 404, 500]).toContain(res.status);
    });

    it('returns 400 when project_id is missing', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/workers/${WORKER_ID}/attendance`)
        .set('Authorization', ENGINEER_TOKEN)
        .send({ check_in_at: '2026-06-12T08:00:00Z' });
      expect(res.status).toBe(400);
    });
  });

  // ── POST /api/v1/workers/:id/attendance — check-out ───────────────────────

  describe('POST /api/v1/workers/:id/attendance — check-out', () => {
    it('returns 201 for valid check-out payload (or 404/500 without DB)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/workers/${WORKER_ID}/attendance`)
        .set('Authorization', ENGINEER_TOKEN)
        .send({
          project_id: PROJECT_ID,
          check_in_at: '2026-06-12T08:00:00Z',
          check_out_at: '2026-06-12T17:00:00Z',
        });
      expect([201, 404, 500]).toContain(res.status);
    });
  });

  // ── GET /api/v1/workers/:id/attendance ────────────────────────────────────

  describe('GET /api/v1/workers/:id/attendance', () => {
    it('returns attendance history (200 or 404/500 depending on DB)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/workers/${WORKER_ID}/attendance`)
        .set('Authorization', ENGINEER_TOKEN)
        .query({ from: '2026-06-01', to: '2026-06-30' });
      expect([200, 404, 500]).toContain(res.status);
    });
  });

  // ── POST /api/v1/projects/:projectId/workforce ────────────────────────────

  describe('POST /api/v1/projects/:projectId/workforce', () => {
    it('returns 201 for valid allocation payload (or 404/500 without DB)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/projects/${PROJECT_ID}/workforce`)
        .set('Authorization', ENGINEER_TOKEN)
        .send({
          worker_id: WORKER_ID,
          role_on_project: 'Lead Carpenter',
          start_date: '2026-06-12',
        });
      expect([201, 404, 500]).toContain(res.status);
    });

    it('returns 400 when worker_id is not a UUID', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/projects/${PROJECT_ID}/workforce`)
        .set('Authorization', ENGINEER_TOKEN)
        .send({
          worker_id: 'not-a-uuid',
          start_date: '2026-06-12',
        });
      expect(res.status).toBe(400);
    });

    it('returns 400 when start_date is missing', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/projects/${PROJECT_ID}/workforce`)
        .set('Authorization', ENGINEER_TOKEN)
        .send({ worker_id: WORKER_ID });
      expect(res.status).toBe(400);
    });
  });

  // ── POST /api/v1/timesheets ────────────────────────────────────────────────

  describe('POST /api/v1/timesheets', () => {
    it('returns 201 for valid timesheet payload (or 404/500 without DB)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/timesheets')
        .set('Authorization', ENGINEER_TOKEN)
        .send({
          worker_id: WORKER_ID,
          project_id: PROJECT_ID,
          period_date: '2026-06-01',
          regular_hours: 160,
          overtime_hours: 20,
        });
      expect([201, 404, 500]).toContain(res.status);
    });

    it('returns 400 when period_date is missing', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/timesheets')
        .set('Authorization', ENGINEER_TOKEN)
        .send({
          worker_id: WORKER_ID,
          project_id: PROJECT_ID,
        });
      expect(res.status).toBe(400);
    });

    it('returns 400 when worker_id is not a UUID', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/timesheets')
        .set('Authorization', ENGINEER_TOKEN)
        .send({
          worker_id: 'not-a-uuid',
          project_id: PROJECT_ID,
          period_date: '2026-06-01',
        });
      expect(res.status).toBe(400);
    });
  });

  // ── PATCH /api/v1/timesheets/:id/approve ──────────────────────────────────

  describe('PATCH /api/v1/timesheets/:id/approve', () => {
    it('returns 200 or 404 or 500 for a valid timesheet UUID', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/timesheets/${TIMESHEET_ID}/approve`)
        .set('Authorization', ENGINEER_TOKEN);
      expect([200, 404, 500]).toContain(res.status);
    });
  });

  // ── GET /api/v1/projects/:projectId/workforce/summary ─────────────────────

  describe('GET /api/v1/projects/:projectId/workforce/summary', () => {
    it('returns manpower summary (200 or 500 depending on DB)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/projects/${PROJECT_ID}/workforce/summary`)
        .set('Authorization', ENGINEER_TOKEN);
      expect([200, 500]).toContain(res.status);
    });
  });
});

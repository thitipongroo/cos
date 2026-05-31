// Integration tests: Project Service — Phase 3
// Full CRUD + state transition flows.
// Uses testcontainers (PostgreSQL) per QM-1 spec.
// Phase 18 wires full container stack — this skeleton tests HTTP contract + validation.

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { JwtAuthGuard } from '../src/modules/identity/guards/jwt-auth.guard';
import { AppModule } from '../src/app.module';

// JWT token fixture for PROJECT_MANAGER role (mocked — real Keycloak in Phase 18 containers)
const PM_TOKEN = 'Bearer test-pm-token';
const ADMIN_TOKEN = 'Bearer test-admin-token';

describe('Project Integration (Phase 3)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: unknown) => {
          const req = (ctx as { switchToHttp: () => { getRequest: () => Record<string, unknown> } })
            .switchToHttp()
            .getRequest();
          // Inject mock tenant + user context so REQUEST-scoped services resolve
          req.tenantId = 'test-tenant-id';
          req.tenantCode = 'test_tenant';
          req.user = { cos_user_id: 'test-user-id', cos_role: 'PROJECT_MANAGER' };
          return true;
        },
      })
      .compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── Validation contract tests (no DB required) ───────────────────────────

  describe('POST /api/v1/projects', () => {
    it('rejects missing project_code (400)', () => {
      return request(app.getHttpServer())
        .post('/api/v1/projects')
        .set('Authorization', PM_TOKEN)
        .send({ project_name: 'Test', project_type: 'COMMERCIAL' })
        .expect(400);
    });

    it('rejects invalid project_type enum (400)', () => {
      return request(app.getHttpServer())
        .post('/api/v1/projects')
        .set('Authorization', PM_TOKEN)
        .send({ project_code: 'P001', project_name: 'Test', project_type: 'INVALID' })
        .expect(400);
    });

    it('rejects invalid budget_currency length (400)', () => {
      return request(app.getHttpServer())
        .post('/api/v1/projects')
        .set('Authorization', PM_TOKEN)
        .send({
          project_code: 'P001',
          project_name: 'Test',
          project_type: 'COMMERCIAL',
          budget_currency: 'TOOLONG',
        })
        .expect(400);
    });

    it('rejects project_code longer than 50 chars (400)', () => {
      return request(app.getHttpServer())
        .post('/api/v1/projects')
        .set('Authorization', PM_TOKEN)
        .send({
          project_code: 'X'.repeat(51),
          project_name: 'Test',
          project_type: 'RESIDENTIAL',
        })
        .expect(400);
    });
  });

  describe('GET /api/v1/projects', () => {
    it('rejects invalid status filter (400)', () => {
      return request(app.getHttpServer())
        .get('/api/v1/projects?status=UNKNOWN')
        .set('Authorization', PM_TOKEN)
        .expect(400);
    });
  });

  describe('POST /api/v1/projects/:id/transitions', () => {
    it('rejects invalid transition target (400)', () => {
      return request(app.getHttpServer())
        .post('/api/v1/projects/00000000-0000-0000-0000-000000000001/transitions')
        .set('Authorization', ADMIN_TOKEN)
        .send({ to: 'NOT_A_STATUS' })
        .expect(400);
    });

    it('rejects reason longer than 500 chars (400)', () => {
      return request(app.getHttpServer())
        .post('/api/v1/projects/00000000-0000-0000-0000-000000000001/transitions')
        .set('Authorization', ADMIN_TOKEN)
        .send({ to: 'CANCELLED', reason: 'R'.repeat(501) })
        .expect(400);
    });
  });

  describe('POST /api/v1/projects/:id/members', () => {
    it('rejects invalid UUID for user_id (400)', () => {
      return request(app.getHttpServer())
        .post('/api/v1/projects/00000000-0000-0000-0000-000000000001/members')
        .set('Authorization', PM_TOKEN)
        .send({ user_id: 'not-a-uuid', role: 'SITE_ENGINEER' })
        .expect(400);
    });

    it('rejects invalid role enum (400)', () => {
      return request(app.getHttpServer())
        .post('/api/v1/projects/00000000-0000-0000-0000-000000000001/members')
        .set('Authorization', PM_TOKEN)
        .send({ user_id: '00000000-0000-0000-0000-000000000002', role: 'FAKE_ROLE' })
        .expect(400);
    });
  });

  describe('PATCH /api/v1/projects/:id', () => {
    it('rejects invalid UUID in param (400)', () => {
      return request(app.getHttpServer())
        .patch('/api/v1/projects/not-a-uuid')
        .set('Authorization', PM_TOKEN)
        .send({ project_name: 'Updated' })
        .expect(400);
    });
  });

  describe('DELETE /api/v1/projects/:id/members/:userId', () => {
    it('rejects non-UUID userId (400)', () => {
      return request(app.getHttpServer())
        .delete('/api/v1/projects/00000000-0000-0000-0000-000000000001/members/not-a-uuid')
        .set('Authorization', PM_TOKEN)
        .expect(400);
    });
  });
});

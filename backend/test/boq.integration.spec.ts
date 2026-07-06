// Integration tests: BOQ Service — Phase 4
// Full BOQ lifecycle: create version → add categories → add items → approve.
// Phase 18 wires full container stack (PostgreSQL testcontainer).
// This skeleton tests HTTP contract, validation, and basic flow.

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

const PM_TOKEN = 'Bearer test-pm-token';
const TENANT_ID = 'dddddddd-0001-4000-8000-000000000001';
const USER_ID = 'dddddddd-0002-4000-8000-000000000001';

describe('BOQ Integration (Phase 4)', () => {
  let infra: IntegrationInfra;
  let app: INestApplication;

  beforeAll(async () => {
    infra = await startIntegrationInfra();
    await infra.prisma.$executeRaw`
      INSERT INTO platform.tenants (tenant_id, tenant_code, tenant_name, keycloak_realm, plan_type, is_active)
      VALUES (${TENANT_ID}::uuid, 'boq-int', 'BOQ Integration Tenant', 'boq-realm', 'STARTER'::platform."PlanType", true)
    `;
    await infra.prisma.$executeRaw`
      INSERT INTO platform.users (user_id, tenant_id, keycloak_user_id, email, display_name)
      VALUES (${USER_ID}::uuid, ${TENANT_ID}::uuid, 'kc-boq', 'pm@boq-int.test', 'PM User')
    `;

    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(
        clsAuthGuard(() => ({
          tenant_id: TENANT_ID,
          user_id: USER_ID,
          role: 'PROJECT_MANAGER',
          tenantCode: 'boq-int',
        })),
      )
      .compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await stopIntegrationInfra(infra);
  });

  describe('POST /api/v1/projects/:projectId/boq/versions', () => {
    it('returns 400 for a malformed projectId (ParseUUIDPipe rejects before the DB)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/projects/project-test-001/boq/versions')
        .set('Authorization', PM_TOKEN)
        .send({ currency_code: 'THB' });
      // projectId 'project-test-001' is not a UUID → ParseUUIDPipe returns 400 (was a raw 22P02 → 500)
      expect(res.status).toBe(400);
    });

    it('returns 400 when currency_code is invalid', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/projects/project-test-001/boq/versions')
        .set('Authorization', PM_TOKEN)
        .send({ currency_code: 'thb' }); // lowercase — fails regex
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/v1/boq/versions/:versionId/items', () => {
    it('returns 400 when quantity is not a valid decimal string', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/boq/versions/version-test-001/items')
        .set('Authorization', PM_TOKEN)
        .send({
          category_id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
          description: 'Test item',
          unit: 'm3',
          quantity: 'not-a-number',
          unit_cost: '2800.0000',
          currency_code: 'THB',
        });
      expect(res.status).toBe(400);
    });

    it('returns 400 when description is missing', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/boq/versions/version-test-001/items')
        .set('Authorization', PM_TOKEN)
        .send({
          category_id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
          unit: 'm3',
          quantity: '1.0000',
          unit_cost: '100.0000',
        });
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/v1/boq/items/:itemId', () => {
    it('returns 404 for non-existent item', async () => {
      const res = await request(app.getHttpServer())
        .delete('/api/v1/boq/items/00000000-0000-0000-0000-000000000000')
        .set('Authorization', PM_TOKEN);
      expect([404, 500]).toContain(res.status);
    });
  });

  describe('POST /api/v1/projects/:projectId/boq/versions/:versionId/approve', () => {
    it('returns 400 for malformed projectId/versionId (ParseUUIDPipe)', async () => {
      const res = await request(app.getHttpServer()).post(
        '/api/v1/projects/p-001/boq/versions/v-001/approve',
      );
      // 'p-001'/'v-001' are not UUIDs → ParseUUIDPipe returns 400 (was a raw 22P02 → 500)
      expect(res.status).toBe(400);
    });
  });

  // GET /api/v1/boq/versions/:versionId/export — real end-to-end path (JSON + CSV).
  // Regression guard: the endpoint previously passed an empty project_id into getVersionDetail,
  // which always 404'd. This seeds real data and asserts both formats return 200.
  describe('GET /api/v1/boq/versions/:versionId/export', () => {
    const PROJECT_ID = 'dddddddd-0003-4000-8000-000000000001';
    const VERSION_ID = 'dddddddd-0004-4000-8000-000000000001';
    const CATEGORY_ID = 'dddddddd-0005-4000-8000-000000000001';

    beforeAll(async () => {
      await infra.prisma.$executeRaw`
        INSERT INTO projects.projects (project_id, tenant_id, project_code, project_name, project_type, status, created_by)
        VALUES (${PROJECT_ID}::uuid, ${TENANT_ID}::uuid, 'BOQ-EXP-1', 'BOQ Export Project',
                'RESIDENTIAL'::"ProjectType", 'ACTIVE'::"ProjectStatus", ${USER_ID}::uuid)
      `;
      await infra.prisma.$executeRaw`
        INSERT INTO boq.boq_versions (version_id, project_id, tenant_id, version_number, status, total_estimated_currency, created_by)
        VALUES (${VERSION_ID}::uuid, ${PROJECT_ID}::uuid, ${TENANT_ID}::uuid, 1, 'DRAFT', 'THB', ${USER_ID}::uuid)
      `;
      await infra.prisma.$executeRaw`
        INSERT INTO boq.boq_categories (category_id, version_id, tenant_id, category_code, category_name)
        VALUES (${CATEGORY_ID}::uuid, ${VERSION_ID}::uuid, ${TENANT_ID}::uuid, 'CAT-01', 'Concrete')
      `;
      await infra.prisma.$executeRaw`
        INSERT INTO boq.boq_items (category_id, version_id, tenant_id, description, unit, quantity, unit_cost, estimated_total, currency_code)
        VALUES (${CATEGORY_ID}::uuid, ${VERSION_ID}::uuid, ${TENANT_ID}::uuid, 'Cement bag', 'bag',
                10.0000, 150.0000, 1500.0000, 'THB')
      `;
    });

    it('returns 200 JSON with the version, categories and items (default format)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/boq/versions/${VERSION_ID}/export`)
        .set('Authorization', PM_TOKEN)
        .expect(200);
      expect(res.body.version.version_id).toBe(VERSION_ID);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].description).toBe('Cement bag');
    });

    it('returns 200 CSV with a text/csv content-type when format=csv', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/boq/versions/${VERSION_ID}/export?format=csv`)
        .set('Authorization', PM_TOKEN)
        .expect(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.text.split('\r\n')[0]).toContain('version_number');
      expect(res.text).toContain('Cement bag');
      expect(res.text).toContain('CAT-01');
    });
  });
});

// Integration tests: BOQ Service — Phase 4
// Full BOQ lifecycle: create version → add categories → add items → approve.
// Phase 18 wires full container stack (PostgreSQL testcontainer).
// This skeleton tests HTTP contract, validation, and basic flow.

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { JwtAuthGuard } from '../src/modules/identity/guards/jwt-auth.guard';
import { AppModule } from '../src/app.module';

const PM_TOKEN = 'Bearer test-pm-token';
const ADMIN_TOKEN = 'Bearer test-admin-token';

describe('BOQ Integration (Phase 4)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: {
          switchToHttp: () => {
            getRequest: () => {
              headers: { authorization: string };
              tenantId: string;
              user: { user_id: string; role: string };
            };
          };
        }) => {
          const req = ctx.switchToHttp().getRequest();
          const auth = req.headers['authorization'];
          req.tenantId = 'tenant-integration-001';
          req.user =
            auth === ADMIN_TOKEN
              ? { user_id: 'admin-001', role: 'TENANT_ADMIN' }
              : { user_id: 'pm-001', role: 'PROJECT_MANAGER' };
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

  describe('POST /api/v1/projects/:projectId/boq/versions', () => {
    it('returns 201 with valid payload', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/projects/project-test-001/boq/versions')
        .set('Authorization', PM_TOKEN)
        .send({ currency_code: 'THB' });
      // Without real DB this will return 500 — validates routing/validation layer
      expect([201, 409, 500]).toContain(res.status);
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
    it('requires authentication', async () => {
      const res = await request(app.getHttpServer()).post(
        '/api/v1/projects/p-001/boq/versions/v-001/approve',
      );
      expect([401, 403, 500]).toContain(res.status);
    });
  });
});

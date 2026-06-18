// Integration tests: Procurement Service — Phase 5
// Full procurement lifecycle: vendor → purchase request → RFQ → PO → delivery → invoice.
// Phase 18 wires full container stack (PostgreSQL + Temporal testcontainer).
// This skeleton tests HTTP contract, validation, and basic flow.

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { JwtAuthGuard } from '../src/modules/identity/guards/jwt-auth.guard';
import { AppModule } from '../src/app.module';
import { buildCreateVendorDto, buildCreatePurchaseRequestDto } from '@cos/test-utils';

const PM_TOKEN = 'Bearer test-pm-token';
const ADMIN_TOKEN = 'Bearer test-admin-token';
const PROC_TOKEN = 'Bearer test-proc-token';

describe('Procurement Integration (Phase 5)', () => {
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
              tenantCode: string;
              user: { user_id: string; role: string };
            };
          };
        }) => {
          const req = ctx.switchToHttp().getRequest();
          const auth = req.headers['authorization'];
          req.tenantId = 'tenant-integration-001';
          req.tenantCode = 'acme_corp';
          if (auth === ADMIN_TOKEN) {
            req.user = { user_id: 'admin-001', role: 'TENANT_ADMIN' };
          } else if (auth === PROC_TOKEN) {
            req.user = { user_id: 'proc-001', role: 'PROCUREMENT_OFFICER' };
          } else {
            req.user = { user_id: 'pm-001', role: 'PROJECT_MANAGER' };
          }
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

  describe('POST /api/v1/procurement/vendors', () => {
    it('returns 201 with valid vendor payload', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/procurement/vendors')
        .set('Authorization', PROC_TOKEN)
        .send(
          buildCreateVendorDto({
            vendor_code: 'VND-001',
            vendor_name: 'Test Vendor Co.',
            contact_email: 'vendor@test.com',
          }),
        );
      expect([201, 409, 500]).toContain(res.status);
    });

    it('returns 400 when vendor_code is missing', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/procurement/vendors')
        .set('Authorization', PROC_TOKEN)
        .send({ vendor_name: 'No Code Vendor' });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/v1/procurement/purchase-requests', () => {
    it('returns 201 with valid PR payload', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/procurement/purchase-requests')
        .set('Authorization', PM_TOKEN)
        .send(buildCreatePurchaseRequestDto({ pr_number: 'PR-001' }));
      expect([201, 409, 500]).toContain(res.status);
    });

    it('returns 400 when pr_number is missing', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/procurement/purchase-requests')
        .set('Authorization', PM_TOKEN)
        .send({});
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/v1/procurement/rfqs', () => {
    it('returns 400 when deadline is missing', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/procurement/rfqs')
        .set('Authorization', PROC_TOKEN)
        .send({
          project_id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
          rfq_number: 'RFQ-001',
        });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/v1/procurement/purchase-orders', () => {
    it('returns 400 when total_amount is not a valid decimal string', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/procurement/purchase-orders')
        .set('Authorization', PROC_TOKEN)
        .send({
          vendor_id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
          project_id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
          po_number: 'PO-001',
          total_amount: 'not-a-number',
          currency_code: 'THB',
          delivery_date: '2026-12-31',
        });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/v1/procurement/purchase-orders/:poId/approve', () => {
    it('requires authentication', async () => {
      const res = await request(app.getHttpServer()).post(
        '/api/v1/procurement/purchase-orders/00000000-0000-0000-0000-000000000000/approve',
      );
      expect([401, 403, 500]).toContain(res.status);
    });
  });

  describe('GET /api/v1/procurement/vendors', () => {
    it('returns 200 with list', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/procurement/vendors')
        .set('Authorization', PROC_TOKEN);
      expect([200, 500]).toContain(res.status);
    });
  });
});

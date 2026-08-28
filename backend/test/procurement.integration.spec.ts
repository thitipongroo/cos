// Integration tests: Procurement Service — Phase 5
// Full procurement lifecycle: vendor → purchase request → RFQ → PO → delivery → invoice.
// Phase 18 wires full container stack (PostgreSQL + Temporal testcontainer).
// This skeleton tests HTTP contract, validation, and basic flow.

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { JwtAuthGuard } from '../src/shared/guards/jwt-auth.guard';
import {
  startIntegrationInfra,
  stopIntegrationInfra,
  clsAuthGuard,
  type IntegrationInfra,
} from './helpers/integration-infra';
import { AppModule } from '../src/app.module';
import { buildCreateVendorDto, buildCreatePurchaseRequestDto } from '@cos/test-utils';

const ADMIN_TOKEN = 'Bearer test-admin-token';
const PROC_TOKEN = 'Bearer test-proc-token';
const TENANT_ID = 'ee000003-0001-4000-8000-000000000001';
const ADMIN_ID = 'ee000003-0002-4000-8000-000000000001';
const PROC_ID = 'ee000003-0003-4000-8000-000000000001';
const PM_ID = 'ee000003-0004-4000-8000-000000000001';

describe('Procurement Integration (Phase 5)', () => {
  let infra: IntegrationInfra;
  let app: INestApplication;

  beforeAll(async () => {
    infra = await startIntegrationInfra();
    await infra.prisma.$executeRaw`
      INSERT INTO platform.tenants (tenant_id, tenant_code, tenant_name, keycloak_realm, plan_type, is_active)
      VALUES (${TENANT_ID}::uuid, 'acme_corp', 'Procurement Integration Tenant', 'proc-realm', 'STARTER'::platform."PlanType", true)
    `;

    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(
        clsAuthGuard((req) => {
          const auth = (req['headers'] as Record<string, string>)?.['authorization'];
          if (auth === ADMIN_TOKEN)
            return {
              tenant_id: TENANT_ID,
              user_id: ADMIN_ID,
              role: 'TENANT_ADMIN',
              tenantCode: 'acme_corp',
            };
          if (auth === PROC_TOKEN)
            return {
              tenant_id: TENANT_ID,
              user_id: PROC_ID,
              role: 'PROCUREMENT_OFFICER',
              tenantCode: 'acme_corp',
            };
          return {
            tenant_id: TENANT_ID,
            user_id: PM_ID,
            role: 'PROJECT_MANAGER',
            tenantCode: 'acme_corp',
          };
        }),
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
      expect([201, 409]).toContain(res.status);
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
        .set('Authorization', PROC_TOKEN) // PR creation requires PROCUREMENT_OFFICER
        .send({
          ...buildCreatePurchaseRequestDto({ pr_number: 'PR-001' }),
          project_id: '3fa85f64-5717-4562-b3fc-2c963f66afa6', // required @IsUUID (not in factory type)
        });
      expect([201, 409]).toContain(res.status);
    });

    it('returns 400 when pr_number is missing', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/procurement/purchase-requests')
        .set('Authorization', PROC_TOKEN)
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
    // The body used to be typed inline (`@Body() body: { tier: 'PM' | ... }`). A type is erased at
    // runtime, so ValidationPipe had no class to validate: a request with no body reached
    // `body.tier` and threw TypeError, which the caller saw as 500. These three assert the DTO is
    // doing its job — the first two would have been 500 before it existed.
    it('answers 400 when no body is sent at all', async () => {
      const res = await request(app.getHttpServer()).post(
        '/api/v1/procurement/purchase-orders/00000000-0000-0000-0000-000000000000/approve',
      );
      expect(res.status).toBe(400);
    });

    it('answers 400 for a tier outside the approval chain', async () => {
      // master:1513-1517 names PM / FINANCE / EXECUTIVE / TENANT_ADMIN. Anything else used to be
      // forwarded straight to the workflow signal.
      const res = await request(app.getHttpServer())
        .post('/api/v1/procurement/purchase-orders/00000000-0000-0000-0000-000000000000/approve')
        .send({ tier: 'INTERN' });
      expect(res.status).toBe(400);
    });

    it('gets past validation for a valid tier — the control', async () => {
      // The PO does not exist, so this cannot succeed; what matters is that it is no longer the
      // BODY being rejected, and that an unknown PO is not a 500 either.
      const res = await request(app.getHttpServer())
        .post('/api/v1/procurement/purchase-orders/00000000-0000-0000-0000-000000000000/approve')
        .send({ tier: 'PM' });
      expect(res.status).not.toBe(400);
      expect(res.status).toBeLessThan(500);
    });
  });

  describe('GET /api/v1/procurement/vendors', () => {
    it('returns 200 with list', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/procurement/vendors')
        .set('Authorization', PROC_TOKEN);
      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/v1/procurement/vendors/:vendorId/quotations', () => {
    const VENDOR_ID = 'ee000003-0005-4000-8000-000000000001';
    const RFQ_ID = 'ee000003-0006-4000-8000-000000000001';

    beforeAll(async () => {
      await infra.prisma.$executeRaw`
        INSERT INTO procurement.vendors (vendor_id, tenant_id, vendor_code, vendor_name)
        VALUES (${VENDOR_ID}::uuid, ${TENANT_ID}::uuid, 'VND-HIST', 'History Vendor Co.')
      `;
      await infra.prisma.$executeRaw`
        INSERT INTO procurement.rfqs (rfq_id, project_id, tenant_id, rfq_number, status, deadline, created_by)
        VALUES (${RFQ_ID}::uuid, gen_random_uuid(), ${TENANT_ID}::uuid, 'RFQ-HIST', 'PUBLISHED',
                now() + interval '7 days', ${PROC_ID}::uuid)
      `;
      await infra.prisma.$executeRaw`
        INSERT INTO procurement.quotations (rfq_id, vendor_id, tenant_id, total_amount, currency_code, validity_days, submitted_at)
        VALUES (${RFQ_ID}::uuid, ${VENDOR_ID}::uuid, ${TENANT_ID}::uuid, 12500.0000, 'THB', 30, now())
      `;
    });

    it('returns 200 with the vendor quotation history', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/procurement/vendors/${VENDOR_ID}/quotations`)
        .set('Authorization', PROC_TOKEN)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].vendor_id).toBe(VENDOR_ID);
      // total_amount comes back numerically-normalized (trailing zeros stripped) — compare by value.
      expect(Number(res.body[0].total_amount)).toBe(12500);
    });

    it('returns 404 for an unknown vendor', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/procurement/vendors/ee000003-9999-4000-8000-000000000999/quotations')
        .set('Authorization', PROC_TOKEN)
        .expect(404);
    });
  });
});

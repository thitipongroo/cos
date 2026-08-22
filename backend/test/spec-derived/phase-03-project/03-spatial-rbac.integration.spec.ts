/**
 * Phase 3 checklist items 11 and 12 — master:2171-2179
 *
 *   "RBAC: read = any tenant user, write = PROJECT_MANAGER / TENANT_ADMIN;
 *    no Kafka events — backing/reference data"
 *
 * The second half is a NEGATIVE rule and the easy one to lose: nothing fails if a spatial write
 * starts emitting events, it just quietly widens the event contract. Asserted by counting rows in
 * platform.outbox_events (the outbox IS the publish — event-outbox.service.ts:107) before and after.
 */
jest.mock('@aws-sdk/client-sns', () => ({
  SNSClient: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({ MessageId: 'mock-msg-id' }),
  })),
  PublishCommand: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import {
  startIntegrationInfra,
  stopIntegrationInfra,
  clsAuthGuard,
  type IntegrationInfra,
} from '../../helpers/integration-infra';
import { AppModule } from '../../../src/app.module';
import { JwtAuthGuard } from '../../../src/modules/identity/guards/jwt-auth.guard';

jest.setTimeout(900_000);

const TENANT_ID = 'eeeeeeee-1111-4000-8000-000000000001';
const USER_ID = 'eeeeeeee-2222-4000-8000-000000000001';

const roleOf = (req: Record<string, unknown>): string => {
  const headers = (req['headers'] ?? {}) as Record<string, string>;
  return headers['x-test-role'] ?? 'TENANT_ADMIN';
};

describe('Phase 3 · spatial hierarchy RBAC and event silence (master:2171-2179)', () => {
  let infra: IntegrationInfra;
  let app: INestApplication;
  let projectId = '';
  let seq = 0;

  beforeAll(async () => {
    infra = await startIntegrationInfra();
    await infra.prisma.$executeRawUnsafe(
      `INSERT INTO platform.tenants (tenant_id, tenant_code, tenant_name, keycloak_realm, plan_type, is_active)
       VALUES ($1::uuid, 'sd-p3s', 'Spec Derived P3 Spatial', 'construction-os', 'STARTER'::platform."PlanType", true)`,
      TENANT_ID,
    );
    await infra.prisma.$executeRawUnsafe(
      `INSERT INTO platform.users (user_id, tenant_id, keycloak_user_id, phone_number, email, display_name)
       VALUES ($1::uuid, $2::uuid, 'kc-p3s', '+66890000009', 'p3s@example.com', 'P3S')`,
      USER_ID,
      TENANT_ID,
    );

    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard(JwtAuthGuard)
      .useValue(clsAuthGuard((req) => (req['user'] ?? {}) as Record<string, string>))
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    // req.user must exist before app.init() — see 02-state-machine for why.
    app.use((req: Record<string, unknown>, _res: unknown, next: () => void) => {
      req['user'] = {
        tenant_id: TENANT_ID,
        user_id: USER_ID,
        role: roleOf(req),
        tenantCode: 'sd-p3s',
      };
      next();
    });
    await app.init();

    const res = await request(app.getHttpServer())
      .post('/api/v1/projects')
      .set('x-test-role', 'TENANT_ADMIN')
      .send({
        project_code: 'SD-P3S-1',
        project_name: 'Spatial Host',
        project_type: 'COMMERCIAL',
        start_date: '2019-01-01',
        end_date: '2020-01-01',
      });
    expect([200, 201]).toContain(res.status);
    const body = res.body as { project_id?: string; projectId?: string };
    projectId = (body.project_id ?? body.projectId) as string;
  });

  afterAll(async () => {
    await app?.close();
    await stopIntegrationInfra(infra);
  });

  const http = () => request(app.getHttpServer());

  const createBuilding = (role: string) => {
    seq += 1;
    return http()
      .post(`/api/v1/projects/${projectId}/buildings`)
      .set('x-test-role', role)
      .send({ building_name: `Tower ${seq}`, building_type: 'OFFICE', total_floors: 10 });
  };

  const outboxCount = async (): Promise<number> => {
    const rows = await infra.prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
      // platform.outbox_events.tenant_id is TEXT, not uuid — casting the parameter to uuid
      // raises 42883 "operator does not exist: text = uuid".
      `SELECT count(*) AS n FROM platform.outbox_events WHERE tenant_id = $1`,
      TENANT_ID,
    );
    return Number(rows[0]?.n ?? 0);
  };

  describe('write is limited to PROJECT_MANAGER / TENANT_ADMIN (master:2172-2173)', () => {
    it.each(['TENANT_ADMIN', 'PROJECT_MANAGER'])('%s may create a building', async (role) => {
      const res = await createBuilding(role);
      expect([200, 201]).toContain(res.status);
    });

    it.each(['SITE_WORKER', 'SITE_ENGINEER', 'FINANCE', 'VIEWER'])(
      '%s is refused a create',
      async (role) => {
        const res = await createBuilding(role);
        expect(res.status).toBe(403);
      },
    );
  });

  describe('read is open to any tenant user (master:2172)', () => {
    it.each(['TENANT_ADMIN', 'PROJECT_MANAGER', 'SITE_WORKER', 'FINANCE', 'VIEWER'])(
      '%s may list buildings',
      async (role) => {
        const res = await http()
          .get(`/api/v1/projects/${projectId}/buildings`)
          .set('x-test-role', role);
        expect(res.status).toBe(200);
      },
    );
  });

  describe('spatial writes emit NO Kafka events (master:2173)', () => {
    it('creating a building adds nothing to the outbox', async () => {
      const before = await outboxCount();
      const res = await createBuilding('TENANT_ADMIN');
      expect([200, 201]).toContain(res.status);
      expect(await outboxCount()).toBe(before);
    });

    it('updating and deleting a building add nothing to the outbox', async () => {
      const created = await createBuilding('TENANT_ADMIN');
      const body = created.body as { building_id?: string };
      const id = body.building_id as string;
      expect(id).toBeDefined();

      const before = await outboxCount();
      const patched = await http()
        .patch(`/api/v1/buildings/${id}`)
        .set('x-test-role', 'TENANT_ADMIN')
        .send({ building_name: 'Renamed Tower' });
      expect([200, 204]).toContain(patched.status);

      const deleted = await http()
        .delete(`/api/v1/buildings/${id}`)
        .set('x-test-role', 'TENANT_ADMIN');
      expect([200, 204]).toContain(deleted.status);

      expect(await outboxCount()).toBe(before);
    });
  });

  describe('a project write DOES emit an event — the control for the rule above (master:2194)', () => {
    it('creating a project adds to the outbox', async () => {
      const before = await outboxCount();
      const res = await http().post('/api/v1/projects').set('x-test-role', 'TENANT_ADMIN').send({
        project_code: 'SD-P3S-CTRL',
        project_name: 'Control',
        project_type: 'RESIDENTIAL',
        start_date: '2019-01-01',
        end_date: '2020-01-01',
      });
      expect([200, 201]).toContain(res.status);
      expect(await outboxCount()).toBeGreaterThan(before);
    });
  });
});

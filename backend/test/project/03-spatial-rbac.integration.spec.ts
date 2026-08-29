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
} from '../helpers/integration-infra';
import { AppModule } from '../../src/app.module';
import { JwtAuthGuard } from '../../src/shared/guards/jwt-auth.guard';

const TENANT_ID = 'eeeeeeee-1111-4000-8000-000000000001';
const USER_ID = 'eeeeeeee-2222-4000-8000-000000000001';
const MISSING_ID = 'eeeeeeee-9999-4000-8000-000000000999';

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

  // ── CRUD across the whole hierarchy ─────────────────────────────────────
  //
  // Absorbed from backend/test/project-spatial.integration.spec.ts (deleted 2026-08-25) when the two
  // spatial suites were merged. The RBAC and event-silence rules above only ever touch BUILDINGS;
  // master:2171-2179 declares five levels plus assets, and nothing else exercises floors, rooms,
  // structures, units or assets over HTTP at all.

  describe('the full building → floor → room → structure → unit → asset lifecycle', () => {
    it('creates, reads, lists, updates and deletes every level', async () => {
      const admin = 'TENANT_ADMIN';
      const created = await createBuilding(admin);
      expect([200, 201]).toContain(created.status);
      const buildingId = (created.body as { building_id: string }).building_id;
      expect((created.body as { tenant_id: string }).tenant_id).toBe(TENANT_ID);

      await http().get(`/api/v1/buildings/${buildingId}`).set('x-test-role', admin).expect(200);
      const bList = await http()
        .get(`/api/v1/projects/${projectId}/buildings`)
        .set('x-test-role', admin)
        .expect(200);
      expect(
        (bList.body as { items: Array<{ building_id: string }> }).items.some(
          (b) => b.building_id === buildingId,
        ),
      ).toBe(true);
      const bUpd = await http()
        .patch(`/api/v1/buildings/${buildingId}`)
        .set('x-test-role', admin)
        .send({ building_name: 'Tower A1' })
        .expect(200);
      expect((bUpd.body as { building_name: string }).building_name).toBe('Tower A1');

      // ── Floor ──
      const fRes = await http()
        .post(`/api/v1/buildings/${buildingId}/floors`)
        .set('x-test-role', admin)
        .send({ floor_number: 5, gross_area_sqm: '1250.50' })
        .expect(201);
      const floorId = (fRes.body as { floor_id: string }).floor_id;
      await http().get(`/api/v1/floors/${floorId}`).set('x-test-role', admin).expect(200);
      await http()
        .get(`/api/v1/buildings/${buildingId}/floors`)
        .set('x-test-role', admin)
        .expect(200);
      await http()
        .patch(`/api/v1/floors/${floorId}`)
        .set('x-test-role', admin)
        .send({ floor_number: 6 })
        .expect(200);

      // ── Room ──
      const rRes = await http()
        .post(`/api/v1/floors/${floorId}/rooms`)
        .set('x-test-role', admin)
        .send({ room_number: '6-A', room_type: 'BEDROOM', area_sqm: '24.50' })
        .expect(201);
      const roomId = (rRes.body as { room_id: string }).room_id;
      await http().get(`/api/v1/rooms/${roomId}`).set('x-test-role', admin).expect(200);
      await http().get(`/api/v1/floors/${floorId}/rooms`).set('x-test-role', admin).expect(200);
      await http()
        .patch(`/api/v1/rooms/${roomId}`)
        .set('x-test-role', admin)
        .send({ room_type: 'STUDY' })
        .expect(200);

      // ── Structure ──
      const sRes = await http()
        .post(`/api/v1/buildings/${buildingId}/structures`)
        .set('x-test-role', admin)
        .send({ structure_type: 'column', material_type: 'RC' })
        .expect(201);
      const structureId = (sRes.body as { structure_id: string }).structure_id;
      await http().get(`/api/v1/structures/${structureId}`).set('x-test-role', admin).expect(200);
      await http()
        .get(`/api/v1/buildings/${buildingId}/structures`)
        .set('x-test-role', admin)
        .expect(200);
      await http()
        .patch(`/api/v1/structures/${structureId}`)
        .set('x-test-role', admin)
        .send({ structure_type: 'beam' })
        .expect(200);

      // ── Unit ──
      const uRes = await http()
        .post(`/api/v1/buildings/${buildingId}/units`)
        .set('x-test-role', admin)
        .send({ unit_number: 'A-0601', unit_type: '2BR', status: 'AVAILABLE' })
        .expect(201);
      const unitId = (uRes.body as { unit_id: string }).unit_id;
      // project_id is DERIVED from the building, not sent by the client — a unit that had to be
      // told its own project could be filed under a different one from its building.
      expect((uRes.body as { project_id: string }).project_id).toBe(projectId);
      await http().get(`/api/v1/units/${unitId}`).set('x-test-role', admin).expect(200);
      await http()
        .get(`/api/v1/buildings/${buildingId}/units`)
        .set('x-test-role', admin)
        .expect(200);
      await http()
        .patch(`/api/v1/units/${unitId}`)
        .set('x-test-role', admin)
        .send({ status: 'SOLD' })
        .expect(200);

      // ── Asset ──
      const aRes = await http()
        .post(`/api/v1/projects/${projectId}/assets`)
        .set('x-test-role', admin)
        .send({ asset_type: 'HVAC', handover_date: '2027-01-15', maintenance_status: 'OK' })
        .expect(201);
      const assetId = (aRes.body as { asset_id: string }).asset_id;
      await http().get(`/api/v1/assets/${assetId}`).set('x-test-role', admin).expect(200);
      await http()
        .get(`/api/v1/projects/${projectId}/assets`)
        .set('x-test-role', admin)
        .expect(200);
      await http()
        .patch(`/api/v1/assets/${assetId}`)
        .set('x-test-role', admin)
        .send({ maintenance_status: 'DUE' })
        .expect(200);

      // ── Delete child → parent ──
      await http().delete(`/api/v1/assets/${assetId}`).set('x-test-role', admin).expect(204);
      await http().delete(`/api/v1/units/${unitId}`).set('x-test-role', admin).expect(204);
      await http()
        .delete(`/api/v1/structures/${structureId}`)
        .set('x-test-role', admin)
        .expect(204);
      await http().delete(`/api/v1/rooms/${roomId}`).set('x-test-role', admin).expect(204);
      await http().delete(`/api/v1/floors/${floorId}`).set('x-test-role', admin).expect(204);
      await http().delete(`/api/v1/buildings/${buildingId}`).set('x-test-role', admin).expect(204);
      await http().get(`/api/v1/buildings/${buildingId}`).set('x-test-role', admin).expect(404);
    });

    it('answers 404 when the parent project does not exist', async () => {
      await http()
        .post(`/api/v1/projects/${MISSING_ID}/buildings`)
        .set('x-test-role', 'TENANT_ADMIN')
        .send({ building_name: 'Ghost' })
        .expect(404);
    });

    it('answers 404 when the parent building does not exist', async () => {
      await http()
        .post(`/api/v1/buildings/${MISSING_ID}/units`)
        .set('x-test-role', 'TENANT_ADMIN')
        .send({ unit_number: 'X-1' })
        .expect(404);
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

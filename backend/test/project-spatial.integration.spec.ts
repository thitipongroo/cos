// Integration tests: Project spatial hierarchy + asset/unit entities — Phase 3 (2026-07-05).
// Full CRUD across buildings → floors → rooms → structures → units, and project → assets,
// against a real PostgreSQL via Testcontainers (QM-1). Mirrors project.integration.spec.ts setup.

jest.mock('@opensearch-project/opensearch', () => ({
  Client: jest.fn().mockImplementation(() => ({
    index: jest.fn().mockResolvedValue({}),
    search: jest.fn().mockResolvedValue({ body: { hits: { hits: [] } } }),
  })),
}));

jest.mock('@cos/kafka', () => {
  const actual = jest.requireActual('@cos/kafka');
  const noopKafka = {
    connect: jest.fn().mockResolvedValue(undefined),
    publish: jest.fn().mockResolvedValue(undefined),
    subscribe: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
    disconnect: jest.fn().mockResolvedValue(undefined),
  };
  return {
    ...actual,
    KafkaProducer: jest.fn().mockImplementation(() => noopKafka),
    KafkaConsumer: jest.fn().mockImplementation(() => noopKafka),
  };
});

import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, StartedRedisContainer } from '@testcontainers/redis';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { createPrismaClient } from '../src/shared/prisma/create-prisma-client';
import { ClsServiceManager } from 'nestjs-cls';
import { AppModule } from '../src/app.module';
import { JwtAuthGuard } from '../src/modules/identity/guards/jwt-auth.guard';

const TENANT_ID = 'dddddddd-1111-4000-8000-000000000001';
const USER_ID = 'dddddddd-2222-4000-8000-000000000001';
const PROJECT_ID = 'dddddddd-3333-4000-8000-000000000001';
const MISSING_ID = 'dddddddd-9999-4000-8000-000000000999';

const mockRole = 'PROJECT_MANAGER';

describe('Project Spatial Integration (Testcontainers — PostgreSQL)', () => {
  let pgContainer: StartedPostgreSqlContainer;
  let redisContainer: StartedRedisContainer;
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    pgContainer = await new PostgreSqlContainer('timescale/timescaledb:latest-pg16').start();
    const pgUrl = pgContainer.getConnectionUri();
    redisContainer = await new RedisContainer('redis:7-alpine').start();
    process.env['DATABASE_URL'] = pgUrl;
    process.env['DIRECT_DATABASE_URL'] = pgUrl;
    process.env['APP_DATABASE_URL'] = pgUrl;
    process.env['REDIS_URL'] = redisContainer.getConnectionUrl();

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { execSync } = require('child_process') as typeof import('child_process');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const os = require('os') as typeof import('os');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodePath = require('path') as typeof import('path');
    const schemaPath = nodePath.resolve(__dirname, '../prisma/schema.prisma');
    const prismaBin = nodePath.resolve(__dirname, '../node_modules/.bin/prisma');
    const configPath = nodePath.resolve(__dirname, '../prisma.config.ts');
    execSync(`"${prismaBin}" migrate deploy --schema "${schemaPath}" --config "${configPath}"`, {
      cwd: os.tmpdir(),
      env: { ...process.env, DATABASE_URL: pgUrl, DIRECT_DATABASE_URL: pgUrl },
      stdio: 'inherit',
    });

    prisma = createPrismaClient(pgUrl);

    await prisma.$executeRaw`
      INSERT INTO platform.tenants (tenant_id, tenant_code, tenant_name, keycloak_realm, plan_type, is_active)
      VALUES (${TENANT_ID}::uuid, 'spatial-int', 'Spatial Integration Tenant',
              'spatial-realm', 'STARTER'::platform."PlanType", true)
    `;
    await prisma.$executeRaw`
      INSERT INTO platform.users (user_id, tenant_id, keycloak_user_id, email, display_name)
      VALUES (${USER_ID}::uuid, ${TENANT_ID}::uuid, 'kc-spatial', 'pm@spatial.test', 'PM User')
    `;
    await prisma.$executeRaw`
      INSERT INTO platform.tenant_memberships (tenant_id, user_id, role)
      VALUES (${TENANT_ID}::uuid, ${USER_ID}::uuid, 'PROJECT_MANAGER'::platform."CosRoleEnum")
    `;
    // Seed a project directly (RLS: set app.current_tenant_id via the app role at request time only;
    // the seed uses the superuser connection which bypasses RLS).
    await prisma.$executeRaw`
      INSERT INTO projects.projects (project_id, tenant_id, project_code, project_name, project_type, status, created_by)
      VALUES (${PROJECT_ID}::uuid, ${TENANT_ID}::uuid, 'SPATIAL-1', 'Spatial Project',
              'RESIDENTIAL'::"ProjectType", 'ACTIVE'::"ProjectStatus", ${USER_ID}::uuid)
    `;

    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          const req = ctx
            .switchToHttp()
            .getRequest<{ user?: { tenant_id?: string; user_id?: string; role?: string } }>();
          const u = req.user;
          const cls = ClsServiceManager.getClsService();
          if (u?.tenant_id && cls.isActive()) {
            cls.set('tenantId', u.tenant_id);
            cls.set('userId', u.user_id);
            cls.set('userRole', u.role);
            cls.set('tenantCode', 'spatial-int');
            cls.set('dedicatedDbUrl', undefined);
          }
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.use((req: Record<string, unknown>, _res: unknown, next: () => void) => {
      req.user = { tenant_id: TENANT_ID, user_id: USER_ID, role: mockRole };
      next();
    });
    await app.init();
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await app?.close();
    await pgContainer?.stop();
    await redisContainer?.stop();
  });

  const http = () => request(app.getHttpServer());

  it('runs the full building → floor → room → structure → unit → asset CRUD lifecycle', async () => {
    // ── Building ──
    const bRes = await http()
      .post(`/api/v1/projects/${PROJECT_ID}/buildings`)
      .send({
        building_name: 'Tower A',
        building_type: 'RESIDENTIAL',
        total_floors: 30,
        location: 'BKK',
      })
      .expect(201);
    const buildingId = bRes.body.building_id as string;
    expect(bRes.body.building_name).toBe('Tower A');
    expect(bRes.body.tenant_id).toBe(TENANT_ID);

    await http().get(`/api/v1/buildings/${buildingId}`).expect(200);
    const bList = await http().get(`/api/v1/projects/${PROJECT_ID}/buildings`).expect(200);
    expect(
      bList.body.items.some((b: { building_id: string }) => b.building_id === buildingId),
    ).toBe(true);
    const bUpd = await http()
      .patch(`/api/v1/buildings/${buildingId}`)
      .send({ building_name: 'Tower A1' })
      .expect(200);
    expect(bUpd.body.building_name).toBe('Tower A1');

    // ── Floor ──
    const fRes = await http()
      .post(`/api/v1/buildings/${buildingId}/floors`)
      .send({ floor_number: 5, gross_area_sqm: '1250.50' })
      .expect(201);
    const floorId = fRes.body.floor_id as string;
    await http().get(`/api/v1/floors/${floorId}`).expect(200);
    await http().get(`/api/v1/buildings/${buildingId}/floors`).expect(200);
    await http().patch(`/api/v1/floors/${floorId}`).send({ floor_number: 6 }).expect(200);

    // ── Room ──
    const rRes = await http()
      .post(`/api/v1/floors/${floorId}/rooms`)
      .send({ room_number: '6-A', room_type: 'BEDROOM', area_sqm: '24.50' })
      .expect(201);
    const roomId = rRes.body.room_id as string;
    await http().get(`/api/v1/rooms/${roomId}`).expect(200);
    await http().get(`/api/v1/floors/${floorId}/rooms`).expect(200);
    await http().patch(`/api/v1/rooms/${roomId}`).send({ room_type: 'STUDY' }).expect(200);

    // ── Structure ──
    const sRes = await http()
      .post(`/api/v1/buildings/${buildingId}/structures`)
      .send({ structure_type: 'column', material_type: 'RC' })
      .expect(201);
    const structureId = sRes.body.structure_id as string;
    await http().get(`/api/v1/structures/${structureId}`).expect(200);
    await http().get(`/api/v1/buildings/${buildingId}/structures`).expect(200);
    await http()
      .patch(`/api/v1/structures/${structureId}`)
      .send({ structure_type: 'beam' })
      .expect(200);

    // ── Unit (project_id derived from the building) ──
    const uRes = await http()
      .post(`/api/v1/buildings/${buildingId}/units`)
      .send({ unit_number: 'A-0601', unit_type: '2BR', status: 'AVAILABLE' })
      .expect(201);
    const unitId = uRes.body.unit_id as string;
    expect(uRes.body.project_id).toBe(PROJECT_ID);
    await http().get(`/api/v1/units/${unitId}`).expect(200);
    await http().get(`/api/v1/buildings/${buildingId}/units`).expect(200);
    await http().patch(`/api/v1/units/${unitId}`).send({ status: 'SOLD' }).expect(200);

    // ── Asset ──
    const aRes = await http()
      .post(`/api/v1/projects/${PROJECT_ID}/assets`)
      .send({ asset_type: 'HVAC', handover_date: '2027-01-15', maintenance_status: 'OK' })
      .expect(201);
    const assetId = aRes.body.asset_id as string;
    await http().get(`/api/v1/assets/${assetId}`).expect(200);
    await http().get(`/api/v1/projects/${PROJECT_ID}/assets`).expect(200);
    await http().patch(`/api/v1/assets/${assetId}`).send({ maintenance_status: 'DUE' }).expect(200);

    // ── Delete (child → parent) ──
    await http().delete(`/api/v1/assets/${assetId}`).expect(204);
    await http().delete(`/api/v1/units/${unitId}`).expect(204);
    await http().delete(`/api/v1/structures/${structureId}`).expect(204);
    await http().delete(`/api/v1/rooms/${roomId}`).expect(204);
    await http().delete(`/api/v1/floors/${floorId}`).expect(204);
    await http().delete(`/api/v1/buildings/${buildingId}`).expect(204);
    await http().get(`/api/v1/buildings/${buildingId}`).expect(404);
  }, 60_000);

  it('returns 404 when creating a building under a missing project', async () => {
    await http()
      .post(`/api/v1/projects/${MISSING_ID}/buildings`)
      .send({ building_name: 'Ghost' })
      .expect(404);
  });

  it('returns 404 when creating a unit under a missing building', async () => {
    await http()
      .post(`/api/v1/buildings/${MISSING_ID}/units`)
      .send({ unit_number: 'X-1' })
      .expect(404);
  });
});

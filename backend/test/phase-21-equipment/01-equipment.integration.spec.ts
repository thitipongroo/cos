/**
 * Phase 21 — Equipment Service against a real database (master:5150-5225).
 *
 * Three claims here can only be settled by running: that `create_hypertable` SUCCEEDED rather than
 * merely being called, that the assignment lifecycle moves equipment status in both directions, and
 * that the role gates the controllers now carry actually refuse a write.
 *
 * The RBAC cases matter most. Both equipment controllers shipped with the JWT guard alone and no
 * @Roles decorator anywhere, so every write was open to any authenticated user in the tenant. A
 * decorator alone would not have fixed it either — @Roles is SetMetadata, inert unless RolesGuard
 * reads it — which is why these assert a real 403 through HTTP rather than the presence of a
 * decorator.
 */
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import {
  startIntegrationInfra,
  stopIntegrationInfra,
  clsAuthGuard,
  type IntegrationInfra,
} from '../helpers/integration-infra';
import { AppModule } from '../../src/app.module';
import { JwtAuthGuard } from '../../src/shared/guards/jwt-auth.guard';

jest.setTimeout(900_000);

const TENANT_ID = 'eeeeeeee-1111-4000-8000-000000000021';
const USER_ID = 'eeeeeeee-2222-4000-8000-000000000021';
const PROJECT_ID = 'eeeeeeee-3333-4000-8000-000000000021';

const roleOf = (req: Record<string, unknown>): string => {
  const headers = (req['headers'] ?? {}) as Record<string, string>;
  return headers['x-test-role'] ?? 'TENANT_ADMIN';
};

describe('Phase 21 · equipment over HTTP', () => {
  let infra: IntegrationInfra;
  let app: INestApplication;
  let seq = 0;

  const api = (): ReturnType<typeof request> => request(app.getHttpServer());
  const nextCode = (): string => `EQ-${(seq += 1).toString().padStart(3, '0')}`;

  /** Asserts the status and surfaces the server's message when it disagrees — a bare .expect(201)
   *  reports only the number, which turns every 500 into the same unreadable failure. */
  const expectStatus = (res: request.Response, code: number): request.Response => {
    if (res.status !== code) {
      throw new Error(`expected ${code}, got ${res.status}: ${JSON.stringify(res.body)}`);
    }
    return res;
  };

  const createEquipment = async (): Promise<string> => {
    const res = expectStatus(
      await api().post('/api/v1/equipment').send({
        equipment_code: nextCode(),
        equipment_name: 'Tower Crane',
        equipment_type: 'CRANE',
        purchase_cost: '1500000.0000',
        currency_code: 'THB',
      }),
      201,
    );
    return (res.body as { equipment_id: string }).equipment_id;
  };

  beforeAll(async () => {
    infra = await startIntegrationInfra();

    await infra.prisma.$executeRawUnsafe(
      `INSERT INTO platform.tenants (tenant_id, tenant_code, tenant_name, keycloak_realm, plan_type, is_active)
       VALUES ($1::uuid, 'sd-p21', 'Spec Derived P21', 'realm-sd-p21', 'STARTER'::platform."PlanType", true)`,
      TENANT_ID,
    );
    await infra.prisma.$executeRawUnsafe(
      `INSERT INTO platform.users (user_id, tenant_id, keycloak_user_id, email, display_name)
       VALUES ($1::uuid, $2::uuid, 'kc-sd-p21', 'p21@example.com', 'Spec User')`,
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
    // Set on the request BEFORE app.init(): TenantMiddleware runs ahead of the guards and
    // EquipmentService is REQUEST-scoped, reading tenantId/userId off the request.
    app.use((req: Record<string, unknown>, _res: unknown, next: () => void) => {
      req['user'] = {
        tenant_id: TENANT_ID,
        user_id: USER_ID,
        role: roleOf(req),
        tenantCode: 'sd-p21',
      };
      next();
    });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await stopIntegrationInfra(infra);
  });

  // ── 14. Schema on a real database ─────────────────────────────────────────

  describe('entities (master:5150-5197)', () => {
    it('creates the three equipment tables', async () => {
      const rows = await infra.prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'equipment'`,
      );
      expect(rows.map((r) => r.table_name).sort()).toEqual([
        'equipment',
        'equipment_assignments',
        'equipment_maintenance',
      ]);
    });

    it('registers equipment_utilization as a TimescaleDB hypertable', async () => {
      // The migration CALLS create_hypertable; only a live database says whether it worked. On a
      // plain postgres image the function does not exist and the whole migration deploy fails —
      // the failure Phase 18 traced to the harness using postgres:16-alpine.
      const rows = await infra.prisma.$queryRawUnsafe<
        Array<{ hypertable_name: string; num_dimensions: number }>
      >(
        `SELECT hypertable_name, num_dimensions FROM timescaledb_information.hypertables
          WHERE hypertable_schema = 'equipment_telemetry'`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].hypertable_name).toBe('equipment_utilization');
    });

    it('partitions it on recorded_at', async () => {
      const rows = await infra.prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
        `SELECT column_name FROM timescaledb_information.dimensions
          WHERE hypertable_schema = 'equipment_telemetry'
            AND hypertable_name = 'equipment_utilization'`,
      );
      expect(rows.map((r) => r.column_name)).toEqual(['recorded_at']);
    });

    it('rejects a duplicate equipment_code within the tenant', async () => {
      const code = nextCode();
      const body = {
        equipment_code: code,
        equipment_name: 'Excavator',
        equipment_type: 'EXCAVATOR',
      };
      await api().post('/api/v1/equipment').send(body).expect(201);
      const second = await api().post('/api/v1/equipment').send(body);
      // A reused code is an operator mistake, not a server fault: 409, not 500.
      expect({ status: second.status, body: second.body }).toMatchObject({ status: 409 });
    });
  });

  // ── 15. RLS ───────────────────────────────────────────────────────────────

  describe('tenant isolation', () => {
    it('carries the canonical policy on every equipment table', async () => {
      const rows = await infra.prisma.$queryRawUnsafe<
        Array<{ tablename: string; policyname: string; permissive: string; qual: string | null }>
      >(
        `SELECT tablename, policyname, permissive, qual FROM pg_policies
          WHERE schemaname = 'equipment'`,
      );
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.filter((r) => r.permissive !== 'PERMISSIVE')).toEqual([]);
      expect(rows.filter((r) => r.policyname !== 'rls_tenant_isolation')).toEqual([]);
      // NULLIF, so an unset GUC matches no row instead of raising 22P02 on ''::uuid.
      expect(rows.filter((r) => !(r.qual ?? '').includes('NULLIF'))).toEqual([]);
    });

    it('hides another tenant rows from app_user', async () => {
      const otherTenant = randomUUID();
      const visible = await infra.prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SET LOCAL ROLE app_user');
        await tx.$executeRawUnsafe(
          `SELECT set_config('app.current_tenant_id', $1, true)`,
          otherTenant,
        );
        return tx.$queryRawUnsafe<Array<{ n: bigint }>>(
          `SELECT count(*)::bigint AS n FROM equipment.equipment`,
        );
      });
      // CONTROL: the superuser connection sees the rows this suite created, so a zero above means
      // "RLS filtered them", not "the table is empty".
      const all = await infra.prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
        `SELECT count(*)::bigint AS n FROM equipment.equipment`,
      );
      expect(Number(visible[0].n)).toBe(0);
      expect(Number(all[0].n)).toBeGreaterThan(0);
    });
  });

  // ── 16. Assignment lifecycle ──────────────────────────────────────────────

  describe('assignment lifecycle (master:5165-5173, 5208-5209)', () => {
    it('moves equipment to IN_USE on assignment and back to AVAILABLE on return', async () => {
      const id = await createEquipment();

      const assigned = expectStatus(
        await api()
          .post(`/api/v1/equipment/${id}/assignments`)
          .send({ project_id: PROJECT_ID, notes: 'tower crane to site A' }),
        201,
      );
      const assignmentId = (assigned.body as { assignment_id: string }).assignment_id;

      const inUse = await api().get(`/api/v1/equipment/${id}`).expect(200);
      expect((inUse.body as { status: string }).status).toBe('IN_USE');

      await api()
        .patch(`/api/v1/equipment/${id}/assignments/${assignmentId}/return`)
        .send({})
        .expect(200);

      const back = await api().get(`/api/v1/equipment/${id}`).expect(200);
      expect((back.body as { status: string }).status).toBe('AVAILABLE');

      const rows = await infra.prisma.$queryRawUnsafe<Array<{ returned_at: Date | null }>>(
        `SELECT returned_at FROM equipment.equipment_assignments WHERE assignment_id = $1::uuid`,
        assignmentId,
      );
      expect(rows[0].returned_at).not.toBeNull();
    });

    it('refuses to assign equipment that is not AVAILABLE', async () => {
      const id = await createEquipment();
      await api()
        .post(`/api/v1/equipment/${id}/assignments`)
        .send({ project_id: PROJECT_ID })
        .expect(201);
      // Already IN_USE — a second project cannot take the same crane.
      await api()
        .post(`/api/v1/equipment/${id}/assignments`)
        .send({ project_id: randomUUID() })
        .expect(422);
    });
  });

  // ── 17. Events ────────────────────────────────────────────────────────────

  describe('Kafka events (master:5221-5225)', () => {
    const outboxTypes = async (): Promise<string[]> => {
      const rows = await infra.prisma.$queryRawUnsafe<Array<{ event_type: string }>>(
        // tenant_id is TEXT, not uuid: platform-scope events store the literal 'platform'.
        `SELECT event_type FROM platform.outbox_events WHERE tenant_id = $1`,
        TENANT_ID,
      );
      return rows.map((r) => r.event_type);
    };

    it('publishes assigned and returned around the lifecycle', async () => {
      const id = await createEquipment();
      const assigned = await api()
        .post(`/api/v1/equipment/${id}/assignments`)
        .send({ project_id: PROJECT_ID })
        .expect(201);
      await api()
        .patch(
          `/api/v1/equipment/${id}/assignments/${(assigned.body as { assignment_id: string }).assignment_id}/return`,
        )
        .send({})
        .expect(200);

      const types = await outboxTypes();
      expect(types).toContain('equipment.unit.assigned.v1');
      expect(types).toContain('equipment.unit.returned.v1');
    });

    it('publishes maintenance_scheduled when maintenance is logged', async () => {
      const id = await createEquipment();
      await api()
        .post(`/api/v1/equipment/${id}/maintenance`)
        .send({
          maintenance_type: 'SCHEDULED',
          scheduled_at: '2026-09-01T08:00:00.000Z',
          cost: '25000.0000',
          currency_code: 'THB',
        })
        .expect(201);

      expect(await outboxTypes()).toContain('equipment.unit.maintenance_scheduled.v1');
    });
  });

  // ── RBAC over HTTP ────────────────────────────────────────────────────────

  describe('RBAC (06-rbac-permission-matrix §Construction Modules, Equipment row)', () => {
    it('refuses a write from a role the matrix gives read-only', async () => {
      // Site Engineer is R on Equipment. Before RolesGuard was wired in, this returned 201.
      await api()
        .post('/api/v1/equipment')
        .set('x-test-role', 'SITE_ENGINEER')
        .send({
          equipment_code: nextCode(),
          equipment_name: 'Mixer',
          equipment_type: 'CONCRETE_MIXER',
        })
        .expect(403);
    });

    it('refuses a write from a role the matrix excludes entirely', async () => {
      await api()
        .post('/api/v1/equipment')
        .set('x-test-role', 'SAFETY_OFFICER')
        .send({
          equipment_code: nextCode(),
          equipment_name: 'Generator',
          equipment_type: 'GENERATOR',
        })
        .expect(403);
    });

    it('allows the Project Manager to write', async () => {
      // CONTROL: the two refusals above must come from the ROLE, not from a broken route.
      await api()
        .post('/api/v1/equipment')
        .set('x-test-role', 'PROJECT_MANAGER')
        .send({
          equipment_code: nextCode(),
          equipment_name: 'Scaffold',
          equipment_type: 'SCAFFOLD',
        })
        .expect(201);
    });

    it('refuses even a READ from a role the matrix excludes', async () => {
      await api().get('/api/v1/equipment').set('x-test-role', 'SAFETY_OFFICER').expect(403);
    });

    it('allows a read from a read-only role', async () => {
      await api().get('/api/v1/equipment').set('x-test-role', 'FINANCE').expect(200);
    });
  });
});

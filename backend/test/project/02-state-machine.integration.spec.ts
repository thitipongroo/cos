/**
 * Phase 3 Generate items 04 and 09 — master:2186, 2191, against the state machine at master:2046-2065.
 *
 *   "State machine guard (validates allowed transitions before processing)"
 *   "Integration tests: full CRUD + transition flows"
 *
 * The spec fixes the machine exactly, and closes it: "Do NOT invent additional states or
 * transitions" (master:2065). So this asserts BOTH halves — every legal edge works, and the
 * illegal ones are refused. A machine that only accepts is not the specified machine.
 *
 *   DRAFT   -> ACTIVE      PROJECT_MANAGER or TENANT_ADMIN
 *   ACTIVE  -> ON_HOLD     PM or TENANT_ADMIN; records on_hold_reason + on_hold_at
 *   ON_HOLD -> ACTIVE      PM or TENANT_ADMIN
 *   ACTIVE  -> COMPLETED   TENANT_ADMIN only; end_date must be <= today
 *   ANY     -> CANCELLED   TENANT_ADMIN only; records cancellation_reason + cancelled_at; terminal
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

jest.setTimeout(900_000);

const TENANT_ID = 'dddddddd-1111-4000-8000-000000000001';
const USER_ID = 'dddddddd-2222-4000-8000-000000000001';

const roleOf = (req: Record<string, unknown>): string => {
  const headers = (req['headers'] ?? {}) as Record<string, string>;
  return headers['x-test-role'] ?? 'TENANT_ADMIN';
};

describe('Phase 3 · project state machine over HTTP (master:2046-2065)', () => {
  let infra: IntegrationInfra;
  let app: INestApplication;
  let seq = 0;

  beforeAll(async () => {
    infra = await startIntegrationInfra();
    await infra.prisma.$executeRawUnsafe(
      `INSERT INTO platform.tenants (tenant_id, tenant_code, tenant_name, keycloak_realm, plan_type, is_active)
       VALUES ($1::uuid, 'sd-p3', 'Spec Derived P3', 'construction-os', 'STARTER'::platform."PlanType", true)`,
      TENANT_ID,
    );
    await infra.prisma.$executeRawUnsafe(
      `INSERT INTO platform.users (user_id, tenant_id, keycloak_user_id, phone_number, email, display_name)
       VALUES ($1::uuid, $2::uuid, 'kc-p3', '+66890000003', 'p3@example.com', 'P3')`,
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

    // req.user must be on the request BEFORE app.init(), not merely set inside the guard:
    // TenantMiddleware runs ahead of the guards, and ProjectService is REQUEST-scoped and reads
    // `request.user?.role` in its CONSTRUCTOR. Setting it only in the guard leaves actorRole as ''
    // and every transition comes back 422 "Role  cannot transition to ...". Same shape as
    // backend/test/project.integration.spec.ts, which documents this ordering.
    app.use((req: Record<string, unknown>, _res: unknown, next: () => void) => {
      req['user'] = {
        tenant_id: TENANT_ID,
        user_id: USER_ID,
        role: roleOf(req),
        tenantCode: 'sd-p3',
      };
      next();
    });

    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await stopIntegrationInfra(infra);
  });

  const http = () => request(app.getHttpServer());

  /** Create a DRAFT project. `endDate` defaults to the past so ACTIVE -> COMPLETED is legal. */
  const createProject = async (endDate = '2020-01-01'): Promise<string> => {
    seq += 1;
    const res = await http()
      .post('/api/v1/projects')
      .set('x-test-role', 'TENANT_ADMIN')
      .send({
        project_code: `SD-P3-${seq}`,
        project_name: `Spec Derived ${seq}`,
        project_type: 'RESIDENTIAL',
        start_date: '2019-01-01',
        end_date: endDate,
      });
    expect([200, 201]).toContain(res.status);
    const body = res.body as { project_id?: string; projectId?: string };
    const id = body.project_id ?? body.projectId;
    expect(id).toBeDefined();
    return id as string;
  };

  const transition = (id: string, to: string, role: string, reason?: string) =>
    http()
      .post(`/api/v1/projects/${id}/transitions`)
      .set('x-test-role', role)
      .send(reason === undefined ? { to } : { to, reason });

  const statusOf = async (id: string): Promise<string> => {
    const rows = await infra.prisma.$queryRawUnsafe<Array<{ status: string }>>(
      `SELECT status::text AS status FROM projects.projects WHERE project_id = $1::uuid`,
      id,
    );
    return rows[0]?.status ?? '(missing)';
  };

  describe('a project starts in DRAFT (master:2161)', () => {
    it('POST /projects creates it in DRAFT', async () => {
      const id = await createProject();
      expect(await statusOf(id)).toBe('DRAFT');
    });
  });

  describe('legal transitions (master:2055-2062)', () => {
    it('DRAFT -> ACTIVE is allowed for PROJECT_MANAGER', async () => {
      const id = await createProject();
      const res = await transition(id, 'ACTIVE', 'PROJECT_MANAGER');
      expect([200, 204]).toContain(res.status);
      expect(await statusOf(id)).toBe('ACTIVE');
    });

    it('ACTIVE -> ON_HOLD records the reason and the timestamp', async () => {
      const id = await createProject();
      await transition(id, 'ACTIVE', 'TENANT_ADMIN');
      const res = await transition(id, 'ON_HOLD', 'PROJECT_MANAGER', 'waiting on permits');
      expect([200, 204]).toContain(res.status);

      const rows = await infra.prisma.$queryRawUnsafe<
        Array<{ status: string; on_hold_reason: string | null; on_hold_at: Date | null }>
      >(
        `SELECT status::text AS status, on_hold_reason, on_hold_at
           FROM projects.projects WHERE project_id = $1::uuid`,
        id,
      );
      expect(rows[0].status).toBe('ON_HOLD');
      expect(rows[0].on_hold_reason).toBe('waiting on permits');
      expect(rows[0].on_hold_at).not.toBeNull();
    });

    it('ON_HOLD -> ACTIVE resumes', async () => {
      const id = await createProject();
      await transition(id, 'ACTIVE', 'TENANT_ADMIN');
      await transition(id, 'ON_HOLD', 'TENANT_ADMIN', 'pause');
      const res = await transition(id, 'ACTIVE', 'PROJECT_MANAGER');
      expect([200, 204]).toContain(res.status);
      expect(await statusOf(id)).toBe('ACTIVE');
    });

    it('ACTIVE -> COMPLETED is allowed for TENANT_ADMIN', async () => {
      const id = await createProject('2020-01-01');
      await transition(id, 'ACTIVE', 'TENANT_ADMIN');
      const res = await transition(id, 'COMPLETED', 'TENANT_ADMIN');
      expect([200, 204]).toContain(res.status);
      expect(await statusOf(id)).toBe('COMPLETED');
    });

    it.each(['DRAFT', 'ACTIVE', 'ON_HOLD'])(
      '%s -> CANCELLED records the reason and the timestamp',
      async (from) => {
        const id = await createProject();
        if (from !== 'DRAFT') await transition(id, 'ACTIVE', 'TENANT_ADMIN');
        if (from === 'ON_HOLD') await transition(id, 'ON_HOLD', 'TENANT_ADMIN', 'pause');

        const res = await transition(id, 'CANCELLED', 'TENANT_ADMIN', 'client withdrew');
        expect([200, 204]).toContain(res.status);

        const rows = await infra.prisma.$queryRawUnsafe<
          Array<{ status: string; cancellation_reason: string | null; cancelled_at: Date | null }>
        >(
          `SELECT status::text AS status, cancellation_reason, cancelled_at
             FROM projects.projects WHERE project_id = $1::uuid`,
          id,
        );
        expect(rows[0].status).toBe('CANCELLED');
        expect(rows[0].cancellation_reason).toBe('client withdrew');
        expect(rows[0].cancelled_at).not.toBeNull();
      },
    );
  });

  describe('role gates (master:2055-2062)', () => {
    it('ACTIVE -> COMPLETED is refused for PROJECT_MANAGER — TENANT_ADMIN only', async () => {
      const id = await createProject('2020-01-01');
      await transition(id, 'ACTIVE', 'TENANT_ADMIN');
      const res = await transition(id, 'COMPLETED', 'PROJECT_MANAGER');
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(await statusOf(id)).toBe('ACTIVE');
    });

    it('CANCELLED is refused for PROJECT_MANAGER — TENANT_ADMIN only', async () => {
      const id = await createProject();
      const res = await transition(id, 'CANCELLED', 'PROJECT_MANAGER', 'nope');
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(await statusOf(id)).toBe('DRAFT');
    });

    it.each(['SITE_WORKER', 'FINANCE', 'VIEWER'])(
      '%s cannot drive any transition',
      async (role) => {
        const id = await createProject();
        const res = await transition(id, 'ACTIVE', role);
        expect(res.status).toBeGreaterThanOrEqual(400);
        expect(await statusOf(id)).toBe('DRAFT');
      },
    );
  });

  describe('required fields (master:2057, 2062)', () => {
    it('ON_HOLD without a reason is refused', async () => {
      const id = await createProject();
      await transition(id, 'ACTIVE', 'TENANT_ADMIN');
      const res = await transition(id, 'ON_HOLD', 'TENANT_ADMIN');
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(await statusOf(id)).toBe('ACTIVE');
    });

    it('CANCELLED without a reason is refused', async () => {
      const id = await createProject();
      const res = await transition(id, 'CANCELLED', 'TENANT_ADMIN');
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(await statusOf(id)).toBe('DRAFT');
    });
  });

  describe('ACTIVE -> COMPLETED requires end_date <= today (master:2060)', () => {
    it('a project whose end_date is in the future cannot complete', async () => {
      const id = await createProject('2099-12-31');
      await transition(id, 'ACTIVE', 'TENANT_ADMIN');
      const res = await transition(id, 'COMPLETED', 'TENANT_ADMIN');
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(await statusOf(id)).toBe('ACTIVE');
    });
  });

  describe('CANCELLED is terminal (master:2063)', () => {
    it.each(['ACTIVE', 'ON_HOLD', 'COMPLETED', 'DRAFT'])(
      'CANCELLED -> %s is refused',
      async (to) => {
        const id = await createProject();
        await transition(id, 'CANCELLED', 'TENANT_ADMIN', 'done');
        const res = await transition(id, to, 'TENANT_ADMIN', 'reopen');
        expect(res.status).toBeGreaterThanOrEqual(400);
        expect(await statusOf(id)).toBe('CANCELLED');
      },
    );
  });

  describe('no transition outside the specified machine (master:2065)', () => {
    it('DRAFT -> COMPLETED is refused (not an edge in the spec)', async () => {
      const id = await createProject('2020-01-01');
      const res = await transition(id, 'COMPLETED', 'TENANT_ADMIN');
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(await statusOf(id)).toBe('DRAFT');
    });

    it('DRAFT -> ON_HOLD is refused (not an edge in the spec)', async () => {
      const id = await createProject();
      const res = await transition(id, 'ON_HOLD', 'TENANT_ADMIN', 'why');
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(await statusOf(id)).toBe('DRAFT');
    });

    it('COMPLETED -> ACTIVE is refused', async () => {
      const id = await createProject('2020-01-01');
      await transition(id, 'ACTIVE', 'TENANT_ADMIN');
      await transition(id, 'COMPLETED', 'TENANT_ADMIN');
      const res = await transition(id, 'ACTIVE', 'TENANT_ADMIN');
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(await statusOf(id)).toBe('COMPLETED');
    });

    it('a status outside the five is rejected at the validation gate', async () => {
      const id = await createProject();
      const res = await transition(id, 'ARCHIVED_FOREVER', 'TENANT_ADMIN');
      expect(res.status).toBe(400);
    });

    // Absorbed from backend/test/project.integration.spec.ts when its transition block was dropped as
    // duplicated (2026-08-25). These two were NOT duplicated: the suite above proves CANCELLED is
    // refused without a reason and refused to a PROJECT_MANAGER, but never that a TENANT_ADMIN with a
    // reason can actually reach it — and never that it is terminal once reached. A state you can
    // enter and then leave is not the same state machine.

    it('DRAFT -> CANCELLED is allowed for TENANT_ADMIN with a reason', async () => {
      const id = await createProject();
      const res = await transition(id, 'CANCELLED', 'TENANT_ADMIN', 'Client withdrew funding');
      expect(res.status).toBeLessThan(400);
      expect(await statusOf(id)).toBe('CANCELLED');
      // The reason is PERSISTED, not just accepted. A cancellation whose reason was dropped leaves
      // nobody able to say why the project ended.
      expect((res.body as { cancellation_reason?: string }).cancellation_reason).toBe(
        'Client withdrew funding',
      );
    });

    it('CANCELLED -> ACTIVE is refused — CANCELLED is terminal', async () => {
      const id = await createProject();
      await transition(id, 'CANCELLED', 'TENANT_ADMIN', 'client withdrew');
      const res = await transition(id, 'ACTIVE', 'TENANT_ADMIN');
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(await statusOf(id)).toBe('CANCELLED');
    });
  });
});

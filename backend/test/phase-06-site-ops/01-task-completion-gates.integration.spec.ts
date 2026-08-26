/**
 * Phase 6 — Task Completion Gates (master:2632-2657).
 *
 * "A task may only transition to status = COMPLETED when ALL hard-block gates pass. On any
 *  hard-block failure → return HTTP 422 with error code COS-TASK-001 and the list of blocking
 *  gate names."
 *
 * Each of the seven gates is exercised ALONE. Testing them together cannot tell a working gate
 * from a dead one: with several blockers present the request fails either way, and a gate that
 * never fires looks exactly like a gate that passed — the same shape as the Phase 3 end_date guard,
 * which was dead for months while every test around it stayed green.
 *
 * Every seeded row is shaped from the live catalogue, not from memory: these are VARCHAR + CHECK
 * columns rather than pg ENUMs, so they take plain strings — and the ACCEPTED VALUES come from
 * pg_constraint, not from guesswork. Checking the column type and the NOT NULL list is not enough:
 * a plausible-looking 'HOT_WORK' failed permits_permit_type_check, whose vocabulary is
 * WORK_PERMIT / SAFETY_PERMIT / DRAWING_APPROVAL / ENTRY_PERMIT.
 */
jest.mock('@aws-sdk/client-sns', () => ({
  SNSClient: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({ MessageId: 'mock-msg-id' }),
  })),
  PublishCommand: jest.fn(),
}));

import { randomUUID } from 'node:crypto';
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
import { JwtAuthGuard } from '../../src/modules/identity/guards/jwt-auth.guard';

jest.setTimeout(900_000);

const TENANT_ID = 'bbbb1111-1111-4000-8000-000000000006';
const USER_ID = 'bbbb2222-2222-4000-8000-000000000006';

const roleOf = (req: Record<string, unknown>): string => {
  const headers = (req['headers'] ?? {}) as Record<string, string>;
  return headers['x-test-role'] ?? 'SITE_ENGINEER';
};

describe('Phase 6 · task completion gates (real database)', () => {
  let infra: IntegrationInfra;
  let app: INestApplication;
  let projectId = '';

  beforeAll(async () => {
    infra = await startIntegrationInfra();
    await infra.prisma.$executeRawUnsafe(
      `INSERT INTO platform.tenants (tenant_id, tenant_code, tenant_name, keycloak_realm, plan_type, is_active)
       VALUES ($1::uuid, 'sd-p6', 'Spec Derived P6', 'construction-os', 'STARTER'::platform."PlanType", true)`,
      TENANT_ID,
    );
    await infra.prisma.$executeRawUnsafe(
      `INSERT INTO platform.users (user_id, tenant_id, keycloak_user_id, phone_number, email, display_name)
       VALUES ($1::uuid, $2::uuid, 'kc-p6', '+66890000006', 'p6@example.com', 'P6')`,
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
    app.use((req: Record<string, unknown>, _res: unknown, next: () => void) => {
      req['user'] = {
        tenant_id: TENANT_ID,
        user_id: USER_ID,
        role: roleOf(req),
        tenantCode: 'sd-p6',
      };
      next();
    });
    await app.init();

    const proj = await request(app.getHttpServer())
      .post('/api/v1/projects')
      .set('x-test-role', 'TENANT_ADMIN')
      .send({
        project_code: 'SD-P6-HOST',
        project_name: 'Site Ops Host',
        project_type: 'RESIDENTIAL',
        start_date: '2019-01-01',
        end_date: '2020-01-01',
      });
    expect([200, 201]).toContain(proj.status);
    projectId = (proj.body as { project_id: string }).project_id;
  });

  afterAll(async () => {
    await app?.close();
    await stopIntegrationInfra(infra);
  });

  const http = () => request(app.getHttpServer());
  const sql = (q: string, ...p: unknown[]) => infra.prisma.$executeRawUnsafe(q, ...p);

  /** A fresh IN_PROGRESS task with nothing blocking it. */
  const newTask = async (status = 'IN_PROGRESS'): Promise<string> => {
    const rows = await infra.prisma.$queryRawUnsafe<Array<{ task_id: string }>>(
      `INSERT INTO projects.tasks (tenant_id, project_id, task_name, status)
       VALUES ($1::uuid, $2::uuid, 'Gate task', $3) RETURNING task_id`,
      TENANT_ID,
      projectId,
      status,
    );
    return rows[0].task_id;
  };

  const complete = (taskId: string, body: Record<string, unknown> = {}) =>
    http()
      .patch(`/api/v1/tasks/${taskId}`)
      .set('x-test-role', 'SITE_ENGINEER')
      .send({ status: 'COMPLETED', ...body });

  const statusOf = async (taskId: string): Promise<string> => {
    const rows = await infra.prisma.$queryRawUnsafe<Array<{ status: string }>>(
      `SELECT status FROM projects.tasks WHERE task_id = $1::uuid`,
      taskId,
    );
    return rows[0]?.status ?? '(missing)';
  };

  describe('the control: an unblocked task completes (master:2632)', () => {
    it('a task with no blockers reaches COMPLETED', async () => {
      const taskId = await newTask();
      const res = await complete(taskId);
      expect([200, 204]).toContain(res.status);
      expect(await statusOf(taskId)).toBe('COMPLETED');
    });
  });

  describe('each hard-block gate ALONE returns 422 COS-TASK-001 (master:2638-2652)', () => {
    /** Seeds exactly one blocker and returns the gate name the spec expects back. */
    const BLOCKERS: ReadonlyArray<[string, string, (taskId: string) => Promise<void>]> = [
      [
        'inspections',
        'a linked inspection that FAILED (gate 1)',
        async (taskId) => {
          // The checklist has to exist: inspections.checklist_id became a real foreign key in
          // 20260822000002_site_ops_foreign_keys, and an inspection is the record of answering a
          // SPECIFIC checklist — a random id was never a valid row, the database just used to
          // accept it.
          const checklistId = randomUUID();
          await sql(
            `INSERT INTO site_ops.safety_checklists
                 (checklist_id, project_id, tenant_id, checklist_name, items)
               VALUES ($1::uuid, $2::uuid, $3::uuid, 'Gate checklist', '[]'::jsonb)`,
            checklistId,
            projectId,
            TENANT_ID,
          );
          await sql(
            `INSERT INTO site_ops.inspections
                 (project_id, tenant_id, checklist_id, status, inspected_by, inspected_at, task_id)
               VALUES ($1::uuid, $2::uuid, $3::uuid, 'FAILED', $4::uuid, now(), $5::uuid)`,
            projectId,
            TENANT_ID,
            checklistId,
            USER_ID,
            taskId,
          );
        },
      ],
      [
        'issues',
        'an OPEN DEFECT issue (gate 2)',
        async (taskId) => {
          await sql(
            `INSERT INTO site_ops.issues
               (project_id, tenant_id, title, issue_type, severity, status, task_id)
             VALUES ($1::uuid, $2::uuid, 'Defect', 'DEFECT', 'HIGH', 'OPEN', $3::uuid)`,
            projectId,
            TENANT_ID,
            taskId,
          );
        },
      ],
      [
        'permits',
        'a linked permit that is REVOKED (gate 4)',
        async (taskId) => {
          await sql(
            `INSERT INTO site_ops.permits
               (tenant_id, project_id, permit_type, permit_number, status, linked_task_id)
             VALUES ($1::uuid, $2::uuid, 'WORK_PERMIT', 'PMT-1', 'REVOKED', $3::uuid)`,
            TENANT_ID,
            projectId,
            taskId,
          );
        },
      ],
      [
        'incidents',
        'an OPEN CRITICAL safety incident (gate 5)',
        async (taskId) => {
          await sql(
            `INSERT INTO site_ops.incidents
               (tenant_id, project_id, incident_type, severity, reported_by, status, task_id)
             VALUES ($1::uuid, $2::uuid, 'FALL', 'CRITICAL', $3::uuid, 'OPEN', $4::uuid)`,
            TENANT_ID,
            projectId,
            USER_ID,
            taskId,
          );
        },
      ],
      // ── The SECOND value each gate names ────────────────────────────────
      //
      // Added 2026-08-26. Four of the gates block on a SET, and only one member of each set was
      // ever exercised: master:2640 names FAILED *or* REQUIRES_REINSPECTION, master:2642 names
      // DEFECT/REWORK/PUNCH, master:2646 names EXPIRED *or* REVOKED, master:2648 names HIGH *or*
      // CRITICAL. The untested member is in the repository SQL and nothing asserted it, so
      // narrowing `IN ('FAILED','REQUIRES_REINSPECTION')` to `= 'FAILED'` left the whole estate
      // green. The unit layer cannot close this: tasks.repository.spec mocks $queryRaw and asserts
      // only that the count comes back as a number, so the predicate is never evaluated by anything
      // but PostgreSQL.
      [
        'inspections',
        'a linked inspection REQUIRING RE-INSPECTION (gate 1, the other half of master:2640)',
        async (taskId) => {
          const checklistId = randomUUID();
          await sql(
            `INSERT INTO site_ops.safety_checklists
                 (checklist_id, project_id, tenant_id, checklist_name, items)
               VALUES ($1::uuid, $2::uuid, $3::uuid, 'Re-inspection checklist', '[]'::jsonb)`,
            checklistId,
            projectId,
            TENANT_ID,
          );
          await sql(
            `INSERT INTO site_ops.inspections
                 (project_id, tenant_id, checklist_id, status, inspected_by, inspected_at, task_id)
               VALUES ($1::uuid, $2::uuid, $3::uuid, 'REQUIRES_REINSPECTION', $4::uuid, now(), $5::uuid)`,
            projectId,
            TENANT_ID,
            checklistId,
            USER_ID,
            taskId,
          );
        },
      ],
      [
        'issues',
        'an OPEN PUNCH issue (gate 2, the third type master:2642 names)',
        async (taskId) => {
          await sql(
            `INSERT INTO site_ops.issues
               (project_id, tenant_id, title, issue_type, severity, status, task_id)
             VALUES ($1::uuid, $2::uuid, 'Punch item', 'PUNCH', 'MEDIUM', 'OPEN', $3::uuid)`,
            projectId,
            TENANT_ID,
            taskId,
          );
        },
      ],
      [
        'permits',
        'a linked permit that has EXPIRED (gate 4, the other half of master:2646)',
        async (taskId) => {
          await sql(
            `INSERT INTO site_ops.permits
               (tenant_id, project_id, permit_type, permit_number, status, linked_task_id)
             VALUES ($1::uuid, $2::uuid, 'SAFETY_PERMIT', 'PMT-EXP-1', 'EXPIRED', $3::uuid)`,
            TENANT_ID,
            projectId,
            taskId,
          );
        },
      ],
      [
        'incidents',
        'an OPEN HIGH safety incident (gate 5, the other severity master:2648 names)',
        async (taskId) => {
          await sql(
            `INSERT INTO site_ops.incidents
               (tenant_id, project_id, incident_type, severity, reported_by, status, task_id)
             VALUES ($1::uuid, $2::uuid, 'STRUCK_BY', 'HIGH', $3::uuid, 'OPEN', $4::uuid)`,
            TENANT_ID,
            projectId,
            USER_ID,
            taskId,
          );
        },
      ],
    ];

    it.each(BLOCKERS)('%s — %s', async (gate, _label, seed) => {
      const taskId = await newTask();
      await seed(taskId);

      const res = await complete(taskId);
      expect(res.status).toBe(422);

      const body = res.body as { error?: { code?: string; blocking_gates?: string[] } };
      expect(body.error?.code).toBe('COS-TASK-001');
      // The gate that actually fired must be named — "something blocked it" is not the contract.
      expect(body.error?.blocking_gates).toContain(gate);
      // And the task must not have moved.
      expect(await statusOf(taskId)).not.toBe('COMPLETED');
    });

    it('delay — a BLOCKED task cannot complete (gate 6, master:2649)', async () => {
      const taskId = await newTask('BLOCKED');
      const res = await complete(taskId);
      expect(res.status).toBe(422);
      const body = res.body as { error?: { code?: string; blocking_gates?: string[] } };
      expect(body.error?.code).toBe('COS-TASK-001');
      expect(body.error?.blocking_gates).toContain('delay');
      expect(await statusOf(taskId)).toBe('BLOCKED');
    });
  });

  describe('a cleared blocker stops blocking (master:2638)', () => {
    it('resolving the issue lets the same task complete', async () => {
      const taskId = await newTask();
      await sql(
        `INSERT INTO site_ops.issues
           (project_id, tenant_id, title, issue_type, severity, status, task_id)
         VALUES ($1::uuid, $2::uuid, 'Rework', 'REWORK', 'HIGH', 'OPEN', $3::uuid)`,
        projectId,
        TENANT_ID,
        taskId,
      );
      expect((await complete(taskId)).status).toBe(422);

      await sql(`UPDATE site_ops.issues SET status = 'RESOLVED' WHERE task_id = $1::uuid`, taskId);
      const res = await complete(taskId);
      expect([200, 204]).toContain(res.status);
      expect(await statusOf(taskId)).toBe('COMPLETED');
    });

    it('an issue of a type outside DEFECT/REWORK/PUNCH does not block (master:2642)', async () => {
      const taskId = await newTask();
      await sql(
        `INSERT INTO site_ops.issues
           (project_id, tenant_id, title, issue_type, severity, status, task_id)
         VALUES ($1::uuid, $2::uuid, 'General note', 'GENERAL', 'LOW', 'OPEN', $3::uuid)`,
        projectId,
        TENANT_ID,
        taskId,
      );
      const res = await complete(taskId);
      expect([200, 204]).toContain(res.status);
    });

    it('a LOW severity incident does not block — only HIGH/CRITICAL do (master:2648)', async () => {
      const taskId = await newTask();
      await sql(
        `INSERT INTO site_ops.incidents
           (tenant_id, project_id, incident_type, severity, reported_by, status, task_id)
         VALUES ($1::uuid, $2::uuid, 'NEAR_MISS', 'LOW', $3::uuid, 'OPEN', $4::uuid)`,
        TENANT_ID,
        projectId,
        USER_ID,
        taskId,
      );
      const res = await complete(taskId);
      expect([200, 204]).toContain(res.status);
    });
  });
});

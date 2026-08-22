/**
 * Phase 6 — `/sync/push`: offline write scope (§17.4) and the conflict protocol (§17.5).
 *
 * SPEC AUTHORITY NOTE. `docs/specifications/17-offline-mobile-sync.md` §17.4 was amended on
 * 2026-08-19 to admit two more entities to the offline-capable set — deliveries received against a
 * purchase order, and purchase requests — on the grounds that both are captured ON SITE, which is
 * exactly where there is no signal. `context/00_master_construction_os.md` still mirrored the older
 * seven-entity list when this suite was written, so a test derived from master alone would have
 * asserted that a correct implementation was a defect. The spec wins (master:98), and the two
 * context files were corrected to match.
 *
 * The tests below are therefore written against §17.4 as amended.
 *
 * WHY THE REGRESSION DIRECTION IS THE ONLY TEST THAT MATTERS FOR MAX_WINS. §17.5 resolves
 * `task.progress_percent` by max-wins: a phone that was offline while the work advanced must not
 * drag the number backwards when it reconnects. A test that only pushes INCREASING values passes
 * identically under max-wins, last-write-wins, and "assign whatever arrived" — three different
 * rules, one green test. The discriminating case is the push that arrives LOWER than the stored
 * value, and it is the one asserted here.
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

const TENANT_ID = 'bbbb1111-1111-4000-8000-000000000062';
const USER_ID = 'bbbb2222-2222-4000-8000-000000000062';

const roleOf = (req: Record<string, unknown>): string => {
  const headers = (req['headers'] ?? {}) as Record<string, string>;
  return headers['x-test-role'] ?? 'SITE_ENGINEER';
};

/** The three values §17.5 allows the server to answer a push with. */
const SERVER_SYNC_STATUSES = ['ACCEPTED', 'CONFLICT_FLAGGED', 'CONFLICT_REJECTED'];

describe('Phase 6 · /sync/push offline scope + conflict protocol (real database)', () => {
  let infra: IntegrationInfra;
  let app: INestApplication;
  let projectId = '';

  beforeAll(async () => {
    infra = await startIntegrationInfra();
    await infra.prisma.$executeRawUnsafe(
      `INSERT INTO platform.tenants (tenant_id, tenant_code, tenant_name, keycloak_realm, plan_type, is_active)
       VALUES ($1::uuid, 'sd-p62', 'Spec Derived P6 Sync', 'construction-os', 'STARTER'::platform."PlanType", true)`,
      TENANT_ID,
    );
    await infra.prisma.$executeRawUnsafe(
      `INSERT INTO platform.users (user_id, tenant_id, keycloak_user_id, phone_number, email, display_name)
       VALUES ($1::uuid, $2::uuid, 'kc-p62', '+66890000062', 'p62@example.com', 'P62')`,
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
        tenantCode: 'sd-p62',
      };
      next();
    });
    await app.init();

    const proj = await request(app.getHttpServer())
      .post('/api/v1/projects')
      .set('x-test-role', 'TENANT_ADMIN')
      .send({
        project_code: 'SD-P62-HOST',
        project_name: 'Sync Scope Host',
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

  const push = (body: Record<string, unknown>, role = 'SITE_ENGINEER') =>
    request(app.getHttpServer())
      .post('/api/v1/sync/push')
      .set('x-test-role', role)
      .send({ operation: 'UPDATE', payload: {}, ...body });

  const newTask = async (): Promise<string> => {
    const rows = await infra.prisma.$queryRawUnsafe<Array<{ task_id: string }>>(
      `INSERT INTO projects.tasks (tenant_id, project_id, task_name, status)
       VALUES ($1::uuid, $2::uuid, 'Sync task', 'IN_PROGRESS') RETURNING task_id`,
      TENANT_ID,
      projectId,
    );
    return rows[0].task_id;
  };

  const progressOf = async (taskId: string): Promise<number> => {
    const rows = await infra.prisma.$queryRawUnsafe<Array<{ progress_percent: number }>>(
      `SELECT progress_percent FROM projects.tasks WHERE task_id = $1::uuid`,
      taskId,
    );
    return Number(rows[0]?.progress_percent ?? -1);
  };

  const pushProgress = (taskId: string, percent: number) =>
    push({ entity_type: 'task', entity_id: taskId, payload: { progress_percent: percent } });

  // ---------------------------------------------------------------------------------------------
  // §17.4 — online-required entities
  // ---------------------------------------------------------------------------------------------
  describe('online-required entities are refused, whatever the client calls them (§17.4)', () => {
    // Financial records are online-required because they carry dual-write risk: a payment replayed
    // from a queue hours later is a second payment. The server is the last line here — the mobile
    // client is supposed to refuse to queue these at all, but a client is something an attacker can
    // rewrite and an old build is something a user can keep running.
    it.each([
      ['purchase-order', 'a financial commitment — server approval required'],
      ['purchase_order', 'the same, under the other naming convention'],
      ['vendor-invoice', 'AP record — dual-write risk'],
      ['ar-receipt', 'AR record — dual-write risk'],
      ['payment', 'a replayed payment is a second payment'],
      ['budget-line', 'cost accounting integrity'],
      ['vendor', 'shared reference data'],
      ['permission', 'an administrative change made at a desk'],
      ['tenant-settings', 'ditto — and one the client provably used to queue'],
      ['conflict', 'a decision taken against server state the reviewer was looking at'],
    ])('refuses to replay %s (%s)', async (entityType) => {
      const res = await push(
        { entity_type: entityType, entity_id: '00000000-0000-4000-8000-000000000001' },
        'TENANT_ADMIN',
      );
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toContain('Unknown entity_type');
    });
  });

  // ---------------------------------------------------------------------------------------------
  // §17.4 as amended 2026-08-19
  // ---------------------------------------------------------------------------------------------
  describe('purchase requests are offline-capable (§17.4, amended 2026-08-19)', () => {
    const PR_ID = 'cccc0001-0000-4000-8000-000000000062';

    it('replays a requisition raised where there was no signal', async () => {
      const res = await push({
        entity_type: 'purchase-request',
        entity_id: PR_ID,
        operation: 'CREATE',
        payload: {
          project_id: projectId,
          items: [{ description: 'เหล็กเส้น DB12', quantity: 20, unit: 'ton' }],
        },
      });

      // §17 pins the response PROTOCOL, not an HTTP code — so this asserts the verdict the
      // client branches on, and only that the call did not fail.
      expect(res.status).toBeLessThan(400);
      expect((res.body as { status: string }).status).toBe('ACCEPTED');

      const rows = await infra.prisma.$queryRawUnsafe<Array<{ pr_id: string; pr_number: string }>>(
        `SELECT pr_id, pr_number FROM procurement.purchase_requests WHERE pr_id = $1::uuid`,
        PR_ID,
      );
      // The client-generated id BECOMES the primary key — that is what makes the replay idempotent.
      expect(rows).toHaveLength(1);
      // The site engineer never invents a document number on a phone; the server allocates it.
      expect(rows[0].pr_number).toMatch(/^PR-\d{4}-/);
    });

    it('a replayed queue item files no second request', async () => {
      // The queue retries after any timeout, so the SECOND arrival of the same item is the normal
      // case, not the exotic one.
      const res = await push({
        entity_type: 'purchase-request',
        entity_id: PR_ID,
        operation: 'CREATE',
        payload: {
          project_id: projectId,
          items: [{ description: 'เหล็กเส้น DB12', quantity: 20, unit: 'ton' }],
        },
      });
      expect(res.status).toBeLessThan(400);

      const rows = await infra.prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT COUNT(*)::bigint AS count FROM procurement.purchase_requests WHERE pr_id = $1::uuid`,
        PR_ID,
      );
      expect(Number(rows[0].count)).toBe(1);
    });
  });

  describe('deliveries are offline-capable (§17.4, amended 2026-08-19)', () => {
    it('has a replay handler — the gate signature is not discarded as an unknown type', async () => {
      // Scope assertion only. What this must NOT be is the failure the amendment was written to end:
      // the client queues it, the UI says "saved, will sync", and the switch has no case at all.
      const res = await push(
        {
          entity_type: 'delivery',
          entity_id: 'cccc0002-0000-4000-8000-000000000062',
          operation: 'CREATE',
          payload: {},
        },
        'TENANT_ADMIN',
      );
      expect(JSON.stringify(res.body)).not.toContain('Unknown entity_type');
    });
  });

  // ---------------------------------------------------------------------------------------------
  // §17.5 — max-wins
  // ---------------------------------------------------------------------------------------------
  describe('task.progress_percent resolves max-wins (§17.5)', () => {
    it('accepts an advance', async () => {
      const taskId = await newTask();
      const res = await pushProgress(taskId, 60);
      expect(res.status).toBeLessThan(400);
      expect((res.body as { status: string }).status).toBe('ACCEPTED');
      expect(await progressOf(taskId)).toBe(60);
    });

    it('does NOT regress when a stale phone pushes a lower value', async () => {
      // THE discriminating case. Under last-write-wins this stores 40 and the site loses a fortnight
      // of recorded progress because someone's phone was in a basement.
      const taskId = await newTask();
      await pushProgress(taskId, 60);
      const res = await pushProgress(taskId, 40);

      // Max-wins is not a rejection: the server accepted the item, it simply won the comparison.
      // The client must mark its queue entry SYNCED and stop retrying it.
      expect((res.body as { status: string }).status).toBe('ACCEPTED');
      expect(await progressOf(taskId)).toBe(60);
    });

    it('a later genuine advance still applies after a stale push', async () => {
      // Guards the opposite failure: "never move" also passes the test above.
      const taskId = await newTask();
      await pushProgress(taskId, 60);
      await pushProgress(taskId, 40);
      await pushProgress(taskId, 80);
      expect(await progressOf(taskId)).toBe(80);
    });

    it('clamps an out-of-range value to 100 rather than storing it', async () => {
      const taskId = await newTask();
      await pushProgress(taskId, 150);
      expect(await progressOf(taskId)).toBe(100);
    });

    it('a negative value cannot pull progress below zero', async () => {
      const taskId = await newTask();
      await pushProgress(taskId, -10);
      expect(await progressOf(taskId)).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------------------------
  // §17.5 — the protocol itself
  // ---------------------------------------------------------------------------------------------
  describe('the push response speaks the documented protocol (§17.5)', () => {
    it('answers with one of ACCEPTED / CONFLICT_FLAGGED / CONFLICT_REJECTED', async () => {
      const taskId = await newTask();
      const res = await pushProgress(taskId, 25);
      expect(SERVER_SYNC_STATUSES).toContain((res.body as { status: string }).status);
    });
  });

  // ---------------------------------------------------------------------------------------------
  // Authorization — sync must not be a wider door than REST
  // ---------------------------------------------------------------------------------------------
  describe('sync/push grants no more than the equivalent REST route', () => {
    // `/sync/push` calls the domain services DIRECTLY, and those services hold no role check of
    // their own — the authorization lives in the REST controller decorator. So without a gate on
    // this route, every authenticated user holds the write surface of every role. Only the NEGATIVE
    // cases can tell a working gate from an absent one; the positive one below is the control that
    // proves the negatives are not failing for some unrelated reason.
    it('lets a SITE_WORKER push task progress (the control)', async () => {
      const taskId = await newTask();
      const res = await push(
        { entity_type: 'task', entity_id: taskId, payload: { progress_percent: 10 } },
        'SITE_WORKER',
      );
      expect(res.status).not.toBe(403);
    });

    it('refuses a SITE_WORKER pushing a safety incident', async () => {
      const res = await push(
        {
          entity_type: 'safety',
          entity_id: 'cccc0003-0000-4000-8000-000000000062',
          operation: 'CREATE',
        },
        'SITE_WORKER',
      );
      expect(res.status).toBe(403);
    });

    it('refuses a SITE_WORKER recording a delivery against a purchase order', async () => {
      // Receipt against a PO is Procurement's act, not the site's — and admitting deliveries to the
      // offline set did not widen who may record one.
      const res = await push(
        {
          entity_type: 'delivery',
          entity_id: 'cccc0004-0000-4000-8000-000000000062',
          operation: 'CREATE',
        },
        'SITE_WORKER',
      );
      expect(res.status).toBe(403);
    });

    it('refuses a SITE_WORKER pushing workforce attendance', async () => {
      const res = await push(
        {
          entity_type: 'attendance',
          entity_id: 'cccc0005-0000-4000-8000-000000000062',
          operation: 'CREATE',
        },
        'SITE_WORKER',
      );
      expect(res.status).toBe(403);
    });
  });
});

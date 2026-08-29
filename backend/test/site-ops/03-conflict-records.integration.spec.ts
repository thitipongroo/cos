/**
 * Phase 6 — ConflictRecord persistence and notification (master:2794, 2811-2814).
 *
 *   "site.conflict.flagged { conflict_id, entity_type, entity_id, conflict_type }
 *      — emitted whenever a CONFLICT_FLAGGED ConflictRecord is persisted
 *        (site_reports LAST_WRITE_WINS + issues FIELD_LEVEL_MERGE paths)"
 *
 * The two flagging rules are quoted at the describe() blocks that test them, because they are
 * different rules and the second one is narrow:
 *
 *   site_reports (master:2571) — "if server version modified_at differs from client's
 *                                 last_known_modified_at, flag as CONFLICT for manual review"
 *   issues       (master:2591) — "if status was changed SERVER-SIDE while client had offline edit,
 *                                 create ConflictRecord for ROLE: SITE_ENGINEER to review"
 *
 * Every flag assertion is paired with a control that does NOT flag. A conflict detector that fires
 * on every request passes each positive test on its own, and the resulting notification storm to
 * SITE_ENGINEER / PROJECT_MANAGER / TENANT_ADMIN is indistinguishable from the feature working.
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
import { JwtAuthGuard } from '../../src/shared/guards/jwt-auth.guard';

const TENANT_ID = 'bbbb1111-1111-4000-8000-000000000063';
const USER_ID = 'bbbb2222-2222-4000-8000-000000000063';

/** master:2726 — the only three values conflict_type may take. */
const CONFLICT_TYPES = ['FIELD_CONFLICT', 'STATUS_CONFLICT', 'REJECTED'];

const roleOf = (req: Record<string, unknown>): string => {
  const headers = (req['headers'] ?? {}) as Record<string, string>;
  return headers['x-test-role'] ?? 'SITE_ENGINEER';
};

interface ConflictRow {
  conflict_id: string;
  entity_type: string;
  entity_id: string;
  conflict_type: string;
  reviewed_by: string | null;
  reviewed_at: Date | null;
}

describe('Phase 6 · ConflictRecord persistence + notification (real database)', () => {
  let infra: IntegrationInfra;
  let app: INestApplication;
  let projectId = '';
  let dayCounter = 0;

  beforeAll(async () => {
    infra = await startIntegrationInfra();
    await infra.prisma.$executeRawUnsafe(
      `INSERT INTO platform.tenants (tenant_id, tenant_code, tenant_name, keycloak_realm, plan_type, is_active)
       VALUES ($1::uuid, 'sd-p63', 'Spec Derived P6 Conflict', 'construction-os', 'STARTER'::platform."PlanType", true)`,
      TENANT_ID,
    );
    await infra.prisma.$executeRawUnsafe(
      `INSERT INTO platform.users (user_id, tenant_id, keycloak_user_id, phone_number, email, display_name)
       VALUES ($1::uuid, $2::uuid, 'kc-p63', '+66890000063', 'p63@example.com', 'P63')`,
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
        tenantCode: 'sd-p63',
      };
      next();
    });
    await app.init();

    const proj = await request(app.getHttpServer())
      .post('/api/v1/projects')
      .set('x-test-role', 'TENANT_ADMIN')
      .send({
        project_code: 'SD-P63-HOST',
        project_name: 'Conflict Host',
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

  /** One report per day per submitter — every seeded report gets its own date. */
  const nextDate = (): string => {
    dayCounter += 1;
    return `2019-${String(Math.floor(dayCounter / 28) + 1).padStart(2, '0')}-${String((dayCounter % 28) + 1).padStart(2, '0')}`;
  };

  const syncReports = (items: Record<string, unknown>[], role = 'SITE_ENGINEER') =>
    http().post('/api/v1/site/reports/sync').set('x-test-role', role).send({ items });

  const reportItem = (clientId: string, extra: Record<string, unknown> = {}) => ({
    client_id: clientId,
    project_id: projectId,
    report_date: nextDate(),
    trade_type: 'CIVIL',
    worker_count: 5,
    ...extra,
  });

  const conflictsFor = (entityId: string): Promise<ConflictRow[]> =>
    infra.prisma.$queryRawUnsafe<ConflictRow[]>(
      `SELECT conflict_id, entity_type, entity_id, conflict_type, reviewed_by, reviewed_at
         FROM site_ops.conflict_records WHERE entity_id = $1::uuid`,
      entityId,
    );

  const flaggedEventsFor = (entityId: string): Promise<Array<{ payload: unknown }>> =>
    infra.prisma.$queryRawUnsafe<Array<{ payload: unknown }>>(
      // The outbox row holds the whole envelope (event_id, tenant_id, occurred_at, ... payload),
      // so the domain fields live one level down at payload->'payload'.
      `SELECT payload->'payload' AS payload FROM platform.outbox_events
        WHERE event_type = 'site.conflict.flagged.v1' AND payload->'payload'->>'entity_id' = $1`,
      entityId,
    );

  const summaryOf = async (reportId: string): Promise<string | null> => {
    const rows = await infra.prisma.$queryRawUnsafe<Array<{ summary: string | null }>>(
      `SELECT summary FROM site_ops.site_reports WHERE report_id = $1::uuid`,
      reportId,
    );
    return rows[0]?.summary ?? null;
  };

  // ---------------------------------------------------------------------------------------------
  // site_reports — LAST_WRITE_WINS (master:2568-2572)
  // ---------------------------------------------------------------------------------------------
  describe('site_reports: flagged only when the server moved under the client', () => {
    it('the control — a first-time sync files no conflict and notifies nobody', async () => {
      const id = randomUUID();
      const res = await syncReports([reportItem(id, { summary: 'first' })]);

      expect(res.status).toBeLessThan(400);
      expect((res.body as Array<{ conflict_status: string }>)[0].conflict_status).toBe('ACCEPTED');
      expect(await conflictsFor(id)).toHaveLength(0);
      expect(await flaggedEventsFor(id)).toHaveLength(0);
    });

    it('a re-sync that knows the current server state is accepted, not flagged', async () => {
      // The ordinary case for a device that synced, went offline, edited, and came back: it still
      // holds the modified_at it last saw, and nothing has changed since.
      const id = randomUUID();
      const date = nextDate();
      await syncReports([{ ...reportItem(id, { summary: 'v1' }), report_date: date }]);
      const rows = await infra.prisma.$queryRawUnsafe<Array<{ modified_at: Date }>>(
        `SELECT modified_at FROM site_ops.site_reports WHERE report_id = $1::uuid`,
        id,
      );
      const serverModifiedAt = rows[0].modified_at.toISOString();

      const res = await syncReports([
        {
          ...reportItem(id, { summary: 'v2' }),
          report_date: date,
          last_known_modified_at: serverModifiedAt,
          client_submitted_at: new Date().toISOString(),
        },
      ]);

      expect((res.body as Array<{ conflict_status: string }>)[0].conflict_status).toBe('ACCEPTED');
      expect(await conflictsFor(id)).toHaveLength(0);
    });

    it('persists a ConflictRecord when the server was modified since the client last looked', async () => {
      const id = randomUUID();
      const date = nextDate();
      await syncReports([{ ...reportItem(id, { summary: 'v1' }), report_date: date }]);

      const res = await syncReports([
        {
          ...reportItem(id, { summary: 'edited offline' }),
          report_date: date,
          // The client is working from a view of the world that predates the server row.
          last_known_modified_at: '2019-01-01T00:00:00.000Z',
          client_submitted_at: new Date().toISOString(),
        },
      ]);

      expect((res.body as Array<{ conflict_status: string }>)[0].conflict_status).toBe(
        'CONFLICT_FLAGGED',
      );

      const records = await conflictsFor(id);
      expect(records).toHaveLength(1);
      expect(records[0].entity_type).toBe('site_reports');
      expect(CONFLICT_TYPES).toContain(records[0].conflict_type);
      // Unreviewed until a human reviews it — that is what puts it on the review queue.
      expect(records[0].reviewed_at).toBeNull();

      // A flag nobody is told about is not "persistence AND notification" (master:2794).
      const events = await flaggedEventsFor(id);
      expect(events).toHaveLength(1);
      expect(events[0].payload).toMatchObject({
        conflict_id: records[0].conflict_id,
        entity_type: 'site_reports',
        entity_id: id,
        conflict_type: records[0].conflict_type,
      });
    });

    it('a flagged overwrite is still applied — the flag asks for review, it does not undo', async () => {
      const id = randomUUID();
      const date = nextDate();
      await syncReports([{ ...reportItem(id, { summary: 'server text' }), report_date: date }]);

      await syncReports([
        {
          ...reportItem(id, { summary: 'newer client text' }),
          report_date: date,
          last_known_modified_at: '2019-01-01T00:00:00.000Z',
          client_submitted_at: new Date().toISOString(),
        },
      ]);

      // LAST_WRITE_WINS on client_submitted_at: the client's write is newer, so it wins.
      expect(await summaryOf(id)).toBe('newer client text');
    });

    it('an older client write loses and the server row is preserved', async () => {
      const id = randomUUID();
      const date = nextDate();
      await syncReports([{ ...reportItem(id, { summary: 'server text' }), report_date: date }]);

      const res = await syncReports([
        {
          ...reportItem(id, { summary: 'stale client text' }),
          report_date: date,
          last_known_modified_at: '2019-01-01T00:00:00.000Z',
          // Written on the device before the server row was touched.
          client_submitted_at: '2019-06-01T00:00:00.000Z',
        },
      ]);

      expect((res.body as Array<{ conflict_status: string }>)[0].conflict_status).toBe(
        'CONFLICT_FLAGGED',
      );
      expect(await summaryOf(id)).toBe('server text');
    });
  });

  // ---------------------------------------------------------------------------------------------
  // The review surface — a ConflictRecord exists to be reviewed by a person
  // ---------------------------------------------------------------------------------------------
  describe('the review queue (master:2591 — "for ROLE: SITE_ENGINEER to review")', () => {
    let conflictId = '';

    beforeAll(async () => {
      const id = randomUUID();
      const date = nextDate();
      await syncReports([{ ...reportItem(id, { summary: 'v1' }), report_date: date }]);
      await syncReports([
        {
          ...reportItem(id, { summary: 'v2' }),
          report_date: date,
          last_known_modified_at: '2019-01-01T00:00:00.000Z',
          client_submitted_at: new Date().toISOString(),
        },
      ]);
      conflictId = (await conflictsFor(id))[0].conflict_id;
    });

    it('a SITE_ENGINEER can see the unresolved conflict', async () => {
      const res = await http()
        .get('/api/v1/site/conflict-records')
        .set('x-test-role', 'SITE_ENGINEER');
      expect(res.status).toBe(200);
      const ids = (res.body as Array<{ conflict_id: string }>).map((r) => r.conflict_id);
      expect(ids).toContain(conflictId);
    });

    it('a SITE_WORKER cannot — the queue is a supervisory surface', async () => {
      const res = await http()
        .get('/api/v1/site/conflict-records')
        .set('x-test-role', 'SITE_WORKER');
      expect(res.status).toBe(403);
    });

    it('resolving one records who reviewed it and when', async () => {
      const res = await http()
        .patch(`/api/v1/site/conflict-records/${conflictId}/resolve`)
        .set('x-test-role', 'SITE_ENGINEER')
        .send({ resolution: 'reviewed' });
      expect(res.status).toBe(200);

      const rows = await infra.prisma.$queryRawUnsafe<ConflictRow[]>(
        `SELECT conflict_id, entity_type, entity_id, conflict_type, reviewed_by, reviewed_at
           FROM site_ops.conflict_records WHERE conflict_id = $1::uuid`,
        conflictId,
      );
      expect(rows[0].reviewed_at).not.toBeNull();
      expect(rows[0].reviewed_by).toBe(USER_ID);
    });

    it('a resolved conflict leaves the unresolved queue', async () => {
      const res = await http()
        .get('/api/v1/site/conflict-records')
        .set('x-test-role', 'SITE_ENGINEER');
      const ids = (res.body as Array<{ conflict_id: string }>).map((r) => r.conflict_id);
      expect(ids).not.toContain(conflictId);
    });
  });

  // ---------------------------------------------------------------------------------------------
  // issues — FIELD_LEVEL_MERGE (master:2582-2592)
  // ---------------------------------------------------------------------------------------------
  describe('issues: server-side status change is the trigger, not any status field', () => {
    const newIssue = async (): Promise<string> => {
      const res = await http()
        .post('/api/v1/site/issues')
        .set('x-test-role', 'SITE_ENGINEER')
        .send({
          project_id: projectId,
          title: 'Cracked column',
          severity: 'HIGH',
        });
      expect([200, 201]).toContain(res.status);
      return (res.body as { issue_id: string }).issue_id;
    };

    const statusOf = async (issueId: string): Promise<string> => {
      const rows = await infra.prisma.$queryRawUnsafe<Array<{ status: string }>>(
        `SELECT status FROM site_ops.issues WHERE issue_id = $1::uuid`,
        issueId,
      );
      return rows[0]?.status ?? '(missing)';
    };

    it('an ordinary status change is applied and announced (master:2810)', async () => {
      // master lists `issue.status_changed { issue_id, project_id, from_status, to_status }` among
      // the Phase 6 event producers, so the platform is required to be able to change an issue's
      // status at all. This is the control for every conflict assertion below it: if the plain
      // update path cannot move a status, no test of the conflict path means anything.
      const issueId = await newIssue();
      const before = await statusOf(issueId);

      const res = await http()
        .patch(`/api/v1/site/issues/${issueId}`)
        .set('x-test-role', 'SITE_ENGINEER')
        .send({ status: 'IN_PROGRESS' });
      expect(res.status).toBe(200);

      expect(before).toBe('OPEN');
      expect(await statusOf(issueId)).toBe('IN_PROGRESS');

      const events = await infra.prisma.$queryRawUnsafe<Array<{ payload: unknown }>>(
        `SELECT payload->'payload' AS payload FROM platform.outbox_events
          WHERE event_type = 'site.issue.status_changed.v1' AND payload->'payload'->>'issue_id' = $1`,
        issueId,
      );
      expect(events).toHaveLength(1);
      expect(events[0].payload).toMatchObject({ from_status: 'OPEN', to_status: 'IN_PROGRESS' });
    });

    it('an edit that touches no status files no conflict', async () => {
      // A site engineer fixing a typo in the description has not conflicted with anybody.
      const issueId = await newIssue();
      const res = await http()
        .patch(`/api/v1/site/issues/${issueId}`)
        .set('x-test-role', 'SITE_ENGINEER')
        .send({ description: 'Crack is 3mm wide, north face' });

      expect(res.status).toBe(200);
      expect(await conflictsFor(issueId)).toHaveLength(0);
      expect(await flaggedEventsFor(issueId)).toHaveLength(0);
    });

    it('a client that agrees with the server status files no conflict', async () => {
      const issueId = await newIssue();
      const res = await http()
        .patch(`/api/v1/site/issues/${issueId}`)
        .set('x-test-role', 'SITE_ENGINEER')
        .send({ status: 'OPEN', description: 'still open' });

      expect(res.status).toBe(200);
      expect(await conflictsFor(issueId)).toHaveLength(0);
    });

    it('applies a severity change (master:2739 — PATCH updates the issue)', async () => {
      // severity is not one of the merged fields (master:2583-2589 lists description, status, photos
      // and resolution_note), so nothing makes the server authoritative over it — yet the route
      // accepts the field and UpdateIssueDto declares it.
      const issueId = await newIssue();
      const res = await http()
        .patch(`/api/v1/site/issues/${issueId}`)
        .set('x-test-role', 'SITE_ENGINEER')
        .send({ severity: 'CRITICAL' });
      expect(res.status).toBe(200);

      const rows = await infra.prisma.$queryRawUnsafe<Array<{ severity: string }>>(
        `SELECT severity FROM site_ops.issues WHERE issue_id = $1::uuid`,
        issueId,
      );
      expect(rows[0].severity).toBe('CRITICAL');
    });

    it('does not un-assign an issue when the edit never mentions the assignee', async () => {
      // An update that says nothing about assignment must leave it alone. Losing it silently is
      // worse than refusing the edit: nobody is told the issue now has no owner.
      const issueId = await newIssue();
      await infra.prisma.$executeRawUnsafe(
        `UPDATE site_ops.issues SET assigned_to = $2::uuid WHERE issue_id = $1::uuid`,
        issueId,
        USER_ID,
      );

      const res = await http()
        .patch(`/api/v1/site/issues/${issueId}`)
        .set('x-test-role', 'SITE_ENGINEER')
        .send({ description: 'measured again: 3mm' });
      expect(res.status).toBe(200);

      const rows = await infra.prisma.$queryRawUnsafe<Array<{ assigned_to: string | null }>>(
        `SELECT assigned_to FROM site_ops.issues WHERE issue_id = $1::uuid`,
        issueId,
      );
      expect(rows[0].assigned_to).toBe(USER_ID);
    });

    it('flags when the server changed status while the client held an offline edit', async () => {
      // The condition master:2591 actually states. The client left with the issue OPEN, someone
      // moved it to RESOLVED on the server, and the client comes back with an edit made against
      // the state it remembers.
      const issueId = await newIssue();
      await infra.prisma.$executeRawUnsafe(
        `UPDATE site_ops.issues SET status = 'RESOLVED', modified_at = now()
          WHERE issue_id = $1::uuid`,
        issueId,
      );

      const res = await http()
        .patch(`/api/v1/site/issues/${issueId}`)
        .set('x-test-role', 'SITE_ENGINEER')
        .send({
          status: 'OPEN',
          description: 'edited on the device while offline',
          last_known_modified_at: '2019-01-01T00:00:00.000Z',
          client_submitted_at: new Date().toISOString(),
        });
      expect(res.status).toBe(200);

      const records = await conflictsFor(issueId);
      expect(records).toHaveLength(1);
      expect(records[0].entity_type).toBe('issues');
      expect(CONFLICT_TYPES).toContain(records[0].conflict_type);

      const events = await flaggedEventsFor(issueId);
      expect(events).toHaveLength(1);
      expect(events[0].payload).toMatchObject({
        conflict_id: records[0].conflict_id,
        entity_type: 'issues',
        entity_id: issueId,
      });

      // Status is server-authoritative in a FIELD_LEVEL_MERGE (master:2586).
      expect(await statusOf(issueId)).toBe('RESOLVED');
    });
  });
});

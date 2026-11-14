/**
 * Site-report events name the report that exists.
 *
 * A site report is unique per (project_id, report_date, submitted_by), and both write paths upsert
 * on that key: a same-day resubmission (POST /site/reports) and a second device id for the same day
 * (POST /site/reports/sync) land on the EXISTING row, which keeps its first report_id. The events
 * used to be built before the write, from the id the request generated or carried — an id that,
 * on the upsert, belongs to no report. The PM's notification printed it ("report {{report_id}}"),
 * and the search indexer looked it up, found nothing and never indexed the new summary.
 *
 * Asserted on the real database: one row, and every outbox row for it naming that row's id.
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

const TENANT_ID = 'bbbb1111-1111-4000-8000-000000000068';
const USER_ID = 'bbbb2222-2222-4000-8000-000000000068';

describe('Site-report events name the written report (real database)', () => {
  let infra: IntegrationInfra;
  let app: INestApplication;
  let projectId = '';

  beforeAll(async () => {
    infra = await startIntegrationInfra();
    await infra.prisma.$executeRawUnsafe(
      `INSERT INTO platform.tenants (tenant_id, tenant_code, tenant_name, keycloak_realm, plan_type, is_active)
       VALUES ($1::uuid, 'sd-p68', 'Site Report Event Id', 'construction-os', 'STARTER'::platform."PlanType", true)`,
      TENANT_ID,
    );
    await infra.prisma.$executeRawUnsafe(
      `INSERT INTO platform.users (user_id, tenant_id, keycloak_user_id, phone_number, email, display_name)
       VALUES ($1::uuid, $2::uuid, 'kc-p68', '+66890000068', 'p68@example.com', 'P68')`,
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
      const headers = (req['headers'] ?? {}) as Record<string, string>;
      req['user'] = {
        tenant_id: TENANT_ID,
        user_id: USER_ID,
        role: headers['x-test-role'] ?? 'SITE_ENGINEER',
        tenantCode: 'sd-p68',
      };
      next();
    });
    await app.init();

    const proj = await request(app.getHttpServer())
      .post('/api/v1/projects')
      .set('x-test-role', 'TENANT_ADMIN')
      .send({
        project_code: 'SD-P68-HOST',
        project_name: 'Report Event Host',
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

  const reportsOn = (reportDate: string): Promise<Array<{ report_id: string; summary: string }>> =>
    infra.prisma.$queryRawUnsafe(
      `SELECT report_id::text AS report_id, summary FROM site_ops.site_reports
        WHERE project_id = $1::uuid AND report_date = $2::date AND submitted_by = $3::uuid`,
      projectId,
      reportDate,
      USER_ID,
    );

  /** report_id of every outbox row of `eventType` for this project and day, oldest first. */
  const eventReportIds = async (eventType: string, reportDate: string): Promise<string[]> => {
    const rows = await infra.prisma.$queryRawUnsafe<Array<{ report_id: string }>>(
      // The outbox row holds the whole envelope; the domain fields are at payload->'payload'.
      `SELECT payload->'payload'->>'report_id' AS report_id FROM platform.outbox_events
        WHERE event_type = $1
          AND payload->'payload'->>'project_id' = $2
          AND payload->'payload'->>'report_date' = $3
        ORDER BY created_at, id`,
      eventType,
      projectId,
      reportDate,
    );
    return rows.map((r) => r.report_id);
  };

  it('a same-day resubmission: both site.report.created.v1 rows name the one report', async () => {
    const day = '2019-03-01';
    const first = await http()
      .post('/api/v1/site/reports')
      .send({ project_id: projectId, report_date: day, summary: 'first version' });
    expect([200, 201]).toContain(first.status);
    const second = await http()
      .post('/api/v1/site/reports')
      .send({ project_id: projectId, report_date: day, summary: 'second version' });
    expect([200, 201]).toContain(second.status);

    const rows = await reportsOn(day);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.summary).toBe('second version');
    const reportId = rows[0]!.report_id;
    expect((second.body as { report_id: string }).report_id).toBe(reportId);

    expect(await eventReportIds('site.report.created.v1', day)).toEqual([reportId, reportId]);
  });

  it('sync: a second client_id for the same day names the existing report', async () => {
    const day = '2019-03-02';
    const item = (clientId: string, summary: string) => ({
      client_id: clientId,
      project_id: projectId,
      report_date: day,
      summary,
    });
    const firstId = randomUUID();
    const secondId = randomUUID();

    const a = await http()
      .post('/api/v1/site/reports/sync')
      .send({ items: [item(firstId, 'a')] });
    expect(a.status).toBeLessThan(400);
    const b = await http()
      .post('/api/v1/site/reports/sync')
      .send({ items: [item(secondId, 'b')] });
    expect(b.status).toBeLessThan(400);

    // The second item is told the report it landed on, not its own client_id. Since
    // fix/site-report-sync-natural-key it is an edit of that report (flagged, see below), not a
    // second submission, so the one submitted event is the first one.
    expect((b.body as Array<{ client_id: string; report_id: string }>)[0]).toEqual(
      expect.objectContaining({ client_id: secondId, report_id: firstId }),
    );

    const rows = await reportsOn(day);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.report_id).toBe(firstId);

    expect(await eventReportIds('site.report.submitted.v1', day)).toEqual([firstId]);
  });

  // ── A new client_id for a day that already has a report: a plain edit of the submitter's own ──
  // ── report. Newest save wins, only the fields sent are written, ACCEPTED, no conflict record. ──

  const detailsOn = (
    reportDate: string,
  ): Promise<
    Array<{
      report_id: string;
      summary: string | null;
      blocker_category: string | null;
      shift: string | null;
      manpower_count: number | null;
    }>
  > =>
    infra.prisma.$queryRawUnsafe(
      `SELECT report_id::text AS report_id, summary, blocker_category, shift, manpower_count
         FROM site_ops.site_reports
        WHERE project_id = $1::uuid AND report_date = $2::date AND submitted_by = $3::uuid`,
      projectId,
      reportDate,
      USER_ID,
    );

  const conflictsFor = (reportId: string): Promise<unknown[]> =>
    infra.prisma.$queryRawUnsafe(
      `SELECT conflict_id FROM site_ops.conflict_records WHERE entity_id = $1::uuid`,
      reportId,
    );

  const flaggedEventsFor = async (reportId: string): Promise<number> => {
    const rows = await infra.prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
      `SELECT count(*) AS n FROM platform.outbox_events
        WHERE event_type = 'site.conflict.flagged.v1' AND payload->'payload'->>'entity_id' = $1`,
      reportId,
    );
    return Number(rows[0]!.n);
  };

  const webReport = async (day: string) => {
    const res = await http().post('/api/v1/site/reports').send({
      project_id: projectId,
      report_date: day,
      summary: 'web version',
      blocker_category: 'WEATHER',
      shift: 'NIGHT',
    });
    expect([200, 201]).toContain(res.status);
    return (res.body as { report_id: string }).report_id;
  };

  /** What the mobile app sends: no summary, a headcount, its own new id. */
  const deviceItem = (day: string, clientSubmittedAt: string, manpower: number) => ({
    client_id: randomUUID(),
    project_id: projectId,
    report_date: day,
    manpower_count: manpower,
    client_submitted_at: clientSubmittedAt,
  });

  it('a newer device save edits the web report: its fields written, the rest kept, unflagged', async () => {
    const day = '2019-03-03';
    const reportId = await webReport(day);

    const res = await http()
      .post('/api/v1/site/reports/sync')
      .send({ items: [deviceItem(day, new Date().toISOString(), 14)] });
    expect(res.status).toBeLessThan(400);
    expect((res.body as Array<{ report_id: string; conflict_status: string }>)[0]).toEqual(
      expect.objectContaining({ report_id: reportId, conflict_status: 'ACCEPTED' }),
    );

    expect(await detailsOn(day)).toEqual([
      {
        report_id: reportId,
        summary: 'web version',
        blocker_category: 'WEATHER',
        shift: 'NIGHT',
        manpower_count: 14,
      },
    ]);
    expect(await conflictsFor(reportId)).toEqual([]);
    expect(await flaggedEventsFor(reportId)).toBe(0);
    // An edit, not a second submission: the analytics worker counts one report per submitted event.
    expect(await eventReportIds('site.report.submitted.v1', day)).toEqual([]);
  });

  it('an older device save leaves the web report as it is, unflagged', async () => {
    const day = '2019-03-04';
    const reportId = await webReport(day);

    const res = await http()
      .post('/api/v1/site/reports/sync')
      .send({ items: [deviceItem(day, '2019-03-04T06:00:00.000Z', 3)] });
    expect(res.status).toBeLessThan(400);
    expect((res.body as Array<{ conflict_status: string }>)[0]?.conflict_status).toBe('ACCEPTED');

    expect(await detailsOn(day)).toEqual([
      expect.objectContaining({ summary: 'web version', manpower_count: null }),
    ]);
    expect(await conflictsFor(reportId)).toEqual([]);
  });

  // The app's own flow: offline, save a draft at 09:00 and submit at 17:00 (each save a new id),
  // reconnect later and sync both. The submit must win although the draft's row was written last.
  it('offline draft then submit, synced together: the later save wins, one report, one submitted event', async () => {
    const day = '2019-03-05';
    const res = await http()
      .post('/api/v1/site/reports/sync')
      .send({
        items: [
          deviceItem(day, '2019-03-05T02:00:00.000Z', 5),
          deviceItem(day, '2019-03-05T10:00:00.000Z', 9),
        ],
      });
    expect(res.status).toBeLessThan(400);
    const results = res.body as Array<{ report_id: string; conflict_status: string }>;
    expect(results.map((r) => r.conflict_status)).toEqual(['ACCEPTED', 'ACCEPTED']);
    expect(results[1]!.report_id).toBe(results[0]!.report_id);

    const rows = await detailsOn(day);
    expect(rows).toEqual([expect.objectContaining({ manpower_count: 9 })]);
    expect(await eventReportIds('site.report.submitted.v1', day)).toEqual([results[0]!.report_id]);
    expect(await conflictsFor(results[0]!.report_id)).toEqual([]);
  });

  it('the same two saves synced one at a time: still the later save wins', async () => {
    const day = '2019-03-06';
    const draft = await http()
      .post('/api/v1/site/reports/sync')
      .send({ items: [deviceItem(day, '2019-03-06T02:00:00.000Z', 5)] });
    expect(draft.status).toBeLessThan(400);
    const submit = await http()
      .post('/api/v1/site/reports/sync')
      .send({ items: [deviceItem(day, '2019-03-06T10:00:00.000Z', 9)] });
    expect(submit.status).toBeLessThan(400);

    expect(await detailsOn(day)).toEqual([expect.objectContaining({ manpower_count: 9 })]);
  });
});

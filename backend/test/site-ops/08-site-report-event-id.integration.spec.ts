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

    // The second item is told the report it landed on, not its own client_id.
    expect((b.body as Array<{ client_id: string; report_id: string }>)[0]).toEqual(
      expect.objectContaining({ client_id: secondId, report_id: firstId }),
    );

    const rows = await reportsOn(day);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.report_id).toBe(firstId);

    expect(await eventReportIds('site.report.submitted.v1', day)).toEqual([firstId, firstId]);
  });
});

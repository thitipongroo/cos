/**
 * Issue edits are announced, so the search index follows them (fix/issue-index-updates).
 *
 * The indexer used to index an issue at creation only. `PATCH /site/issues/:id/status` announced a
 * status move (site.issue.status_changed.v1) that nothing consumed, and `PATCH /site/issues/:id`
 * announced nothing for a description or severity edit. Now every applied edit writes
 * site.issue.updated.v1 in the same transaction, and the indexer handles all three issue events by
 * loading the row — asserted here as the outbox rows and the row the indexer would load.
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
import { SearchIndexRepository } from '../../src/modules/search/search-index.repository';
import { runInTenantContext } from '../../src/shared/context/run-in-tenant-context';

const TENANT = 'bbbb1111-1111-4000-8000-000000000091';
const USER = 'bbbb2222-1111-4000-8000-000000000091';

describe('Issue edits are announced for the search index (real database)', () => {
  let infra: IntegrationInfra;
  let app: INestApplication;
  let projectId = '';

  beforeAll(async () => {
    infra = await startIntegrationInfra();
    await infra.prisma.$executeRawUnsafe(
      `INSERT INTO platform.tenants (tenant_id, tenant_code, tenant_name, keycloak_realm, plan_type, is_active)
       VALUES ($1::uuid, 'sd-p91', 'Issue Events', 'construction-os', 'STARTER'::platform."PlanType", true)`,
      TENANT,
    );
    await infra.prisma.$executeRawUnsafe(
      `INSERT INTO platform.users (user_id, tenant_id, keycloak_user_id, phone_number, email, display_name)
       VALUES ($1::uuid, $2::uuid, 'kc-p91', '+66890000910', 'p91@example.com', 'P91')`,
      USER,
      TENANT,
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
        tenant_id: TENANT,
        user_id: USER,
        role: 'TENANT_ADMIN',
        tenantCode: 'sd-p91',
      };
      next();
    });
    await app.init();

    const proj = await request(app.getHttpServer()).post('/api/v1/projects').send({
      project_code: 'SD-P91',
      project_name: 'Issue Events Host',
      project_type: 'RESIDENTIAL',
      start_date: '2019-01-01',
      end_date: '2020-01-01',
    });
    expect([200, 201]).toContain(proj.status);
    projectId = (proj.body as { project_id: string }).project_id;
  }, 300_000);

  afterAll(async () => {
    await app?.close();
    await stopIntegrationInfra(infra);
  });

  const http = () => request(app.getHttpServer());

  const eventsFor = async (issueId: string): Promise<string[]> => {
    const rows = await infra.prisma.$queryRawUnsafe<Array<{ event_type: string }>>(
      `SELECT event_type FROM platform.outbox_events
        WHERE payload->'payload'->>'issue_id' = $1 ORDER BY created_at, event_type`,
      issueId,
    );
    return rows.map((r) => r.event_type);
  };

  const indexed = (issueId: string) =>
    runInTenantContext({ tenantId: TENANT, userId: USER }, () =>
      app.get(SearchIndexRepository).findIssue(issueId),
    );

  it('a description / severity edit writes site.issue.updated.v1; the indexer row has the new values', async () => {
    const created = await http()
      .post('/api/v1/site/issues')
      .send({ project_id: projectId, title: 'ผนังร้าว', severity: 'LOW', description: 'เล็กน้อย' });
    expect([200, 201]).toContain(created.status);
    const issueId = (created.body as { issue_id: string }).issue_id;

    const edit = await http()
      .patch(`/api/v1/site/issues/${issueId}`)
      .send({ description: 'ร้าวลึก ต้องซ่อม', severity: 'HIGH' });
    expect(edit.status).toBe(200);

    expect(await eventsFor(issueId)).toEqual(['site.issue.created.v1', 'site.issue.updated.v1']);
    expect(await indexed(issueId)).toEqual(
      expect.objectContaining({ description: 'ร้าวลึก ต้องซ่อม', severity: 'HIGH' }),
    );
  });

  // The status path already emitted status_changed before this change; this case pins it alongside
  // the edit path. What is new is that the indexer consumes it (unit-tested in the consumer spec).
  // `indexed` is the row the indexer loads (a database read) — the consumer and OpenSearch are not run.
  it('a status change writes site.issue.status_changed.v1; the indexer row has the new status', async () => {
    const created = await http()
      .post('/api/v1/site/issues')
      .send({ project_id: projectId, title: 'Scaffold guardrail', severity: 'MEDIUM' });
    const issueId = (created.body as { issue_id: string }).issue_id;

    const moved = await http()
      .patch(`/api/v1/site/issues/${issueId}/status`)
      .send({ status: 'RESOLVED', resolution_note: 'fixed' });
    expect(moved.status).toBe(200);

    expect(await eventsFor(issueId)).toEqual([
      'site.issue.created.v1',
      'site.issue.status_changed.v1',
    ]);
    expect(await indexed(issueId)).toEqual(expect.objectContaining({ status: 'RESOLVED' }));
  });
});

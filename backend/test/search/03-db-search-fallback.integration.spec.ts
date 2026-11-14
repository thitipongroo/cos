/**
 * Search with OpenSearch unreachable (fix/search-results-fallback).
 *
 * The site-report, issue and project searches used to answer an OpenSearch failure with the plain
 * list — every row, unfiltered by `q` — which the caller shows as search results. They now search the
 * database (ILIKE over the same fields, metacharacters escaped). Real PostgreSQL, rows written through
 * the app's routes; OpenSearch pointed at a port nothing listens on.
 */
// The integration setup mocks the OpenSearch client; this suite needs the real one, failing.
jest.unmock('@opensearch-project/opensearch');
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
import { ContextIdFactory } from '@nestjs/core';
import { SiteOpsRepository } from '../../src/modules/site-ops/site-ops.repository';
import { runInTenantContext } from '../../src/shared/context/run-in-tenant-context';

const TENANT = 'bbbb1111-1111-4000-8000-000000000070';
const USER = 'bbbb2222-1111-4000-8000-000000000070';

describe('Search falls back to the database when OpenSearch is down (real PostgreSQL)', () => {
  let infra: IntegrationInfra;
  let app: INestApplication;
  let projectId = '';
  const previousUrl = process.env['OPENSEARCH_URL'];

  beforeAll(async () => {
    infra = await startIntegrationInfra();
    process.env['OPENSEARCH_URL'] = 'http://127.0.0.1:1'; // nothing listens: every search throws
    await infra.prisma.$executeRawUnsafe(
      `INSERT INTO platform.tenants (tenant_id, tenant_code, tenant_name, keycloak_realm, plan_type, is_active)
       VALUES ($1::uuid, 'sd-p70', 'Search Fallback', 'construction-os', 'STARTER'::platform."PlanType", true)`,
      TENANT,
    );
    await infra.prisma.$executeRawUnsafe(
      `INSERT INTO platform.users (user_id, tenant_id, keycloak_user_id, phone_number, email, display_name)
       VALUES ($1::uuid, $2::uuid, 'kc-p70', '+66890000700', 'p70@example.com', 'P70')`,
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
        tenantCode: 'sd-p70',
      };
      next();
    });
    await app.init();

    const http = () => request(app.getHttpServer());
    const proj = await http().post('/api/v1/projects').send({
      project_code: 'SD-P70-RIV',
      project_name: 'โครงการริมน้ำ',
      project_type: 'RESIDENTIAL',
      start_date: '2019-01-01',
      end_date: '2020-01-01',
    });
    expect([200, 201]).toContain(proj.status);
    projectId = (proj.body as { project_id: string }).project_id;
    const other = await http().post('/api/v1/projects').send({
      project_code: 'SD-P70-OTH',
      project_name: 'Hilltop Offices',
      project_type: 'COMMERCIAL',
      start_date: '2019-01-01',
      end_date: '2020-01-01',
    });
    expect([200, 201]).toContain(other.status);

    for (const [day, blockers] of [
      ['2019-05-01', 'ปูนมาช้า เครนเสีย'],
      ['2019-05-02', 'Tower crane down'],
      ['2019-05-03', 'cement 50% delivered'],
      ['2019-05-04', 'cement 500 bags'],
    ] as const) {
      const res = await http()
        .post('/api/v1/site/reports')
        .send({ project_id: projectId, report_date: day, blockers });
      expect([200, 201]).toContain(res.status);
    }
    for (const [title, severity] of [
      ['ผนังร้าวชั้นสอง', 'HIGH'],
      ['ผนังสีลอก', 'LOW'],
      // Matches nothing below: the unfiltered list (the old fallback) would include it.
      ['Scaffold missing guardrail', 'HIGH'],
    ] as const) {
      const res = await http()
        .post('/api/v1/site/issues')
        .send({ project_id: projectId, title, severity });
      expect([200, 201]).toContain(res.status);
    }
  }, 300_000);

  afterAll(async () => {
    await app?.close();
    if (previousUrl === undefined) delete process.env['OPENSEARCH_URL'];
    else process.env['OPENSEARCH_URL'] = previousUrl;
    await stopIntegrationInfra(infra);
  });

  const get = (url: string) => request(app.getHttpServer()).get(url);
  const q = (text: string) => encodeURIComponent(text);

  it('site reports: a Thai substring finds its report, and only it', async () => {
    const res = await get(`/api/v1/site/reports?q=${q('ปูน')}`);
    expect(res.status).toBe(200);
    expect(
      (res.body as { items: Array<{ blockers: string }> }).items.map((r) => r.blockers),
    ).toEqual(['ปูนมาช้า เครนเสีย']);
  });

  it('site reports: case-insensitive, and a % in the query is matched literally', async () => {
    const crane = await get(`/api/v1/site/reports?q=${q('CRANE')}`);
    expect(
      (crane.body as { items: Array<{ blockers: string }> }).items.map((r) => r.blockers),
    ).toEqual(['Tower crane down']);
    // Unescaped, "50%" would be a wildcard and also match "500 bags".
    const pct = await get(`/api/v1/site/reports?q=${q('50%')}`);
    expect(
      (pct.body as { items: Array<{ blockers: string }> }).items.map((r) => r.blockers),
    ).toEqual(['cement 50% delivered']);
  });

  it('site reports: the date range applies to the database search', async () => {
    const res = await get(`/api/v1/site/reports?q=${q('cement')}&from_date=2019-05-04`);
    expect(
      (res.body as { items: Array<{ blockers: string }> }).items.map((r) => r.blockers),
    ).toEqual(['cement 500 bags']);
  });

  it('site reports: no match is an empty result, not the unfiltered list', async () => {
    const res = await get(`/api/v1/site/reports?q=${q('zzzznomatch')}`);
    expect(res.status).toBe(200);
    expect((res.body as { items: unknown[] }).items).toEqual([]);
  });

  // GET /site/issues takes no `q` (no client searches issues — register), so the issue search is
  // driven through the repository the service's fallback calls, against the same real rows.
  it('issues: the database search finds a Thai substring, with the severity filter applied', async () => {
    const contextId = ContextIdFactory.create();
    app.registerRequestByContextId({ tenantId: TENANT }, contextId);
    const repo = await app.resolve(SiteOpsRepository, contextId, { strict: false });
    const titles = (rows: Array<{ title: string }>) => rows.map((r) => r.title).sort();

    await runInTenantContext({ tenantId: TENANT, userId: USER }, async () => {
      expect(titles(await repo.searchIssuesText('ผนัง', {}, 50))).toEqual(
        ['ผนังร้าวชั้นสอง', 'ผนังสีลอก'].sort(),
      );
      expect(titles(await repo.searchIssuesText('ผนัง', { severity: 'HIGH' }, 50))).toEqual([
        'ผนังร้าวชั้นสอง',
      ]);
      expect(await repo.searchIssuesText('zzzznomatch', {}, 50)).toEqual([]);
    });
  });

  it('projects: by a Thai substring of the name and by code', async () => {
    const byName = await get(`/api/v1/projects?q=${q('ริมน้ำ')}`);
    expect(byName.status).toBe(200);
    const names = (byName.body as { items: Array<{ project_name: string }> }).items.map(
      (p) => p.project_name,
    );
    expect(names).toEqual(['โครงการริมน้ำ']);
    const byCode = await get(`/api/v1/projects?q=${q('p70-oth')}`);
    expect(
      (byCode.body as { items: Array<{ project_name: string }> }).items.map((p) => p.project_name),
    ).toEqual(['Hilltop Offices']);
  });
});

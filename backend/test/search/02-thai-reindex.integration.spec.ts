/**
 * Thai-aware search indexes, rebuilt from the database (feat/search-thai-reindex).
 *
 * The standard analyzer the dynamic mapping used does not segment Thai: "ปูนมาช้า เครนเสีย" was two
 * tokens, so a search for "ปูน" found nothing. The index templates (search-index-mapping.ts) give
 * every string the `thai` analyzer and keep the `.keyword` sub-field the read paths filter on. An
 * index that already exists keeps its old analyzer, so the reindex script builds a new index from
 * the database and moves the name onto it as an alias.
 *
 * Real PostgreSQL (rows written through the app's own routes) and real OpenSearch. The app runs with
 * no Kafka, so nothing indexes the rows as they are written — exactly the state the reindex exists
 * for: rows in the database, an index that does not have them.
 */
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
import { Client as PgClient } from 'pg';
import { Client as OpenSearchClient } from '@opensearch-project/opensearch';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';
import {
  startIntegrationInfra,
  stopIntegrationInfra,
  clsAuthGuard,
  type IntegrationInfra,
} from '../helpers/integration-infra';
import { AppModule } from '../../src/app.module';
import { JwtAuthGuard } from '../../src/shared/guards/jwt-auth.guard';
import {
  listTenants,
  reindexSearch,
  type ReindexSearchClient,
} from '../../src/modules/search/maintenance/reindex-search';
import { templateNameFor } from '../../src/modules/search/search-index-mapping';
import { SearchIndexerService } from '../../src/modules/search/search-indexer.service';
import { SearchIndexRepository } from '../../src/modules/search/search-index.repository';
import { runInTenantContext } from '../../src/shared/context/run-in-tenant-context';

// The deployed stack runs 3.7.0 (docker-compose.yml); the other suite pins 2.17.1. Run both:
// OPENSEARCH_IMAGE=opensearchproject/opensearch:3.7.0 pnpm … test:integration test/search/02-…
const OPENSEARCH_IMAGE = process.env['OPENSEARCH_IMAGE'] ?? 'opensearchproject/opensearch:2.17.1';

const TENANT_A = 'bbbb1111-1111-4000-8000-000000000069';
const TENANT_B = 'bbbb1111-2222-4000-8000-000000000069';
const TENANT_C = 'bbbb1111-3333-4000-8000-000000000069'; // made inactive before the reindex
const USER_A = 'bbbb2222-1111-4000-8000-000000000069';
const USER_B = 'bbbb2222-2222-4000-8000-000000000069';
const USER_C = 'bbbb2222-3333-4000-8000-000000000069';
type T = 'A' | 'B' | 'C';
const TENANT: Record<T, string> = { A: TENANT_A, B: TENANT_B, C: TENANT_C };
const USER: Record<T, string> = { A: USER_A, B: USER_B, C: USER_C };

describe('Thai-aware search indexes, rebuilt from the database (real PostgreSQL + OpenSearch)', () => {
  let infra: IntegrationInfra;
  let opensearch: StartedTestContainer;
  let node: string;
  let app: INestApplication;
  let pg: PgClient;
  const projectOf: Record<string, string> = {};

  const os = (path: string, init?: RequestInit) =>
    fetch(`${node}${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    });

  const http = (tenant: T) => {
    const agent = request(app.getHttpServer());
    const set = (r: request.Test) => r.set('x-test-tenant', tenant);
    return {
      get: (url: string) => set(agent.get(url)),
      post: (url: string) => set(agent.post(url)),
    };
  };

  beforeAll(async () => {
    [infra, opensearch] = await Promise.all([
      startIntegrationInfra(),
      new GenericContainer(OPENSEARCH_IMAGE)
        .withEnvironment({
          'discovery.type': 'single-node',
          DISABLE_SECURITY_PLUGIN: 'true',
          DISABLE_INSTALL_DEMO_CONFIG: 'true',
          OPENSEARCH_JAVA_OPTS: '-Xms512m -Xmx512m',
        })
        .withExposedPorts(9200)
        .withWaitStrategy(Wait.forHttp('/_cluster/health', 9200).forStatusCode(200))
        .withStartupTimeout(180_000)
        .start(),
    ]);
    node = `http://${opensearch.getHost()}:${opensearch.getMappedPort(9200)}`;
    process.env['OPENSEARCH_URL'] = node;

    // An environment from before the templates: `site-reports` already exists as a concrete index
    // with the dynamic (standard-analyzer) mapping, holding a document.
    const stale = await os('/site-reports/_doc/stale-doc?refresh=true', {
      method: 'PUT',
      body: JSON.stringify({ tenant_id: TENANT_A, blockers: 'ปูนมาช้า' }),
    });
    expect(stale.ok).toBe(true);

    for (const [tenant, user, code, phone] of [
      [TENANT_A, USER_A, 'sd-p69a', '+66890000691'],
      [TENANT_B, USER_B, 'sd-p69b', '+66890000692'],
      [TENANT_C, USER_C, 'sd-p69c', '+66890000693'],
    ] as const) {
      await infra.prisma.$executeRawUnsafe(
        `INSERT INTO platform.tenants (tenant_id, tenant_code, tenant_name, keycloak_realm, plan_type, is_active)
         VALUES ($1::uuid, $2, $2, 'construction-os', 'STARTER'::platform."PlanType", true)`,
        tenant,
        code,
      );
      await infra.prisma.$executeRawUnsafe(
        `INSERT INTO platform.users (user_id, tenant_id, keycloak_user_id, phone_number, email, display_name)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5, $3)`,
        user,
        tenant,
        `kc-${code}`,
        phone,
        `${code}@example.com`,
      );
    }

    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard(JwtAuthGuard)
      .useValue(clsAuthGuard((req) => (req['user'] ?? {}) as Record<string, string>))
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.use((req: Record<string, unknown>, _res: unknown, next: () => void) => {
      const headers = (req['headers'] ?? {}) as Record<string, string>;
      const t = (headers['x-test-tenant'] ?? 'A') as T;
      req['user'] = {
        tenant_id: TENANT[t],
        user_id: USER[t],
        role: 'TENANT_ADMIN',
        tenantCode: `sd-p69${t.toLowerCase()}`,
      };
      next();
    });
    await app.init(); // SearchIndexerService.onModuleInit puts the templates here

    for (const t of ['A', 'B', 'C'] as const) {
      const proj = await http(t)
        .post('/api/v1/projects')
        .send({
          project_code: `SD-P69-${t}`,
          project_name: t === 'A' ? 'โครงการริมน้ำ' : `โครงการอื่น ${t}`,
          project_type: 'RESIDENTIAL',
          start_date: '2019-01-01',
          end_date: '2020-01-01',
        });
      expect([200, 201]).toContain(proj.status);
      projectOf[t] = (proj.body as { project_id: string }).project_id;
    }
    const report = async (t: T, day: string, blockers: string) => {
      const res = await http(t)
        .post('/api/v1/site/reports')
        .send({ project_id: projectOf[t], report_date: day, blockers });
      expect([200, 201]).toContain(res.status);
    };
    await report('A', '2019-04-01', 'ปูนมาช้า เครนเสีย');
    await report('A', '2019-04-02', 'Tower crane down');
    // ส่ง (deliver) is on the built-in `thai` analyzer's stopword list — hence the custom analyzer.
    await report('A', '2019-04-03', 'รอส่งของ');
    // Tenant B has the same Thai words: it must never surface for tenant A.
    await report('B', '2019-04-01', 'ปูนมาช้า');
    await report('C', '2019-04-01', 'ปูนมาช้า');
    const issue = await http('A')
      .post('/api/v1/site/issues')
      .send({ project_id: projectOf['A'], title: 'ผนังร้าวชั้นสอง', severity: 'HIGH' });
    expect([200, 201]).toContain(issue.status);

    // Tenant C is paused (inactive) when the reindex runs — e.g. mid enterprise provisioning (D48).
    await infra.prisma.$executeRawUnsafe(
      `UPDATE platform.tenants SET is_active = false WHERE tenant_id = $1::uuid`,
      TENANT_C,
    );

    // The pre-template state, for real: tenant A's Thai report indexed by the app's own indexer into
    // the concrete `site-reports` that already existed (standard analyzer).
    const firstReport = await infra.prisma.$queryRawUnsafe<Array<{ report_id: string }>>(
      `SELECT report_id::text AS report_id FROM site_ops.site_reports
        WHERE tenant_id = $1::uuid AND blockers = 'ปูนมาช้า เครนเสีย'`,
      TENANT_A,
    );
    await runInTenantContext({ tenantId: TENANT_A, userId: USER_A }, async () => {
      const row = await app.get(SearchIndexRepository).findSiteReport(firstReport[0]!.report_id);
      await app.get(SearchIndexerService).indexSiteReport(row!);
    });
    await os('/site-reports/_refresh', { method: 'POST' });

    pg = new PgClient({ connectionString: infra.pgUrl });
    await pg.connect();
  }, 600_000);

  afterAll(async () => {
    await pg?.end();
    await app?.close();
    delete process.env['OPENSEARCH_URL'];
    await opensearch?.stop();
    await stopIntegrationInfra(infra);
  });

  const reportHits = async (t: T, q: string) => {
    const res = await http(t).get(`/api/v1/site/reports?q=${encodeURIComponent(q)}`);
    expect(res.status).toBe(200);
    return (res.body as { items: Array<{ blockers: string | null }> }).items.map((r) => r.blockers);
  };

  it('the app put the Thai-aware templates at startup', async () => {
    for (const index of ['cos_projects', 'site-reports', 'site-issues'] as const) {
      const res = await os(`/_index_template/${templateNameFor(index)}`);
      expect(res.status).toBe(200);
    }
  });

  it('before the reindex: the old index holds the Thai report but cannot find a word in it', async () => {
    const all = (await (
      await os('/site-reports/_search', {
        method: 'POST',
        body: JSON.stringify({ query: { match_phrase: { blockers: 'ปูนมาช้า เครนเสีย' } } }),
      })
    ).json()) as { hits: { total: { value: number } } };
    expect(all.hits.total.value).toBe(1); // it is there…
    expect(await reportHits('A', 'ปูน')).toEqual([]); // …and a word inside it finds nothing
  });

  const tenantsNow = async () =>
    (await listTenants(pg)).map((t) => ({ tenantId: t.tenant_id, db: pg }));

  /** Documents of one tenant in an index, through the `.keyword` term filter the read paths use. */
  const docsOfTenant = async (index: string, tenantId: string): Promise<number> => {
    const res = (await (
      await os(`/${index}/_count`, {
        method: 'POST',
        body: JSON.stringify({ query: { term: { 'tenant_id.keyword': tenantId } } }),
      })
    ).json()) as { count: number };
    return res.count;
  };

  it('a dry run reads the database and writes nothing', async () => {
    const tenants = await tenantsNow();
    // Inactive tenant C included: leaving it out would drop its documents for good.
    expect(tenants.map((t) => t.tenantId).sort()).toEqual([TENANT_A, TENANT_B, TENANT_C].sort());

    const reports = await reindexSearch(
      new OpenSearchClient({ node }) as unknown as ReindexSearchClient,
      tenants,
      { apply: false, indexes: ['cos_projects', 'site-reports', 'site-issues'] },
    );
    expect(reports.map((r) => [r.index, r.documents, r.before.kind])).toEqual([
      ['cos_projects', 3, 'none'],
      ['site-reports', 5, 'concrete'],
      ['site-issues', 1, 'none'],
    ]);
    const aliases = await os('/_alias/site-reports');
    expect(aliases.status).toBe(404);
    expect(await reportHits('A', 'ปูน')).toEqual([]);
  });

  it('--apply: the names become aliases of new indexes holding every row, Thai-searchable', async () => {
    const tenants = await tenantsNow();
    const reports = await reindexSearch(
      new OpenSearchClient({ node }) as unknown as ReindexSearchClient,
      tenants,
      { apply: true, indexes: ['cos_projects', 'site-reports', 'site-issues'] },
    );
    for (const r of reports) {
      const alias = (await (await os(`/_alias/${r.index}`)).json()) as Record<string, unknown>;
      expect(Object.keys(alias)).toEqual([r.target]);
    }
    // The stale document of the old concrete index went with it; every row is there.
    expect(((await (await os('/site-reports/_count')).json()) as { count: number }).count).toBe(5);
    // The `.keyword` term filter every read path uses still separates tenants exactly — including
    // inactive tenant C, whose report is kept.
    expect(await docsOfTenant('site-reports', TENANT_A)).toBe(3);
    expect(await docsOfTenant('site-reports', TENANT_B)).toBe(1);
    expect(await docsOfTenant('site-reports', TENANT_C)).toBe(1);

    // Through the app's read paths, which query the names (now aliases).
    expect(await reportHits('A', 'ปูน')).toEqual(['ปูนมาช้า เครนเสีย']);
    expect(await reportHits('A', 'เครน')).toEqual(['ปูนมาช้า เครนเสีย']);
    expect(await reportHits('A', 'crane')).toEqual(['Tower crane down']);
    expect(await reportHits('A', 'ส่ง')).toEqual(['รอส่งของ']);
    expect(await reportHits('B', 'ปูน')).toEqual(['ปูนมาช้า']);

    const issues = await http('A').get(`/api/v1/site/issues?q=${encodeURIComponent('ผนัง')}`);
    expect((issues.body as { items: Array<{ title: string }> }).items.map((i) => i.title)).toEqual([
      'ผนังร้าวชั้นสอง',
    ]);
    const projects = await http('A').get(`/api/v1/projects?q=${encodeURIComponent('ริมน้ำ')}`);
    expect(projects.status).toBe(200);
    const projectItems = (projects.body as { items?: Array<{ project_name: string }> }).items ?? [];
    expect(projectItems.map((p) => p.project_name)).toEqual(['โครงการริมน้ำ']);
  });

  it('a second run moves the aliases to newer indexes and keeps the documents', async () => {
    const tenants = await tenantsNow();
    const [again] = await reindexSearch(
      new OpenSearchClient({ node }) as unknown as ReindexSearchClient,
      tenants,
      { apply: true, indexes: ['site-reports'] },
    );
    expect(again!.before.kind).toBe('alias');
    const alias = (await (await os('/_alias/site-reports')).json()) as Record<string, unknown>;
    expect(Object.keys(alias)).toEqual([again!.target]);
    expect(await reportHits('A', 'ปูน')).toEqual(['ปูนมาช้า เครนเสีย']);
  });

  // --tenant used to rebuild too: a new index holding that tenant only, swapped in — every other
  // tenant's documents gone. It now writes that tenant's rows into the index as it is.
  it('--tenant repairs one tenant in place and leaves every other tenant and the alias alone', async () => {
    const aliasBefore = Object.keys(
      (await (await os('/_alias/site-reports')).json()) as Record<string, unknown>,
    );
    // Lose one of tenant A's documents.
    const hit = (await (
      await os('/site-reports/_search', {
        method: 'POST',
        body: JSON.stringify({ query: { match_phrase: { blockers: 'Tower crane down' } } }),
      })
    ).json()) as { hits: { hits: Array<{ _id: string; _index: string }> } };
    const lost = hit.hits.hits[0]!;
    // Deleted at its own version: a plain DELETE of an externally versioned document leaves a
    // tombstone one version higher (kept ~60 s, index.gc_deletes), which would rightly reject the
    // repair's same-version write. Nothing in the app deletes documents; this only simulates a loss.
    const doc = (await (await os(`/${lost._index}/_doc/${lost._id}`)).json()) as {
      _version: number;
    };
    const del = await os(
      `/${lost._index}/_doc/${lost._id}?refresh=true&version=${doc._version}&version_type=external_gte`,
      { method: 'DELETE' },
    );
    expect(del.ok).toBe(true);
    expect(await docsOfTenant('site-reports', TENANT_A)).toBe(2);

    const [repair] = await reindexSearch(
      new OpenSearchClient({ node }) as unknown as ReindexSearchClient,
      (await listTenants(pg, TENANT_A)).map((t) => ({ tenantId: t.tenant_id, db: pg })),
      { apply: true, indexes: ['site-reports'], tenantId: TENANT_A },
    );
    expect(repair!.mode).toBe('tenant');
    expect(await docsOfTenant('site-reports', TENANT_A)).toBe(3);
    expect(await docsOfTenant('site-reports', TENANT_B)).toBe(1);
    expect(await docsOfTenant('site-reports', TENANT_C)).toBe(1);
    expect(
      Object.keys((await (await os('/_alias/site-reports')).json()) as Record<string, unknown>),
    ).toEqual(aliasBefore);
  });
});

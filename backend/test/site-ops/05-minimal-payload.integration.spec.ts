/**
 * Phase 6 — "Response DTOs optimized for mobile (minimal payload option via ?minimal=true)"
 * (master:2797).
 *
 * WHAT THIS CAN AND CANNOT ASSERT. master:2797 is the ONLY statement of this feature anywhere in
 * `context/` or `docs/specifications/` — no spec names the fields a minimal report carries. So these
 * tests assert the properties the spec does state and stop there: the option must actually reduce
 * the payload, it must return the same rows as the full response, and what comes back must still be
 * usable (a projection with no identifier is not a smaller answer, it is a useless one). The exact
 * field list is unspecified and is deliberately NOT pinned here — asserting a list read off the
 * implementation would turn today's projection into a contract nobody agreed to.
 */
jest.mock('@aws-sdk/client-sns', () => ({
  SNSClient: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({ MessageId: 'mock-msg-id' }),
  })),
  PublishCommand: jest.fn(),
}));

// The harness runs no OpenSearch, so the search path is driven from here: `searchHits` is what the
// index will appear to hold, and `searchShouldFail` drives the catch branch in searchSiteReports.
const searchHits: Array<{ _source: { report_id: string } }> = [];
let searchShouldFail = false;

jest.mock('@opensearch-project/opensearch', () => ({
  Client: jest.fn().mockImplementation(() => ({
    index: jest.fn().mockResolvedValue({}),
    search: jest
      .fn()
      .mockImplementation(() =>
        searchShouldFail
          ? Promise.reject(new Error('opensearch unavailable'))
          : Promise.resolve({ body: { hits: { hits: searchHits } } }),
      ),
  })),
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

jest.setTimeout(900_000);

const TENANT_ID = 'bbbb1111-1111-4000-8000-000000000065';
const USER_ID = 'bbbb2222-2222-4000-8000-000000000065';

const roleOf = (req: Record<string, unknown>): string => {
  const headers = (req['headers'] ?? {}) as Record<string, string>;
  return headers['x-test-role'] ?? 'SITE_ENGINEER';
};

interface ListResponse {
  items: Array<Record<string, unknown>>;
  total: number;
  page: number;
  limit: number;
}

describe('Phase 6 · ?minimal=true payload option (real database)', () => {
  let infra: IntegrationInfra;
  let app: INestApplication;
  let projectId = '';
  const reportIds: string[] = [];

  beforeAll(async () => {
    infra = await startIntegrationInfra();
    await infra.prisma.$executeRawUnsafe(
      `INSERT INTO platform.tenants (tenant_id, tenant_code, tenant_name, keycloak_realm, plan_type, is_active)
       VALUES ($1::uuid, 'sd-p65', 'Spec Derived P6 Minimal', 'construction-os', 'STARTER'::platform."PlanType", true)`,
      TENANT_ID,
    );
    await infra.prisma.$executeRawUnsafe(
      `INSERT INTO platform.users (user_id, tenant_id, keycloak_user_id, phone_number, email, display_name)
       VALUES ($1::uuid, $2::uuid, 'kc-p65', '+66890000065', 'p65@example.com', 'P65')`,
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
        tenantCode: 'sd-p65',
      };
      next();
    });
    await app.init();

    const proj = await request(app.getHttpServer())
      .post('/api/v1/projects')
      .set('x-test-role', 'TENANT_ADMIN')
      .send({
        project_code: 'SD-P65-HOST',
        project_name: 'Minimal Host',
        project_type: 'RESIDENTIAL',
        start_date: '2019-01-01',
        end_date: '2020-01-01',
      });
    expect([200, 201]).toContain(proj.status);
    projectId = (proj.body as { project_id: string }).project_id;

    // Three reports, each carrying the optional fields a full response should include, so "the
    // minimal one is smaller" is a statement about the projection and not about empty columns.
    for (let i = 1; i <= 3; i += 1) {
      const clientId = randomUUID();
      const res = await request(app.getHttpServer())
        .post('/api/v1/site/reports')
        .set('x-test-role', 'SITE_ENGINEER')
        .send({
          project_id: projectId,
          report_date: `2019-03-0${i}`,
          trade_type: 'CIVIL',
          worker_count: 4 + i,
          summary: `Day ${i} summary`,
          weather: 'RAIN',
          manpower_count: 10 + i,
          blockers: 'Access road flooded',
          client_submitted_at: new Date().toISOString(),
        });
      expect([200, 201]).toContain(res.status);
      reportIds.push((res.body as { report_id: string }).report_id ?? clientId);
    }
  });

  afterAll(async () => {
    await app?.close();
    await stopIntegrationInfra(infra);
  });

  beforeEach(() => {
    searchHits.length = 0;
    searchShouldFail = false;
  });

  const list = (query = ''): Promise<{ status: number; body: ListResponse }> =>
    request(app.getHttpServer())
      .get(`/api/v1/site/reports?project_id=${projectId}${query}`)
      .set('x-test-role', 'SITE_ENGINEER')
      .then((r) => ({ status: r.status, body: r.body as ListResponse }));

  const keysOf = (items: Array<Record<string, unknown>>): string[] =>
    Object.keys(items[0] ?? {}).sort();

  it('the control — the full response carries the whole report', async () => {
    const res = await list();
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThanOrEqual(3);
    expect(keysOf(res.body.items).length).toBeGreaterThan(6);
  });

  it('?minimal=true returns a strictly smaller projection', async () => {
    const full = await list();
    const minimal = await list('&minimal=true');

    expect(minimal.status).toBe(200);
    const fullKeys = keysOf(full.body.items);
    const minimalKeys = keysOf(minimal.body.items);

    expect(minimalKeys.length).toBeLessThan(fullKeys.length);
    // A projection, not a different resource: every field it keeps must exist on the full one.
    expect(fullKeys).toEqual(expect.arrayContaining(minimalKeys));
  });

  it('returns the same reports, not fewer', async () => {
    // "Smaller payload" must mean narrower rows, never dropped rows — a client paging a site's
    // history cannot be silently handed a shorter list because it asked for less per item.
    const full = await list();
    const minimal = await list('&minimal=true');

    expect(minimal.body.total).toBe(full.body.total);
    expect(minimal.body.items).toHaveLength(full.body.items.length);
  });

  it('the minimal report is still usable — it carries its own identifier', async () => {
    const minimal = await list('&minimal=true');
    for (const item of minimal.body.items) {
      expect(typeof item['report_id']).toBe('string');
      expect(item['report_id']).toBeTruthy();
    }
  });

  it('an explicit minimal=false is the full payload', async () => {
    const full = await list();
    const explicit = await list('&minimal=false');
    expect(keysOf(explicit.body.items)).toEqual(keysOf(full.body.items));
  });

  it('any value other than "true" is the full payload', async () => {
    // The controller compares against the literal 'true'; nothing else opts in.
    const full = await list();
    const odd = await list('&minimal=1');
    expect(keysOf(odd.body.items)).toEqual(keysOf(full.body.items));
  });

  describe('with a full-text query (the search path)', () => {
    it('still honours minimal when the index answers', async () => {
      searchHits.push({ _source: { report_id: reportIds[0] } });

      const full = await list('&q=summary');
      searchHits.push({ _source: { report_id: reportIds[0] } });
      const minimal = await list('&q=summary&minimal=true');

      expect(minimal.body.items.length).toBeGreaterThan(0);
      expect(keysOf(minimal.body.items).length).toBeLessThan(keysOf(full.body.items).length);
    });

    it('still honours minimal when the index is down and the DB answers instead', async () => {
      // The fallback is an internal detail. A client that asked for the reduced payload — because it
      // is on a metered link at a site with one bar of signal — must not be handed the full one
      // because a server-side dependency was unavailable.
      searchShouldFail = true;
      const minimal = await list('&q=summary&minimal=true');
      const full = await list('&minimal=false');

      expect(minimal.status).toBe(200);
      expect(minimal.body.items.length).toBeGreaterThan(0);
      expect(keysOf(minimal.body.items).length).toBeLessThan(keysOf(full.body.items).length);
    });
  });
});

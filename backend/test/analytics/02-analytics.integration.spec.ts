// Integration tests: Analytics API — the HTTP layer, Phase 14
//
// SCOPE, stated plainly, because three specs cover this phase and each owns a different half:
//
//   01-kafka-to-clickhouse-to-api   ingestion, end to end — real Kafka, real Go worker, real ClickHouse
//   03-clickhouse-query-layer       the SQL — real ClickHouse, real DDL, no HTTP
//   THIS FILE                       everything between the socket and the service
//
// So ClickHouse is mocked here on purpose: what is under test is the wiring the other two never
// touch — that the routes are mounted, that RolesGuard actually refuses a role the decorator does
// not list, that ABAC §6.5 narrows the projects a PROJECT_MANAGER may ask about, and that a
// ServiceUnavailableException leaves as an HTTP 503 rather than as a 500 or an empty array.
//
// WHAT THIS FILE USED TO ASSERT, and why it no longer does. Four of its six cases were
// `expect(Array.isArray(res.body)).toBe(true)`, which passes for an endpoint that returns [] every
// time, and one asserted a cache hit — all of which analytics.service.spec.ts covers directly and
// without two containers. Worse, it overrode JwtAuthGuard with a hand-rolled stub that set
// `req.user` but never CLS, and CLS is where the real guard puts the role (jwt-auth.guard.ts:50).
// AnalyticsProjectScopeService reads `clsUserRole()`, saw '', concluded the caller was not
// project-scoped and returned every requested id unfiltered — so the ABAC query never ran, in the
// only analytics spec that has a real Postgres to run it against. `clsAuthGuard` is the shared
// helper that does this correctly.

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
import { CLICKHOUSE_CLIENT } from '../../src/modules/analytics/analytics.module';
import { CACHE_MANAGER } from '@nestjs/cache-manager';

// ── Fixtures ─────────────────────────────────────────────────────────────────────────────────────

const TENANT = 'aaaaaaaa-0000-4000-8000-000000000001';
const PM_USER = 'aaaaaaaa-0000-4000-8000-000000000010';
// Real UUIDs, not 'user-1'. RolesGuard's additional-roles fallback casts user_id ::uuid, so a
// non-UUID turns a 403 into a 500 the moment a case exercises the denial path.
const MEMBER_PROJECT = 'bbbbbbbb-0000-4000-8000-000000000001';
const OTHER_PROJECT = 'bbbbbbbb-0000-4000-8000-000000000002';
const DATE_RANGE = '2026-01-01,2026-06-30';
const AUTH = 'Bearer test-token';

/** The role the next request presents. `x-test-role` picks it; the guard below reads the header. */
const ROLE_HEADER = 'x-test-role';

const EXECUTIVE_ROWS = [
  {
    projectId: MEMBER_PROJECT,
    totalCommitted: '100000',
    totalActual: '85000',
    totalBudget: '200000',
    utilizationPct: 42.5,
    atRisk: 0 as const,
    overdueInvoiceCount: 0,
  },
];

// ONE ClickHouse mock and ONE cache mock, shared by the single application below and reprogrammed
// per test. They are not rebuilt, because rebuilding the application is what hung this suite.
//
// WHY THIS SHAPE (2026-08-07). Six tests used to each build their own AppModule + Nest application
// purely to swap these two providers. Every one of them was closed, yet the process would not exit:
// on CI the run reached "Ran all test suites" at 162.9s and then sat for 70 more minutes until it
// was cancelled, with @nestjs/schedule crons firing into a torn-down environment the whole time.
// Measured locally: the whole file hangs 200s+ past the end of its tests, but running a single test
// with `-t` — one application instead of seven — exits in 22s, and every other integration spec
// (one application each) exits cleanly. `--detectOpenHandles` reports nothing, so whatever each
// extra application leaks is invisible to Jest; the fix is to stop creating them.
//
// close() is invoked by AnalyticsModule.onModuleDestroy on app shutdown (ADR-034 graceful
// shutdown); the mock must provide it or teardown throws "close is not a function".
const chMock = {
  query: jest.fn(),
  close: jest.fn().mockResolvedValue(undefined),
};

const cacheMock = {
  get: jest.fn(),
  set: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(undefined),
};

/** Program the shared ClickHouse mock to return `rows` for the next query. */
function chReturns(rows: unknown[]): void {
  chMock.query.mockResolvedValue({ json: jest.fn().mockResolvedValue(rows) });
}

/** The `projectIds` the service actually asked ClickHouse for — what ABAC left of the request. */
function queriedProjectIds(): string[] {
  const [args] = chMock.query.mock.calls[0] as [{ query_params: { projectIds: string[] } }];
  return args.query_params.projectIds;
}

// ── Suite ────────────────────────────────────────────────────────────────────────────────────────

describe('Analytics API Integration (Phase 14)', () => {
  let infra: IntegrationInfra;
  let app: INestApplication;

  beforeAll(async () => {
    // AppModule's ThrottlerModule needs REDIS_URL + a reachable Redis at init.
    infra = await startIntegrationInfra();

    // Real rows, because the assertions below are about a real query. PM_USER is a member of
    // MEMBER_PROJECT and not of OTHER_PROJECT — that difference is the whole of the ABAC case.
    await infra.prisma.$executeRaw`
      INSERT INTO platform.tenants (tenant_id, tenant_code, tenant_name, keycloak_realm, plan_type, is_active)
      VALUES (${TENANT}::uuid, 'analytics-int', 'Analytics Integration Tenant', 'analytics-realm',
              'STARTER'::platform."PlanType", true)
    `;
    await infra.prisma.$executeRaw`
      INSERT INTO platform.users (user_id, tenant_id, keycloak_user_id, email, display_name)
      VALUES (${PM_USER}::uuid, ${TENANT}::uuid, 'kc-analytics-pm', 'pm@analytics-int.test', 'PM User')
    `;
    for (const [id, code] of [
      [MEMBER_PROJECT, 'AN-MEMBER'],
      [OTHER_PROJECT, 'AN-OTHER'],
    ] as const) {
      await infra.prisma.$executeRaw`
        INSERT INTO projects.projects (project_id, tenant_id, project_code, project_name, project_type,
                                       status, created_by)
        VALUES (${id}::uuid, ${TENANT}::uuid, ${code}, ${code}, 'RESIDENTIAL'::"ProjectType",
                'ACTIVE'::"ProjectStatus", ${PM_USER}::uuid)
      `;
    }
    await infra.prisma.$executeRaw`
      INSERT INTO projects.project_members (project_id, tenant_id, user_id, role, assigned_by)
      VALUES (${MEMBER_PROJECT}::uuid, ${TENANT}::uuid, ${PM_USER}::uuid,
              'PROJECT_MANAGER'::"ProjectMemberRole", ${PM_USER}::uuid)
    `;

    // The ONLY application in this file. Tests reprogram chMock / cacheMock instead of rebuilding
    // it — see the note above the mocks for what rebuilding cost.
    //
    // clsAuthGuard, not a hand-rolled stub: it publishes the identity into CLS the way the real
    // guard does, which is what AnalyticsProjectScopeService reads. The role comes from a header so
    // one application can serve both the permitted and the refused case.
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(
        clsAuthGuard((req) => ({
          tenant_id: TENANT,
          user_id: PM_USER,
          role: (req['headers'] as Record<string, string>)[ROLE_HEADER] ?? 'PROJECT_MANAGER',
          tenantCode: 'analytics-int',
        })),
      )
      .overrideProvider(CLICKHOUSE_CLIENT)
      .useValue(chMock)
      .overrideProvider(CACHE_MANAGER)
      .useValue(cacheMock)
      .compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await stopIntegrationInfra(infra);
  });

  beforeEach(() => {
    // clearAllMocks wipes call history but keeps implementations, so the defaults are re-applied
    // explicitly: cache misses, ClickHouse returns nothing. Each test overrides what it needs.
    jest.clearAllMocks();
    cacheMock.get.mockResolvedValue(null);
    chReturns([]);
  });

  /**
   * A raw query string, not supertest's object form.
   *
   * `@nestjs/platform-express@11` ships Express 5, whose default query parser is `simple` — Node's
   * `querystring`, which does not read bracket notation at all. `projectIds[]=A` arrives under the
   * literal key `projectIds[]`, so `@Query('projectIds')` sees nothing and the handler proceeds with
   * an empty list. supertest's `.query({ … })` cannot express the repeated-key form either: it
   * serialises through `qs`, which brackets every array it is given.
   *
   * This is what the old version of this file sent, and why its executive case could pass while the
   * endpoint received no projects at all — `expect(Array.isArray(res.body))` is true of the empty
   * answer that produces.
   */
  const executive = (projectIds: string[], role?: string) => {
    const req = request(app.getHttpServer())
      .get('/api/v1/analytics/executive')
      .set('Authorization', AUTH);
    if (role) req.set(ROLE_HEADER, role);
    const qs = [
      ...projectIds.map((id) => `projectIds=${encodeURIComponent(id)}`),
      `dateRange=${encodeURIComponent(DATE_RANGE)}`,
    ].join('&');
    return req.query(qs);
  };

  // ── RBAC — §5.4.1, the decorator on the route ──────────────────────────────────────────────────

  describe('who may open the executive dashboard', () => {
    it('refuses a role the route does not list', async () => {
      // @Roles(EXECUTIVE, PROJECT_MANAGER, FINANCE, TENANT_ADMIN). SITE_WORKER holds none of them
      // and no additional roles either, so RolesGuard's union lookup finds nothing.
      await executive([MEMBER_PROJECT], 'SITE_WORKER').expect(403);
      expect(chMock.query).not.toHaveBeenCalled();
    });

    it('admits a role it does list', async () => {
      chReturns(EXECUTIVE_ROWS);
      await executive([MEMBER_PROJECT], 'FINANCE').expect(200);
    });
  });

  // ── ABAC — §6.5, which projects the caller may see INSIDE the dashboard ────────────────────────

  describe('which projects a PROJECT_MANAGER sees', () => {
    it('drops a project the caller is not assigned to', async () => {
      // The FILTER is already covered by analytics-project-scope.service.spec.ts, which stubs the
      // database and even asserts the SQL text. What it cannot cover is the SQL RUNNING: that
      // projects.project_members has these columns, that `= ANY(…::uuid[])` accepts the ids, that
      // the tenant GUC predicate matches what TenantPrismaService sets, and that RLS lets the row
      // through. This spec is the only analytics test with a real Postgres, so it is the only place
      // any of that is executed.
      //
      // Asserted on what reached ClickHouse, because a filtered id is invisible in a response whose
      // rows the mock supplies.
      chReturns(EXECUTIVE_ROWS);
      await executive([MEMBER_PROJECT, OTHER_PROJECT], 'PROJECT_MANAGER').expect(200);

      expect(queriedProjectIds()).toEqual([MEMBER_PROJECT]);
    });

    it('leaves a tenant-wide role unfiltered', async () => {
      // §6.5 scopes PROJECT_MANAGER only. An EXECUTIVE's grant is tenant-wide, so both ids stand —
      // the control that keeps the case above from passing because the filter drops everything.
      // The rule itself is unit-tested; what this adds is that the controller reaches the scope
      // service at all, which a spec with a mocked scope cannot show.
      chReturns(EXECUTIVE_ROWS);
      await executive([MEMBER_PROJECT, OTHER_PROJECT], 'EXECUTIVE').expect(200);

      expect(queriedProjectIds().sort()).toEqual([MEMBER_PROJECT, OTHER_PROJECT].sort());
    });
  });

  // ── Failure — the one thing only an HTTP test can see ─────────────────────────────────────────

  describe('when ClickHouse is unavailable', () => {
    it('answers 503 rather than 500 or an empty dashboard', async () => {
      // analytics.service.spec.ts proves the service throws ServiceUnavailableException. That it
      // leaves the process as a 503 is a property of the filter chain, and this is the only test
      // in the repository that looks at the status code on the wire.
      chMock.query.mockRejectedValue(new Error('connection refused'));

      await executive([MEMBER_PROJECT], 'EXECUTIVE').expect(503);
    });
  });
});

// Integration tests: Analytics API — Phase 14
// Verifies HTTP contract for all 5 analytics endpoints.
// ClickHouse and Redis are mocked via module overrides (real containers in Phase 18 stack).

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import {
  startIntegrationInfra,
  stopIntegrationInfra,
  type IntegrationInfra,
} from './helpers/integration-infra';
import { AppModule } from '../src/app.module';
import { JwtAuthGuard } from '../src/modules/identity/guards/jwt-auth.guard';
import { CLICKHOUSE_CLIENT } from '../src/modules/analytics/analytics.module';
import { CACHE_MANAGER } from '@nestjs/cache-manager';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT = 'aaaaaaaa-0000-0000-0000-000000000001';
const PROJECT = 'bbbbbbbb-0000-0000-0000-000000000002';
const DATE_RANGE = '2026-01-01,2026-06-30';
const AUTH = 'Bearer test-token';

const COST_ROWS = [{ eventDate: '2026-01-01', committed: '100000', actual: '85000' }];
const PROCUREMENT_ROWS = [
  { eventDate: '2026-01-01', poCount: 3, rfqCount: 1, invoiceCount: 2, overdueInvoiceCount: 0 },
];
const SITE_ROWS = [
  {
    eventDate: '2026-01-01',
    reportCount: 4,
    issueOpenCount: 1,
    inspectionFailCount: 0,
    manpowerTotal: 50,
  },
];
const EXECUTIVE_ROWS = [
  {
    projectId: PROJECT,
    totalCommitted: '100000',
    totalActual: '85000',
    totalBudget: '200000',
    utilizationPct: 42.5,
    atRisk: false,
    overdueInvoiceCount: 0,
  },
];
const PM_ROWS = [
  {
    eventDate: '2026-01-01',
    manpowerTotal: 50,
    issueOpenCount: 1,
    inspectionFailCount: 0,
    reportCount: 4,
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

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

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('Analytics API Integration (Phase 14)', () => {
  let infra: IntegrationInfra;
  let app: INestApplication;

  beforeAll(async () => {
    // AppModule's ThrottlerModule needs REDIS_URL + a reachable Redis at init.
    infra = await startIntegrationInfra();

    // The ONLY application in this file. Tests reprogram chMock / cacheMock instead of rebuilding
    // it — see the note above the mocks for what rebuilding cost.
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: unknown) => {
          const req = (ctx as { switchToHttp: () => { getRequest: () => Record<string, unknown> } })
            .switchToHttp()
            .getRequest();
          req.tenantId = TENANT;
          req.tenantCode = 'test_tenant';
          // Must be the JwtPayload shape: RolesGuard reads `user.role` and throws
          // ForbiddenException('Missing role claim in JWT') when it is absent. This mock used to set
          // `cos_role` / `cos_user_id`, which exist on no payload in this codebase, so every request
          // through an @Roles()-guarded route came back 403 — the /analytics/executive tests failed
          // for that reason alone, not for anything they assert. Every other integration spec
          // already uses { tenant_id, user_id, role }.
          req.user = { tenant_id: TENANT, user_id: 'user-1', role: 'PROJECT_MANAGER' };
          return true;
        },
      })
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

  // ── Executive dashboard ───────────────────────────────────────────────────

  describe('GET /api/v1/analytics/executive', () => {
    it('returns 200 with project rows when ClickHouse responds', async () => {
      chReturns(EXECUTIVE_ROWS);
      const res = await request(app.getHttpServer())
        .get('/api/v1/analytics/executive')
        .set('Authorization', AUTH)
        .query({ tenantId: TENANT, 'projectIds[]': PROJECT, dateRange: DATE_RANGE })
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });

    it('returns 503 when ClickHouse is unavailable', async () => {
      chMock.query.mockRejectedValue(new Error('connection refused'));

      await request(app.getHttpServer())
        .get('/api/v1/analytics/executive')
        .set('Authorization', AUTH)
        .query({ tenantId: TENANT, 'projectIds[]': PROJECT, dateRange: DATE_RANGE })
        .expect(503);
    });
  });

  // ── PM dashboard ─────────────────────────────────────────────────────────

  describe('GET /api/v1/analytics/pm/:projectId', () => {
    it('returns 200 with site activity rows', async () => {
      chReturns(PM_ROWS);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/analytics/pm/${PROJECT}`)
        .set('Authorization', AUTH)
        .query({ tenantId: TENANT, dateRange: DATE_RANGE })
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  // ── Trend endpoints ──────────────────────────────────────────────────────

  describe('GET /api/v1/analytics/projects/:projectId/cost-trend', () => {
    it('returns 200 with cost trend rows', async () => {
      chReturns(COST_ROWS);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/analytics/projects/${PROJECT}/cost-trend`)
        .set('Authorization', AUTH)
        .query({ tenantId: TENANT, dateRange: DATE_RANGE })
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('GET /api/v1/analytics/projects/:projectId/procurement-trend', () => {
    it('returns 200 with procurement trend rows', async () => {
      chReturns(PROCUREMENT_ROWS);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/analytics/projects/${PROJECT}/procurement-trend`)
        .set('Authorization', AUTH)
        .query({ tenantId: TENANT, dateRange: DATE_RANGE })
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('GET /api/v1/analytics/projects/:projectId/site-trend', () => {
    it('returns 200 with site trend rows', async () => {
      chReturns(SITE_ROWS);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/analytics/projects/${PROJECT}/site-trend`)
        .set('Authorization', AUTH)
        .query({ tenantId: TENANT, dateRange: DATE_RANGE })
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  // ── Cache-hit path: no ClickHouse call ───────────────────────────────────

  describe('Cache hit — ClickHouse is not called', () => {
    it('returns cached data without hitting ClickHouse for cost-trend', async () => {
      const cachedRows = [{ eventDate: '2026-01-01', committed: '999', actual: '888' }];
      cacheMock.get.mockResolvedValue(cachedRows);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/analytics/projects/${PROJECT}/cost-trend`)
        .set('Authorization', AUTH)
        .query({ tenantId: TENANT, dateRange: DATE_RANGE })
        .expect(200);

      expect(res.body).toEqual(cachedRows);
      // beforeEach cleared the call history, so this asserts the cache short-circuit for THIS
      // request — the same guarantee the throwaway application used to provide.
      expect(chMock.query).not.toHaveBeenCalled();
    });
  });
});

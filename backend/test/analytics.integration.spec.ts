// Integration tests: Analytics API — Phase 14
// Verifies HTTP contract for all 5 analytics endpoints.
// ClickHouse and Redis are mocked via module overrides (real containers in Phase 18 stack).

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
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

function makeChClient(rows: unknown[]) {
  const resultSet = { json: jest.fn().mockResolvedValue(rows) };
  return { query: jest.fn().mockResolvedValue(resultSet) };
}

const noopCache = {
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(undefined),
};

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('Analytics API Integration (Phase 14)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    // Each test overrides ClickHouse with appropriate row fixtures below;
    // this beforeAll sets up shared infrastructure.
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
          req.user = { cos_user_id: 'user-1', cos_role: 'PROJECT_MANAGER' };
          return true;
        },
      })
      .overrideProvider(CLICKHOUSE_CLIENT)
      .useValue(makeChClient(EXECUTIVE_ROWS))
      .overrideProvider(CACHE_MANAGER)
      .useValue(noopCache)
      .compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Executive dashboard ───────────────────────────────────────────────────

  describe('GET /api/v1/analytics/executive', () => {
    it('returns 200 with project rows when ClickHouse responds', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/analytics/executive')
        .set('Authorization', AUTH)
        .query({ tenantId: TENANT, 'projectIds[]': PROJECT, dateRange: DATE_RANGE })
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });

    it('returns 503 when ClickHouse is unavailable', async () => {
      // override ClickHouse to throw
      const failingCh = { query: jest.fn().mockRejectedValue(new Error('connection refused')) };
      const mod: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
        .overrideGuard(JwtAuthGuard)
        .useValue({ canActivate: () => true })
        .overrideProvider(CLICKHOUSE_CLIENT)
        .useValue(failingCh)
        .overrideProvider(CACHE_MANAGER)
        .useValue(noopCache)
        .compile();

      const failApp = mod.createNestApplication();
      failApp.setGlobalPrefix('api/v1');
      await failApp.init();

      await request(failApp.getHttpServer())
        .get('/api/v1/analytics/executive')
        .set('Authorization', AUTH)
        .query({ tenantId: TENANT, 'projectIds[]': PROJECT, dateRange: DATE_RANGE })
        .expect(503);

      await failApp.close();
    });
  });

  // ── PM dashboard ─────────────────────────────────────────────────────────

  describe('GET /api/v1/analytics/pm/:projectId', () => {
    it('returns 200 with site activity rows', async () => {
      const pmCh = makeChClient(PM_ROWS);
      const mod: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
        .overrideGuard(JwtAuthGuard)
        .useValue({ canActivate: () => true })
        .overrideProvider(CLICKHOUSE_CLIENT)
        .useValue(pmCh)
        .overrideProvider(CACHE_MANAGER)
        .useValue(noopCache)
        .compile();

      const pmApp = mod.createNestApplication();
      pmApp.setGlobalPrefix('api/v1');
      await pmApp.init();

      const res = await request(pmApp.getHttpServer())
        .get(`/api/v1/analytics/pm/${PROJECT}`)
        .set('Authorization', AUTH)
        .query({ tenantId: TENANT, dateRange: DATE_RANGE })
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      await pmApp.close();
    });
  });

  // ── Trend endpoints ──────────────────────────────────────────────────────

  describe('GET /api/v1/analytics/projects/:projectId/cost-trend', () => {
    it('returns 200 with cost trend rows', async () => {
      const trendCh = makeChClient(COST_ROWS);
      const mod: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
        .overrideGuard(JwtAuthGuard)
        .useValue({ canActivate: () => true })
        .overrideProvider(CLICKHOUSE_CLIENT)
        .useValue(trendCh)
        .overrideProvider(CACHE_MANAGER)
        .useValue(noopCache)
        .compile();

      const trendApp = mod.createNestApplication();
      trendApp.setGlobalPrefix('api/v1');
      await trendApp.init();

      const res = await request(trendApp.getHttpServer())
        .get(`/api/v1/analytics/projects/${PROJECT}/cost-trend`)
        .set('Authorization', AUTH)
        .query({ tenantId: TENANT, dateRange: DATE_RANGE })
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      await trendApp.close();
    });
  });

  describe('GET /api/v1/analytics/projects/:projectId/procurement-trend', () => {
    it('returns 200 with procurement trend rows', async () => {
      const trendCh = makeChClient(PROCUREMENT_ROWS);
      const mod: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
        .overrideGuard(JwtAuthGuard)
        .useValue({ canActivate: () => true })
        .overrideProvider(CLICKHOUSE_CLIENT)
        .useValue(trendCh)
        .overrideProvider(CACHE_MANAGER)
        .useValue(noopCache)
        .compile();

      const trendApp = mod.createNestApplication();
      trendApp.setGlobalPrefix('api/v1');
      await trendApp.init();

      const res = await request(trendApp.getHttpServer())
        .get(`/api/v1/analytics/projects/${PROJECT}/procurement-trend`)
        .set('Authorization', AUTH)
        .query({ tenantId: TENANT, dateRange: DATE_RANGE })
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      await trendApp.close();
    });
  });

  describe('GET /api/v1/analytics/projects/:projectId/site-trend', () => {
    it('returns 200 with site trend rows', async () => {
      const trendCh = makeChClient(SITE_ROWS);
      const mod: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
        .overrideGuard(JwtAuthGuard)
        .useValue({ canActivate: () => true })
        .overrideProvider(CLICKHOUSE_CLIENT)
        .useValue(trendCh)
        .overrideProvider(CACHE_MANAGER)
        .useValue(noopCache)
        .compile();

      const trendApp = mod.createNestApplication();
      trendApp.setGlobalPrefix('api/v1');
      await trendApp.init();

      const res = await request(trendApp.getHttpServer())
        .get(`/api/v1/analytics/projects/${PROJECT}/site-trend`)
        .set('Authorization', AUTH)
        .query({ tenantId: TENANT, dateRange: DATE_RANGE })
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      await trendApp.close();
    });
  });

  // ── Cache-hit path: no ClickHouse call ───────────────────────────────────

  describe('Cache hit — ClickHouse is not called', () => {
    it('returns cached data without hitting ClickHouse for cost-trend', async () => {
      const cachedRows = [{ eventDate: '2026-01-01', committed: '999', actual: '888' }];
      const hittingCache = {
        get: jest.fn().mockResolvedValue(cachedRows),
        set: jest.fn().mockResolvedValue(undefined),
        del: jest.fn().mockResolvedValue(undefined),
      };
      const chSpy = makeChClient([]);
      const mod: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
        .overrideGuard(JwtAuthGuard)
        .useValue({ canActivate: () => true })
        .overrideProvider(CLICKHOUSE_CLIENT)
        .useValue(chSpy)
        .overrideProvider(CACHE_MANAGER)
        .useValue(hittingCache)
        .compile();

      const cachedApp = mod.createNestApplication();
      cachedApp.setGlobalPrefix('api/v1');
      await cachedApp.init();

      const res = await request(cachedApp.getHttpServer())
        .get(`/api/v1/analytics/projects/${PROJECT}/cost-trend`)
        .set('Authorization', AUTH)
        .query({ tenantId: TENANT, dateRange: DATE_RANGE })
        .expect(200);

      expect(res.body).toEqual(cachedRows);
      expect(chSpy.query).not.toHaveBeenCalled();
      await cachedApp.close();
    });
  });
});

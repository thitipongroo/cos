import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { AnalyticsService } from '../analytics.service';
import { CLICKHOUSE_CLIENT } from '../analytics.module';

// ── Mock factories ──────────────────────────────────────────────────────────

function makeCacheManager(cachedValue: unknown = null) {
  return {
    get: jest.fn().mockResolvedValue(cachedValue),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
  };
}

function makeClickHouseClient(rows: unknown[] = []) {
  const resultSet = { json: jest.fn().mockResolvedValue(rows) };
  return { query: jest.fn().mockResolvedValue(resultSet) };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function buildService(chClient: object, cacheManager: object) {
  const mod: TestingModule = await Test.createTestingModule({
    providers: [
      AnalyticsService,
      { provide: CLICKHOUSE_CLIENT, useValue: chClient },
      { provide: CACHE_MANAGER, useValue: cacheManager },
    ],
  }).compile();
  return mod.get(AnalyticsService);
}

// ── Cache key logic ──────────────────────────────────────────────────────────
describe('AnalyticsService — cache key & hit behaviour', () => {
  const TENANT = 'tenant-a';
  const PROJECT = 'proj-1';
  const DATE_RANGE = '2026-01-01,2026-06-30';

  it('returns cached value without querying ClickHouse when cache hits', async () => {
    const cached = [{ eventDate: '2026-01-01', committed: '100', actual: '80' }];
    const cache = makeCacheManager(cached);
    const ch = makeClickHouseClient();
    const svc = await buildService(ch, cache);

    const result = await svc.getCostTrend(TENANT, PROJECT, DATE_RANGE);

    expect(result).toBe(cached);
    expect(ch.query).not.toHaveBeenCalled();
  });

  it('queries ClickHouse on cache miss and stores result', async () => {
    const rows = [{ eventDate: '2026-01-01', committed: '500', actual: '450' }];
    const cache = makeCacheManager(null);
    const ch = makeClickHouseClient(rows);
    const svc = await buildService(ch, cache);

    const result = await svc.getCostTrend(TENANT, PROJECT, DATE_RANGE);

    expect(ch.query).toHaveBeenCalledTimes(1);
    expect(cache.set).toHaveBeenCalledTimes(1);
    expect(result).toEqual(rows);
  });

  it('falls back to ClickHouse when the cache store is unavailable (get rejects)', async () => {
    const rows = [{ eventDate: '2026-01-01', committed: '500', actual: '450' }];
    const cache = makeCacheManager(null);
    cache.get.mockRejectedValue(new Error('redis down'));
    const ch = makeClickHouseClient(rows);
    const svc = await buildService(ch, cache);

    const result = await svc.getCostTrend(TENANT, PROJECT, DATE_RANGE);

    expect(result).toEqual(rows);
    expect(ch.query).toHaveBeenCalledTimes(1);
  });

  it('cache key includes all discriminating fields for cost-trend', async () => {
    const cache = makeCacheManager(null);
    const ch = makeClickHouseClient([]);
    const svc = await buildService(ch, cache);

    await svc.getCostTrend(TENANT, PROJECT, DATE_RANGE);

    const setCall = cache.set.mock.calls[0];
    const key: string = setCall[0];
    expect(key).toMatch(new RegExp(`analytics:${TENANT}:cost-trend:${PROJECT}:${DATE_RANGE}`));
  });

  it('different dashboard types produce different cache keys', async () => {
    const cache = makeCacheManager(null);
    const ch = makeClickHouseClient([]);
    const svc = await buildService(ch, cache);

    await svc.getCostTrend(TENANT, PROJECT, DATE_RANGE);
    await svc.getProcurementTrend(TENANT, PROJECT, DATE_RANGE);

    const keys = cache.set.mock.calls.map(([k]: [string]) => k) as string[];
    expect(keys[0]).toContain(':cost-trend:');
    expect(keys[1]).toContain(':procurement-trend:');
    expect(keys[0]).not.toBe(keys[1]);
  });
});

// ── Error handling ───────────────────────────────────────────────────────────
describe('AnalyticsService — ClickHouse error handling', () => {
  const TENANT = 'tenant-err';
  const PROJECT = 'proj-err';
  const DATE_RANGE = '2026-01-01,2026-03-31';

  it('throws ServiceUnavailableException when ClickHouse query rejects', async () => {
    const cache = makeCacheManager(null);
    const ch = { query: jest.fn().mockRejectedValue(new Error('connection refused')) };
    const svc = await buildService(ch, cache);

    await expect(svc.getCostTrend(TENANT, PROJECT, DATE_RANGE)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('throws ServiceUnavailableException for getProcurementTrend ClickHouse failure', async () => {
    const cache = makeCacheManager(null);
    const ch = { query: jest.fn().mockRejectedValue(new Error('timeout')) };
    const svc = await buildService(ch, cache);

    await expect(svc.getProcurementTrend(TENANT, PROJECT, DATE_RANGE)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('throws ServiceUnavailableException for getSiteTrend ClickHouse failure', async () => {
    const cache = makeCacheManager(null);
    const ch = { query: jest.fn().mockRejectedValue(new Error('timeout')) };
    const svc = await buildService(ch, cache);

    await expect(svc.getSiteTrend(TENANT, PROJECT, DATE_RANGE)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});

// ── Date range parsing ───────────────────────────────────────────────────────
describe('AnalyticsService — dateRange query param binding', () => {
  it('passes parsed startDate and endDate as separate query params', async () => {
    const cache = makeCacheManager(null);
    const ch = makeClickHouseClient([]);
    const svc = await buildService(ch, cache);

    await svc.getCostTrend('t1', 'p1', '2026-01-15,2026-03-31');

    const callArgs = ch.query.mock.calls[0][0];
    expect(callArgs.query_params.startDate).toBe('2026-01-15');
    expect(callArgs.query_params.endDate).toBe('2026-03-31');
  });
});

// ── Cache invalidation ───────────────────────────────────────────────────────
describe('AnalyticsService — invalidate()', () => {
  it('calls cache.del for every dashboard type', async () => {
    const cache = makeCacheManager(null);
    const ch = makeClickHouseClient([]);
    const svc = await buildService(ch, cache);

    await svc.invalidate('t1', 'p1');

    const deletedKeys: string[] = cache.del.mock.calls.map(([k]: [string]) => k);
    expect(deletedKeys.some((k) => k.includes(':cost-trend:'))).toBe(true);
    expect(deletedKeys.some((k) => k.includes(':procurement-trend:'))).toBe(true);
    expect(deletedKeys.some((k) => k.includes(':site-trend:'))).toBe(true);
    expect(deletedKeys.some((k) => k.includes(':executive:'))).toBe(true);
    expect(deletedKeys.some((k) => k.includes(':pm:'))).toBe(true);
  });
});

// ── PM Dashboard ─────────────────────────────────────────────────────────────
describe('AnalyticsService — getPmDashboard', () => {
  const TENANT = 'tenant-pm';
  const PROJECT = 'proj-pm';
  const DATE_RANGE = '2026-01-01,2026-06-30';

  it('returns cached value without querying ClickHouse when cache hits', async () => {
    const cached = [{ eventDate: '2026-01-01', manpowerTotal: 10 }];
    const cache = makeCacheManager(cached);
    const ch = makeClickHouseClient();
    const svc = await buildService(ch, cache);

    const result = await svc.getPmDashboard(TENANT, PROJECT, DATE_RANGE);
    expect(result).toBe(cached);
    expect(ch.query).not.toHaveBeenCalled();
  });

  it('queries ClickHouse on cache miss and stores result', async () => {
    const rows = [{ eventDate: '2026-01-01', manpowerTotal: 20 }];
    const cache = makeCacheManager(null);
    const ch = makeClickHouseClient(rows);
    const svc = await buildService(ch, cache);

    const result = await svc.getPmDashboard(TENANT, PROJECT, DATE_RANGE);
    expect(result).toEqual(rows);
    expect(ch.query).toHaveBeenCalledTimes(1);
    expect(cache.set).toHaveBeenCalledTimes(1);
  });

  it('throws ServiceUnavailableException when ClickHouse fails', async () => {
    const cache = makeCacheManager(null);
    const ch = { query: jest.fn().mockRejectedValue(new Error('timeout')) };
    const svc = await buildService(ch, cache);

    await expect(svc.getPmDashboard(TENANT, PROJECT, DATE_RANGE)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});

// ── Executive dashboard — error handling ─────────────────────────────────────
describe('AnalyticsService — getExecutiveDashboard error handling', () => {
  it('throws ServiceUnavailableException when ClickHouse fails', async () => {
    const cache = makeCacheManager(null);
    const ch = { query: jest.fn().mockRejectedValue(new Error('connection refused')) };
    const svc = await buildService(ch, cache);

    await expect(
      svc.getExecutiveDashboard('t1', ['p1'], '2026-01-01,2026-06-30', 10),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

// ── getSiteTrend success path ─────────────────────────────────────────────────
describe('AnalyticsService — getSiteTrend success path', () => {
  it('queries ClickHouse and caches result on cache miss', async () => {
    const rows = [{ eventDate: '2026-01-01', manpowerTotal: 5 }];
    const cache = makeCacheManager(null);
    const ch = makeClickHouseClient(rows);
    const svc = await buildService(ch, cache);

    const result = await svc.getSiteTrend('t1', 'p1', '2026-01-01,2026-03-31');
    expect(result).toEqual(rows);
    expect(cache.set).toHaveBeenCalledTimes(1);
  });
});

// ── Executive dashboard — cache hit ──────────────────────────────────────────
describe('AnalyticsService — getExecutiveDashboard cache hit', () => {
  it('returns cached value without querying ClickHouse', async () => {
    const cached = [{ projectId: 'p1', atRisk: false }];
    const cache = makeCacheManager(cached);
    const ch = makeClickHouseClient();
    const svc = await buildService(ch, cache);

    const result = await svc.getExecutiveDashboard('t1', ['p1'], '2026-01-01,2026-06-30', 10);
    expect(result).toBe(cached);
    expect(ch.query).not.toHaveBeenCalled();
  });
});

// ── getProcurementTrend cache hit ─────────────────────────────────────────────
describe('AnalyticsService — getProcurementTrend cache hit', () => {
  it('returns cached value without querying ClickHouse', async () => {
    const cached = [{ eventDate: '2026-01-01', poCount: 3 }];
    const cache = makeCacheManager(cached);
    const ch = makeClickHouseClient();
    const svc = await buildService(ch, cache);

    const result = await svc.getProcurementTrend('t1', 'p1', '2026-01-01,2026-06-30');
    expect(result).toBe(cached);
    expect(ch.query).not.toHaveBeenCalled();
  });
});

// ── getSiteTrend cache hit ────────────────────────────────────────────────────
describe('AnalyticsService — getSiteTrend cache hit', () => {
  it('returns cached value without querying ClickHouse', async () => {
    const cached = [{ eventDate: '2026-01-01', reportCount: 2 }];
    const cache = makeCacheManager(cached);
    const ch = makeClickHouseClient();
    const svc = await buildService(ch, cache);

    const result = await svc.getSiteTrend('t1', 'p1', '2026-01-01,2026-06-30');
    expect(result).toBe(cached);
    expect(ch.query).not.toHaveBeenCalled();
  });
});

// ── parseDateRange error path ─────────────────────────────────────────────────
describe('AnalyticsService — parseDateRange invalid input', () => {
  it('throws when dateRange has no comma separator', async () => {
    const cache = makeCacheManager(null);
    const ch = makeClickHouseClient([]);
    const svc = await buildService(ch, cache);

    await expect(svc.getCostTrend('t1', 'p1', '2026-01-01')).rejects.toThrow('Invalid dateRange');
  });
});

// ── Executive dashboard — riskThresholdPct param ─────────────────────────────
describe('AnalyticsService — getExecutiveDashboard riskThreshold', () => {
  it('passes riskThreshold to ClickHouse query params', async () => {
    const cache = makeCacheManager(null);
    const ch = makeClickHouseClient([]);
    const svc = await buildService(ch, cache);

    await svc.getExecutiveDashboard('t1', ['p1'], '2026-01-01,2026-06-30', 15);

    const callArgs = ch.query.mock.calls[0][0];
    expect(callArgs.query_params.riskThreshold).toBe(15);
  });

  it('defaults riskThreshold to 10 when not supplied', async () => {
    const cache = makeCacheManager(null);
    const ch = makeClickHouseClient([]);
    const svc = await buildService(ch, cache);

    await svc.getExecutiveDashboard('t1', ['p1'], '2026-01-01,2026-06-30');

    const callArgs = ch.query.mock.calls[0][0];
    expect(callArgs.query_params.riskThreshold).toBe(10);
  });
});

// ── Cache store outage — best-effort degradation ─────────────────────────────
// cacheGet() must swallow a throwing cache store and degrade to a direct ClickHouse
// query rather than fail the request (analytics.service.ts:71 — the catch → return undefined).
describe('AnalyticsService — cache store outage degrades gracefully', () => {
  it('falls back to ClickHouse when cache.get throws', async () => {
    const rows = [{ eventDate: '2026-01-01', committed: '500', actual: '450' }];
    const cache = {
      get: jest.fn().mockRejectedValue(new Error('cache store unavailable')),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    };
    const ch = makeClickHouseClient(rows);
    const svc = await buildService(ch, cache);

    const result = await svc.getCostTrend('t1', 'p1', '2026-01-01,2026-06-30');

    expect(result).toEqual(rows);
    expect(cache.get).toHaveBeenCalledTimes(1);
    expect(ch.query).toHaveBeenCalledTimes(1);
  });
});

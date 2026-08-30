import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import type { ClickHouseClient } from '@clickhouse/client';
import type Redis from 'ioredis';
import { createLogger } from '@cos/logger';
import { CACHE_REDIS, CLICKHOUSE_CLIENT } from './analytics.tokens';

const logger = createLogger('analytics-service');

// Rows per SCAN round trip. SCAN is cursor-based and non-blocking, unlike KEYS, which would stall
// the shared Redis for every other caller while it walks the whole keyspace.
const SCAN_COUNT = 200;

// Cache key format from spec §Phase 14 Caching Strategy:
// analytics:{tenant_id}:{dashboard_type}:{project_id}:{date_range}
function cacheKey(
  tenantId: string,
  dashboardType: string,
  projectId: string,
  dateRange: string,
): string {
  return `analytics:${tenantId}:${dashboardType}:${projectId}:${dateRange}`;
}

export interface ExecutiveDashboardRow {
  projectId: string;
  totalCommitted: string;
  totalActual: string;
  totalBudget: string;
  utilizationPct: number;
  // §35.13 ESC-34: 0 | 1, not boolean. This comes from a ClickHouse `if(...)`, which returns
  // UInt8 — the value on the wire is 0 or 1 and never false or true. Declaring it `boolean` was
  // a lie the compiler could not catch, and it hid a rendering bug in the web portfolio table
  // (ESC-36). Every client interface below mirrors this type deliberately.
  atRisk: 0 | 1;
  overdueInvoiceCount: number;
}

export interface PmDashboardRow {
  eventDate: string;
  manpowerTotal: number;
  issueOpenCount: number;
  inspectionFailCount: number;
  reportCount: number;
}

export interface CostTrendRow {
  eventDate: string;
  committed: string;
  actual: string;
}

export interface ProcurementTrendRow {
  eventDate: string;
  poCount: number;
  rfqCount: number;
  invoiceCount: number;
  overdueInvoiceCount: number;
}

export interface SiteTrendRow {
  eventDate: string;
  reportCount: number;
  issueOpenCount: number;
  inspectionFailCount: number;
  manpowerTotal: number;
}

@Injectable()
export class AnalyticsService {
  constructor(
    @Inject(CLICKHOUSE_CLIENT) private readonly ch: ClickHouseClient,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    @Inject(CACHE_REDIS) private readonly redis: Redis,
  ) {}

  // Cache is best-effort: a cache-store outage must never fail an analytics request
  // (it degrades to a direct ClickHouse query). Guards against store-adapter errors.
  private async cacheGet<T>(key: string): Promise<T | undefined> {
    try {
      return (await this.cache.get<T>(key)) ?? undefined;
    } catch {
      return undefined;
    }
  }

  private async cacheSet(key: string, value: unknown): Promise<void> {
    try {
      await this.cache.set(key, value);
    } catch {
      /* cache unavailable — skip write, response is unaffected */
    }
  }

  // ── Executive Dashboard ────────────────────────────────────────────────────
  // GET /api/v1/analytics/executive?projectIds[]=...&dateRange=...
  // Data: project_cost_daily + procurement_activity_daily
  async getExecutiveDashboard(
    tenantId: string,
    projectIds: string[],
    dateRange: string,
    riskThresholdPct = 10,
  ): Promise<ExecutiveDashboardRow[]> {
    const key = cacheKey(tenantId, 'executive', projectIds.sort().join(','), dateRange);
    const cached = await this.cacheGet<ExecutiveDashboardRow[]>(key);
    if (cached) return cached;

    const [startDate, endDate] = this.parseDateRange(dateRange);

    try {
      const result = await this.ch.query({
        query: `
          WITH cost AS (
            SELECT
              project_id,
              sumMerge(committed_amount) AS committed,
              sumMerge(actual_amount)    AS actual,
              max(budget_amount)         AS budget
            FROM analytics.project_cost_daily FINAL
            WHERE tenant_id = {tenantId:UUID}
              AND project_id IN ({projectIds:Array(UUID)})
              AND event_date BETWEEN {startDate:Date} AND {endDate:Date}
            GROUP BY project_id
          ),
          overdue AS (
            SELECT
              project_id,
              countMerge(overdue_invoice_count) AS overdue_count
            FROM analytics.procurement_activity_daily FINAL
            WHERE tenant_id = {tenantId:UUID}
              AND project_id IN ({projectIds:Array(UUID)})
              AND event_date BETWEEN {startDate:Date} AND {endDate:Date}
            GROUP BY project_id
          )
          SELECT
            cost.project_id                            AS projectId,
            toString(cost.committed)                   AS totalCommitted,
            toString(cost.actual)                      AS totalActual,
            toString(cost.budget)                      AS totalBudget,
            if(cost.budget > 0,
               round(toFloat64(cost.actual) / toFloat64(cost.budget) * 100, 2),
               0)                                      AS utilizationPct,
            -- NO toBool. The column comes back as UInt8 1/0 and every consumer is written for
            -- that: ExecutiveDashboardRow above, apps/web/src/lib/api/types.ts and the two mobile
            -- screens all declare 0 | 1, and both render guards compare against 1. That is
            -- §35.13 ESC-34, where the product owner chose (b) fix the type over (a) coerce the
            -- value, on 2026-08-24. Wrapping this in toBool reverses the decision and breaks the
            -- guards silently: false === 1 is false, so the at-risk badge would never render
            -- again — which is ESC-36, the defect that fix was written to close.
            --
            -- (No backticks in this comment: it sits inside a template literal, so one would end
            -- the string and take the rest of the query with it.)
            if(cost.budget > 0,
               abs(toFloat64(cost.actual) - toFloat64(cost.budget))
               / toFloat64(cost.budget) * 100 > {riskThreshold:Float64},
               false)                                  AS atRisk,
            coalesce(overdue.overdue_count, 0)         AS overdueInvoiceCount
          FROM cost
          LEFT JOIN overdue ON cost.project_id = overdue.project_id
        `,
        query_params: {
          tenantId,
          projectIds,
          startDate,
          endDate,
          riskThreshold: riskThresholdPct,
        },
        format: 'JSONEachRow',
      });

      const rows = await result.json<ExecutiveDashboardRow>();
      await this.cacheSet(key, rows);
      return rows;
    } catch (_err) {
      throw new ServiceUnavailableException('Analytics query failed — ClickHouse unavailable');
    }
  }

  // ── PM Dashboard ──────────────────────────────────────────────────────────
  // GET /api/v1/analytics/pm/:projectId?dateRange=...
  // Data: site_activity_daily + procurement_activity_daily
  async getPmDashboard(
    tenantId: string,
    projectId: string,
    dateRange: string,
  ): Promise<PmDashboardRow[]> {
    const key = cacheKey(tenantId, 'pm', projectId, dateRange);
    const cached = await this.cacheGet<PmDashboardRow[]>(key);
    if (cached) return cached;

    const [startDate, endDate] = this.parseDateRange(dateRange);

    try {
      const result = await this.ch.query({
        query: `
          SELECT
            toString(s.event_date)                         AS eventDate,
            toUInt32(sumMerge(s.manpower_total))           AS manpowerTotal,
            toInt32(sumMerge(s.issue_open_count))          AS issueOpenCount,
            toUInt32(countMerge(s.inspection_fail_count))  AS inspectionFailCount,
            toUInt32(countMerge(s.report_count))           AS reportCount
          FROM analytics.site_activity_daily AS s FINAL
          WHERE s.tenant_id = {tenantId:UUID}
            AND s.project_id = {projectId:UUID}
            AND s.event_date BETWEEN {startDate:Date} AND {endDate:Date}
          GROUP BY s.event_date
          ORDER BY s.event_date ASC
        `,
        query_params: { tenantId, projectId, startDate, endDate },
        format: 'JSONEachRow',
      });

      const rows = await result.json<PmDashboardRow>();
      await this.cacheSet(key, rows);
      return rows;
    } catch (_err) {
      throw new ServiceUnavailableException('Analytics query failed — ClickHouse unavailable');
    }
  }

  // ── Cost Trend ────────────────────────────────────────────────────────────
  async getCostTrend(
    tenantId: string,
    projectId: string,
    dateRange: string,
  ): Promise<CostTrendRow[]> {
    const key = cacheKey(tenantId, 'cost-trend', projectId, dateRange);
    const cached = await this.cacheGet<CostTrendRow[]>(key);
    if (cached) return cached;

    const [startDate, endDate] = this.parseDateRange(dateRange);

    try {
      const result = await this.ch.query({
        query: `
          SELECT
            toString(event_date)              AS eventDate,
            toString(sumMerge(committed_amount)) AS committed,
            toString(sumMerge(actual_amount))    AS actual
          FROM analytics.project_cost_daily FINAL
          WHERE tenant_id = {tenantId:UUID}
            AND project_id = {projectId:UUID}
            AND event_date BETWEEN {startDate:Date} AND {endDate:Date}
          GROUP BY event_date
          ORDER BY event_date ASC
        `,
        query_params: { tenantId, projectId, startDate, endDate },
        format: 'JSONEachRow',
      });

      const rows = await result.json<CostTrendRow>();
      await this.cacheSet(key, rows);
      return rows;
    } catch (_err) {
      throw new ServiceUnavailableException('Analytics query failed — ClickHouse unavailable');
    }
  }

  // ── Procurement Trend ─────────────────────────────────────────────────────
  async getProcurementTrend(
    tenantId: string,
    projectId: string,
    dateRange: string,
  ): Promise<ProcurementTrendRow[]> {
    const key = cacheKey(tenantId, 'procurement-trend', projectId, dateRange);
    const cached = await this.cacheGet<ProcurementTrendRow[]>(key);
    if (cached) return cached;

    const [startDate, endDate] = this.parseDateRange(dateRange);

    try {
      const result = await this.ch.query({
        query: `
          SELECT
            toString(event_date)                              AS eventDate,
            toUInt32(countMerge(po_count))                    AS poCount,
            toUInt32(countMerge(rfq_count))                   AS rfqCount,
            toUInt32(countMerge(invoice_count))               AS invoiceCount,
            toUInt32(countMerge(overdue_invoice_count))       AS overdueInvoiceCount
          FROM analytics.procurement_activity_daily FINAL
          WHERE tenant_id = {tenantId:UUID}
            AND project_id = {projectId:UUID}
            AND event_date BETWEEN {startDate:Date} AND {endDate:Date}
          GROUP BY event_date
          ORDER BY event_date ASC
        `,
        query_params: { tenantId, projectId, startDate, endDate },
        format: 'JSONEachRow',
      });

      const rows = await result.json<ProcurementTrendRow>();
      await this.cacheSet(key, rows);
      return rows;
    } catch (_err) {
      throw new ServiceUnavailableException('Analytics query failed — ClickHouse unavailable');
    }
  }

  // ── Site Trend ────────────────────────────────────────────────────────────
  async getSiteTrend(
    tenantId: string,
    projectId: string,
    dateRange: string,
  ): Promise<SiteTrendRow[]> {
    const key = cacheKey(tenantId, 'site-trend', projectId, dateRange);
    const cached = await this.cacheGet<SiteTrendRow[]>(key);
    if (cached) return cached;

    const [startDate, endDate] = this.parseDateRange(dateRange);

    try {
      const result = await this.ch.query({
        query: `
          SELECT
            toString(event_date)                              AS eventDate,
            toUInt32(countMerge(report_count))                AS reportCount,
            toInt32(sumMerge(issue_open_count))               AS issueOpenCount,
            toUInt32(countMerge(inspection_fail_count))       AS inspectionFailCount,
            toUInt32(sumMerge(manpower_total))                AS manpowerTotal
          FROM analytics.site_activity_daily FINAL
          WHERE tenant_id = {tenantId:UUID}
            AND project_id = {projectId:UUID}
            AND event_date BETWEEN {startDate:Date} AND {endDate:Date}
          GROUP BY event_date
          ORDER BY event_date ASC
        `,
        query_params: { tenantId, projectId, startDate, endDate },
        format: 'JSONEachRow',
      });

      const rows = await result.json<SiteTrendRow>();
      await this.cacheSet(key, rows);
      return rows;
    } catch (_err) {
      throw new ServiceUnavailableException('Analytics query failed — ClickHouse unavailable');
    }
  }

  // ── Cache invalidation ────────────────────────────────────────────────────
  /**
   * Drop every cached dashboard for one project. Returns the number of keys removed.
   *
   * NOT yet wired to a Kafka consumer — call it from whatever mutates project cost/procurement/site
   * data. Until then the 5-minute TTL is the only bound on staleness.
   *
   * This used to build `analytics:{tenant}:{type}:{project}:*` and hand it to `cache.del()`. That
   * treats `*` as a literal character, so it could only ever have matched a key whose date range was
   * the single character `*` — it deleted nothing, ever, for any input. Two separate reasons it could
   * not work as written: `cache.del()` takes one exact key and has no glob support at all, and the
   * executive dashboard keys on `projectIds.sort().join(',')`, so a single project id is a SUBSTRING
   * of that segment rather than the whole of it.
   *
   * Hence SCAN over the raw client with `*{projectId}*`: it catches the executive multi-project keys
   * as well as the single-project ones, whatever date range they were cached under. Project ids are
   * UUIDs and no other segment of the key can contain one, so the wildcards cannot over-match.
   */
  async invalidate(tenantId: string, projectId: string): Promise<number> {
    const pattern = `analytics:${tenantId}:*${projectId}*`;
    let cursor = '0';
    let removed = 0;

    try {
      do {
        const [next, keys] = await this.redis.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          String(SCAN_COUNT),
        );
        cursor = next;
        if (keys.length > 0) {
          // UNLINK reclaims memory on a background thread; DEL would block the event loop of a
          // shared Redis proportionally to the number of keys.
          removed += await this.redis.unlink(...keys);
        }
      } while (cursor !== '0');
    } catch (err) {
      // Invalidation is best-effort, exactly like cacheGet/cacheSet: a cache-store outage must not
      // fail the mutation that triggered it. Stale entries still expire on the TTL.
      logger.warn({ err, tenantId, projectId }, 'analytics.cache.invalidate-failed');
      return removed;
    }

    logger.debug({ tenantId, projectId, removed }, 'analytics.cache.invalidated');
    return removed;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  private parseDateRange(dateRange: string): [string, string] {
    const [start, end] = dateRange.split(',');
    if (!start || !end) throw new Error(`Invalid dateRange: ${dateRange}`);
    return [start.trim(), end.trim()];
  }
}

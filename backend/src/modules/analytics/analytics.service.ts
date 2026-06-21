import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import type { ClickHouseClient } from '@clickhouse/client';
import { CLICKHOUSE_CLIENT } from './analytics.tokens';

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
  atRisk: boolean;
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
  ) {}

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
    const cached = await this.cache.get<ExecutiveDashboardRow[]>(key);
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
      await this.cache.set(key, rows);
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
    const cached = await this.cache.get<PmDashboardRow[]>(key);
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
      await this.cache.set(key, rows);
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
    const cached = await this.cache.get<CostTrendRow[]>(key);
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
      await this.cache.set(key, rows);
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
    const cached = await this.cache.get<ProcurementTrendRow[]>(key);
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
      await this.cache.set(key, rows);
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
    const cached = await this.cache.get<SiteTrendRow[]>(key);
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
      await this.cache.set(key, rows);
      return rows;
    } catch (_err) {
      throw new ServiceUnavailableException('Analytics query failed — ClickHouse unavailable');
    }
  }

  // ── Cache invalidation ────────────────────────────────────────────────────
  // Called by event-driven invalidation when a relevant Kafka event arrives
  async invalidate(tenantId: string, projectId: string): Promise<void> {
    // Pattern: analytics:{tenant_id}:*:{project_id}:*
    // cache-manager doesn't support pattern delete — delete known key prefixes
    const dashboardTypes = ['executive', 'pm', 'cost-trend', 'procurement-trend', 'site-trend'];
    await Promise.all(
      dashboardTypes.map((t) => this.cache.del(cacheKey(tenantId, t, projectId, '*'))),
    );
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  private parseDateRange(dateRange: string): [string, string] {
    const [start, end] = dateRange.split(',');
    if (!start || !end) throw new Error(`Invalid dateRange: ${dateRange}`);
    return [start.trim(), end.trim()];
  }
}

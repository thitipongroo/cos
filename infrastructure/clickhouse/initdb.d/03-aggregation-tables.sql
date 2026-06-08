-- Phase 14 — Analytics: AggregatingMergeTree target tables
-- Source: context/00_master_construction_os.md §Phase 14 ClickHouse Tables
--
-- Engine:       AggregatingMergeTree (pre-aggregated at ingestion time — meets P95 SLA)
-- Partitioning: toYYYYMM(event_date) for all fact tables (spec §Phase 14)
-- TTL:          raw events 2 years; aggregated tables indefinite (spec §Phase 14)
-- ORDER BY:     (tenant_id, project_id, event_date) — primary query pattern
--
-- Query pattern (always use FINAL to merge partial states):
--   SELECT tenant_id, project_id, sumMerge(committed_amount) ...
--   FROM analytics.project_cost_daily FINAL
--   WHERE tenant_id = ? GROUP BY project_id

-- ══════════════════════════════════════════════════════════════════
-- project_cost_daily
-- Executive Dashboard: Budget utilization %, Projects at risk
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS analytics.project_cost_daily
(
    tenant_id        UUID,
    project_id       UUID,
    event_date       Date,
    committed_amount AggregateFunction(sum, Decimal(19,4)),
    actual_amount    AggregateFunction(sum, Decimal(19,4)),
    -- budget_amount: snapshot from construction.project.created; non-aggregate.
    -- Query with max(budget_amount) to surface the one non-zero row per project.
    budget_amount    Decimal(19,4)
)
ENGINE = AggregatingMergeTree
PARTITION BY toYYYYMM(event_date)
ORDER BY (tenant_id, project_id, event_date);

-- ══════════════════════════════════════════════════════════════════
-- procurement_activity_daily
-- Executive Dashboard: Overdue invoices count
-- PM Dashboard:        RFQ pending, PO delivery overdue
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS analytics.procurement_activity_daily
(
    tenant_id             UUID,
    project_id            UUID,
    event_date            Date,
    po_count              AggregateFunction(count, UInt32),
    rfq_count             AggregateFunction(count, UInt32),
    invoice_count         AggregateFunction(count, UInt32),
    -- overdue_invoice_count: invoices where payment_due < event_date at ingestion time
    overdue_invoice_count AggregateFunction(count, UInt32)
)
ENGINE = AggregatingMergeTree
PARTITION BY toYYYYMM(event_date)
ORDER BY (tenant_id, project_id, event_date);

-- ══════════════════════════════════════════════════════════════════
-- site_activity_daily
-- PM Dashboard: Daily manpower trend, Open issues, Inspection pass rate
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS analytics.site_activity_daily
(
    tenant_id             UUID,
    project_id            UUID,
    event_date            Date,
    report_count          AggregateFunction(count, UInt32),
    -- issue_open_count: cumulative open issues; each site.issue.created adds +1
    issue_open_count      AggregateFunction(sum, Int32),
    inspection_fail_count AggregateFunction(count, UInt32),
    -- manpower_total: count of workforce checkins (1 checkin = 1 worker on site)
    manpower_total        AggregateFunction(sum, Int32)
)
ENGINE = AggregatingMergeTree
PARTITION BY toYYYYMM(event_date)
ORDER BY (tenant_id, project_id, event_date);

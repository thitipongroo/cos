-- Phase 14 — Analytics: Materialized View DDL
-- Source: context/00_master_construction_os.md §Phase 14 ClickHouse Strategy
--
-- Pattern: Kafka engine table → Materialized View → AggregatingMergeTree target
-- MVs use -State aggregate functions to insert partial aggregate states.
-- Multiple MVs feed the same target table; ClickHouse merges partial states at query time.
--
-- countStateIf(1 = 0) inserts an empty partial state (0 contribution) for metrics
-- not owned by a given MV — prevents double-counting across multiple MVs.
-- sumState(toInt32(0)) is safe because adding 0 never changes a sum result.

-- ══════════════════════════════════════════════════════════════════
-- project_cost_daily MVs  (3 MVs)
-- ══════════════════════════════════════════════════════════════════

-- (1) construction.project.created → budget_amount snapshot
CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.mv_project_created_to_cost
TO analytics.project_cost_daily
AS SELECT
    toUUID(tenant_id)                       AS tenant_id,
    toUUID(payload.project_id)              AS project_id,
    toDate(occurred_at)                     AS event_date,
    sumState(toDecimal128(0, 4))            AS committed_amount,
    sumState(toDecimal128(0, 4))            AS actual_amount,
    toDecimal128(payload.budget.amount, 4)  AS budget_amount
FROM analytics.kafka_construction_project_created
GROUP BY tenant_id, project_id, event_date, payload.budget.amount;

-- (2) procurement.po.created → committed_amount
CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.mv_po_to_cost
TO analytics.project_cost_daily
AS SELECT
    toUUID(tenant_id)                                      AS tenant_id,
    toUUID(payload.project_id)                             AS project_id,
    toDate(occurred_at)                                    AS event_date,
    sumState(toDecimal128(payload.total_amount.amount, 4)) AS committed_amount,
    sumState(toDecimal128(0, 4))                           AS actual_amount,
    toDecimal128(0, 4)                                     AS budget_amount
FROM analytics.kafka_procurement_po_created
GROUP BY tenant_id, project_id, event_date;

-- (3) procurement.vendor_invoice.approved → actual_amount
CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.mv_invoice_to_cost
TO analytics.project_cost_daily
AS SELECT
    toUUID(tenant_id)                                AS tenant_id,
    toUUID(payload.project_id)                       AS project_id,
    toDate(occurred_at)                              AS event_date,
    sumState(toDecimal128(0, 4))                     AS committed_amount,
    sumState(toDecimal128(payload.amount.amount, 4)) AS actual_amount,
    toDecimal128(0, 4)                               AS budget_amount
FROM analytics.kafka_procurement_invoice_approved
GROUP BY tenant_id, project_id, event_date;

-- ══════════════════════════════════════════════════════════════════
-- procurement_activity_daily MVs  (3 MVs)
--
-- Each MV owns its metric column (countState); other count columns use
-- countStateIf(1 = 0) to insert an empty partial state — no double-counting.
-- ══════════════════════════════════════════════════════════════════

-- (4) procurement.po.created → po_count
CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.mv_po_count_to_procurement
TO analytics.procurement_activity_daily
AS SELECT
    toUUID(tenant_id)          AS tenant_id,
    toUUID(payload.project_id) AS project_id,
    toDate(occurred_at)        AS event_date,
    countState()               AS po_count,
    countStateIf(1 = 0)        AS rfq_count,
    countStateIf(1 = 0)        AS invoice_count,
    countStateIf(1 = 0)        AS overdue_invoice_count
FROM analytics.kafka_procurement_po_created
GROUP BY tenant_id, project_id, event_date;

-- (5) procurement.rfq.created → rfq_count
CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.mv_rfq_count_to_procurement
TO analytics.procurement_activity_daily
AS SELECT
    toUUID(tenant_id)          AS tenant_id,
    toUUID(payload.project_id) AS project_id,
    toDate(occurred_at)        AS event_date,
    countStateIf(1 = 0)        AS po_count,
    countState()               AS rfq_count,
    countStateIf(1 = 0)        AS invoice_count,
    countStateIf(1 = 0)        AS overdue_invoice_count
FROM analytics.kafka_procurement_rfq_created
GROUP BY tenant_id, project_id, event_date;

-- (6) procurement.vendor_invoice.approved → invoice_count + overdue_invoice_count
-- overdue: payment_due < event_date at ingestion time (approximate — invoices becoming
-- overdue later are not recounted; suitable for real-time dashboard approximation)
CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.mv_invoice_count_to_procurement
TO analytics.procurement_activity_daily
AS SELECT
    toUUID(tenant_id)                                                              AS tenant_id,
    toUUID(payload.project_id)                                                     AS project_id,
    toDate(occurred_at)                                                            AS event_date,
    countStateIf(1 = 0)                                                            AS po_count,
    countStateIf(1 = 0)                                                            AS rfq_count,
    countState()                                                                   AS invoice_count,
    countStateIf(toDate(payload.payment_due) < toDate(occurred_at))               AS overdue_invoice_count
FROM analytics.kafka_procurement_invoice_approved
GROUP BY tenant_id, project_id, event_date;

-- ══════════════════════════════════════════════════════════════════
-- site_activity_daily MVs  (4 MVs)
--
-- sumState(toInt32(0)) contributes 0 to sum — no double-counting.
-- Each MV owns its metric; others receive zero-value states.
-- ══════════════════════════════════════════════════════════════════

-- (7) site.report.submitted → report_count
-- event_date from report_date (not occurred_at) for accurate daily site tracking
CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.mv_report_to_site
TO analytics.site_activity_daily
AS SELECT
    toUUID(tenant_id)            AS tenant_id,
    toUUID(payload.project_id)   AS project_id,
    toDate(payload.report_date)  AS event_date,
    countState()                 AS report_count,
    sumState(toInt32(0))         AS issue_open_count,
    countStateIf(1 = 0)         AS inspection_fail_count,
    sumState(toInt32(0))         AS manpower_total
FROM analytics.kafka_site_report_submitted
GROUP BY tenant_id, project_id, event_date;

-- (8) site.issue.created → issue_open_count (+1 per new issue)
CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.mv_issue_to_site
TO analytics.site_activity_daily
AS SELECT
    toUUID(tenant_id)          AS tenant_id,
    toUUID(payload.project_id) AS project_id,
    toDate(occurred_at)        AS event_date,
    countStateIf(1 = 0)        AS report_count,
    sumState(toInt32(1))       AS issue_open_count,
    countStateIf(1 = 0)        AS inspection_fail_count,
    sumState(toInt32(0))       AS manpower_total
FROM analytics.kafka_site_issue_created
GROUP BY tenant_id, project_id, event_date;

-- (9) site.inspection.failed → inspection_fail_count
CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.mv_inspection_to_site
TO analytics.site_activity_daily
AS SELECT
    toUUID(tenant_id)          AS tenant_id,
    toUUID(payload.project_id) AS project_id,
    toDate(occurred_at)        AS event_date,
    countStateIf(1 = 0)        AS report_count,
    sumState(toInt32(0))       AS issue_open_count,
    countState()               AS inspection_fail_count,
    sumState(toInt32(0))       AS manpower_total
FROM analytics.kafka_site_inspection_failed
GROUP BY tenant_id, project_id, event_date;

-- (10) workforce.checkin.created → manpower_total (+1 per checkin)
CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.mv_workforce_to_site
TO analytics.site_activity_daily
AS SELECT
    toUUID(tenant_id)          AS tenant_id,
    toUUID(payload.project_id) AS project_id,
    toDate(occurred_at)        AS event_date,
    countStateIf(1 = 0)        AS report_count,
    sumState(toInt32(0))       AS issue_open_count,
    countStateIf(1 = 0)        AS inspection_fail_count,
    sumState(toInt32(1))       AS manpower_total
FROM analytics.kafka_workforce_checkin_created
GROUP BY tenant_id, project_id, event_date;

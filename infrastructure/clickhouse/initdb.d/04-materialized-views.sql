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
--
-- ══════════════════════════════════════════════════════════════════════════════════════
-- CORRECTED 2026-08-23 — TDD OQ-47. Two of the four faults that kept every target table
-- empty live in this file, and both would have kept them empty even if the topic names in
-- 02-kafka-tables.sql had been right from the start.
--
-- TIMESTAMPS. Every MV called `toDate(occurred_at)`. `occurred_at` is an ISO-8601 instant —
-- `EventOutboxService` builds it with `new Date().toISOString()`, so it always carries
-- milliseconds and a trailing `Z`. ClickHouse's `toDate` on a String stops at the offset
-- designator:
--
--     Cannot parse '2026-08-23T04:00:00.000Z' as Date: syntax error at position 23
--
-- That is the SAME failure, at the same character position, that the Go carbon consumer
-- documents and works around in services/analytics-worker/internal/carbon/consumer.go. It
-- was never fixed here. `parseDateTimeBestEffort` reads both that form and a plain
-- `YYYY-MM-DD` (verified on 26.3), so it covers `report_date` and `payment_due` too.
--
-- MALFORMED IDS. `toUUID()` THROWS on a value that is not a UUID, and an exception raised
-- while pushing to a view aborts the whole block — so one bad record discarded every good
-- record batched with it. Observed with a real `proj-kg-…` id left by an earlier test. Each
-- MV now filters with `toUUIDOrNull(...) IS NOT NULL` first; a malformed row is dropped on
-- its own instead of taking its neighbours with it.
--
-- Two conventions this file now depends on, both load-bearing:
--
--   * The source table is aliased `k` and every source column is qualified `k.…`. Without
--     the alias, `toUUID(tenant_id) AS tenant_id` shadows the source column and the WHERE
--     clause then sees the UUID alias instead of the String — ClickHouse rejects it with
--     "Illegal type UUID of first argument of function toUUIDOrNull".
--   * `parseDateTimeBestEffortOrNull` in the WHERE, `parseDateTimeBestEffort` in the SELECT:
--     the guard has to tolerate junk to filter it, the projection must not silently produce
--     1970-01-01 from a NULL.
-- ══════════════════════════════════════════════════════════════════════════════════════

-- ══════════════════════════════════════════════════════════════════
-- project_cost_daily MVs  (3 MVs)
-- ══════════════════════════════════════════════════════════════════

-- (1) construction.project.created → budget_amount snapshot
CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.mv_project_created_to_cost
TO analytics.project_cost_daily
AS SELECT
    toUUID(k.tenant_id)                            AS tenant_id,
    toUUID(k.payload.project_id)                   AS project_id,
    toDate(parseDateTimeBestEffort(k.occurred_at)) AS event_date,
    sumState(toDecimal128(0, 4))                   AS committed_amount,
    sumState(toDecimal128(0, 4))                   AS actual_amount,
    toDecimal128(k.payload.budget.amount, 4)       AS budget_amount
FROM analytics.kafka_construction_project_created AS k
WHERE isNotNull(toUUIDOrNull(k.tenant_id))
  AND isNotNull(toUUIDOrNull(k.payload.project_id))
  AND isNotNull(parseDateTimeBestEffortOrNull(k.occurred_at))
GROUP BY tenant_id, project_id, event_date, k.payload.budget.amount;

-- (2) procurement.po.created → committed_amount
CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.mv_po_to_cost
TO analytics.project_cost_daily
AS SELECT
    toUUID(k.tenant_id)                                      AS tenant_id,
    toUUID(k.payload.project_id)                             AS project_id,
    toDate(parseDateTimeBestEffort(k.occurred_at))           AS event_date,
    sumState(toDecimal128(k.payload.total_amount.amount, 4)) AS committed_amount,
    sumState(toDecimal128(0, 4))                             AS actual_amount,
    toDecimal128(0, 4)                                       AS budget_amount
FROM analytics.kafka_procurement_po_created AS k
WHERE isNotNull(toUUIDOrNull(k.tenant_id))
  AND isNotNull(toUUIDOrNull(k.payload.project_id))
  AND isNotNull(parseDateTimeBestEffortOrNull(k.occurred_at))
GROUP BY tenant_id, project_id, event_date;

-- (3) procurement.vendor_invoice.approved → actual_amount
CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.mv_invoice_to_cost
TO analytics.project_cost_daily
AS SELECT
    toUUID(k.tenant_id)                                AS tenant_id,
    toUUID(k.payload.project_id)                       AS project_id,
    toDate(parseDateTimeBestEffort(k.occurred_at))     AS event_date,
    sumState(toDecimal128(0, 4))                       AS committed_amount,
    sumState(toDecimal128(k.payload.amount.amount, 4)) AS actual_amount,
    toDecimal128(0, 4)                                 AS budget_amount
FROM analytics.kafka_procurement_invoice_approved AS k
WHERE isNotNull(toUUIDOrNull(k.tenant_id))
  AND isNotNull(toUUIDOrNull(k.payload.project_id))
  AND isNotNull(parseDateTimeBestEffortOrNull(k.occurred_at))
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
    toUUID(k.tenant_id)                            AS tenant_id,
    toUUID(k.payload.project_id)                   AS project_id,
    toDate(parseDateTimeBestEffort(k.occurred_at)) AS event_date,
    countState()                                   AS po_count,
    countStateIf(1 = 0)                            AS rfq_count,
    countStateIf(1 = 0)                            AS invoice_count,
    countStateIf(1 = 0)                            AS overdue_invoice_count
FROM analytics.kafka_procurement_po_created AS k
WHERE isNotNull(toUUIDOrNull(k.tenant_id))
  AND isNotNull(toUUIDOrNull(k.payload.project_id))
  AND isNotNull(parseDateTimeBestEffortOrNull(k.occurred_at))
GROUP BY tenant_id, project_id, event_date;

-- (5) procurement.rfq.created → rfq_count
CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.mv_rfq_count_to_procurement
TO analytics.procurement_activity_daily
AS SELECT
    toUUID(k.tenant_id)                            AS tenant_id,
    toUUID(k.payload.project_id)                   AS project_id,
    toDate(parseDateTimeBestEffort(k.occurred_at)) AS event_date,
    countStateIf(1 = 0)                            AS po_count,
    countState()                                   AS rfq_count,
    countStateIf(1 = 0)                            AS invoice_count,
    countStateIf(1 = 0)                            AS overdue_invoice_count
FROM analytics.kafka_procurement_rfq_created AS k
WHERE isNotNull(toUUIDOrNull(k.tenant_id))
  AND isNotNull(toUUIDOrNull(k.payload.project_id))
  AND isNotNull(parseDateTimeBestEffortOrNull(k.occurred_at))
GROUP BY tenant_id, project_id, event_date;

-- (6) procurement.vendor_invoice.approved → invoice_count + overdue_invoice_count
-- overdue: payment_due < event_date at ingestion time (approximate — invoices becoming
-- overdue later are not recounted; suitable for real-time dashboard approximation).
-- `payment_due` gets the same best-effort parse: it is a DATE column upstream and arrives as
-- `YYYY-MM-DD`, but a comparison that throws would abort the block exactly like toUUID did.
CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.mv_invoice_count_to_procurement
TO analytics.procurement_activity_daily
AS SELECT
    toUUID(k.tenant_id)                            AS tenant_id,
    toUUID(k.payload.project_id)                   AS project_id,
    toDate(parseDateTimeBestEffort(k.occurred_at)) AS event_date,
    countStateIf(1 = 0)                            AS po_count,
    countStateIf(1 = 0)                            AS rfq_count,
    countState()                                   AS invoice_count,
    countStateIf(
        toDate(parseDateTimeBestEffortOrNull(k.payload.payment_due))
          < toDate(parseDateTimeBestEffort(k.occurred_at))
    )                                              AS overdue_invoice_count
FROM analytics.kafka_procurement_invoice_approved AS k
WHERE isNotNull(toUUIDOrNull(k.tenant_id))
  AND isNotNull(toUUIDOrNull(k.payload.project_id))
  AND isNotNull(parseDateTimeBestEffortOrNull(k.occurred_at))
GROUP BY tenant_id, project_id, event_date;

-- ══════════════════════════════════════════════════════════════════
-- site_activity_daily MVs  (4 MVs)
--
-- sumState(toInt32(0)) contributes 0 to sum — no double-counting.
-- Each MV owns its metric; others receive zero-value states.
-- ══════════════════════════════════════════════════════════════════

-- (7) site.report.submitted → report_count
-- event_date from report_date (not occurred_at) for accurate daily site tracking: a report
-- filed at midnight for the previous day's work belongs to the day it describes.
CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.mv_report_to_site
TO analytics.site_activity_daily
AS SELECT
    toUUID(k.tenant_id)                                  AS tenant_id,
    toUUID(k.payload.project_id)                         AS project_id,
    toDate(parseDateTimeBestEffort(k.payload.report_date)) AS event_date,
    countState()                                         AS report_count,
    sumState(toInt32(0))                                 AS issue_open_count,
    countStateIf(1 = 0)                                  AS inspection_fail_count,
    sumState(toInt32(0))                                 AS manpower_total
FROM analytics.kafka_site_report_submitted AS k
WHERE isNotNull(toUUIDOrNull(k.tenant_id))
  AND isNotNull(toUUIDOrNull(k.payload.project_id))
  AND isNotNull(parseDateTimeBestEffortOrNull(k.payload.report_date))
GROUP BY tenant_id, project_id, event_date;

-- (8) site.issue.created → issue_open_count (+1 per new issue)
CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.mv_issue_to_site
TO analytics.site_activity_daily
AS SELECT
    toUUID(k.tenant_id)                            AS tenant_id,
    toUUID(k.payload.project_id)                   AS project_id,
    toDate(parseDateTimeBestEffort(k.occurred_at)) AS event_date,
    countStateIf(1 = 0)                            AS report_count,
    sumState(toInt32(1))                           AS issue_open_count,
    countStateIf(1 = 0)                            AS inspection_fail_count,
    sumState(toInt32(0))                           AS manpower_total
FROM analytics.kafka_site_issue_created AS k
WHERE isNotNull(toUUIDOrNull(k.tenant_id))
  AND isNotNull(toUUIDOrNull(k.payload.project_id))
  AND isNotNull(parseDateTimeBestEffortOrNull(k.occurred_at))
GROUP BY tenant_id, project_id, event_date;

-- (9) site.inspection.failed → inspection_fail_count
CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.mv_inspection_to_site
TO analytics.site_activity_daily
AS SELECT
    toUUID(k.tenant_id)                            AS tenant_id,
    toUUID(k.payload.project_id)                   AS project_id,
    toDate(parseDateTimeBestEffort(k.occurred_at)) AS event_date,
    countStateIf(1 = 0)                            AS report_count,
    sumState(toInt32(0))                           AS issue_open_count,
    countState()                                   AS inspection_fail_count,
    sumState(toInt32(0))                           AS manpower_total
FROM analytics.kafka_site_inspection_failed AS k
WHERE isNotNull(toUUIDOrNull(k.tenant_id))
  AND isNotNull(toUUIDOrNull(k.payload.project_id))
  AND isNotNull(parseDateTimeBestEffortOrNull(k.occurred_at))
GROUP BY tenant_id, project_id, event_date;

-- (10) workforce.checkin.created → manpower_total (+1 per checkin)
CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.mv_workforce_to_site
TO analytics.site_activity_daily
AS SELECT
    toUUID(k.tenant_id)                            AS tenant_id,
    toUUID(k.payload.project_id)                   AS project_id,
    toDate(parseDateTimeBestEffort(k.occurred_at)) AS event_date,
    countStateIf(1 = 0)                            AS report_count,
    sumState(toInt32(0))                           AS issue_open_count,
    countStateIf(1 = 0)                            AS inspection_fail_count,
    sumState(toInt32(1))                           AS manpower_total
FROM analytics.kafka_workforce_checkin_created AS k
WHERE isNotNull(toUUIDOrNull(k.tenant_id))
  AND isNotNull(toUUIDOrNull(k.payload.project_id))
  AND isNotNull(parseDateTimeBestEffortOrNull(k.occurred_at))
GROUP BY tenant_id, project_id, event_date;

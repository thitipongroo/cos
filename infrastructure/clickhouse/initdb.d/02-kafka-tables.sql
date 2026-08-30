-- Phase 14 — Analytics: Kafka ingestion
--
-- THE KAFKA ENGINE TABLES THAT USED TO LIVE HERE ARE GONE (2026-08-23). Ingestion moved to
-- services/analytics-worker/internal/metrics — see that file's header for the full account.
--
-- In short: the eight tables here subscribed to bare event names such as
-- 'construction.project.created'. Real topics are '{tenant_id}.construction.project.created.v1'
-- (packages/@cos/kafka/src/topic-catalog.ts, topicForEvent). kafka_topic_list takes LITERAL
-- names, so not one of the eight ever matched a topic: the aggregate tables in 03 stayed empty and
-- every Executive and PM dashboard metric read zero. Nothing failed loudly — the tables were
-- created, the consumer groups registered, and the API answered 200 with zeros, which reads as
-- "no data yet" rather than "not connected".
--
-- A literal list also cannot follow tenants: each new tenant creates new topics, and only a regex
-- subscription picks them up. The Go worker already runs exactly that pattern for carbon.
--
-- Pre-aggregation at ingestion — what master §Phase 14 requires for the P95 SLA — is unchanged: the
-- worker writes the same -State partial aggregates into the same tables, so the query side in
-- 03-aggregation-tables.sql and the analytics API are untouched.
--
-- The DROPs below matter only for an environment that already ran the old file; initdb.d itself runs
-- just once, on an empty data directory.

DROP VIEW IF EXISTS analytics.mv_project_created_to_cost;
DROP VIEW IF EXISTS analytics.mv_po_to_cost;
DROP VIEW IF EXISTS analytics.mv_invoice_to_cost;
DROP VIEW IF EXISTS analytics.mv_po_count_to_procurement;
DROP VIEW IF EXISTS analytics.mv_rfq_count_to_procurement;
DROP VIEW IF EXISTS analytics.mv_invoice_count_to_procurement;
DROP VIEW IF EXISTS analytics.mv_report_to_site;
DROP VIEW IF EXISTS analytics.mv_issue_to_site;
DROP VIEW IF EXISTS analytics.mv_inspection_to_site;
DROP VIEW IF EXISTS analytics.mv_workforce_to_site;

DROP TABLE IF EXISTS analytics.kafka_construction_project_created;
DROP TABLE IF EXISTS analytics.kafka_procurement_po_created;
DROP TABLE IF EXISTS analytics.kafka_procurement_invoice_approved;
DROP TABLE IF EXISTS analytics.kafka_procurement_rfq_created;
DROP TABLE IF EXISTS analytics.kafka_site_report_submitted;
DROP TABLE IF EXISTS analytics.kafka_site_inspection_failed;
DROP TABLE IF EXISTS analytics.kafka_site_issue_created;
DROP TABLE IF EXISTS analytics.kafka_workforce_checkin_created;

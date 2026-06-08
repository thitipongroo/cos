-- Phase 14 — Analytics: Kafka Engine Table Definitions
-- Source: context/00_master_construction_os.md §Phase 14 ClickHouse Strategy
--
-- ClickHouse consumes domain events directly from Kafka (AvroConfluent).
-- Broker (internal docker network): kafka:9092
-- Schema Registry:                  schema-registry:8081  (set via users.d/analytics.xml)
-- Consumer group prefix:            ch-analytics-* (distinct from application consumers)
-- kafka_skip_broken_messages:       100  — tolerate schema mismatches during dev restarts
--
-- Column mapping: only fields needed for aggregation are declared.
-- Nested Avro records → ClickHouse Tuple columns; accessed via dot notation in MVs.

-- ══════════════════════════════════════════════════════════════════
-- construction.project.created  →  project_cost_daily (budget_amount)
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS analytics.kafka_construction_project_created
(
    event_id    String,
    tenant_id   String,
    occurred_at String,
    payload     Tuple(
        project_id  String,
        budget      Tuple(amount String, currency_code String)
    )
)
ENGINE = Kafka
SETTINGS
    kafka_broker_list          = 'kafka:9092',
    kafka_topic_list           = 'construction.project.created',
    kafka_group_name           = 'ch-analytics-construction',
    kafka_format               = 'AvroConfluent',
    kafka_num_consumers        = 1,
    kafka_skip_broken_messages = 100;

-- ══════════════════════════════════════════════════════════════════
-- procurement.po.created  →  project_cost_daily (committed_amount)
--                         →  procurement_activity_daily (po_count)
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS analytics.kafka_procurement_po_created
(
    event_id    String,
    tenant_id   String,
    occurred_at String,
    payload     Tuple(
        project_id   String,
        total_amount Tuple(amount String, currency_code String)
    )
)
ENGINE = Kafka
SETTINGS
    kafka_broker_list          = 'kafka:9092',
    kafka_topic_list           = 'procurement.po.created',
    kafka_group_name           = 'ch-analytics-procurement-po',
    kafka_format               = 'AvroConfluent',
    kafka_num_consumers        = 1,
    kafka_skip_broken_messages = 100;

-- ══════════════════════════════════════════════════════════════════
-- procurement.vendor_invoice.approved  →  project_cost_daily (actual_amount)
--                                      →  procurement_activity_daily (invoice_count, overdue_invoice_count)
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS analytics.kafka_procurement_invoice_approved
(
    event_id    String,
    tenant_id   String,
    occurred_at String,
    payload     Tuple(
        project_id  String,
        amount      Tuple(amount String, currency_code String),
        payment_due String
    )
)
ENGINE = Kafka
SETTINGS
    kafka_broker_list          = 'kafka:9092',
    kafka_topic_list           = 'procurement.vendor_invoice.approved',
    kafka_group_name           = 'ch-analytics-procurement-invoice',
    kafka_format               = 'AvroConfluent',
    kafka_num_consumers        = 1,
    kafka_skip_broken_messages = 100;

-- ══════════════════════════════════════════════════════════════════
-- procurement.rfq.created  →  procurement_activity_daily (rfq_count)
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS analytics.kafka_procurement_rfq_created
(
    event_id    String,
    tenant_id   String,
    occurred_at String,
    payload     Tuple(project_id String)
)
ENGINE = Kafka
SETTINGS
    kafka_broker_list          = 'kafka:9092',
    kafka_topic_list           = 'procurement.rfq.created',
    kafka_group_name           = 'ch-analytics-procurement-rfq',
    kafka_format               = 'AvroConfluent',
    kafka_num_consumers        = 1,
    kafka_skip_broken_messages = 100;

-- ══════════════════════════════════════════════════════════════════
-- site.report.submitted  →  site_activity_daily (report_count)
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS analytics.kafka_site_report_submitted
(
    event_id    String,
    tenant_id   String,
    occurred_at String,
    payload     Tuple(project_id String, report_date String)
)
ENGINE = Kafka
SETTINGS
    kafka_broker_list          = 'kafka:9092',
    kafka_topic_list           = 'site.report.submitted',
    kafka_group_name           = 'ch-analytics-site-report',
    kafka_format               = 'AvroConfluent',
    kafka_num_consumers        = 1,
    kafka_skip_broken_messages = 100;

-- ══════════════════════════════════════════════════════════════════
-- site.inspection.failed  →  site_activity_daily (inspection_fail_count)
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS analytics.kafka_site_inspection_failed
(
    event_id    String,
    tenant_id   String,
    occurred_at String,
    payload     Tuple(project_id String)
)
ENGINE = Kafka
SETTINGS
    kafka_broker_list          = 'kafka:9092',
    kafka_topic_list           = 'site.inspection.failed',
    kafka_group_name           = 'ch-analytics-site-inspection',
    kafka_format               = 'AvroConfluent',
    kafka_num_consumers        = 1,
    kafka_skip_broken_messages = 100;

-- ══════════════════════════════════════════════════════════════════
-- site.issue.created  →  site_activity_daily (issue_open_count)
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS analytics.kafka_site_issue_created
(
    event_id    String,
    tenant_id   String,
    occurred_at String,
    payload     Tuple(project_id String)
)
ENGINE = Kafka
SETTINGS
    kafka_broker_list          = 'kafka:9092',
    kafka_topic_list           = 'site.issue.created',
    kafka_group_name           = 'ch-analytics-site-issue',
    kafka_format               = 'AvroConfluent',
    kafka_num_consumers        = 1,
    kafka_skip_broken_messages = 100;

-- ══════════════════════════════════════════════════════════════════
-- workforce.checkin.created  →  site_activity_daily (manpower_total)
-- 1 checkin event = 1 worker present on site for that project/date
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS analytics.kafka_workforce_checkin_created
(
    event_id    String,
    tenant_id   String,
    occurred_at String,
    payload     Tuple(project_id String)
)
ENGINE = Kafka
SETTINGS
    kafka_broker_list          = 'kafka:9092',
    kafka_topic_list           = 'workforce.checkin.created',
    kafka_group_name           = 'ch-analytics-workforce',
    kafka_format               = 'AvroConfluent',
    kafka_num_consumers        = 1,
    kafka_skip_broken_messages = 100;

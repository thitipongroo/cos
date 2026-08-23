-- Phase 14 — Analytics: Kafka Engine Table Definitions
-- Source: context/00_master_construction_os.md §Phase 14 ClickHouse Strategy
--
-- ClickHouse consumes domain events directly from Kafka (AvroConfluent).
-- Broker (internal docker network): kafka:9092
-- Schema Registry:                  schema-registry:8081  (set via users.d/analytics.xml)
-- Consumer group prefix:            ch-analytics-* (distinct from application consumers)
-- kafka_skip_broken_messages:       100  — see the warning below before trusting this
--
-- ══════════════════════════════════════════════════════════════════════════════════════
-- CORRECTED 2026-08-23 — TDD OQ-47. Until then these tables had never received a message,
-- so analytics.project_cost_daily, procurement_activity_daily and site_activity_daily —
-- every table the executive and PM dashboards read — were empty. FOUR independent faults,
-- each sufficient on its own. All four were reproduced against ClickHouse 26.3 and the fix
-- verified end to end: a real Avro event took project_cost_daily from 0 rows to 1, with
-- the budget it was published with.
--
-- 1. TOPIC NAMES. Every table named a bare event, `construction.project.created`. Real
--    topics are `{tenant_id}.{event_type}` and every event type ends in `.v1`
--    (KafkaProducer.publish → topicForEvent), so no name ever matched. Now a `^`-anchored
--    PATTERN: librdkafka treats a leading `^` as a regex, the same convention the Go
--    consumers use (libs/go/coskafka). Verified: a table subscribed this way received
--    messages from a tenant-prefixed topic, with `_topic` confirming the source.
--
-- 2. PARTIAL PAYLOAD TUPLES. The old header said "only fields needed for aggregation are
--    declared". That is not how the AvroConfluent reader works: a Tuple that omits fields
--    does not project them away, it MIS-READS the record — and `kafka_skip_broken_messages`
--    then discards the result without an exception. Measured: 5 messages consumed, zero
--    exceptions, zero rows. Every payload field is now declared, generated from the
--    committed `.avsc`. `scripts/ci/check-clickhouse-avro-columns.mjs` fails the build if
--    the two drift apart.
--
-- 3. (in 04-materialized-views.sql) `toDate(occurred_at)` cannot parse the timestamps this
--    platform emits. This one was independent of the topic names: it would have kept the
--    tables empty even if every name had been right.
--
-- 4. (in 04-materialized-views.sql) `toUUID()` on a malformed id aborted the whole block.
--
-- ⚠️  `kafka_skip_broken_messages = 100` is why faults 1 and 2 were INVISIBLE. It converts a
--    decode failure into silence — no exception, no DLQ, no retry, and no metric that moves.
--    `system.kafka_consumers.exceptions` holds only the last few per consumer. If these
--    tables are ever quiet again, look there FIRST; the absence of an error means nothing.
-- ══════════════════════════════════════════════════════════════════════════════════════
--
-- Column mapping: EVERY payload field is declared, in schema order. Nested Avro records →
-- ClickHouse Tuple columns; accessed via dot notation in the MVs. Do not prune a field you
-- think is unused — see fault 2.

-- ══════════════════════════════════════════════════════════════════
-- construction.project.created  →  project_cost_daily (budget_amount)
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS analytics.kafka_construction_project_created
(
    event_id    String,
    tenant_id   String,
    occurred_at String,
    payload     Tuple(
        project_id   String,
        project_code String,
        project_name String,
        project_type String,
        budget       Tuple(amount String, currency_code String),
        start_date   String,
        end_date     String,
        created_by   String
    )
)
ENGINE = Kafka
SETTINGS
    kafka_broker_list          = 'kafka:9092',
    -- `^`-anchored PATTERN, not a literal name — topics are per-tenant (§7.3).
    kafka_topic_list           = '^[^.]+\.construction\.project\.created\.v1$',
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
        po_id         String,
        project_id    String,
        vendor_id     String,
        po_number     String,
        total_amount  Tuple(amount String, currency_code String),
        delivery_date String,
        -- boq_item_id added 2026-08-23 (TDD OQ-50): Finance needs it to attribute a cost transaction to a
        -- budget line. A Tuple that omits a field does not project it away, it MIS-READS the record —
        -- and kafka_skip_broken_messages = 100 makes that silent (OQ-47). Nullable because the Avro
        -- field is ["null","string"]: a line ordered outside the BOQ has none.
        line_items    Array(Tuple(item_id String, quantity String, unit String, unit_price String,
                                  boq_item_id Nullable(String)))
    )
)
ENGINE = Kafka
SETTINGS
    kafka_broker_list          = 'kafka:9092',
    -- `^`-anchored PATTERN, not a literal name — topics are per-tenant (§7.3).
    kafka_topic_list           = '^[^.]+\.procurement\.po\.created\.v1$',
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
        invoice_id  String,
        po_id       String,
        project_id  String,
        vendor_id   String,
        amount      Tuple(amount String, currency_code String),
        approved_by String,
        approved_at String,
        payment_due String
    )
)
ENGINE = Kafka
SETTINGS
    kafka_broker_list          = 'kafka:9092',
    -- `^`-anchored PATTERN, not a literal name — topics are per-tenant (§7.3).
    kafka_topic_list           = '^[^.]+\.procurement\.vendor_invoice\.approved\.v1$',
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
    payload     Tuple(
        rfq_id     String,
        pr_id      Nullable(String),
        project_id String,
        rfq_number String,
        deadline   String,
        created_by String
    )
)
ENGINE = Kafka
SETTINGS
    kafka_broker_list          = 'kafka:9092',
    -- `^`-anchored PATTERN, not a literal name — topics are per-tenant (§7.3).
    kafka_topic_list           = '^[^.]+\.procurement\.rfq\.created\.v1$',
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
    payload     Tuple(
        report_id    String,
        project_id   String,
        report_date  String,
        submitted_by String
    )
)
ENGINE = Kafka
SETTINGS
    kafka_broker_list          = 'kafka:9092',
    -- `^`-anchored PATTERN, not a literal name — topics are per-tenant (§7.3).
    kafka_topic_list           = '^[^.]+\.site\.report\.submitted\.v1$',
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
    payload     Tuple(
        inspection_id String,
        project_id    String,
        checklist_id  String,
        failed_items  Array(Tuple(item_id String, description String)),
        inspected_by  String,
        inspected_at  String
    )
)
ENGINE = Kafka
SETTINGS
    kafka_broker_list          = 'kafka:9092',
    -- `^`-anchored PATTERN, not a literal name — topics are per-tenant (§7.3).
    kafka_topic_list           = '^[^.]+\.site\.inspection\.failed\.v1$',
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
    payload     Tuple(
        issue_id   String,
        project_id String,
        report_id  Nullable(String),
        title      String,
        severity   String,
        created_by String
    )
)
ENGINE = Kafka
SETTINGS
    kafka_broker_list          = 'kafka:9092',
    -- `^`-anchored PATTERN, not a literal name — topics are per-tenant (§7.3).
    kafka_topic_list           = '^[^.]+\.site\.issue\.created\.v1$',
    kafka_group_name           = 'ch-analytics-site-issue',
    kafka_format               = 'AvroConfluent',
    kafka_num_consumers        = 1,
    kafka_skip_broken_messages = 100;

-- ══════════════════════════════════════════════════════════════════
-- workforce.checkin.created  →  site_activity_daily (manpower_total)
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS analytics.kafka_workforce_checkin_created
(
    event_id    String,
    tenant_id   String,
    occurred_at String,
    payload     Tuple(
        checkin_id String,
        worker_id  String,
        project_id String,
        checkin_at String,
        method     String,
        -- Avro declares this ["null", record]. ClickHouse refuses `Nullable(Tuple(...))` outright
        -- ("Nullable Tuple type is not allowed", needs allow_experimental_nullable_tuple_type), so
        -- the nullability is pushed INSIDE the tuple. Verified against a real event carrying a
        -- location and one carrying null — see the note in 04-materialized-views.sql.
        location   Tuple(lat Nullable(Float64), lng Nullable(Float64))
    )
)
ENGINE = Kafka
SETTINGS
    kafka_broker_list          = 'kafka:9092',
    -- `^`-anchored PATTERN, not a literal name — topics are per-tenant (§7.3).
    kafka_topic_list           = '^[^.]+\.workforce\.checkin\.created\.v1$',
    kafka_group_name           = 'ch-analytics-workforce',
    kafka_format               = 'AvroConfluent',
    kafka_num_consumers        = 1,
    kafka_skip_broken_messages = 100;

-- Phase 24 — Carbon analytics target table
-- Source: spec §33.3 (Service Assignment: carbon aggregations → analytics-worker, Go → ClickHouse),
--         §33.4 (CarbonRecord, EN 15804 / ISO 21930 A1–A3, GHG Protocol Scope 1/2/3)
--
-- Database is `analytics`, not `carbon_analytics`: 01-database.sql creates exactly one analytics
-- database and every other fact table lives there. A second database for one table would split the
-- OLAP surface for no benefit.
--
-- Engine: ReplacingMergeTree, NOT AggregatingMergeTree like 03-aggregation-tables.sql. Those tables
-- pre-aggregate because dashboards read sums; carbon records must stay individually addressable —
-- §33.4 requires every row to carry the carbon_factor and carbon_factor_source that produced it so
-- an auditor can reproduce the number. Replacing on carbon_record_id makes a redelivered Kafka
-- message idempotent (Postgres already guarantees one record per consumption).
--
-- Decimal, not Float: emissions figures are audited. quantity/factor/result mirror the Postgres
-- column types exactly — DECIMAL(10,4), DECIMAL(10,6), DECIMAL(19,4).

CREATE TABLE IF NOT EXISTS analytics.carbon_records
(
    carbon_record_id     UUID,
    tenant_id            UUID,
    project_id           UUID,
    consumption_id       UUID,
    material_id          UUID,
    quantity_consumed    Decimal(10,4),
    unit                 LowCardinality(String),
    carbon_factor        Decimal(10,6),
    -- EPD document / database entry the factor came from. §33.4: MUST be recorded for every factor
    -- used, to enable the audit trail.
    carbon_factor_source String,
    carbon_kgco2e        Decimal(19,4),
    -- 'SCOPE_1' | 'SCOPE_2' | 'SCOPE_3'. Material embodied carbon is always Scope 3; the column
    -- exists so equipment fuel (Scope 1) and grid electricity (Scope 2) can land here later
    -- without a schema change (§33.4 GHG Protocol table).
    ghg_scope            LowCardinality(String),
    recorded_at          DateTime64(3, 'UTC')
)
ENGINE = ReplacingMergeTree
PARTITION BY toYYYYMM(recorded_at)
-- Project footprint over a period is the dominant read (§33.4 project-level GHG reporting).
-- carbon_record_id last so it is the dedup key within a project/day.
ORDER BY (tenant_id, project_id, recorded_at, carbon_record_id);

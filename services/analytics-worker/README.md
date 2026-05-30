# Construction OS — Analytics Worker (Go)

**Runtime:** Go 1.22+
**Phase:** Phase 14 — Analytics + Dashboard
**Deployable:** Separate from NestJS monolith (Go runtime)

## Purpose

Consumes Kafka domain events and writes aggregated metrics to ClickHouse for dashboard queries. Uses ClickHouse Kafka engine tables and materialized views to pre-aggregate at ingestion time (not at query time — required to meet p95 < 3s SLA).

Responsibilities:
- Kafka consumer for all domain events (project, procurement, site, finance)
- Write to ClickHouse fact tables (`project_cost_daily`, `procurement_activity_daily`, `site_activity_daily`)
- Maintain materialized view aggregations (`AggregatingMergeTree`)

## Dependencies

- Kafka (consumer group: `analytics-consumer-group`)
- ClickHouse 24.x (fact tables + materialized views)
- Confluent Schema Registry (Avro schema validation — Phase 8)

## Configuration

```bash
KAFKA_BROKERS=localhost:29092
KAFKA_GROUP_ID=analytics-consumer-group
CLICKHOUSE_DSN=clickhouse://cos:password@localhost:9000/analytics
SCHEMA_REGISTRY_URL=http://localhost:8081
```

## Usage

```bash
cd services/analytics-worker
go mod download
go run .

# Build
go build -o analytics-worker .
```

## Performance target

- Ingestion latency: < 5 minutes from Kafka event to ClickHouse (QM-6)
- Dashboard query SLA: p95 < 3s (Executive), p95 < 2s (PM) — enforced via materialized views + Redis cache in NestJS Analytics Service

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

## Public API

This service has no HTTP API. It exposes two interfaces:

### Kafka Consumer

Consumer group: `analytics-consumer-group`

| Topic | Event type | Description |
| --- | --- | --- |
| `project.project.created.v1` | `ProjectCreatedEvent` | New project created |
| `project.project.updated.v1` | `ProjectUpdatedEvent` | Project metadata updated |
| `procurement.purchase_order.created.v1` | `PurchaseOrderCreatedEvent` | PO created |
| `procurement.po.status_changed` | `PoStatusChangedEvent` | PO status transition |
| `procurement.delivery.received.v1` | `DeliveryReceivedEvent` | Delivery recorded |
| `procurement.vendor_invoice.received.v1` | `VendorInvoiceReceivedEvent` | Invoice received |
| `site-ops.daily_report.submitted.v1` | `DailyReportSubmittedEvent` | Site daily report submitted |
| `site-ops.issue.created.v1` | `IssueCreatedEvent` | Site issue raised |
| `finance.budget.updated.v1` | `BudgetUpdatedEvent` | Budget line updated |
| `finance.cost_entry.created.v1` | `CostEntryCreatedEvent` | Cost entry recorded |

All schemas registered in Confluent Schema Registry (Avro, `BACKWARD_TRANSITIVE` — Phase 8).

### Health Endpoint

```http
GET /healthz → 200 OK  {"status":"ok"}
```

Checked by Kubernetes liveness probe every 30s.

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

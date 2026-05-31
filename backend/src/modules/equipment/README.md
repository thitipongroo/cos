# equipment

NestJS module for construction equipment management and utilization tracking.

## Purpose

Tracks equipment inventory, project assignments, maintenance schedules, and daily utilization (Phase 21). Time-series telemetry (utilization, fuel consumption) stored in TimescaleDB hypertables. IoT telemetry pipeline available via EP-DOMAIN-003.

**Status:** Module scaffolded. Full implementation in Phase 21.

## Public API

```
POST   /api/v1/equipment                                    — create equipment
GET    /api/v1/equipment                                    — list (filter by status, type)
GET    /api/v1/equipment/:id                                — get detail
PATCH  /api/v1/equipment/:id/status                        — update status
POST   /api/v1/equipment/:id/assignments                    — assign to project
PATCH  /api/v1/equipment/:id/assignments/:aid/return       — return from project
POST   /api/v1/equipment/:id/maintenance                    — log maintenance event
POST   /api/v1/equipment/:id/utilization                    — record daily utilization
GET    /api/v1/projects/:projectId/equipment               — equipment on project
```

## Status State Machine

`AVAILABLE → IN_USE → MAINTENANCE → AVAILABLE`
`ANY → RETIRED` (terminal)

## Dependencies

- `@cos/database` — `TenantPrismaService` (PostgreSQL for equipment entities)
- `@cos/financial` — `Decimal` for cost fields (`purchase_cost`, maintenance `cost`)
- `@cos/rbac` — role guards
- `@cos/shared` — Kafka event contracts
- TimescaleDB — hypertable for `equipment_utilization` time-series data

## Configuration

| Variable        | Description                                            |
| --------------- | ------------------------------------------------------ |
| `DATABASE_URL`  | PgBouncer connection string (PostgreSQL + TimescaleDB) |
| `KAFKA_BROKERS` | Kafka broker list                                      |

## Usage

```typescript
// Record daily utilization
POST /api/v1/equipment/uuid/utilization
{ "project_id": "uuid", "hours_operated": "8.50", "fuel_consumed": "45.00",
  "operator_id": "uuid" }
```

Kafka events emitted: `equipment.assigned`, `equipment.returned`, `equipment.maintenance_scheduled`

## Notes

- `equipment_utilization` is a TimescaleDB hypertable partitioned by `recorded_at`
- IoT telemetry pipeline: EP-DOMAIN-003 `IoTIntegration` stub — MQTT → Kafka → TimescaleDB
- Common IoT event types: GPS_POSITION, FUEL_LEVEL, ENGINE_HOURS, IGNITION_ON/OFF

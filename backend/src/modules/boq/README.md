# boq

NestJS module for Bill of Quantities (BOQ) management.

## Purpose

Manages BOQ versions, categories, and line items for construction projects (Phase 4).
Enforces financial precision rules: all monetary values stored as `DECIMAL(19,4)`, calculated with `decimal.js` (never native JS float).
Supports versioning with copy-on-approve semantics.

**Status:** Module scaffolded. Full implementation in Phase 4.

## Public API

```text
POST   /api/v1/projects/:projectId/boq/versions                   — create new version
GET    /api/v1/projects/:projectId/boq/versions                   — list versions
GET    /api/v1/projects/:projectId/boq/versions/:versionId        — get version detail
POST   /api/v1/projects/:projectId/boq/versions/:versionId/approve
POST   /api/v1/boq/versions/:versionId/categories                 — add category
POST   /api/v1/boq/versions/:versionId/items                      — add item
PATCH  /api/v1/boq/items/:itemId                                   — update (DRAFT only)
DELETE /api/v1/boq/items/:itemId                                   — delete (DRAFT only)
GET    /api/v1/boq/versions/:versionId/export                     — export JSON/CSV
```

## Calculation Rules

```text
estimated_total = ROUND(quantity × unit_cost, 4)  — HALF_UP
category.subtotal = SUM(item.estimated_total)
version.total = SUM(category.subtotal)
```

## Dependencies

- `@cos/database` — `TenantPrismaService`
- `@cos/financial` — `calculateLineTotal`, `Decimal` — never native float
- `@cos/rbac` — `PROJECT_MANAGER`, `TENANT_ADMIN` guards
- `@cos/kafka` — KafkaProducer (SDK)
- `@cos/shared` — typed event payload contracts

## Configuration

| Variable        | Description                 |
| --------------- | --------------------------- |
| `DATABASE_URL`  | PgBouncer connection string |
| `KAFKA_BROKERS` | Kafka broker list           |

## Usage

```typescript
// Create BOQ item (DRAFT version only)
POST /api/v1/boq/versions/uuid/items
{
  "description": "Ready-mix concrete C25",
  "unit": "m3",
  "quantity": "150.0000",
  "unit_cost": "2850.0000",
  "currency_code": "THB"
}
```

Kafka events emitted:

- `boq.created`
- `boq.updated`
- `construction.boq.version_created.v1`
- `boq.version.approved`

## Notes

- Only one DRAFT version per project at a time
- Approving sets previous APPROVED → SUPERSEDED (immutable)
- `carbon_factor_kg_co2e` field is nullable — populated when EP-ENV-001 is activated
- Extension point: EP-DOMAIN-002 `BIMIntegration` for quantity auto-import from IFC

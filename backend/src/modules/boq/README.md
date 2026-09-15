# boq

NestJS module for Bill of Quantities (BOQ) management.

## Purpose

Manages BOQ versions, categories, and line items for construction projects (Phase 4).
Enforces financial precision rules: all monetary values stored as `DECIMAL(19,4)`, calculated
with `decimal.js` (never native JS float).
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
GET    /api/v1/boq/projects/:projectId/price-variance             — BOQ vs ราคากลาง (?version_id=)
```

## Central price feed (ADR-061)

Every item create and update looks for a ราคากลาง central price for the line's `item_code`, through
`CentralPriceCatalogService` (the `central-prices` module — the catalog is never queried from here):

- **Mode A (always).** When an ACTIVE price in the line's currency exists, the line is linked:
  `central_price_id`, `reference_price` (a snapshot of the central price) and
  `price_variance = unit_cost − reference_price` (decimal.js, signed). No price, or a price in another
  currency, leaves the line unlinked.
- **Mode B (`use_central_price: true`).** `unit_cost` is taken from that price and stays editable. Refused
  with `COS-CPRICE-006` (422) when the line has no `item_code`, no ACTIVE price exists, or the currency
  differs; sending `unit_cost` as well is `COS-CPRICE-007` (400).
- **On update** a linked line keeps its snapshot and only `price_variance` is recomputed — a later catalog
  import does not move an estimate's baseline. An unlinked line is looked up again. Mode B re-takes the
  snapshot from the current price.
- **Which price.** The newest `effective_period` for the code (byte order), see the central-prices README.
- **Version copy** carries the three columns into the new version unchanged.

`price-variance` reports one version (`version_id`, default the newest) with, per item, `reference_price`,
`price_variance`, `reference_total = ROUND(quantity × reference_price, 4)` and
`variance_total = estimated_total − reference_total`; totals cover linked items only, except
`estimated_total`. Read roles as the version detail.

**Outstanding (D12):** no web BOQ item editor and no Stitch screen exist, so nothing in `apps/web` surfaces
the reference, the variance or the auto-populate action yet. The API above is what exists.

## Calculation Rules

```text
estimated_total = ROUND(quantity × unit_cost, 4)  — HALF_UP
category.subtotal = SUM(item.estimated_total)
version.total = SUM(category.subtotal) over EVERY category, at every depth (OQ-23)
```

## Dependencies

- `@cos/database` — `TenantPrismaService`
- `@cos/financial` — `calculateLineTotal`, `Decimal` — never native float
- `@cos/rbac` — `PROJECT_MANAGER`, `TENANT_ADMIN` guards
- `@cos/kafka` — KafkaProducer (SDK)
- `@cos/shared` — typed event payload contracts
- `central-prices` module — `CentralPriceCatalogService.findReferencePrice` (ADR-061)

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

// Mode B — price the line from ราคากลาง (ADR-061)
POST /api/v1/boq/versions/uuid/items
{
  "item_code": "STR-001",
  "description": "Ready-mix concrete C25",
  "unit": "m3",
  "quantity": "150.0000",
  "use_central_price": true
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

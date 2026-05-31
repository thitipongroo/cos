# finance

NestJS module for project cost tracking (NOT a full accounting system).

## Purpose

Tracks project-level budget vs. committed vs. actual cost (Phase 7). Consumes Kafka events from the procurement module to auto-record cost transactions. Does NOT implement double-entry bookkeeping, chart of accounts, or GL posting.

**Status:** Module scaffolded. Full implementation in Phase 7.

## Scope

**Implements:**

- Project budget setup and revision tracking
- Cost transaction recording (from procurement events + manual entry)
- Payment status tracking
- Budget variance reporting across projects

**Does NOT implement:**

- Double-entry bookkeeping
- Chart of accounts / GL posting
- ERP integration (EP-FINANCE-002 stub — Post-MVP)
- Tax calculation (EP-FINANCE-001 — Avalara AvaTax, stub until activated)

## Public API

```
GET  /api/v1/projects/:projectId/finance/summary     — budget vs actual vs committed
GET  /api/v1/projects/:projectId/finance/budget      — budget detail with lines
POST /api/v1/projects/:projectId/finance/budget      — create/update budget
POST /api/v1/projects/:projectId/budget-lines        — add budget line
GET  /api/v1/projects/:projectId/cost-transactions   — list transactions (paginated)
POST /api/v1/projects/:projectId/payments            — record payment
GET  /api/v1/projects/:projectId/payments            — list payments
GET  /api/v1/finance/reports/variance                — portfolio budget variance
```

## Kafka Consumers

| Event                                    | Action                                  |
| ---------------------------------------- | --------------------------------------- |
| `procurement.purchase_order.created.v1`  | Create committed cost_transaction       |
| `procurement.vendor_invoice.received.v1` | Create actual cost_transaction          |
| `procurement.po.status_changed`          | Update committed_amount if PO CANCELLED |

## Dependencies

- `@cos/database` — `TenantPrismaService`
- `@cos/financial` — `Decimal` for all monetary calculations — never float
- `@cos/rbac` — `FINANCE`, `PROJECT_MANAGER` guards
- `@cos/shared` — Kafka consumer + event contracts
- Multi-currency: Open Exchange Rates API (EP-FINANCE-003 — resolved; rates cached in Redis 24h)

## Configuration

| Variable                      | Description                   |
| ----------------------------- | ----------------------------- |
| `DATABASE_URL`                | PgBouncer connection string   |
| `KAFKA_BROKERS`               | Kafka broker list             |
| `REDIS_URL`                   | Redis for exchange rate cache |
| `OPEN_EXCHANGE_RATES_API_KEY` | Injected via AWS SM / Vault   |

## Usage

```typescript
// Get project financial summary
GET /api/v1/projects/uuid/finance/summary
→ { budget: "5000000.0000", committed: "1200000.0000", actual: "800000.0000",
    variance_percent: "84.00", currency_code: "THB" }
```

Kafka events emitted: `finance.budget.created`, `finance.payment.processed`, `finance.variance.alert`, `finance.cashflow_risk.detected.v1`, `finance.budget.exceeded.v1`

## Notes

- All amounts stored as `DECIMAL(19,4)` in PostgreSQL — never float
- Currency stored as ISO 4217 code (e.g. `THB`, `USD`)
- Cross-service data arrives exclusively via Kafka — no direct DB queries to procurement

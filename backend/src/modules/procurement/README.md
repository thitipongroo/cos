# procurement

NestJS module for procurement workflows.

## Purpose

Manages the full procurement lifecycle: Purchase Requests → RFQ → Quotations → Purchase Orders → Deliveries → Invoices (Phase 5).
Uses Temporal for long-running RFQ and PO workflows with threshold-based approval chains.

**Status:** Module scaffolded. Full implementation in Phase 5.

## Public API

Vendors:

```text
POST/GET /api/v1/vendors
```

Purchase Requests:

```text
POST/GET /api/v1/purchase-requests
POST     /api/v1/purchase-requests/:id/submit
POST     /api/v1/purchase-requests/:id/approve
```

RFQ:

```text
POST/GET /api/v1/rfqs
POST     /api/v1/rfqs/:id/publish
POST     /api/v1/rfqs/:id/quotations
POST     /api/v1/rfqs/:id/award
```

Purchase Orders:

```text
POST/GET /api/v1/purchase-orders
POST     /api/v1/purchase-orders/:id/record-delivery
```

## Approval Thresholds (PO)

| Amount (THB)   | Approvers required                    |
| -------------- | ------------------------------------- |
| ≤ 50,000       | PROJECT_MANAGER                       |
| 50,001–500,000 | PROJECT_MANAGER + FINANCE             |
| > 500,000      | PROJECT_MANAGER + FINANCE + EXECUTIVE |

48-hour timeout per approver → escalates to manager → final escalation → TENANT_ADMIN.

## Dependencies

- `@cos/database` — `TenantPrismaService`
- `@cos/financial` — `calculateLineTotal` for line item totals
- `@cos/rbac` — `PROCUREMENT_OFFICER`, `PROC_MANAGER` guards
- `@cos/shared` — Kafka event contracts
- `@temporalio/client`, `@temporalio/worker` — Temporal RFQ + PO workflows

## Configuration

| Variable           | Description                 |
| ------------------ | --------------------------- |
| `DATABASE_URL`     | PgBouncer connection string |
| `KAFKA_BROKERS`    | Kafka broker list           |
| `TEMPORAL_ADDRESS` | Temporal server address     |

## Usage

```typescript
// Create a PO and start Temporal workflow
POST /api/v1/purchase-orders
{ "rfq_id": "uuid", "vendor_id": "uuid", "delivery_date": "2026-07-01", ... }
```

Kafka events emitted:

- `procurement.rfq.created`, `procurement.rfq.status_changed`
- `procurement.purchase_order.created.v1`, `procurement.po.status_changed`
- `procurement.delivery.received.v1`
- `procurement.vendor_invoice.received.v1`

## Notes

- Tax calculation via EP-FINANCE-001 (Avalara AvaTax) — stub until activated
- Vendor scoring via EP-PROC-001 — stub until methodology defined
- All workflow state transitions must emit Kafka events (Global Rule)

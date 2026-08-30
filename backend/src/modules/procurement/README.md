# procurement

NestJS module for procurement workflows.

## Purpose

Manages the full procurement lifecycle: Purchase Requests → RFQ → Quotations → Purchase Orders → Deliveries →
Invoices (Phase 5).
Uses Temporal for long-running RFQ and PO workflows with threshold-based approval chains.

**Status:** Phase 5 complete.

## Public API

All routes are under `/api/v1/procurement/*` (canonical convention — spec §14 + ADR-022;
vendors included). Tenant-scoped server-side via RLS + JWT. There are no project-scoped
list routes — per-project views use the tenant-wide lists with `?project_id=`.

```text
Vendors:         POST/GET  /api/v1/procurement/vendors
                 GET/DELETE /api/v1/procurement/vendors/:vendorId
Purchase reqs:   POST/GET  /api/v1/procurement/purchase-requests      (filter: status, project_id)
RFQs:            POST/GET  /api/v1/procurement/rfqs                   (filter: status, project_id)
                 POST      /api/v1/procurement/rfqs/:rfqId/publish|close|cancel|award
                 GET/POST  /api/v1/procurement/rfqs/:rfqId/quotations
Purchase orders: POST/GET  /api/v1/procurement/purchase-orders        (filter: status, project_id)
                 GET       /api/v1/procurement/purchase-orders/:poId
                 GET       /api/v1/procurement/purchase-orders/:poId/deliveries
                 POST      /api/v1/procurement/purchase-orders/:poId/submit|approve|reject|acknowledge|mark-paid|dispute
Deliveries:      POST/GET  /api/v1/procurement/deliveries             (po_id in body / filter)
Vendor invoices: POST/GET  /api/v1/procurement/vendor-invoices        (po_id in body / query)
                 POST      /api/v1/procurement/vendor-invoices/:invoiceId/approve
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
- `@cos/kafka` — KafkaProducer (SDK)
- `@cos/shared` — typed event payload contracts
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
POST /api/v1/procurement/purchase-orders
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

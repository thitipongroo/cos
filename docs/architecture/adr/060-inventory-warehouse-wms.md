# 60. Inventory / Warehouse Management (WMS) — post-MVP, Procurement service

Date: 2026-07-20

## Status

Accepted

## Context

ADR-057 recorded full Inventory / Warehouse management as a post-MVP gap: a basic `Inventory` entity
(`quantity_on_hand`, `reorder_level`) already exists in the procurement area of §11, but there is no stock
movement ledger, no goods-receipt (GRN), no multi-warehouse, and no valuation. The product owner requested
the full design (deep-propagation); the feature remains **post-MVP**.

Product-owner decisions (2026-07-20):

- **Scope:** Full WMS — stock movement ledger (receipt / issue / transfer / adjustment) + GRN tied to PO
  Delivery + multi-warehouse/location + valuation.
- **Valuation:** Moving average.
- **Host:** Extend the `procurement` schema (where `Inventory` and `Procurement — Delivery` already live).
- **GRN → cost:** Stock-only — GRN updates stock but does **not** post a cost transaction; cost recognition
  stays PO → `COMMITTED`, vendor invoice → `ACTUAL` (no double counting).

## Decision

### Data model (§11, `procurement` schema)

**`Warehouse`** — `warehouse_id` (PK), `tenant_id`, `project_id` (nullable — site store vs central),
`name`, `location`, `is_active`.

**`Inventory`** (extend existing) — add `warehouse_id` (FK → Warehouse), `average_unit_cost`
DECIMAL(19,4), `stock_value` DECIMAL(19,4) = `quantity_on_hand × average_unit_cost`. Keep
`quantity_on_hand`, `reorder_level`.

**`StockMovement`** (ledger) — `movement_id` (PK), `tenant_id`, `warehouse_id` (FK), `material_id`,
`movement_type` ENUM (`RECEIPT` / `ISSUE` / `TRANSFER` / `ADJUSTMENT`), `quantity` (signed), `unit_cost`
(at movement), `source_type` ENUM (`GRN` / `CONSUMPTION` / `TRANSFER` / `MANUAL`), `source_id`, `moved_at`,
`moved_by`.

**`GoodsReceiptNote`** (GRN) — `grn_id` (PK), `tenant_id`, `po_id` (FK → Purchase Order), `delivery_id`
(FK → Delivery), `warehouse_id`, `received_by`, `received_at`, `status`; GRN lines: `material_id`,
`qty_received`, `unit`.

### Behaviour

- A GRN creates `StockMovement(RECEIPT)` rows → increments `Inventory.quantity_on_hand` and recomputes
  **moving average**: `new_avg = (old_qty·old_avg + recv_qty·recv_cost) / (old_qty + recv_qty)`.
- `ISSUE` / `CONSUMPTION` decrements stock at the current `average_unit_cost`; `TRANSFER` moves between
  warehouses; `ADJUSTMENT` corrects counts. `stock_value` is always `quantity_on_hand × average_unit_cost`.
- **GRN is stock-only** — it does not emit a cost transaction. Financial recognition is unchanged
  (PO → `COMMITTED`, vendor invoice → `ACTUAL`, §Phase 7). All monetary fields follow the Financial
  Precision spec.
- `site_ops` material consumption emits a `StockMovement(ISSUE, source_type = CONSUMPTION)` against the
  issuing warehouse (cross-schema via event, no direct DB access).

### API (§14, `/api/v1/procurement`)

- `POST /warehouses` · `GET /warehouses`
- `GET /inventory` (by warehouse/material; low-stock filter via `reorder_level`) · `GET /inventory/{material_id}`
- `POST /grn` (create from a delivery) · `GET /grn`
- `POST /stock-movements` (issue / transfer / adjustment) · `GET /stock-movements` (ledger)

### RBAC (§6)

Inventory / Warehouse (WMS): `PROCUREMENT` = RW (receive/manage), `SITE_ENGINEER` = RW (issue/consume),
`PM` = R, `FINANCE` = R (valuation), `EXECUTIVE` = R, `TENANT_ADMIN` = FULL.

### Events (§15/§16)

`GoodsReceived` (GRN), `StockIssued`, `StockTransferred`, `StockAdjusted`.

### UX (§20)

- `/procurement/warehouses` — warehouse list
- `/procurement/inventory` — stock-on-hand by warehouse/material + low-stock (reorder) view
- `/procurement/grn` — goods receipt against deliveries + stock-movement ledger

## Consequences

### Positive

- Builds on the existing `Inventory` entity + `Delivery`; no new service.
- Moving average is a single scalar per inventory row — cheap and deterministic; no lot tracking needed.
- Stock-only GRN avoids double-counting cost against the existing PO/invoice recognition.

### Negative / open

- Moving average loses lot-level traceability (acceptable per decision; FIFO/lots is a future option).
- Reconciling `site_ops` consumption to warehouse issue relies on the event flow being in place.

### Neutral

- **Remains post-MVP.** Not added to the MVP phase plan.

## References

- ADR-057 (gap recorded, post-MVP)
- `docs/specifications/11-database-schema.md` (existing `Inventory`, `Procurement — Delivery`, Material Consumption)
- `docs/specifications/14-api-architecture.md` §14 · `06-rbac-permission-matrix.md` §6 · `16-enterprise-event-flow.md`
- Phase 7 cost recognition (PO → COMMITTED, invoice → ACTUAL) — unchanged

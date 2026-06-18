# 24. AR Client Billing, AR Receipts, and direct-method Cash Flow Forecast (MVP)

Date: 2026-06-19

## Status

Accepted

## Context

Spec §28 lists the **AR/Billing module as MVP scope** ("AR/Billing module live"), and §11
defines the `Financials — Billing`, `Financials — AR Receipt`, `Contract`, and `Customer`
entities. §15 defines the Client Billing (AR) approval chain (Finance → PM → Executive above a
configured limit) and §06 defines the RBAC. §14 lists `POST /finance/billing`,
`PATCH /finance/billing/{id}/approve`, and `GET /finance/cashflow-forecast/{project_id}`.

The original Phase 7 implementation was scoped to project **cost tracking** only (budget, cost
transactions, payments, variance) and the master Phase 7 SCOPE CLARIFICATION did not enumerate
AR Billing — leaving these endpoints unimplemented and previously mislabelled "deferred
(post-MVP)" in §14. The product owner confirmed AR Billing + Cash Flow Forecast belong in MVP.

Two questions had no direct spec answer:

1. **Cash flow forecast algorithm.** §09 only tags the forecast as "ClickHouse + AI Pipeline"
   (daily) with no formula, inputs, or output shape.
2. **CRM dependency depth.** `Billing → Contract → Customer`, and §11 `Customer.opportunity_id`
   references a CRM `Opportunity` (→ `Lead`). No `crm` schema exists in the codebase, and §21.6
   keeps the CRM UI excluded (schema-only).

## Decision

**1. Cash flow forecast — deterministic direct method (13-week rolling).**
We implement the industry-standard short-term direct method (a CFO's 13-week rolling forecast):
weekly buckets where inflow = ISSUED AR billings due by `due_date` and outflow = PENDING
payments due by `payment_date`, both project-scoped, with a running cumulative net. This is
deterministic (no AI) and computed in the service layer from existing finance-domain data.
Overdue items collapse into the first bucket; items beyond the 13-week horizon are excluded. No
opening cash-account balance is modelled (none exists in §11) — `cumulative_net` is relative to
zero. The §09 "AI Pipeline" predictive forecast remains a separate, longer-horizon analytics
concern (Phase 14/23).

**2. Outflow stays inside the finance domain.** Outflow is sourced from `finance.payments`
(PENDING), not by reading `procurement.invoices` directly — preserving the module boundary
established for vendor invoices (procurement-owned; finance approves/pays).

**3. Customer + Contract entities, no full CRM pipeline.** We build `finance.customers` and
`finance.contracts` (plus `finance.billings` and `finance.ar_receipts`) in the **`finance`
schema** (the consuming domain; no `crm` schema exists). `Customer.opportunity_id` is
**nullable** so AR customers can be created directly without the Lead → Opportunity pipeline.

**4. Approval limit is configuration.** §06/§15 say PM approves "up to a configured limit". The
mechanism (PM ≤ limit; above requires Executive) is enforced in the service; the threshold value
is a config (`BILLING_PM_APPROVAL_MAX`, default 500,000 THB), tenant-configurable in the Phase 14
admin UI — mirroring the existing procurement approval thresholds.

## Consequences

- AR Client Billing, AR Receipts, Contracts, Customers, and the Cash Flow Forecast are live MVP
  endpoints under `/api/v1/finance/*`. §14, the finance OpenAPI, and master Phase 7 are updated.
- Billing lifecycle: `DRAFT → ISSUED` (approval, emits `finance.billing.approved.v1`) → `PAID`
  (on AR receipt, emits `finance.ar_receipt.recorded.v1`).
- Placing customers/contracts in `finance` is a pragmatic MVP choice; a future dedicated `crm`
  schema (with the Lead → Opportunity pipeline) can migrate these tables and back-fill
  `opportunity_id`.
- The forecast is an approximation bounded by the data captured (issued billings, pending
  payments); it is not a general-ledger cash position.

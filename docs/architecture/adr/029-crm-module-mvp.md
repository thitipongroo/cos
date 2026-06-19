# 29. CRM module brought into MVP (Lead → Opportunity → Customer)

Date: 2026-06-20

## Status

Accepted

## Context

§21.6 excluded the CRM **UI** from MVP while claiming the CRM **schema + API exist from Day 1**.
In reality neither existed: no `crm` schema/tables, no CRM module, and `crm.openapi.yaml` was an
empty stub. The product owner decided to bring CRM fully into MVP (UI + the missing backend),
overriding §21.6.

§11.3 defines the lifecycle `Lead → (qualify) → Opportunity → (win) → Customer`, with fields in
§11.2. §14 lists four CRM endpoints (`GET`/`POST /crm/leads`, `POST /crm/opportunities`,
`PATCH /crm/opportunities/{id}/convert`). §20.7.10 specifies **no page inventory**. The `Customer`
entity already exists as **`finance.customers`** (built in the AR Billing increment, ADR-024,
with a nullable `opportunity_id`).

## Decision

**1. Build the CRM backend now.** New `crm` schema with `crm.leads`, `crm.opportunities`,
`crm.contacts` (§11.2). Every row carries `created_by / created_at / updated_at / deleted_at`
(soft delete, §11.4). RLS per §Phase 16.

**2. Customer = `finance.customers` (no duplicate entity).** The `convert` action sets the
opportunity to `WON` and inserts a `finance.customers` row (`opportunity_id` = the won
opportunity, `company_name` from the lead/opportunity). AR Billing already references
`finance.customers`, so the win-to-customer traceability (§11.3) is preserved without a second
Customer table. The CRM repository writes `finance.customers` directly (same DB, tenant-scoped by
RLS) — documented cross-schema write to the canonical Customer store.

**3. Status enums (§11 lists none).** `Lead.status ∈ {NEW, QUALIFIED, DISQUALIFIED}`;
`Opportunity.status ∈ {OPEN, WON, LOST}`. Creating an opportunity from a lead marks the lead
`QUALIFIED`; `convert` marks the opportunity `WON`.

**4. Endpoints.** The four §14 endpoints, plus read endpoints the UI needs but §14 omits:
`GET /crm/opportunities`, `GET /crm/contacts`, `GET /crm/customers`. These extend §14 (documented
there). RBAC: read = `EXECUTIVE` + `CRM_SALES_MANAGER`; write = `CRM_SALES_MANAGER` (+ `TENANT_ADMIN`).

**5. Page inventory (designed — §20.7.10 has none).** `/crm/leads` (list + create + qualify),
`/crm/opportunities` (list + create-from-lead + convert), `/crm/customers` (read-only list).

## Consequences

- §21.6 and §20.7.10 are updated: CRM is MVP (UI + backend); the page inventory is recorded.
- `finance.customers` remains the single Customer store, now populated both by AR (direct create)
  and CRM (convert). A future move of customers into the `crm` schema would supersede this.
- `crm.openapi.yaml`, §14, and master are updated to the implemented surface.

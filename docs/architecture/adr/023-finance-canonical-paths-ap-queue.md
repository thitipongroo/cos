# Finance canonical `/api/v1/finance/*` paths + AP queue (AIP-132); vendor-invoice ownership

**Date:** 2026-06-19
**Status:** Accepted
**Deciders:** Product owner, engineering
**Tags:** architecture | api | finance

---

## Context

The web Finance pages (spec §20.7.4: payments, budget, invoices, variance) needed
tenant-wide views, but the Phase 7 Finance implementation was **project-scoped**
(`/api/v1/projects/:projectId/finance/*`, `/projects/:projectId/payments`,
`/projects/:projectId/cost-transactions`) — drifted from spec §14, which mandates
`/api/v1/finance/*`. Several §20.7.4 needs had no backend endpoint: a tenant-wide
payments (AP) queue and a tenant-wide vendor-invoice list. §14's Financial table was
itself inconsistent — missing the implemented variance report and listing AR `billing`

- `cashflow-forecast` that were never built.

A research review of procure-to-pay / 3-way-match practice (Tradogram, NetSuite, GEP,
Tipalti) confirmed: the **vendor invoice belongs to the procurement→AP boundary**
(created against a PO, matched PO+receipt+invoice); **Finance approves/pays** it. Finance
does not own a separate invoice store.

## Decision

1. **Canonical paths** — reconcile Finance to `/api/v1/finance/*` (spec §14):
   - `GET/POST /finance/budget/:projectId` (project-scoped) + `POST .../lines`
   - `GET /finance/cost-transactions` and `GET /finance/payments` — tenant-wide
     AIP-132 lists, filterable by `?project_id=`
   - `POST /finance/payments` — record payment (project_id in body)
   - `GET /finance/reports/variance` — added to §14
2. **AP queue** — payments and cost-transactions become tenant-wide filterable lists.
3. **Vendor invoices stay in procurement** — the Finance "invoices" page is a
   finance-gated view over `GET /api/v1/procurement/vendor-invoices` (now tenant-wide,
   optional `?po_id=` / `?status=`), per the P2P 3-way-match boundary. No duplicate
   finance invoice resource is created.
4. **§14 corrected** — add the variance + payments-list endpoints; mark AR `billing`
   and `cashflow-forecast` as **deferred (post-MVP)**.

## Rationale

Mirrors the procurement reconciliation (AIP-132 List / AIP-159; spec authoritative).
Keeping vendor invoices in procurement matches industry P2P ownership and avoids a
duplicate AP store; Finance gets a role-gated view + the payment/approval actions.

## Consequences

### Positive

- §20.7.4 Finance pages are served by correct tenant-wide endpoints; spec/impl aligned.
- Single source of truth for vendor invoices (procurement), viewed by Finance.

### Negative / Follow-up

- AR `billing` + `cashflow-forecast` remain unimplemented (deferred, documented in §14).
- Larger change across controller/service/repo/DTO/OpenAPI/web; mitigated by 100%
  unit-test coverage on finance + procurement controller/service/repository.

# 62. e-GP (Electronic Government Procurement) integration — post-MVP, Preconstruction (CRM ext)

Date: 2026-07-20

## Status

Accepted

## Context

ADR-057 recorded e-GP integration (Thailand's Electronic Government Procurement system, กรมบัญชีกลาง) as a
post-MVP gap — absent from the spec. The Preconstruction nav (tenders / bids) is already sketched as a
post-MVP CRM-service extension (§20.7.12c, §01 §1.2) but with no e-GP mechanism. The product owner requested
the full design. It remains **post-MVP**.

Product-owner decisions (2026-07-20):

- **Scope:** Read tender feed + submit bid + import award (full cycle).
- **Mechanism:** BOTH — an e-GP API adapter **and** manual entry.
- **Host:** Preconstruction, a CRM-service extension (`crm` schema, §01 §1.2).
- **Contract/BOQ link:** a won tender creates a `main_contract`; the bid is built from BOQ + ราคากลาง
  (`reference_price`, ADR-061).

## Decision

### Data model (§11, `crm` schema)

**`Tender`** — `tender_id` (PK), `tenant_id`, `egp_ref` (e-GP project number, nullable for manual),
`title`, `agency`, `budget_amount` DECIMAL(19,4), `announcement_date`, `submission_deadline`, `source`
ENUM(`EGP_API` / `MANUAL`), `status` ENUM(`WATCHING` / `PREPARING` / `SUBMITTED` / `WON` / `LOST`),
`created_by`, `created_at`.

**`Bid`** — `bid_id` (PK), `tenant_id`, `tender_id` (FK → Tender), `bid_amount` DECIMAL(19,4),
`boq_snapshot_ref` (BOQ used to price the bid), `status` ENUM(`DRAFT` / `SUBMITTED`), `submitted_at`,
`result` ENUM(`WON` / `LOST`, nullable).

### Behaviour

- **Ingestion (both):** an `EgpAdapter` (Strategy pattern, §13.3, same shape as the ERP / central-price
  adapters) reads the tender feed, submits bids, and imports awards; **or** a user enters tenders/bids
  manually. ⚠️ **e-GP public-API availability is unverified** — the adapter is the seam, wired when a usable
  API exists; manual entry always works.
- **Bid pricing:** a bid is built from the project BOQ, whose lines carry `reference_price` from ราคากลาง
  (ADR-061), so a bid can be compared against the central price.
- **Award → Contract:** importing/recording a `WON` result emits `TenderWon`; the Finance service creates a
  `main_contract` (`customer` = the government agency) via the event — no direct cross-schema write.

### API (§14, `/api/v1/preconstruction`)

- `GET /tenders` (list/filter) · `POST /tenders` (manual create) · `POST /tenders/sync` (EgpAdapter pull)
- `POST /tenders/{id}/bids` (create bid from BOQ) · `POST /bids/{id}/submit` (adapter or manual)
- `PATCH /tenders/{id}/award` (record WON/LOST; WON → create Contract)

### RBAC (§6)

Tenders / Bids: `CRM_SALES_MANAGER` = RW, `PM` = RW (estimating), `EXECUTIVE` = A (bid approval),
`FINANCE` = R, `TENANT_ADMIN` = FULL.

### Events (§15/§16)

`TenderImported`, `BidSubmitted`, `TenderWon` (→ Finance creates `main_contract`), `TenderLost`.

### UX (§20)

Extends the existing post-MVP `/preconstruction/tenders` and `/preconstruction/bids` (§20.7.12c) with
e-GP sync status, BOQ-priced bid preparation, and award import.

## Consequences

### Positive

- Closes the "head of flow" (bidding) that COS previously lacked; integrates with ราคากลาง + Contract.
- Adapter + manual means the feature is usable even before an e-GP API is available.

### Negative / open

- **e-GP public-API availability + auth (government credentials) is unverified** — until confirmed, only the
  manual path is guaranteed; the adapter is a stub seam (§13.3).
- e-GP document/format conformance is a build-time concern.

### Neutral

- **Remains post-MVP.** Pairs with ราคากลาง (ADR-061) and the Preconstruction nav (§20.7.12c).

## References

- ADR-057 (gap, post-MVP) · ADR-061 (ราคากลาง reference price) · §13.3 (adapter Strategy pattern)
- §20.7.12c / §01 §1.2 (Preconstruction = CRM-service extension) · §11 `finance.Contract`

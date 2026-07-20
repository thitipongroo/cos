# 63. Bank guarantees / bonds — post-MVP, Finance service

Date: 2026-07-20

## Status

Accepted

## Context

ADR-057 recorded bank guarantees / bonds (a common Thai contractual requirement, especially for government
work) as a post-MVP gap — absent from the spec. The product owner requested the full design. It remains
**post-MVP**.

Product-owner decisions (2026-07-20):

- **Types:** all standard bonds — bid / performance / advance-payment / retention / warranty — as one typed
  entity.
- **Host + links:** Finance service; a bond links to a `Contract` (performance/retention/advance/warranty)
  and/or a `Tender`/`Bid` (bid bond).
- **Lifecycle:** full — `ISSUED → ACTIVE → RELEASED / EXPIRED / CALLED`.
- **Ownership + alerts:** Finance manages; near-expiry alerts via the Notification service (§19).

## Decision

### Data model (§11, `finance` schema)

**`Bond`** — `bond_id` (PK), `tenant_id`, `contract_id` (nullable FK → Contract), `tender_id` (nullable FK
→ Tender — for bid bonds), `bond_type` ENUM(`BID` / `PERFORMANCE` / `ADVANCE` / `RETENTION` / `WARRANTY`),
`issuer_bank`, `bond_number`, `amount` DECIMAL(19,4), `currency_code`, `issue_date`, `expiry_date`,
`status` ENUM(`ISSUED` / `ACTIVE` / `RELEASED` / `EXPIRED` / `CALLED`), `created_by`, `created_at`.

### Behaviour

- Lifecycle transitions are explicit; `CALLED` records a bond being drawn/claimed by the beneficiary.
- A scheduled check emits `BondExpiring` ahead of `expiry_date`; the Notification service (§19) alerts
  Finance/PM. All monetary fields follow the Financial Precision spec.

### API (§14, `/api/v1/finance`)

- `POST /bonds` (create) · `GET /bonds` (list; `?contract_id` / `?tender_id` / `?status`)
- `PATCH /bonds/{id}/status` (ACTIVE / RELEASED / CALLED / EXPIRED)

### RBAC (§6)

Bonds: `FINANCE` = RW, `PM` = RW, `EXECUTIVE` = R, `TENANT_ADMIN` = FULL.

### Events (§15/§16)

`BondIssued`, `BondReleased`, `BondCalled`, `BondExpiring` (drives the expiry alert).

### UX (§20)

- `/finance/bonds` — bond register (type, bank, amount, expiry, status) + expiry alerts.

## Consequences

### Positive

- Bonds tie into Contract and Tender/Bid, so guarantee obligations are visible against the work they secure.
- Expiry alerts prevent lapses (a real contractual risk on government jobs).

### Negative / open

- Bank-side integration (electronic LG issuance) is out of scope; bonds are recorded, not issued by COS.

### Neutral

- **Remains post-MVP.**

## References

- ADR-057 (gap) · ADR-062 (Tender/Bid — bid bond link) · §11 `finance.Contract` · §19 Notification service

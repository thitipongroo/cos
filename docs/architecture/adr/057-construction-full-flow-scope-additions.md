# 57. Construction full-flow scope additions (8 post-MVP capabilities + client contract signing in MVP)

Date: 2026-07-20

## Status

Accepted

## Context

A scope-boundary review (recorded in `docs/research/back-office-boundary.md`) mapped how far COS reaches
across a construction company's full flow and where it stops. Beyond the deliberately-external Accounting
and HR/Payroll back-office, the review identified capabilities that are **genuinely absent from the entire
specification set** (verified by `grep`, not inferred) and that a complete construction company flow needs.

The product owner reviewed the findings (2026-07-20) and decided to bring these gaps **into the spec** so
they are tracked rather than silently missing. Each item below was confirmed absent — this ADR records the
decision to add them and at what altitude, so no downstream reader treats them as already designed.

**Distinction preserved:** the `Contract` entity (`main_contract`/`subcontract`/`supply_agreement`), its
`status` (`draft → signed → active → terminated`), the `ContractSigned` event (§16.2), retention and
billing milestones **already exist** (`11-database-schema`). What is missing for client contracts is the
actual **signing mechanism** — the `signed` status is presently a manual flag with no e-signature, no
contract-document generation, and no signing workflow.

## Decision

Add the following nine capabilities to the spec. **Eight are documented post-MVP at capability level**
(internal design — schema, API, RBAC, events, UX — is defined when each item's phase begins, per the
`§20.7.12c` convention). **One (client contract signing) is placed in MVP.**

### Post-MVP — documented future scope (capability-level; internals deferred to phase start)

| #   | Capability                                              | What it adds                                                                       | Confirmed current state                                                           |
| --- | ------------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 1   | Variation Order / Change Order / Claims                 | Manage approved changes to contract scope/price, linked to Contract + BOQ + budget | Contract entity exists; **no VO/claims workflow** (grep-negative)                 |
| 2   | Inventory / Warehouse (WMS)                             | Stock movement, GRN vs PO delivery, multi-warehouse, material valuation            | material consumption + `reorder_level` exist; **no WMS**                          |
| 3   | ราคากลาง (Comptroller-General central pricing)          | Reference-price source feeding BOQ line items                                      | **not in spec**                                                                   |
| 4   | e-GP (Electronic Government Procurement) integration    | Public-tender data / bidding for government work                                   | **not in spec**                                                                   |
| 5   | Bank guarantees / bonds                                 | Bid / performance / retention / advance bonds, linked to Contract + e-GP           | **not in spec**                                                                   |
| 6   | Building permit & license management                    | Track construction permits/licences by status & expiry                             | **not in spec**                                                                   |
| 7   | Project risk register                                   | Structured project risk log (distinct from AI delay-risk forecasting)              | only AI delay-risk exists; **no register**                                        |
| 8   | Site instruction / meeting minutes / correspondence log | Document-control records                                                           | RFI exists as a `Task` (`work_type: rfi`); **no site-instruction/minutes module** |

### MVP — client contract signing

Client contract signing (e-signature workflow) is placed in **MVP**. It adds the actual signing capability
on top of the existing Contract entity + `signed` status. The **signing mechanism is a pending pre-build
design decision** and is NOT decided here — options to be resolved before the build phase include:

- Build vs integrate a third-party e-signature provider (and which one).
- Signed-document generation and storage (where the signed PDF lives; retention).
- Signatory identity & verification (reuse Path A/B auth vs external signer identity).
- Signing workflow states layered onto `draft → signed → active` (who signs, order, timestamp, audit).

Until that decision, the `signed` status remains a manual flag; this ADR only fixes the **scope decision**
(it is MVP), not the mechanism.

## Consequences

### Positive

- The gaps are now tracked in the authoritative scope file (`21-mvp-scope`) instead of being invisible.
- Capability-level entries avoid inventing schema/API that the product owner has not designed — no guessing.
- ราคากลาง and e-GP are recorded, aligning the spec with the `docs/research/` disruption/competitive analyses
  that flagged them as Thai-market differentiators.

### Negative / open

- **Nine follow-up design decisions remain** (one per post-MVP item at phase start; the e-signature mechanism
  before the MVP contract-signing build). None may be stubbed without a product-owner decision (Rule 38).
- Deep propagation (`10`/`11`/`06`/`14`/`15`/`16`/`20`) for each item is intentionally deferred — a later
  increment per item.

### Neutral

- The `§13.1` Layer classification and existing Contract model are **not** overridden; these are additive.

## References

- `docs/research/back-office-boundary.md` — scope-boundary map + gap analysis (§4, §5)
- `docs/specifications/21-mvp-scope.md` — §21.2 (Included / Excluded, updated by this ADR)
- `docs/specifications/11-database-schema.md` — Contract entity + status (existing)
- `docs/specifications/16-enterprise-event-flow.md` §16.2 — `ContractSigned` event (existing)
- `docs/specifications/20-ux-flow.md` §20.7.12c — capability-level-until-phase-start convention
- ADR-030 (Vendor Portal MVP) — precedent for a product-owner scope decision recorded as an ADR

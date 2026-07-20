# 59. Variation Order / Change Order / Claims (post-MVP, Finance service)

Date: 2026-07-20

## Status

Accepted

## Context

ADR-057 recorded Variation Order / Change Order / Claims as a genuine gap (the `Contract` entity exists
but there is no change-management workflow) and placed it **post-MVP, capability-level**. The product owner
subsequently requested the full design (deep-propagation). This ADR fixes the design; the feature remains
**post-MVP** (defined in the spec, not built in the MVP phase plan).

Product-owner decisions (2026-07-20):

- **Host:** Finance service (`finance` schema), alongside `Contract` (ADR-024).
- **On approval, auto-adjust:** `Contract.contract_value` + `project_budgets.allocated_amount` **and**
  create BOQ delta lines.
- **Approval workflow:** reuse the AR-billing chain — `PROJECT_MANAGER` up to their approval limit,
  `EXECUTIVE` above (precedent ADR-024).
- **Claims:** a **separate entity** that, when accepted, **converts to a Variation Order** (distinct
  lifecycle: a claim is a request; a VO is an approved change).

## Decision

### Data model (§11, `finance` schema)

**`VariationOrder`**

- `vo_id` (UUID PK), `tenant_id`, `contract_id` (FK → Contract), `project_id`
- `vo_number`, `title`, `description`
- `vo_value` DECIMAL(19,4) — signed change to the contract (+ addition / − omission), `currency_code`
- `status` ENUM (`DRAFT` → `SUBMITTED` → `APPROVED` / `REJECTED`)
- `source_claim_id` (nullable FK → Claim — set when the VO originated from an accepted claim)
- `approved_by`, `approved_at`, `created_by`, `created_at`

**`Claim`**

- `claim_id` (UUID PK), `tenant_id`, `contract_id` (FK), `project_id`
- `claim_type` ENUM (`TIME` / `COST` / `BOTH`), `description`
- `claimed_amount` DECIMAL(19,4) nullable, `claimed_days` INT nullable
- `status` ENUM (`SUBMITTED` → `UNDER_REVIEW` → `ACCEPTED` / `REJECTED`)
- `converted_vo_id` (nullable FK → VariationOrder — set on ACCEPTED)
- `created_by`, `created_at`

**BOQ delta:** `boq_items` gains `variation_order_id` (nullable FK → VariationOrder). A VO's approved
changes are recorded as additive/negative BOQ lines tagged with `variation_order_id`, so the BOQ reflects
the post-change scope while preserving the original baseline.

### Auto-adjust on `APPROVED` (financial precision spec applies)

When a VO transitions to `APPROVED`:

1. `Contract.contract_value += vo_value`
2. `project_budgets.allocated_amount += vo_value` (a budget adjustment transaction records the delta)
3. BOQ delta lines (tagged `variation_order_id`) are created

All three in one transaction; emit `VariationOrderApproved`.

### API (§14, `/api/v1/finance`)

- `POST /contracts/{id}/variations` — create VO (DRAFT)
- `GET /variations` — list (tenant-wide; `?contract_id=` / `?project_id=`)
- `PATCH /variations/{id}/submit` — DRAFT → SUBMITTED
- `PATCH /variations/{id}/approve` — SUBMITTED → APPROVED (AR chain: PM ≤ limit, Executive above) → auto-adjust
- `PATCH /variations/{id}/reject` — SUBMITTED → REJECTED
- `POST /claims` — create claim · `GET /claims` — list
- `PATCH /claims/{id}/accept` — ACCEPTED → convert to VO (sets `converted_vo_id`)
- `PATCH /claims/{id}/reject`

### RBAC (§6)

- Variation Orders / Claims: create + submit = `PROJECT_MANAGER` (RW); approve = `PROJECT_MANAGER`
  (≤ limit) + `EXECUTIVE` (A) + `TENANT_ADMIN` (FULL); `FINANCE` = R.
- Approval-limit semantics identical to Client Billing (§6 notes, ADR-024).

### Events (§15/§16)

- `VariationOrderSubmitted`, `VariationOrderApproved` (drives the auto-adjust), `ClaimSubmitted`,
  `ClaimAccepted` (drives the claim→VO conversion).

### UX (§20)

- `/finance/contracts/{id}/variations` — VO list/detail + submit/approve
- `/finance/claims` — claim list/detail + accept/reject

## Consequences

### Positive

- Change management is integrated with Contract + budget + BOQ, not a side spreadsheet.
- Reuses the existing AR approval-limit machinery — no new approval primitive.

### Negative / open

- BOQ baseline-vs-current reporting (original vs post-VO) is a follow-up UX/report concern.
- Multi-currency VO on a differently-denominated contract follows the §13.3 conversion rule; edge cases
  are a build detail.

### Neutral

- **Remains post-MVP** — defined here, scheduled to its phase later; not added to the MVP phase plan.

## References

- ADR-057 (gap recorded, post-MVP) · ADR-024 (AR approval chain reused; Contract in `finance`)
- `docs/specifications/11-database-schema.md` (Contract, project_budgets, boq_items)
- `docs/specifications/14-api-architecture.md` §14 · `06-rbac-permission-matrix.md` §6 · `16-enterprise-event-flow.md`

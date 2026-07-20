# 64. Building permit & license management — post-MVP (extend Permit entity)

Date: 2026-07-20

## Status

Accepted

## Context

ADR-057 recorded building-permit & license management as a post-MVP gap. §11 already has a `Permit` entity,
but its `permit_type` covers **site/safety** permits only (`work_permit` / `safety_permit` /
`drawing_approval` / `entry_permit`) — not government building permits or company licences. The product
owner requested the full design; it remains **post-MVP**.

Product-owner decisions (2026-07-20):

- **Model:** Extend the existing `Permit` entity (reuse `permit_number` / `issued_by` / `valid_until` /
  `status`) rather than a new entity.
- **Scope:** Building/construction permit (อ.1 / อ.6) + company licence (contractor registration/grade).
- **Expiry alerts:** Yes — via the Notification service (like bonds).
- **Ownership:** PM + Tenant Admin.

## Decision

### Data model (§11 — extend `Permit`)

- `permit_type` gains `building_permit` and `license` (existing `work_permit` / `safety_permit` /
  `drawing_approval` / `entry_permit` unchanged).
- Add `issuing_authority` (nullable — e.g. local municipality / กรมโยธาธิการ for building permits; the
  licensing body for company licences).
- `project_id` becomes nullable (a company licence is tenant-level, not project-scoped).
- Existing `permit_number`, `issued_by`, `valid_from`, `valid_until`, `status`
  (`pending` / `active` / `expired` / `revoked`) are reused as-is.

### Behaviour

- A scheduled check emits `PermitExpiring` before `valid_until` → Notification service (§19) alerts
  PM / Tenant Admin (same pattern as `BondExpiring`, ADR-063).

### API (§14)

- `GET /api/v1/permits` (list; `?type` / `?project_id` / `?status`)
- `POST /api/v1/permits` (record a permit/licence)
- `PATCH /api/v1/permits/{id}/status` (active / expired / revoked)

### RBAC (§6)

Permits & licences: `PM` = RW, `TENANT_ADMIN` = FULL, other roles = R (Safety already reads work permits).

### Events (§15/§16)

`PermitRecorded`, `PermitExpiring` (drives the expiry alert).

### UX (§20)

- `/compliance/permits` — permit & licence register (type, authority, number, validity, status) + expiry
  alerts. Building permit (project-scoped) and company licence (tenant-level) both appear here.

## Consequences

### Positive

- Reuses the existing `Permit` structure — minimal new schema; site and regulatory permits share one register.
- Expiry alerts prevent an expired building permit / licence from silently lapsing.

### Negative / open

- No e-submission to the permitting authority (records only) — an integration is a future option.

### Neutral

- **Remains post-MVP.**

## References

- ADR-057 (gap) · §11 existing `Permit` entity · §19 Notification service · ADR-063 (expiry-alert pattern)

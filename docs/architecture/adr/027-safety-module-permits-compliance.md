# 27. Safety module — incidents, permit approval, compliance, and completion gate #5

Date: 2026-06-19

## Status

Accepted

## Context

§20.7.7 (Safety Officer) needs incidents, work-permit approval, safety checklists, and a
compliance view. §14 lists `POST /safety/incidents`, `PATCH /safety/incidents/{id}/acknowledge`,
and `GET`/`POST /safety/checklists`. §11 defines the `Safety — Incidents` and `Permit` entities;
§15.5 defines the permit approval chain; §21.2 scopes incidents / checklists / work permits /
permit approval as MVP. master Phase 6 lists **seven** task completion gates and two budget
warnings, of which Increment 9 implemented only gates 1–4 (a reading gap).

Several details were unspecified or conflicting:

- The `Permit` status enum (`pending/active/expired/revoked`, §11) has **no intermediate state**
  for the two-step SAFETY_PERMIT chain (§15.5: SE → Safety Officer → PM final).
- Checklists were implemented under `/site/checklists` in Increment 9, but §14 places them under
  `/safety/checklists`.
- §21.2 marks AI-based compliance detection (from video/photo) as post-MVP, leaving the basic
  compliance status / violation view without a defined backend.

## Decision

**1. A dedicated `safety` module** owns incidents, permits, and compliance, and re-routes
checklists. It imports `SiteOpsModule` and delegates `GET /safety/checklists` →
`SiteOpsService.listChecklists` and `POST /safety/checklists` (submit a completed checklist) →
`SiteOpsService.submitInspection` (a completed checklist is recorded as an inspection).
`GET /site/checklists` (Increment 9) is removed; the web `useChecklists` hook moves to
`/safety/checklists`.

**2. Permit approval (§15.5) within the §11 status enum.** `PENDING → ACTIVE` on approval;
`PENDING → REVOKED` on rejection. For `SAFETY_PERMIT`, activation requires a `PROJECT_MANAGER` /
`TENANT_ADMIN` approver (PM is final); other permit types activate on a `SAFETY_OFFICER` approval.
The intermediate "Safety-Officer-approved, awaiting PM" state is not modelled (no enum value);
if the product owner needs an explicit two-step audit trail it supersedes this.

**3. Compliance is MVP (deterministic).** `GET /safety/compliance` returns a deterministic summary
derived from existing data — open incidents (and HIGH/CRITICAL), expired and revoked permits. §21.2
is updated to move the compliance **view** into MVP; **AI-based** compliance detection from
video/photo remains the post-MVP enhancement.

**4. Completion gate set completed (gates 5–7 + warnings 8–9).** Increment 9's task gate is
extended to the full master Phase 6 set: gate 5 (open HIGH/CRITICAL incident linked to the task),
gate 6 (task not BLOCKED), gate 7 (linked BOQ item's PO has a delivery not in PENDING), and the
budget warnings 8 (≥85% ORANGE) and 9 (≥100% RED — requires `acknowledge_budget_overrun: true`).
Warnings return `200` with a `warnings[]` array; gate 9 without acknowledgement is a hard block.

## Consequences

- Safety Officer pages (`/safety/incidents`, `/safety/permits`, `/safety/checklists`,
  `/safety/compliance`) have working backends; §14, §21.2, master, and the OpenAPI specs are updated.
- The task completion gate now reflects all seven hard blocks; gates 7–9 query procurement
  (PO deliveries) and BOQ/finance (budget vs actual) cross-module.
- `permits` and `incidents` live in `site_ops`; the safety module reads/writes them there.

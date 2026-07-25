# ADR-070: Project phases (`projects.project_phases`, execution-stage tracking)

**Date:** 2026-07-25
**Status:** Accepted
**Deciders:** Product Owner, Platform Engineering
**Tags:** data, mobile, bim

---

## Context

The SITE_ENGINEER dashboard mockup shows a **phase card** ("Phase 2: Structural") — where the project
is in its construction sequence. No such data existed: `projects.projects` carries only a coarse
lifecycle `status` (`DRAFT` / `ACTIVE` / `ON_HOLD` / `COMPLETED` / `CANCELLED`), and `projects.tasks`
carries `work_type` (a task _category_: `construction` / `rfi` / `administrative` — §11), not an
execution phase. The card was therefore deliberately omitted (PO decision 2026-07-16) as unbacked.

The PO asked to research how world-class construction platforms model this before choosing a model.

## What the industry does (research, 2026-07-25)

- **WBS (Work Breakdown Structure)** is the universal backbone (Procore, Autodesk Construction Cloud,
  Oracle Primavera P6): a project decomposes into **phases → work packages → tasks**. A "phase" is a
  top-level WBS node.
- **"Which phase now" is _derived_ from the schedule**, not stored as a hand-maintained flag — controls
  tools compute the current phase from activity status/dates against the WBS. This matches how COS
  already derives Earned-Schedule progress (`percentComplete`, `spi`) from tasks + BOQ (§32.12).
- Two distinct concepts exist in the field: a coarse **project stage** (Pre-construction → Construction
  → Closeout — COS's `status` already covers this) and a granular **construction phase** (Foundation →
  Structural → MEP → Finishes → Handover — the mockup's card). This ADR addresses the latter.

## Decision

Add a first-class, per-project **`projects.project_phases`** entity: an ordered list of named phases
(`seq`, `name`, `status`, planned/actual dates) per project. The dashboard's **current phase** is
_derived_ (never a stored `is_current` flag, which would go stale):

> **current phase** = the lowest-`seq` phase whose status is `IN_PROGRESS`; if none is `IN_PROGRESS`,
> the lowest-`seq` phase that is not `COMPLETED` (the next phase due to start); if every phase is
> `COMPLETED` or there are no phases, there is **no** current phase (`null`).

`status` is one of `NOT_STARTED` / `IN_PROGRESS` / `COMPLETED` (CHECK-constrained). Uniqueness of
ordering is enforced by `uq_project_phases_seq (tenant_id, project_id, seq)`.

## Rationale

- **Why a first-class entity (not a `phase` column on tasks):** §13.4 already names project phases as
  the output of BIM Structure Import — `IfcBuildingStorey → project phases`, returning `phasesCreated`.
  An entity is the shape that importer produces, so when BIM import ships (it is currently a fail-fast
  stub, §32.9) it **populates this table with zero rework**. Tagging tasks with a phase code would not
  match `phasesCreated` and would require every task to be classified.
- **Why derive the current phase, not store it:** the industry norm, and it cannot drift from the phase
  statuses. The derivation is a pure function, unit-tested to 100%.
- **Why `name` is free-form (not a fixed taxonomy):** no phase taxonomy is specified anywhere in the
  specs, and the BIM source (`IfcBuildingStorey` names) is itself free-form. A hard-coded enum would be
  an invention; free-form text lets the PM (or BIM import) supply real names.
- **Why `status` is stored, not rolled up from tasks:** tasks are not linked to phases (no `phase_id`),
  so there is nothing to roll up today. A future `tasks.phase_id` + rollup is noted as follow-up; until
  then the phase status is set explicitly (by the PM via the write API, by BIM, or by seed).

## Consequences

### Positive

- The dashboard shows a real, named current phase; the omitted mockup card is now backed by data.
- BIM Structure Import (§13.4) has a table to write into — the phase model and its importer agree.

### Negative

- For a non-BIM tenant, phases must be entered (write API now; a PM web screen is follow-up). A project
  with no phase rows shows no phase card (rendered as absent, never as a wrong value — §32.12).

### Neutral

- Multiple phases may be `IN_PROGRESS` at once (construction phases legitimately overlap); the current
  phase is simply the lowest-`seq` such phase. No single-active-phase constraint is imposed.

## References

- `docs/specifications/13-product-architecture.md` §13.4 (BIM `IfcBuildingStorey → project phases`)
- `docs/specifications/11-database-schema.md` (Project Phase), `10-construction-ontology.md` §10.2
- QM-9 (backward-compatible migration — new table only), QM-4 (schema-qualified SQL), QM-1 (100% cover)
- Research: Procore (WBS / project phases), Oracle Primavera P6 (WBS + Earned Value); PO decision 2026-07-25

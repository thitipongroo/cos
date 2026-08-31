# 25. Site-ops canonical `/site/*` paths and inspection approval transitions

Date: 2026-06-19

## Status

Accepted

## Context

The Site Engineer web client (§20.7.5) needs `/site/reports`, `/site/issues`,
`/site/inspections`, and `/site/conflicts`. Two gaps surfaced while wiring it:

1. **Path drift.** §14 Site APIs document `/api/v1/site/reports`, `/api/v1/site/inspections`,
   but the implemented controller served `/api/v1/site-reports`, `/api/v1/issues`,
   `/api/v1/inspections`, `/api/v1/conflict-records` (no `site/` group), and §14 did not list
   issues or conflict-records at all. The existing web (`queries.ts`) already called the flat
   paths.
2. **Inspections were write-only.** Only `POST /inspections` (submit) existed. §20.7.5 requires
   an inspection **results** view plus **approval / re-inspection**. §11/Phase 6 define the
   `inspections` table with `status ENUM('PENDING','PASSED','FAILED','REQUIRES_REINSPECTION')`
   and §06 grants Inspections/QC **RW** to PM, Site Engineer, Safety Officer (Executive R), but
   the status-transition graph for "approval" is not spelled out.

## Decision

**1. Canonical `/api/v1/site/*` paths (reconcile to §14).** All site-ops routes are served under
`site/*`: `site/reports`, `site/reports/{id}`, `site/reports/sync`, `site/reports/{id}/materials`,
`site/issues`, `site/issues/{id}`, `site/inspections`, `site/conflict-records`. §14 Site APIs is
updated to match and extended with the previously-undocumented issues, conflict-records,
inspection list/detail/update, materials, and sync endpoints. The web client and integration
tests are updated to the new paths in the same change.

**2. Inspection results + approval/re-inspection.** Add:

- `GET /api/v1/site/inspections` — list results (filter `project_id`, `status`, paginated).
- `GET /api/v1/site/inspections/{id}` — detail.
- `PATCH /api/v1/site/inspections/{id}` — update `status` (+ optional `notes`).

**Transition graph (design — spec gives states + RBAC but not the graph):** a non-terminal
inspection (`PENDING`, `FAILED`, or `REQUIRES_REINSPECTION`) may move to `PASSED` (approve),
`FAILED`, or `REQUIRES_REINSPECTION` (request re-inspection). `PASSED` is **terminal** — a
`PATCH` on a `PASSED` inspection returns `422` (re-inspection requires a new inspection record).
Moving to `PASSED` emits `site.inspection.passed.v1`; moving to `FAILED` emits
`site.inspection.failed.v1` (reusing the existing Phase 6 events). RBAC: read =
EXECUTIVE/PM/SITE-ENGINEER/SAFETY_OFFICER/TENANT-ADMIN; write (PATCH) =
PM/SITE-ENGINEER/SAFETY_OFFICER/TENANT-ADMIN (§06 "Inspections / QC" RW).

## Consequences

- One canonical convention for site-ops paths; §14 is now complete for the module.
- Breaking path change is contained: controller, `site-ops.integration.spec.ts`, and
  `apps/web/src/lib/api/queries.ts` are migrated together; no external consumers exist yet (pre-release).
- The inspection approval graph is a documented design choice, not a spec mandate; if the product
  owner later defines a stricter QC workflow (e.g. a distinct APPROVED state or approver ≠
  submitter rule), it supersedes this ADR.

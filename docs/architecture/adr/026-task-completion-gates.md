# 26. Task completion gates and the BOQ-dependency interpretation

Date: 2026-06-19

## Status

Accepted

## Context

§11 defines the `Tasks` entity and §14 the `/api/v1/projects/{project_id}/tasks` endpoints, but
neither was implemented. master Phase 6 defines a **completion gate**: a task may transition to
`COMPLETED` only when four hard-block gates pass, else `HTTP 422` with code `COS-TASK-001` and the
list of blocking gate names:

1. **Inspections** — no linked inspection with status `FAILED` / `REQUIRES_REINSPECTION`.
2. **Issues** — no linked issue with `issue_type IN (DEFECT, REWORK, PUNCH)` and `status = OPEN`.
3. **Dependencies** — all predecessor tasks are `COMPLETED`.
4. **Permit** — no linked permit with status `EXPIRED` / `REVOKED`.

Three facts forced design decisions:

- The existing `site_ops.issues` and `site_ops.inspections` tables had **no `task_id`** (and
  issues had no `issue_type`), so gates 1–2 could not be evaluated.
- There was **no `permits` table** (gate 4).
- master describes gate 3 as "predecessor tasks derived from BOQ parent-child hierarchy
  (`boq_item_id` parent → child)", but **`boq.boq_items` has no item-level parent** — the only
  parent-child hierarchy in the schema is **category-level** (`boq.boq_categories.parent_category_id`).

## Decision

**1. Schema.** Create `projects.tasks` (§11) and `site_ops.permits` (§11). Add a nullable
`task_id` to `site_ops.inspections` and to `site_ops.issues`, plus `issue_type`
(`DEFECT/REWORK/PUNCH/GENERAL`, §11) to issues. All gates are now evaluable; nothing is deferred.

**2. Gate 3 dependency model (interpretation).** Since BOQ items have no item-level parent, a
task's **predecessors are the tasks whose BOQ item sits in the _parent BOQ category_** of the
completing task's BOQ item's category. The gate fails if any such predecessor task is not
`COMPLETED`. A task with no `boq_item_id` has no BOQ-derived predecessors (gate 3 passes). This is
the documented interpretation of master's "BOQ parent-child hierarchy"; if the product owner later
introduces explicit task dependencies (e.g. a `task_dependencies` table), it supersedes this.

**3. Endpoints.** `GET` / `POST /api/v1/projects/{projectId}/tasks` (§14) plus
`PATCH /api/v1/tasks/{taskId}` (progress / status; master Phase 6). The gate runs only on a
transition to `COMPLETED`.

**4. Permits scope.** Only the `permits` table + the gate-4 query are built here. The full permit
lifecycle / approval UI (§20.7.7 Safety Officer) is a later workstream that builds on this table.

## Consequences

- `/tasks` (Site Worker §20.7.6) and the completion gate are live; `COS-TASK-001` returns the
  failing gate names so the client can show actionable blockers.
- Gate 3 is bounded by BOQ category structure, not arbitrary task graphs; adequate for MVP.
- `permits` exists ahead of the Safety module; that module will add permit CRUD / approval.

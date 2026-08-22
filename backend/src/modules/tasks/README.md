# tasks

NestJS module for project tasks and the server-side task completion gates.

## Purpose

Owns task CRUD and the authoritative completion gate evaluated on
`PATCH /api/v1/tasks/:id { status: 'completed' }`. Seven hard-block gates and two budget warnings are
defined in Phase 6 — this module implements exactly those, nothing more. Gates are server-side only;
they are **not** enforced offline. Source: `00_master` §Phase 6 Task Completion Gates.

## Public API

```text
GET   /api/v1/projects/:projectId/tasks   — list tasks for a project
POST  /api/v1/projects/:projectId/tasks   — create task
PATCH /api/v1/tasks/:taskId               — update task (including status transitions)
```

## Dependencies

- `@cos/rbac` — role guards
- `@cos/types` — shared enums (task status, issue type, severity)
- `@cos/logger` — structured logging
- `TenantPrismaService` — tenant-scoped access (RLS enforced)
- Reads across site-ops (inspections, issues, safety incidents), procurement (deliveries),
  BOQ (parent/child hierarchy, budget) and safety (permits) to evaluate the gates

## Configuration

No module-specific environment variables. Uses the shared `DATABASE_URL` (PgBouncer).

## Usage

```typescript
// Completing a task evaluates all gates; a hard-block failure returns 422
PATCH /api/v1/tasks/<taskId>
{ "status": "completed" }

// Budget at or above 100% requires explicit PM acknowledgement
PATCH /api/v1/tasks/<taskId>
{ "status": "completed", "acknowledge_budget_overrun": true }
```

## Notes

Hard blocks — any failure returns HTTP `422` with error code `COS-TASK-001` and the blocking gate
names:

1. **Inspections** — no linked inspection with `result = FAIL` or `status = REQUIRES_REINSPECTION`
2. **Issues** — no linked open issue of type `DEFECT` / `REWORK` / `PUNCH`
3. **Dependencies** — all BOQ-derived predecessor tasks are `COMPLETED`
4. **Permit** — no linked permit `EXPIRED` / `REVOKED`
5. **Safety** — no linked open incident with severity `HIGH` / `CRITICAL`
6. **Delay** — task is not `BLOCKED` (set by `construction.delay.detected.v1`)
7. **Material** — the linked BOQ item's PO has at least one non-`PENDING` delivery

Warn only (HTTP `200` with `warnings[]`):

8. Budget 85–99% of the BOQ item → `ORANGE`
9. Budget ≥ 100% → `RED`, requires `acknowledge_budget_overrun: true`

- Offline conflict strategy for `progress_percent` is **MAX_WINS** — higher value wins, resolved
  silently with no `ConflictRecord` (progress is monotonic).
- Tasks reference `floor_id` / `room_id` (nullable) for room assignment — mirrored as `LOCATED_IN`
  in the knowledge graph.
- Test design: `docs/specifications/35-test-design.md` §35.10.6.

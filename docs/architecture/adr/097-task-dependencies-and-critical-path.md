# ADR-097: Task-to-task dependencies and the critical-path engine

**Date:** 2026-09-04
**Status:** Accepted
**Deciders:** Product Owner
**Tags:** architecture | data

---

## Context

The EXECUTIVE mockup `mockup/mobile/08_executive/02_tasks/02_ex_tasks` draws a **Critical Path**
section. Nothing in this platform could produce one, for two separate reasons.

**There is no task-to-task dependency edge.** `10-construction-ontology.md:117` and
`12-construction-knowledge-graph.md:120` both define `DEPENDS_ON` as a Task → Task N:M relationship,
but a search of `backend/src`, `services/` and `apps/` for that name returns nothing. The
relationship is specified and unimplemented.

**What exists instead is an inference from the BOQ hierarchy.** Completion gate 3 — "all predecessor
tasks have status = completed" (`11-database-schema.md:428`) — is implemented in
`backend/src/modules/tasks/tasks.repository.ts` as `countIncompletePredecessors`, and ADR-026
records why: master described gate 3 as deriving predecessors from a BOQ item parent→child
hierarchy, `boq.boq_items` has no item-level parent, and the only parent-child hierarchy in the
schema is category-level. So the gate treats _every task whose BOQ item sits in the parent category_
as a predecessor.

That inference is serviceable as a completion gate and useless as a schedule network. It has no
direction between two specific tasks, no dependency type, and no lag, so a forward/backward pass
over it computes nothing meaningful. A critical path needs the real edge.

## Decision

**Add `projects.task_dependencies`** — an explicit Task → Task edge carrying
`dependency_type` (`FS` / `SS` / `FF` / `SF`) and `lag_days`, tenant-scoped and RLS-protected like
every other domain table.

**Compute the critical path from that table only.** Forward pass for earliest start/finish, backward
pass for latest start/finish, total float per task; the critical path is the set of tasks with zero
float. Durations come from `planned_start` / `planned_end` on `projects.tasks`.

**Completion gate 3 is not changed.** `countIncompletePredecessors` keeps the ADR-026 category-level
derivation, unmodified. The two mechanisms coexist: ADR-026 gates completion, this table describes
the schedule.

**Cycles are rejected at write time**, with `COS-TASK-003`. A cyclic dependency graph has no
critical path, and the failure must surface where the edge is created rather than where a report is
requested.

## Rationale

The product owner considered three treatments of gate 3 on 2026-09-04 and chose the first:

| Option                                                          | Why it was or was not taken                                                                                                                                             |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Chosen** — gate 3 keeps ADR-026; the new table feeds CPM only | No behaviour change to a hard block that is live today. The two mechanisms are documented rather than silently merged.                                                  |
| Gate 3 switches to the explicit table                           | One mechanism, but every task without an explicit predecessor row stops being gated the day it ships — a hard block weakening without any signal.                       |
| Gate 3 checks both                                              | Strictest, and wrong in a way that is hard to see: a task would acquire predecessors it never had, from a category rule never designed to combine with an explicit one. |

Unifying the two is real future work and is named here so it is not rediscovered as a defect. It
needs the explicit edges to exist for enough projects that switching the gate does not weaken it,
which is a data-migration question, not a code one.

**The edge is relational, not graph-first.** §12 puts `DEPENDS_ON` in the Neo4j knowledge graph, and
the graph module's README states the rule this follows: _"PostgreSQL remains the source of truth; the
graph is derived and eventually consistent"_, written exclusively by `services/kg-ingestion-worker`
from Kafka. A schedule network that gates and reports must be read from the source of truth, not
from a derived store that may lag.

**No `DEPENDS_ON` edge is emitted to Neo4j in this change.** The edge is unimplemented in the
ingestion worker today, so not emitting it leaves the knowledge graph exactly as it already is. This
is a deferral with a known shape, not an omission: when the worker gains the relationship, its source
is `projects.task_dependencies`.

## Consequences

### Positive

- The critical path is computed from a real schedule network rather than inferred from cost
  breakdown structure.
- `DEPENDS_ON` acquires a relational home, so §10 and §12 stop describing a relationship that exists
  nowhere.
- Cycle rejection at write time means a malformed network cannot be created, rather than being
  discovered when a report fails.

### Negative

- Two dependency mechanisms now exist. A reader of `countIncompletePredecessors` must be told that
  the explicit table is not what gates completion — the comment there says so, and so does this ADR.
- Dependencies must be authored. Until rows exist for a project its critical path is empty, which is
  a correct answer and an unhelpful screen.

### Neutral

- `dependency_type` supports all four PDM relationships from the first migration. Only `FS` is
  exercised by the seeded data; the others cost nothing to carry, and adding them later would rewrite
  every row.
- `lag_days` is signed. A negative value is a lead, which is ordinary in construction scheduling.

## References

- `docs/specifications/10-construction-ontology.md` §Relationships — `DEPENDS_ON`, Task → Task, N:M
- `docs/specifications/11-database-schema.md` — Tasks entity and the seven completion gates
- `docs/specifications/12-construction-knowledge-graph.md` — `Task DEPENDS_ON Task`
- `docs/architecture/adr/026-task-completion-gates.md`
- `backend/src/modules/graph/README.md` — the graph is derived; PostgreSQL is the source of truth

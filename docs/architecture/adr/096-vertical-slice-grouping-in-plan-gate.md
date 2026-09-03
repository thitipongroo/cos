# ADR-096: Rule 38 task lists are grouped into vertical slices before implementation

**Date:** 2026-09-03
**Status:** Proposed
**Deciders:** Product Owner (pending)
**Tags:** architecture | process

---

## Context

Rule 38 requires one `TodoWrite` task per line item of the spec's Generate / Deliverables /
Constraints section, read line by line, presented to the product owner, and approved before the
first line of code. That requirement is what makes the obligation list exhaustive, and it is not in
question here.

But a Generate list is written **by artefact**, because that is how a specification is organised. A
Phase file lists the Prisma models, then the DTOs, then the controllers, then the screens. Taking one
task per line therefore produces a horizontal plan by construction:

```text
Task 1  every Prisma model in this Phase
Task 2  every DTO
Task 3  every controller
Task 4  every screen
```

Three consequences follow, and all three have a cost this repository already pays:

1. **Nothing is verifiable until late.** Rule 36 wants filesystem evidence per item, and it gets it —
   the model exists, the file is on disk. What no task produces until the last one is a path a user
   can walk, so the first genuine end-to-end signal arrives after the plan is nearly spent.
2. **A red run cannot be attributed.** Four artefact-shaped tasks land four broad changes. When the
   suite goes red at task 3, the cause is somewhere in the union of tasks 1–3.
3. **Integration risk is deferred to the end**, which is the opposite of where it belongs. If the
   Kafka contract between two modules is wrong, that is discovered after both were built against it.

The `incremental-implementation` and `planning-and-task-breakdown` skills in
[`addyosmani/agent-skills`](https://github.com/addyosmani/agent-skills) name this directly: build one
complete path through the stack per slice, so each increment leaves the system working and testable.
That is incompatible with a task list derived one-per-spec-line — not because either is wrong, but
because they are answers to different questions. The spec line list answers _what are we obliged to
build_. The slice list answers _in what order does it become provable_.

## Decision

**Keep Rule 38 exactly as written. Add one step to `/plan-gate`, after extraction and before
presentation.**

`/plan-gate` continues to extract one item per spec line, tag each `READY` or
`NEEDS_ESCALATION: <reason>`, and lose nothing. It then presents `.claude/impl-pending.md` in two
sections rather than one:

**Section A — Obligations (unchanged).** Every spec line item, in spec order, tagged. This is the
list Rule 38 requires, the list the product owner approves, and the list `/verify` checks against.
Nothing is merged, dropped, or reworded.

**Section B — Build order.** The same items, grouped into vertical slices. Each slice names the
obligation IDs it contains and the one thing that becomes provable when it lands:

```text
Slice 1  user can create an equipment record
         obligations: A3 (Prisma model) · A7 (DTO) · A11 (controller) · A19 (screen)
         provable when done: POST /api/v1/equipment returns 201 and the row is visible in the UI

Slice 2  user can list and filter equipment
         obligations: A12 · A20 · A24
         provable when done: the list screen renders a filtered page from the API
```

Rules for Section B:

- Every obligation in Section A appears in exactly one slice. An obligation that fits nowhere is a
  finding about the extraction, not licence to drop it
- A slice that cannot state what becomes provable is not a slice — it is a group of files
- `NEEDS_ESCALATION` items are listed in the slice they block, and the slice does not start
- Slices are ordered by dependency, with the riskiest first where dependencies allow

`/verify` remains driven by Section A. Slices decide **order**; obligations decide **completeness**.
The two lists are never allowed to diverge, because Section B is generated from Section A rather than
written beside it.

## Rationale

**Why not change Rule 38.** The one-item-per-line requirement is what stops obligations being merged
away, and the failure it was written against — a subagent summarising a spec and dropping the line
that read differently from its neighbours — is recorded in `CLAUDE.md`. Grouping _for order_ while
keeping the list _for completeness_ takes the benefit without touching the guarantee.

**Why not slice at extraction time.** Slicing during extraction is exactly the summarisation Rule 38
forbids: the moment you are deciding what belongs together, you are no longer reading line by line.
The two operations must stay in that order.

**Why in `/plan-gate` and not in a skill.** A skill nothing invokes changes nothing. The plan gate is
the one place every multi-step deliverable already passes through, and the product owner is already
reading its output — so the build order arrives where the decision about it is being made.

**Alternatives considered.**

- _Leave it alone._ Rejected: the three costs above are real and recurring, and the fix is one
  presentation step.
- _Replace the per-line list with a slice list._ Rejected: gives up the completeness guarantee to buy
  ordering, which is the wrong trade.
- _A separate `/slices` command after approval._ Rejected: the build order is part of what the
  product owner should be approving, not something derived after approval.

## Consequences

### Positive

- The first end-to-end signal arrives at slice 1 instead of near the end of the plan
- A red run is attributable to one slice
- Integration risk surfaces first where the slice order puts it there deliberately
- The product owner sees, and can challenge, the build order — not only the obligation list

### Negative

- `/plan-gate` output is longer, and the grouping step costs a few minutes per plan
- Grouping is a judgement call; a bad grouping produces slices that are not independently provable,
  which is a new way for a plan to be wrong

### Neutral

- Rule 38, Rule 36, `rule-38-check-approval.sh` and `/verify` are untouched
- `.claude/impl-pending.md` gains a section; its existing section keeps its shape, so the hook that
  watches the file needs no change

## References

- `context.md` §GLOBAL EXECUTION RULES — Rule 38, Rule 36
- `CLAUDE.md` §Two gates that can never be skipped
- `.claude/commands/plan-gate.md`, `.claude/commands/verify.md`
- `.claude/skills/spec-reading/SKILL.md`
- `addyosmani/agent-skills` — `incremental-implementation`, `planning-and-task-breakdown`

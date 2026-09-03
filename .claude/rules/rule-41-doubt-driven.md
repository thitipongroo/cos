---
paths:
  - "backend/prisma/migrations/**"
  - "backend/prisma/rollbacks/**"
  - "backend/src/shared/guards/**"
  - "backend/src/shared/middleware/**"
  - "backend/src/shared/scheduling/**"
  - "backend/src/modules/identity/**"
  - "backend/src/modules/finance/**"
  - "backend/src/modules/sync/**"
  - "packages/@cos/kafka/**"
  - "packages/@cos/rbac/**"
  - "**/*.avsc"
---

# Rule 41 — Adversarial review of a non-trivial decision, in flight

Indexed in: `context.md` §GLOBAL EXECUTION RULES

Rule 38 gates the plan. Rule 36 gates the claim of completion. Between them there is no gate at all,
and that is where the expensive mistakes are made: a decision taken with confidence, carried forward
on the strength of that confidence, and discovered at Rule 36 when the cheap moment to change it has
passed.

Rule 41 closes that middle. Before a **non-trivial decision** stands, it is reviewed by a
fresh-context reviewer prompted to **disprove it**, not to approve it. Run `/doubt`.

## What counts as non-trivial

A decision is non-trivial when **any one** of these is true:

- It asserts a property no compiler and no type can check — idempotence, ordering, thread safety, an
  invariant across two writes, "this is safe under retry"
- It crosses a module boundary, or moves data between a module and Kafka
- Its blast radius is irreversible on its own: a migration, a Kafka contract, an RLS policy, a
  permission check, anything touching money
- Its correctness depends on context a future reader cannot see from the diff

Everything else is out of scope. A rename, a formatting pass, a one-line fix with obvious
correctness, or following an unambiguous instruction does not trigger this rule. Doubting every
keystroke ships nothing.

## What the rule requires

1. Name the claim in two or three lines, and why it matters — this is yours, not the reviewer's
2. Extract the smallest reviewable artefact plus the contract it must satisfy
3. Send **artefact + contract only** to a fresh-context reviewer, with an adversarial prompt. The
   claim is withheld: handing a reviewer your conclusion buys agreement, not review
4. Classify every finding against the artefact text yourself — contract misread, actionable,
   accepted trade-off, or noise — in that precedence order
5. Stop at trivial findings, at three cycles, or when the product owner says ship

`/doubt` performs all five and writes nothing.

## Where this sits against the other gates

| Gate    | When                          | Who decides                | Artefact                              |
| ------- | ----------------------------- | -------------------------- | ------------------------------------- |
| Rule 38 | before the first line of code | **product owner** (human)  | `.claude/impl-pending.md`             |
| Rule 41 | while the decision is cheap   | you, on reviewer findings  | the classification in the transcript  |
| Rule 36 | before saying it is done      | you, on command output     | `ls` / `grep` / `cat` per obligation  |

Rule 41 is **not** a human gate. It does not replace Rule 38 and cannot satisfy it. A decision that
passes `/doubt` still needs product owner approval to become code, and still needs Rule 36 evidence
to be called done.

## Doubt theater — the checkable failure

Across two or more cycles where the reviewer surfaced substantive findings, **zero** findings were
classified as actionable. That is validation wearing the shape of review. Stop and escalate rather
than run a third cycle.

## Not a persona skill

`/doubt` runs from the main session. Do not add `doubt-review` to the routing table of
`engineering-agent`, `qa-agent`, `devops-agent` or `doc-agent`: a persona that follows step 3 spawns
another persona, which `agent-team/PATTERNS.md` forbids and which Claude Code blocks anyway. If you
reach this rule from inside a subagent, say so and hand the decision back to the main session.

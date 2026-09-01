---
name: engineering-refactoring
description: Restructure existing code without changing what it does — extract, rename, deduplicate, simplify. Use when code is hard to follow or repeated, and behaviour must stay identical.
allowed-tools:
  - "Read"
  - "Glob"
  - "Grep"
  - "Edit"
  - "Bash"
---

# Refactoring

Refactoring changes structure and nothing else. If behaviour changes, it is not a
refactor — it is a change, and it needs its own review.

## The rule that makes it safe

**Tests pass before, and the same tests pass after.** If there are no tests over
the code you are about to restructure, write them first, against current
behaviour — including the behaviour you suspect is wrong. Fixing that is a
separate step.

## What to do

- **Extract** a named function when a block needs a comment to explain it
- **Rename** when a name lies about what it holds
- **Deduplicate** only when the copies are the same thing, not merely similar.
  Two functions that look alike but change for different reasons should stay apart
- **Delete** dead code rather than reorganising it

## What not to do

- Do not bundle a bug fix into a refactor. Reviewers cannot separate them, and a
  bisect cannot either
- Do not widen scope to files the task did not touch
- Do not introduce an abstraction for a second case; wait for the third

## Before reporting

Show the test run, before and after. State what moved and what its new name is,
so a reader can follow the change without diffing every file.

## This project has not decided it

No Quality Mandate and no Rule in `context.md` covers refactoring — checked against `context.md` and `context/00_master_construction_os.md`. The method above is the only written guidance in this repository.

Two consequences. Follow it rather than improvising, since nothing else is written down. And if you settle a number, a threshold or a procedure while doing the work, record it in `context.md` under a Quality Mandate or a Rule — not here. A decision left in a skill file is invisible to Phase 19, to the hooks, and to anyone reading the mandates.

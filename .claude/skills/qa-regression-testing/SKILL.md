---
name: qa-regression-testing
description: Verify that what worked before still works after a change. Use before a release, after a merge, and whenever a fixed defect needs to stay fixed.
allowed-tools:
  - "Read"
  - "Glob"
  - "Grep"
  - "Write"
  - "Bash"
---

# Regression Testing

The suite exists so that a change to one thing cannot silently break another.
Its value is entirely in being run and being trusted.

## What belongs in it

- Every defect that has been fixed, as a test that fails on the old code
- The paths that must never break, whatever else changes
- The behaviour a contract promises - API shapes, event schemas, stored formats

## Keeping it useful

- **Add a test with every fix**, in the same change. A defect fixed without a
  test is a defect that returns
- **Prune deliberately.** A test for behaviour that was intentionally removed is
  noise; delete it and say so in the change
- **Keep it fast enough to run every time.** A suite that only runs nightly
  catches regressions a day late, when the cause is buried

## Selecting what to run

Running everything is the safe default. When that is too slow, select by what the
change touches and its dependents - and say what was skipped. Silent selection is
how a regression reaches production with a green build behind it.

## Reporting

New failures separated from known ones, and each new failure traced to the change
that introduced it. A regression report that does not name the cause has only
moved the work.

## Rules

- Never delete a failing regression test to make a release. That test is the
  release blocking itself, correctly

## This project has not decided it

No Quality Mandate and no Rule in `context.md` covers regression suite policy — checked against `context.md` and `context/00_master_construction_os.md`. The method above is the only written guidance in this repository.

Two consequences. Follow it rather than improvising, since nothing else is written down. And if you settle a number, a threshold or a procedure while doing the work, record it in `context.md` under a Quality Mandate or a Rule — not here. A decision left in a skill file is invisible to Phase 19, to the hooks, and to anyone reading the mandates.

---
name: qa-test-design
description: Decide what to test and at which level before any test is written - the cases, the boundaries, and what is deliberately left uncovered. Use at the start of a feature, or when a suite is large but keeps missing defects.
allowed-tools:
  - "Read"
  - "Glob"
  - "Grep"
  - "Write"
---

# Test Design

Coverage percentage measures which lines ran, not which risks are covered. Design
from the risk.

## Method

1. **List what can go wrong**, not what the code does. Wrong result, wrong
   permission, lost data, duplicated action, stale read
2. **Assign each risk a level.** Logic goes to unit; a seam goes to integration;
   a journey whose failure is unacceptable goes to end-to-end. One risk, one level
3. **Derive cases from the boundaries** - equivalence classes, then the edges of
   each: empty, one, many, maximum, one over, negative, duplicate, out of order
4. **Write down what you are not testing**, and why. An untested area that nobody
   decided to skip is the one that surprises you

## Rules

- **Every case names its risk.** A case that cannot say what it protects against
  is a case that will be deleted during the next cleanup, correctly
- **Push cases down.** A rule tested through the UI is slow and fragile; the same
  rule tested at the unit is fast and precise
- **Do not duplicate a case across levels** unless the levels genuinely fail
  differently

## Output

A table: risk, level, cases, and the explicit not-covered list. That last column
is the one that gets read after an incident.

## This project has not decided it

No Quality Mandate and no Rule in `context.md` covers test design and case selection — checked against `context.md` and
`context/00_master_construction_os.md`. The method above is the only written guidance in this repository.

Two consequences. Follow it rather than improvising, since nothing else is written down. And if you settle a number, a
threshold or a procedure while doing the work, record it in `context.md` under a Quality Mandate or a Rule — not here. A
decision left in a skill file is invisible to Phase 19, to the hooks, and to anyone reading the mandates.

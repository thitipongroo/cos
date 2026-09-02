---
name: qa-test-reporting
description: Turn raw test results into something a team can act on - trends, blockers, risk areas, and what to do next. Use for release readiness, sprint reporting, or when leadership asks whether quality is improving.
allowed-tools:
  - "Read"
  - "Glob"
  - "Grep"
  - "Write"
---

# Test Reporting

The audience decides what a run means. Engineers need the failure; a release
decision needs the risk. Write for the one asking.

## Structure

1. **Verdict first** - ready, ready with named risks, or not ready. One line
2. **Numbers that support it** - passed, failed, skipped, flaky, coverage of the
   areas that changed
3. **Blockers**, each with the impact if shipped anyway
4. **Trend** - better or worse than the last run, and by what
5. **What is not covered** - carried forward from the test design

## Rules

- **Never present a percentage without its denominator.** "94% passing" over an
  unknown suite size says nothing
- **Do not average away a category.** One failing payment test does not become
  noise because 400 others passed
- **Separate new failures from known ones.** A report where both look the same is
  read as noise within two sprints
- **Flaky counts are a headline number**, not a footnote. A suite with rising
  flakes is losing its ability to signal anything

## Rules for the verdict

If a blocker exists, the verdict is not ready - even under schedule pressure. The
report states the risk; the decision to ship anyway belongs to someone else, on
the record.

## This project decides it

The method above is general. Where this repository has already fixed a number, a tool or a procedure, that decision wins
— read it before applying anything here.

- `context.md` PHASE 19 VERIFICATION PROTOCOL
- Rule 36

Phase 19 defines the report format this project uses — Section A auto and manual counts, Section B one line per Quality
Mandate, Section C the adoption gates. Rule 36 is the standard every claim in it has to meet.

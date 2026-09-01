---
name: qa-automation-testing
description: Build and maintain automated test suites that run unattended in CI - selection, structure, stability and speed. Use when deciding what to automate, or when an existing suite is slow, flaky or ignored.
allowed-tools:
  - "Read"
  - "Glob"
  - "Grep"
  - "Write"
  - "Edit"
  - "Bash"
---

# Automation Testing

An automated test earns its place by catching regressions cheaply, forever. One
that flakes, or that nobody trusts, costs more than it saves.

## What to automate

- Runs often, is deterministic, and has a clear pass condition
- Covers a risk that would be expensive to miss
- Is stable enough that a failure means something changed

## What not to automate

- Exploratory work, and judgement about whether something feels right
- A flow still being redesigned - the test will be rewritten before it catches
  anything
- A one-off check, unless writing it is faster than doing it

## Structure

- **Pyramid, not ice cream cone.** Many unit, fewer integration, few end-to-end.
  A suite dominated by UI tests is slow and brittle by construction
- **Independent tests.** No ordering, no shared mutable state, safe in parallel
- **Own the data.** Each test creates and removes what it needs

## Stability

A flaky test is a broken test. Fix the wait, the data setup or the race - or
delete it. Never wrap it in a retry: retries convert a signal into noise and the
suite stops being believed.

## Speed

Track total wall-clock. When a suite gets slow enough to skip, it has already
stopped working, whatever the pass rate says.

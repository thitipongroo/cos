---
name: engineering-e2e-testing
description: Test a complete user journey through the running system, driving the real interface. Use for the few flows whose failure would be unacceptable, not for broad coverage.
allowed-tools:
  - "Read"
  - "Glob"
  - "Grep"
  - "Write"
  - "Edit"
  - "Bash"
---

# End-to-End Testing

E2E tests are the slowest and most brittle tests you own. Keep few, and make each
one earn its place by covering a journey whose failure matters.

## Choosing what to cover

Pick the flows a user cannot work around: sign in, the core transaction, payment,
the irreversible action. Everything else is cheaper to cover lower down.

## Writing one

- Drive the interface the way a person does — through visible affordances, not by
  calling internals
- Select by role and accessible name before falling back to a test id. Never by
  CSS position or generated class
- Wait for a condition, never for a duration. A fixed sleep is a flake with a
  timer on it
- Each test sets up its own data and cleans it up. Tests that depend on each
  other's leftovers fail in isolation and in parallel

## Handling flakiness

A test that fails intermittently is not passing — it is failing slowly. Either
fix the wait, the data setup or the race, or delete the test. Retrying until
green destroys the signal the suite exists to give.

## Before reporting

Paste the run and the duration. Name any test you had to retry, and why.

## This project decides it

The method above is general. Where this repository has already fixed a number, a tool or a procedure, that decision wins
— read it before applying anything here.

- `context.md` QM-1 — Test Coverage
- spec §30.5
- spec §30.7

QM-1 lists the ten web scenarios and three mobile scenarios that must exist, by name. §30.7 records what does not work
for offline simulation in Detox and what to use instead.

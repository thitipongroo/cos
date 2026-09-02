---
name: engineering-unit-testing
description: Write tests for a single unit in isolation — one function, class or module, with its collaborators replaced. Use when adding or changing logic that can be exercised without I/O.
allowed-tools:
  - "Read"
  - "Glob"
  - "Grep"
  - "Write"
  - "Edit"
  - "Bash"
---

# Unit Testing

A unit test proves one unit's logic. If it needs a database, a network or a
clock, it is an integration test — write that instead.

## Before writing

Read the existing tests in the same package. Match their framework, file naming,
assertion style and setup helpers. A test suite with two conventions is harder to
maintain than one with a convention you disagree with.

## What to cover

- The stated behaviour, once per branch
- Boundaries: empty, zero, one, maximum, off-by-one either side
- The error paths — every `throw` and every early return
- Anything the code special-cases. A special case with no test is a guess

## Rules

- **One reason to fail per test.** A test asserting five unrelated things reports
  one failure and hides four
- **No shared mutable state between tests.** Order-dependent suites fail in CI
  and pass locally
- **Assert on values, not on calls**, unless the call *is* the behaviour
- **Fake time and randomness.** A test that depends on the wall clock will fail
  on some Tuesday
- Never assert what the implementation happens to do today when the requirement
  says less. That test blocks the next refactor for no benefit

## Before reporting

Run them. Paste the result, including the count. A test you wrote but did not run
is not a test yet.

## This project decides it

The method above is general. Where this repository has already fixed a number, a tool or a procedure, that decision wins
— read it before applying anything here.

- `context.md` QM-1 — Test Coverage
- Rule 30
- Rule 32
- Rule 35

QM-1 sets the coverage threshold (100% lines and branches), names which suites run serially and why, and records the two
recurring traps: request-scoped services read `req.userId` / `req.tenantId` with a CLS fallback, and the `?? ''` getter
is only covered by invoking it. Rule 30 governs fake timers, Rule 32 the jest config, Rule 35 what every `@cos/*`
package must carry.

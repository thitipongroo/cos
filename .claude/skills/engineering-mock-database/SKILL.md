---
name: engineering-mock-database
description: Substitute the database in tests — with a fake repository, an in-memory engine, or a disposable real instance. Use when tests need data without depending on a shared or slow database.
allowed-tools:
  - "Read"
  - "Glob"
  - "Grep"
  - "Write"
  - "Edit"
  - "Bash"
---

# Mock Database

Three options, and the choice decides what the test can prove.

| Option | Proves | Misses |
|---|---|---|
| Fake repository in code | the caller's logic | everything the database enforces |
| In-memory engine | queries run | dialect differences, real constraints, real plans |
| Disposable real instance | the actual behaviour | costs setup time |

**Prefer a disposable real instance for anything that asserts on SQL, schema,
constraints or transactions.** The other two are for tests about the caller.

## If you fake the repository

- Implement the same interface, including the errors — not-found, conflict,
  constraint violation
- Do not let it accept writes the real schema would reject. A fake that is more
  permissive than the database hides exactly the bug the test should catch

## If you use a real instance

- Migrate it the way production migrates. A hand-built schema proves nothing
  about the migration
- One instance or schema per test run; never a shared long-lived database
- Roll back or truncate between tests, and close every connection at the end

## Rules

- Never point a test at a database anyone else uses
- Seed the minimum each test needs, inside that test. Shared fixtures grow until
  no one knows which test depends on which row

## Before reporting

State which option you used and what that means the test does not cover.

## This project has not decided it

No Quality Mandate and no Rule in `context.md` covers how the database is substituted in tests — checked against
`context.md` and `context/00_master_construction_os.md`. The method above is the only written guidance in this
repository.

Two consequences. Follow it rather than improvising, since nothing else is written down. And if you settle a number, a
threshold or a procedure while doing the work, record it in `context.md` under a Quality Mandate or a Rule — not here. A
decision left in a skill file is invisible to Phase 19, to the hooks, and to anyone reading the mandates.

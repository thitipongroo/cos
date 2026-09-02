---
name: engineering-integration-testing
description: Test units against their real collaborators — a real database, queue, cache or HTTP boundary. Use when the risk is in the seams rather than in the logic.
allowed-tools:
  - "Read"
  - "Glob"
  - "Grep"
  - "Write"
  - "Edit"
  - "Bash"
---

# Integration Testing

These tests exist to catch what mocks hide: schema mismatches, transaction
behaviour, serialization, connection handling, timeouts.

## Scope

Test one seam at a time. "The service plus its database" is an integration test;
"the whole system through the UI" is end-to-end and belongs elsewhere.

## Setup

- Use a real dependency in a disposable instance — a container, a temp schema, an
  in-memory server the production driver also supports
- Never point a test at a shared or long-lived environment. A suite that mutates
  shared state fails for whoever runs it second
- Migrate the schema the same way production does. A hand-built test schema
  proves nothing about the migration

## Teardown

Every test leaves the world as it found it: roll back, truncate, or drop the
instance. Close every connection the test opened — a suite that hangs after the
last assertion is leaking a handle, and `forceExit` hides the leak rather than
fixing it.

## What to assert

The things a unit test cannot see: what was actually persisted, what the query
returns for the edge case, what happens on constraint violation, timeout, and
retry.

## Before reporting

Paste the run, including timing. Integration suites that quietly grow slower stop
being run.

## This project decides it

The method above is general. Where this repository has already fixed a number, a tool or a procedure, that decision wins
— read it before applying anything here.

- `context.md` QM-1 — Test Coverage
- spec §30.4
- Rule 39

QM-1 names the integration runner and the Testcontainers setup. Rule 39 is the reason a suite hangs after the specs
pass: close every long-lived handle, and never use `forceExit` to mask a leak.

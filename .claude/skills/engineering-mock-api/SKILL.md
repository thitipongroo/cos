---
name: engineering-mock-api
description: Stand up a fake HTTP service so callers can be developed and tested without the real one. Use when the upstream is unavailable, rate-limited, expensive, or not yet built.
allowed-tools:
  - "Read"
  - "Glob"
  - "Grep"
  - "Write"
  - "Edit"
  - "Bash"
---

# Mock API

A mock API is only useful while it behaves like the real one. The moment it
drifts, it starts certifying code that will fail in production.

## Build it from the contract

Take the shapes from the actual contract — OpenAPI document, published schema, or
a recorded real response. Never from what the calling code happens to expect;
that makes the mock agree with the bug.

## What it must reproduce

- **Success shapes**, field for field, including nullability and types
- **Error responses** — the status codes and bodies the real service returns,
  not a generic 500
- **Auth behaviour** — reject a missing or wrong credential, as the real one does
- **The unhappy conditions worth testing**: timeout, slow response, rate limit,
  partial page, empty collection

## Rules

- Keep it in the test or dev setup, never reachable from production configuration
- Pin it to a contract version and record which one. An unversioned mock cannot
  be checked for drift
- When the real service changes, the mock is part of that change

## Verify it against reality

Run the same request against both when you can, and diff the shapes. A mock that
has never been compared to the real service is an assumption with a port number.

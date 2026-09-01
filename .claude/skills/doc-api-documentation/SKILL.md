---
name: doc-api-documentation
description: Document an HTTP or library API so a caller can use it without reading the source - endpoints, parameters, responses, errors and auth. Use when shipping an API surface or when integrators keep asking the same questions.
allowed-tools:
  - "Read"
  - "Glob"
  - "Grep"
  - "Write"
  - "Edit"
---

# API Documentation

Documentation is read by someone stuck. Write for that person: what to send, what
comes back, and what to do when it fails.

## Per endpoint

- **What it does**, in one sentence, in terms of the caller's goal
- **Auth** required, and what happens without it
- **Parameters** - name, type, required or not, constraints, and the default.
  A default that is undocumented is a support ticket
- **Request example** that can be pasted and run
- **Response example** for success, with every field explained. Include the
  nullable ones - those are what break clients
- **Errors** - every status this endpoint returns, the condition that produces
  it, and what the caller should do about it
- **Limits** - rate limit, page size, maximum payload

## Rules

- **Generate from the source of truth** where one exists - schema, types,
  annotations. Hand-written docs drift within one release
- **Every example must run.** Copy them out and execute them before publishing
- **Document the actual behaviour**, not the intended behaviour. If they differ,
  that is a defect to raise, not a wording problem to smooth over
- **Version everything.** State which version the page describes, and keep the
  previous one reachable while it is still supported

## Before publishing

Run each example. Check every field in the response example exists in a real
response. List which endpoints are undocumented rather than leaving the gap silent.

## This project decides it

The method above is general. Where this repository has already fixed a number, a tool or a procedure, that decision wins — read it before applying anything here.

- `context.md` QM-2 — API Versioning
- QM-11 — Documentation Standards
- spec §14.3

QM-2 fixes the file convention — one OpenAPI document per service at `docs/api/{service}.openapi.yaml`, generated rather than written, with CI failing when it is stale. QM-11 requires the error codes registry to be updated alongside.

---
name: devops-logging
description: Decide what to log, in what shape, and for how long - so an incident can be reconstructed without guessing. Use when adding a service, or when logs exist but never answer the question.
allowed-tools:
  - "Read"
  - "Glob"
  - "Grep"
  - "Write"
  - "Edit"
---

# Logging

Logs are written once and read under pressure. Optimise for the second.

## Shape

Structured, one object per event, with the fields consistent across services:
timestamp, level, message, correlation id, and the identifiers needed to find
related events. Free-text logs cannot be filtered, and filtering is the entire
point during an incident.

## Levels, used honestly

| Level | For |
|---|---|
| ERROR | something failed and needs a human |
| WARN | recovered, but someone should know |
| INFO | a business event worth reconstructing later |
| DEBUG | development only |

Everything at INFO is the same as nothing at INFO.

## Correlation

Every log line carries the id that ties it to the request or job. Without it, a
distributed system produces a pile of lines nobody can assemble into a story.

## Rules

- **Never log a secret, a token, a password or a full payment detail.** Assume
  every log is readable by more people than you expect
- **Never log personal data** beyond the identifiers you need. Mask the rest
- **Log the decision, not the noise.** "Charged, declined by issuer" is useful;
  "entering function" is not
- **Log the error with its cause**, not a message that discards the original
- **Set retention deliberately**, and know what it costs. Logs kept forever are a
  liability; logs kept two days are useless in an incident found on Monday

## This project decides it

The method above is general. Where this repository has already fixed a number, a tool or a procedure, that decision wins — read it before applying anything here.

- `context.md` QM-8 — Observability Standards
- QM-5 — Data Privacy & Compliance

QM-8 fixes the JSON log shape field by field and forbids `console.log` — use `@cos/logger`. Loki is the log store, with 30 days hot and a 7-year compliance archive. QM-5 is why no PII may appear in a log line.

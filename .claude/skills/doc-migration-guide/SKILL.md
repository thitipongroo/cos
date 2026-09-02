---
name: doc-migration-guide
description: Write instructions for moving from one version, system or approach to another - the steps, the order, and the way back. Use for a breaking change, a platform move, or a deprecation with a deadline.
allowed-tools:
  - "Read"
  - "Glob"
  - "Grep"
  - "Write"
  - "Bash"
---

# Migration Guide

The reader has something that works and is being asked to change it. Earn that by
being precise about effort, order and risk.

## Open with

- **What is changing**, and why it cannot stay as it is
- **Who is affected** - and, just as important, who is not
- **The effort**, honestly estimated. An underestimate here is discovered at 2am
- **The deadline**, if the old path is going away

## The steps

- Numbered, in the only order that works, with prerequisites stated up front
- **Before and after** for each change, so the reader can pattern-match
- **A checkpoint** after each step: how to confirm it worked before continuing
- **Rollback** for each step, or a clear statement of where rollback stops being
  possible. That point must be named explicitly

## Rules

- **Test the guide by following it** on a real project that has not migrated.
  Guides written from the change author's memory always skip a step
- **Cover the awkward cases** the migration script does not handle - that is
  precisely where readers get stuck and give up
- **Do not require a big-bang cutover** where an incremental path exists. Say how
  to run both during transition
- **State what cannot be migrated**, if anything, rather than letting it be
  discovered

## Close with

Where to get help, and how to report a case the guide does not cover.

## This project decides it

The method above is general. Where this repository has already fixed a number, a tool or a procedure, that decision wins
— read it before applying anything here.

- `context.md` QM-2 — API Versioning
- QM-9 — Backward Compatibility

QM-2 fixes the deprecation terms: an old version stays functional for at least 12 months, tenants are told by email and
in-app banner at least 90 days before sunset, and the sunset date is recorded in `docs/api/deprecation-schedule.md`.
QM-9 holds the three-step column rename and the rollback script requirement.

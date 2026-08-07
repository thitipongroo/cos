---
title: Construction OS — Developer Manual
last_updated: 2026-08-07
---

# Construction OS — Developer Manual

How to run, build, test and extend the platform. Written for someone with commit access on day one.

> **What this manual is not.** It does not restate architecture decisions — those live in
> [`docs/specifications/`](../specifications/README.md) (source of truth) and
> [`context/00_master_construction_os.md`](../../context/00_master_construction_os.md) (compiled
> execution view). Where this manual states a version or a command, it was read from the repository
> at the date above; where it states a rule, it cites the spec that owns it. If the two disagree, the
> spec wins and this page is the bug.

| Page                                       | Covers                                                                                |
| ------------------------------------------ | ------------------------------------------------------------------------------------- |
| [getting-started.md](getting-started.md)   | Prerequisites, first `pnpm install`, infrastructure up, migrate, seed, run            |
| [tech-stack.md](tech-stack.md)             | Runtimes, datastores, and which spec section owns each version                        |
| [api-reference.md](api-reference.md)       | Endpoint conventions, auth, errors, rate limits, and where the OpenAPI contracts live |
| [kafka-events.md](kafka-events.md)         | Event envelope, topic naming, outbox, schema registry, DLQ, and the typed SDK         |
| [mobile.md](mobile.md)                     | Why `apps/mobile` is a separate workspace, offline storage, running and capturing it  |
| [ci-cd.md](ci-cd.md)                       | The GitHub Actions jobs, what gates a merge, and ArgoCD's role                        |
| [extension-points.md](extension-points.md) | The Integration Stub Pattern (§32.9) and where each extension point is resolved       |

## The two rules that gate everything

Both live in [`context.md`](../../context.md) and are repeated in `CLAUDE.md` because they are the
ones most often skipped:

- **Rule 38 — before the first line of code.** Read the spec's Generate / Deliverables / Constraints
  section line by line, turn each line item into a task tagged `READY` or `NEEDS_ESCALATION`, and get
  product-owner approval on that list before implementing. A `NEEDS_ESCALATION` item is never stubbed
  or skipped unilaterally.
- **Rule 36 — before claiming anything done.** Re-read the spec section line by line and produce
  `ls`/`grep`/`cat` evidence for **each** item. "I verified X" is not "everything is complete".

## Quality mandates you will hit immediately

| Mandate   | What it means in practice                                                                          |
| --------- | -------------------------------------------------------------------------------------------------- |
| **QM-1**  | 100% line **and** branch coverage on new modules. Tests ship in the same PR, never as a follow-up. |
| **QM-2**  | Every endpoint under `/api/v1/`. Breaking change → new version, old one lives ≥ 12 months.         |
| **QM-3**  | Zero hardcoded user-facing strings — everything through i18n keys.                                 |
| **QM-4**  | No secrets in code or git. RLS on every domain table. Security headers on every response.          |
| **QM-10** | Errors are `COS-{DOMAIN}-{NNN}` with `traceId`; never `200` with an error body.                    |
| **QM-18** | Connect through PgBouncer, never PostgreSQL `5432`. Close every long-lived handle on shutdown.     |

The full list is in [`context.md`](../../context.md) § QUALITY MANDATES.

> 📎 [Documentation index](../README.md) · [Architecture + ADRs](../architecture/README.md) ·
> [API contracts](../api/README.md) · [Runbooks](../runbooks/README.md)

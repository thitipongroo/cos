---
title: 'Construction OS — Technical Design'
version: '0.1.0'
status: Draft
last_updated: '2026-08-21'
authors:
  - thitipongroo
related_docs:
  - ../specifications/README.md
  - ../architecture/README.md
  - ../../context/00_master_construction_os.md
---

# Construction OS — Technical Design

Per-phase technical design for Phase 1–25, compiled from `docs/specifications/` and
`context/00_master_construction_os.md`.

> **Authority.** `docs/specifications/` is the source of truth for every architecture decision, and
> `32-implementation-specifications.md` wins within that set (§32 authority note).
> `context/00_master_construction_os.md` is the compiled execution view of those decisions.
> **This folder decides nothing.** Where a page here disagrees with a spec, the spec wins and the page
> is the bug. Every statement below cites the section that establishes it; anything with no source is
> recorded in that phase's § 14 Open Questions instead of being written as fact.
>
> **Not the UX design brief.** `DESIGN.md` at the repository root is the design brief for screens,
> tokens and visual rules. This folder is the engineering counterpart and never restates it.

---

## What each page contains

Every `phase-NN-*.md` page uses the same fourteen sections, in this order. A section with nothing
authoritative behind it says so — it is never filled with inference.

| §   | Section                        | Sourced from                                                                                        |
| --- | ------------------------------ | --------------------------------------------------------------------------------------------------- |
| 1   | Overview & goals               | `00_master` § Phase Register + the phase command                                                    |
| 2   | Scope (in / out)               | phase command + `21-mvp-scope`                                                                      |
| 3   | Architecture                   | `architecture/README.md` C4 views + `03-system-design` §3.2 + `architecture/service-interaction.md` |
| 4   | Data model                     | phase command entities + `11-database-schema` + `backend/prisma/`                                   |
| 5   | API contract                   | phase command APIs + `14-api-architecture` + `docs/api/*.openapi.yaml`                              |
| 6   | Events                         | `32-implementation-specifications` §32.4 + `packages/@cos/shared/src/avro/`                         |
| 7   | Sequence / flows               | flows the specs describe end to end — anything partial is marked, not completed by inference        |
| 8   | Failure modes & rollback       | QM-9 / QM-12 / QM-16 / QM-17 + the phase's own retry, DLQ and compensation mechanisms               |
| 9   | Security                       | `05-security-compliance` + `06-rbac-permission-matrix` + `07-multi-tenant-architecture` §7.7        |
| 10  | Observability                  | `31-monitoring-observability` + `00_master` § Phase 15 metric and alert list                        |
| 11  | Testing & acceptance           | `30-testing-strategy` + QM-1 + the phase's `Generate:` list                                         |
| 12  | Implementation status          | `ls` / `grep` against this repository (Rule 36) — evidence, not recollection                        |
| 13  | Dependencies & risks           | pointer to `00_master` § Phase Dependency Graph and § Risk Register                                 |
| 14  | Open questions / NOT SPECIFIED | anything the specs do not settle, tagged and left open                                              |

**Sections 2, 13 point rather than restate.** `00_master` § Phase Template states the rule this
follows: non-functional targets "are **inherited** from the specs — phases reference them, never
restate the numbers". Copying an effort estimate or an SLO figure into 26 more files creates 26 more
places for it to go stale.

---

## Phase index

Stage mapping is from `32-implementation-specifications` §32.1 (SaaS Maturity Model). Build order is
from `00_master` § FINAL EXECUTION ORDER, which is why the numbering below is not sequential.

| Phase | Page                                                       | Stage | Page status |
| ----- | ---------------------------------------------------------- | ----- | ----------- |
| 1     | [Foundation Repository](phase-01-foundation-repository.md) | 1     | Drafted     |
| 2     | [Auth + Tenant System](phase-02-auth-tenant-system.md)     | 1     | Drafted     |
| 8     | [Event Infrastructure](phase-08-event-infrastructure.md)   | 3\*   | Drafted     |
| 3     | Project Service                                            | 2     | Not written |
| 4     | BOQ Service                                                | 2     | Not written |
| 5     | Procurement Service                                        | 2     | Not written |
| 6     | Site Operations                                            | 2     | Not written |
| 7     | Finance Service                                            | 2     | Not written |
| 9     | File + Document System                                     | 3     | Not written |
| 20    | Notification Service                                       | 3     | Not written |
| 21    | Equipment Service                                          | 3     | Not written |
| 22    | Workforce Service                                          | 3     | Not written |
| 25    | Enterprise Provisioning                                    | 3     | Not written |
| 10    | Mobile Offline Engine                                      | 3     | Not written |
| 11    | AI Foundation                                              | 3     | Not written |
| 12    | AI Report Assistant                                        | 3     | Not written |
| 13    | Knowledge Graph                                            | 3     | Not written |
| 14    | Analytics + Dashboard                                      | 3     | Not written |
| 15    | Observability                                              | —     | Not written |
| 16    | Security                                                   | —     | Not written |
| 17    | DevOps + Deployment                                        | 4     | Not written |
| 18    | Testing                                                    | —     | Not written |
| 19    | Final Production Readiness                                 | —     | Not written |
| 23    | MLOps Pipeline                                             | 5     | Not written |
| 24    | Digital Twin                                               | 5     | Not written |

\* Phase 8 is classified Stage 3 by capability but is a **build-order prerequisite for Phase 3–7**;
§32.1 states this exception explicitly. Phases 15, 16, 18 and 19 carry no stage in the §32.1 table.

---

## Cross-cutting design

Facts that hold for every phase. Each phase page assumes these and does not repeat them.

### Architecture

The application layer is a **modular monolith** (NestJS), not microservices
(`03-system-design` §3.1 architecture note). Thirteen deployables are listed in
`32-implementation-specifications` §32.2, which is the **canonical runtime table** — every other
runtime table in the repository is a mirror of it, and `scripts/readiness/check-service-runtimes.sh`
fails CI on a mismatch against the build files actually present under `services/`.

A module leaves the monolith only when **both** §32.2 extraction conditions hold: a dedicated team
owns it, and it has independent scaling pressure with production evidence.

Communication rules (§32.2): module-to-module is NestJS dependency injection — never HTTP or gRPC
inside the monolith; async is Kafka; the main app reaches the File Service and the AI services over
REST; write paths to the Go workers go through Kafka, and read paths query each store directly.

C4 views live in [`architecture/README.md`](../architecture/README.md) and are the only diagram
source — `03-system-design` §3.4 requires that diagram sources live in `architecture/`. Each phase
page names which containers and modules it touches and links there rather than redrawing them.

### Tenant isolation

Shared DB + `tenant_id` + PostgreSQL RLS is the MVP baseline and the standard for all domain modules
(`07-multi-tenant-architecture` §7.1). Dedicated DB per tenant is activated on contract for
Enterprise via `platform.tenants.dedicated_db_url`, and `platform.*` never moves off the shared DB
(§7.1 platform schema isolation rule).

Every domain table carries `tenant_id UUID NOT NULL` and exactly one `AS PERMISSIVE` RLS policy named
`rls_tenant_isolation`, with both `ENABLE` and `FORCE ROW LEVEL SECURITY` (§7.7). All SQL is
schema-qualified; unqualified table names are prohibited (§7.1).

Tenant context is resolved **during JWT authentication**, not in pre-auth middleware — NestJS runs
middleware before guards, so middleware cannot read `req.user` (§7.1 routing mechanism, ADR-031).
`JwtAuthGuard` publishes the context into CLS, which is authoritative under Fastify because the
request is cloned; `TenantContextInterceptor` projects onto `req.*` as a secondary path.

### Events

The Base Event Envelope is defined in `32-implementation-specifications` §32.4. Event type naming is
`{domain}.{entity}.{action}.v{N}`; Kafka topic names carry a `{tenant_id}.` prefix and are a distinct
namespace from the event type (`15-event-driven-workflow` §15.6, `07-multi-tenant-architecture` §7.3).
Schema Registry subjects use **RecordNameStrategy** — one schema per event shared across tenants —
with `BACKWARD_TRANSITIVE` compatibility (§32.4 Schema Registry Rules).

The envelope field list differs between §32.4, §15.6 and the committed Avro schema. See
[Open questions](#open-questions-register) OQ-2 — it is not resolved here.

### Financial precision

`DECIMAL(19,4)` for money, `VARCHAR(3)` ISO 4217 for currency, `DECIMAL(19,6)` for exchange rates.
`FLOAT`, `DOUBLE` and JavaScript `Number` are prohibited. `decimal.js` (TypeScript) and Python
`decimal` with `ROUND_HALF_UP`. Round only final results, never intermediates
(`32-implementation-specifications` §32.5).

### Security baseline

OAuth2/OIDC via Keycloak; RBAC + ABAC; AES-256 at rest; TLS 1.3 on ingress; immutable audit logging
(`05-security-compliance` §5.2). JWT custom claims are exactly `tenant_id`, `user_id`, `role` — no
other naming variant is authoritative (§5.4.1). Roles are the nine in
`06-rbac-permission-matrix` §6.2 plus three implementation sub-roles in §6.8; `VENDOR_PORTAL` is an
external principal and not a `CosRole` (§6.8b).

Guard placement is fixed by §6.9: vocabulary (`CosRole`, `ROLE_PERMISSIONS`, decorators, metadata
keys) lives in `@cos/rbac`; concrete `CanActivate` guards live in `backend/src/shared/guards/`.

### Observability baseline

Structured JSON logs through `@cos/logger` — never `console.log`; W3C `traceparent` propagated over
HTTP and `trace_id`/`span_id` carried on Kafka headers; metrics and alert rules per
`31-monitoring-observability`. Sampling is decided **only** at the OTel Collector — no SDK may
head-sample, or the "100% of errors" guarantee silently fails (ADR-075, `00_master` § Phase 15).

### Testing baseline

100% line and 100% branch unit coverage for new modules (QM-1, `30-testing-strategy` §30.3);
integration tests on Testcontainers (§30.4); tenant-isolation tests must prove a cross-tenant query
returns zero rows (§30.6); contract tests via Pact (§30.8). Test files ship in the same PR as the
implementation.

---

## Open questions register

Contradictions found in the source material while compiling these pages. **None is resolved here** —
each is recorded, carried into the § 14 of the affected phase page, and left for the product owner.

| ID   | Where                                                                                                      | What                                                                                                                                                                                   | Affects            |
| ---- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| OQ-1 | `03-system-design` §3.2 vs `backend/src/modules/`                                                          | §3.2 names 21 logical services; 23 NestJS modules exist on disk. Four §3.2 services have no module of that name; eight modules are not named in §3.2.                                  | Phase 1, Phase 3–7 |
| OQ-2 | `32-implementation-specifications` §32.4 vs `15-event-driven-workflow` §15.6 vs `base-event-envelope.avsc` | Envelope has 8 fields in §32.4, 10 in §15.6, and 9 in the committed Avro schema (`trace_id` / `span_id` nullable with default `null`).                                                 | Phase 8            |
| OQ-3 | `15-event-driven-workflow` §15.6                                                                           | The section calls the envelope "CloudEvents v1.0-**inspired** … **NOT** a strict CloudEvents-compliant envelope" and, under ECO-001, "**Envelope:** CloudEvents v1.0 (**normative**)". | Phase 8            |
| OQ-4 | `07-multi-tenant-architecture` §7.3                                                                        | "Created on first publish, not at tenant onboarding" (topic provisioning) against "materialised per tenant, created idempotently at tenant onboarding" (creation procedure).           | Phase 8, Phase 25  |

Phase-local questions, raised on the page named and repeated here so the register is complete:

| ID    | Where                                            | What                                                                                                                                                                          | Raised on |
| ----- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| OQ-1a | `packages/@cos/`                                 | `@cos/schemas` and `@cos/ui-logic` exist on disk but are named in no phase `Generate:` list read so far.                                                                      | Phase 1   |
| OQ-5  | root `pnpm-workspace.yaml` comment               | Claims `apps/mobile` hoisting is configured in `apps/mobile/.npmrc` via `--ignore-workspace`; that file and `00_master` both say `nodeLinker` lives in `pnpm-workspace.yaml`. | Phase 1   |
| OQ-6  | `32-implementation-specifications` §32.4         | Of the 27 canonical schema names the migration table requires, 16 exist and 11 have no file; `finance.variance.alert.v1.avsc` kept its legacy name with a `.v1` suffix.       | Phase 8   |
| OQ-7  | QM-9 / §9.7.1 vs `backend/prisma/` and CI        | 5 of 89 migrations have no rollback script; a 6th is misnamed. §9.7.1 claims a CI gate enforces this — no such gate exists, and §30.12's gate table does not list one.        | Phase 2   |
| OQ-8  | `00_master` § PHASE 2 COMMAND vs `schema.prisma` | `users.department` and `UserAdditionalRole` exist on disk; the phase command describes a single `role` per membership and neither field.                                      | Phase 2   |
| OQ-9  | `05-security-compliance` §5.4                    | Unified login **decided** 2026-08-21 (privileged roles stay Path B only); the role↔path binding is still written in 6 files and the spec edit is owed.                        | Phase 2   |
| OQ-10 | ADR-067 vs the checked-in realm + `MFA_ENFORCE`  | MFA is **not enforced** for `TENANT_ADMIN` / `FINANCE`: Layer 1 absent from the realm JSON, Layer 2 defaults off. QM-4 requires it.                                           | Phase 2   |

---

## Maintaining these pages

Rule 37 binds this folder: after changing anything in `docs/specifications/`, grep for the changed
section number, technology name or concept, and update the matching page in the same commit.

```bash
grep -rn "<changed-keyword>" docs/technical-design/ context.md context/00_master_construction_os.md
```

Markdown here is linted — this folder is **not** in `.markdownlintignore`, so pages must satisfy
`.markdownlint.json` (MD013 line length 120, code blocks and tables exempt) and Prettier, both run in
the CI lint job.

---
title: 'Construction OS — Technical Design'
version: '0.1.0'
status: Draft
last_updated: '2026-08-22'
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

| Phase | Page                                                           | Stage | Page status |
| ----- | -------------------------------------------------------------- | ----- | ----------- |
| 1     | [Foundation Repository](phase-01-foundation-repository.md)     | 1     | Drafted     |
| 2     | [Auth + Tenant System](phase-02-auth-tenant-system.md)         | 1     | Drafted     |
| 3     | [Project Service](phase-03-project-service.md)                 | 2     | Drafted     |
| 4     | [BOQ Service](phase-04-boq-service.md)                         | 2     | Drafted     |
| 5     | [Procurement Service](phase-05-procurement-service.md)         | 2     | Drafted     |
| 6     | [Site Operations](phase-06-site-operations.md)                 | 2     | Drafted     |
| 7     | [Finance Service](phase-07-finance-service.md)                 | 2     | Drafted     |
| 8     | [Event Infrastructure](phase-08-event-infrastructure.md)       | 3\*   | Drafted     |
| 9     | [File + Document System](phase-09-file-document-system.md)     | 3     | Drafted     |
| 10    | [Mobile Offline Engine](phase-10-mobile-offline-engine.md)     | 3     | Drafted     |
| 11    | [AI Foundation](phase-11-ai-foundation.md)                     | 3     | Drafted     |
| 12    | [AI Report Assistant](phase-12-ai-report-assistant.md)         | 3     | Drafted     |
| 13    | [Knowledge Graph](phase-13-knowledge-graph.md)                 | 3     | Drafted     |
| 14    | [Analytics + Dashboard](phase-14-analytics-dashboard.md)       | 3     | Drafted     |
| 15    | [Observability](phase-15-observability.md)                     | —     | Drafted     |
| 16    | [Security](phase-16-security.md)                               | —     | Drafted     |
| 17    | [DevOps + Deployment](phase-17-devops-deployment.md)           | 4     | Drafted     |
| 18    | [Testing](phase-18-testing.md)                                 | —     | Drafted     |
| 19    | [Final Production Readiness](phase-19-production-readiness.md) | —     | Drafted     |
| 20    | [Notification Service](phase-20-notification-service.md)       | —     | Drafted     |
| 21    | [Equipment Service](phase-21-equipment-service.md)             | —     | Drafted     |
| 22    | [Workforce Service](phase-22-workforce-service.md)             | —     | Drafted     |
| 23    | [MLOps Pipeline](phase-23-mlops-pipeline.md)                   | 5     | Drafted     |
| 24    | [Digital Twin](phase-24-digital-twin.md)                       | 5     | Drafted     |
| 25    | [Enterprise Provisioning](phase-25-enterprise-provisioning.md) | 3     | Drafted     |
| 3     | Project Service                                                | 2     | Not written |
| 4     | BOQ Service                                                    | 2     | Not written |
| 5     | Procurement Service                                            | 2     | Not written |
| 6     | Site Operations                                                | 2     | Not written |
| 7     | Finance Service                                                | 2     | Not written |
| 9     | File + Document System                                         | 3     | Not written |
| 20    | Notification Service                                           | 3     | Not written |
| 21    | Equipment Service                                              | 3     | Not written |
| 22    | Workforce Service                                              | 3     | Not written |
| 25    | Enterprise Provisioning                                        | 3     | Not written |
| 10    | Mobile Offline Engine                                          | 3     | Not written |
| 11    | AI Foundation                                                  | 3     | Not written |
| 12    | AI Report Assistant                                            | 3     | Not written |
| 13    | Knowledge Graph                                                | 3     | Not written |
| 14    | Analytics + Dashboard                                          | 3     | Not written |
| 15    | Observability                                                  | —     | Not written |
| 16    | Security                                                       | —     | Not written |
| 17    | DevOps + Deployment                                            | 4     | Not written |
| 18    | Testing                                                        | —     | Not written |
| 19    | Final Production Readiness                                     | —     | Not written |
| 23    | MLOps Pipeline                                                 | 5     | Not written |
| 24    | Digital Twin                                                   | 5     | Not written |

**—** = the phase is not mapped to a Stage. `00_master` § Stage map covers Phases 1–2, 3–7,
8–14 + 25, 17 and 23–24 only — Phases 15, 16, 18–22 appear in no Stage.

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

### Record lifecycle — soft delete and PII erasure

`11-database-schema` §11.4 binds every table, so no phase page repeats it. Every record carries
`tenant_id`, `created_by`, `created_at`, `updated_at` and `deleted_at`; project-scoped records add
`project_id`.

**All records soft-delete.** `deleted_at` is set; the row stays. **Hard deletes are not permitted on
production data** — it would break the audit trail, the retention policy (`09-data-architecture`
§9.5) and FK integrity across tenants. Every query filters `WHERE deleted_at IS NULL` unless it is
deliberately reading deleted rows, and `30-testing-strategy` §30.4 makes "GET by id returns 404 for a
soft-deleted record" a required integration test.

**PII-bearing entities also carry `pii_erased_at`** (PDPA §37, GDPR Art. 17). Erasure nullifies the
listed PII fields and stamps the timestamp; it never deletes the row, and it is **independent of**
deletion — the two flags give four lifecycle states (§11.4). The PII fields subject to erasure are
enumerated per entity in §11.4; `Contact.lead_id` is deliberately retained because it is a business
relationship identifier, not PII.

### Workflow execution

Temporal is the workflow engine (`04-tech-stack` §4.4). Two phases put business-critical state
changes inside workflows rather than in a service method: **Phase 5** (the entire RFQ and PO state
machine) and **Phase 9** (retention hard-delete and ZIP extraction). `dataExportWorkflow` (PDPA) is a
third caller.

A workflow only runs when a worker polls its task queue. Five worker files exist — one per workflow
family — and as of 2026-08-22 none of them is launched in any environment; see
[OQ-32](#open-questions-register). Read that before treating any workflow-backed behaviour on a phase
page as operational.

### Data access

Domain tables are **raw SQL migrations reached through `$queryRaw` on `TenantPrismaService`**, not
Prisma models. `backend/prisma/schema.prisma` declares `schemas = ["platform", "files"]` only;
`11-database-schema` §11.6 states the convention ("raw SQL, like the other domain schemas — not
Prisma-modelled"). All 13 domain repositories across `project`, `boq`, `procurement`, `site-ops` and
`finance` follow it. The `files` schema is the single exception, and Phase 9 says why.

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

| ID   | Where                                                                                                      | What                                                                                                                                                                                                | Affects            |
| ---- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| OQ-1 | `03-system-design` §3.2 vs `backend/src/modules/`                                                          | **Closed** — full mapping with sources now in `architecture/README.md` § Level 3, together with the C4 Component view. Forecasting Service turns out to be unbuilt and unspecified beyond its name. | Phase 1, Phase 3–7 |
| OQ-2 | `32-implementation-specifications` §32.4 vs `15-event-driven-workflow` §15.6 vs `base-event-envelope.avsc` | Envelope has 8 fields in §32.4, 10 in §15.6, and 9 in the committed Avro schema (`trace_id` / `span_id` nullable with default `null`).                                                              | Phase 8            |
| OQ-3 | `15-event-driven-workflow` §15.6                                                                           | The section calls the envelope "CloudEvents v1.0-**inspired** … **NOT** a strict CloudEvents-compliant envelope" and, under ECO-001, "**Envelope:** CloudEvents v1.0 (**normative**)".              | Phase 8            |
| OQ-4 | `07-multi-tenant-architecture` §7.3                                                                        | "Created on first publish, not at tenant onboarding" (topic provisioning) against "materialised per tenant, created idempotently at tenant onboarding" (creation procedure).                        | Phase 8, Phase 25  |

Phase-local questions, raised on the page named and repeated here so the register is complete:

| ID    | Where                                                                        | What                                                                                                                                                                                                                                                                                                                                                                     | Raised on                  |
| ----- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------- |
| OQ-1a | `packages/@cos/`                                                             | `@cos/schemas` and `@cos/ui-logic` exist on disk but are named in no phase `Generate:` list read so far.                                                                                                                                                                                                                                                                 | Phase 1                    |
| OQ-5  | root `pnpm-workspace.yaml` comment                                           | Claims `apps/mobile` hoisting is configured in `apps/mobile/.npmrc` via `--ignore-workspace`; that file and `00_master` both say `nodeLinker` lives in `pnpm-workspace.yaml`.                                                                                                                                                                                            | Phase 1                    |
| OQ-6  | `32-implementation-specifications` §32.4                                     | **Closed** — the stale 27-row table is replaced by a verified status; 10 unreferenced rename targets dropped.                                                                                                                                                                                                                                                            | Phase 8                    |
| OQ-16 | §32.4 #16 vs code + 3 documents                                              | `finance.budget.variance_detected.v1` (spec) against `finance.variance.alert.v1` (on the wire). Aligning to the spec is a breaking `.v2`, not a rename.                                                                                                                                                                                                                  | Phase 8                    |
| OQ-18 | `00_master` § PHASE 8 + `15-event-driven-workflow` §15.65 vs ADR-094         | Both specs say the outbox writes in the same transaction as the business row; ADR-094 records that the built system does not, and why. Durability is unaffected; atomicity is not what ships.                                                                                                                                                                            | Phase 8                    |
| OQ-19 | `00_master` § PHASE 3 COMMAND, internally                                    | The `States:` block allows `CANCELLED` only from `DRAFT`/`ACTIVE`/`ON_HOLD`; the `Transition rules:` block in the same code block says `ANY → CANCELLED`.                                                                                                                                                                                                                | Phase 3                    |
| OQ-20 | ADR-065 implementation note + `21-mvp-scope` §21 vs `modules/project/risks/` | Both call the AI-suggested feed and/or the register unbuilt; `RisksConsumer` is built, registered and tested.                                                                                                                                                                                                                                                            | Phase 3                    |
| OQ-21 | `GET /projects/user/:userId`                                                 | On the API surface with OpenAPI docs and a `TENANT_ADMIN` gate, but in no spec, ADR or phase command.                                                                                                                                                                                                                                                                    | Phase 3                    |
| OQ-22 | `indexProject` vs the absence of any reindex path                            | A swallowed OpenSearch write drifts the search index permanently; no backfill job, script or runbook exists.                                                                                                                                                                                                                                                             | Phase 3                    |
| OQ-23 | `00_master` § PHASE 4 calculation rules vs the hierarchy it defines          | The version total sums only items attached directly to root categories, so a BOQ that uses sub-categories under-reports — potentially to zero. Implementation is faithful to the rule as written.                                                                                                                                                                        | Phase 4                    |
| OQ-24 | `copyVersionContents` vs an unconstrained `parent_category_id`               | Copying a version forward reproduces two levels of categories; anything deeper is dropped by an inner join, along with its items. Nothing caps depth at write time.                                                                                                                                                                                                      | Phase 4                    |
| OQ-25 | `workflows/worker.ts` vs every deployment surface                            | The whole RFQ/PO state machine executes in Temporal activities, and nothing in scripts, Compose, Dockerfiles, CI, Helm or §32.2 starts the worker. Workflow tests pass on their own in-process worker.                                                                                                                                                                   | Phase 5                    |
| OQ-26 | `vendor-scoring.ts` vs the spec                                              | The scoring adapter is built, but how `quality` and `price` criterion values are derived from data is defined nowhere. The score endpoint is live.                                                                                                                                                                                                                       | Phase 5                    |
| OQ-27 | `procurement.delivery_items` vs `11-database-schema`                         | The table decides whether a PO line is fulfilled, yet is described only in passing by `17-offline-mobile-sync` §17.4 — no §11 definition, not in the Phase 5 entity list.                                                                                                                                                                                                | Phase 5                    |
| OQ-28 | Phase 6 `LAST_WRITE_WINS` vs an unbounded device clock                       | `client_submitted_at` from the handset is the ordering key; no skew bound is specified anywhere, so a fast clock wins every merge until corrected.                                                                                                                                                                                                                       | Phase 6                    |
| OQ-29 | `site-ops/ep/file-service.stub.ts`                                           | Throws `NotImplementedException`, has zero callers, and promises a Phase 9 activation that never happened — photo linkage went the other way, via `files.stored_files.entity_id`.                                                                                                                                                                                        | Phase 6                    |
| OQ-30 | `procurement.wht_rules` vs `finance.wht_rules`                               | Two WHT rate tables in two schemas; only the finance one is read, while the OpenAPI spec and two code comments name the procurement one as authoritative.                                                                                                                                                                                                                | Phase 5, Phase 7           |
| OQ-31 | Phase 7's Kafka-only rule vs [OQ-18](#open-questions-register)               | A dropped `po.created` silently under-commits a budget, and the no-direct-query rule forbids the reconciliation that would catch it.                                                                                                                                                                                                                                     | Phase 7                    |
| OQ-32 | Every Temporal worker vs every deployment surface                            | Five production workers exist — procurement, enterprise provisioning, PDPA data export, file cleanup, file zip-extraction — and nothing in scripts, images, Compose, CI, Helm or §32.2 launches any of them. Supersedes OQ-25. Three documents assume three different homes for the worker (a `temporal-worker` Deployment, inside `cos-backend`, a standalone process). | Phase 5, Phase 9, Phase 25 |
| OQ-33 | Phase 9 command's ClamAV deferral vs the same command block                  | "Do not implement until spec defines it" contradicts the quarantine bucket, retention, event and recovery path specified a few lines above; antivirus is built and correct.                                                                                                                                                                                              | Phase 9                    |
| OQ-34 | `19-notification-architecture` §19.6 vs the preference filter                | §19.6 says critical safety notifications cannot be disabled; the exemption is applied to quiet hours only, so a user can switch safety incidents off on every channel.                                                                                                                                                                                                   | Phase 20                   |
| OQ-35 | `SafetyViolationDetected` in §19.6 and §16 vs everywhere else                | Named as a critical safety notification in two specs; no canonical name in §32.4, no producer, no consumer.                                                                                                                                                                                                                                                              | Phase 20                   |
| OQ-36 | `32-implementation-specifications` §32.4 #9 vs the emitted payload           | The check-in event carries 3 of 6 specified fields and names one differently; the DTO cannot capture `method` or `location`. The Phase 22 command agrees with the code, so the two authorities disagree.                                                                                                                                                                 | Phase 22                   |
| OQ-37 | `modules/workforce/README.md` vs the tree                                    | Advertises an `EP-DOMAIN-008 BiometricCheckIn` stub that exists nowhere in the repository.                                                                                                                                                                                                                                                                               | Phase 22                   |
| OQ-38 | `17-offline-mobile-sync` §17.2 vs `runPushSync.ts` + the server              | Retry exhaustion for safety incidents, attendance, inspections and material consumption escalates to nobody: `onExhausted` has no provider, and no `platform.sync.exhausted` event, review-queue table or admin endpoint exists.                                                                                                                                         | Phase 10                   |
| OQ-39 | `32-implementation-specifications` §32.7 vs `serwist/[path]/route.ts`        | §32.7's `useNativeEsbuild: false` MUST rests on `esbuild` not being a dependency; it now is, with `allowBuilds` support, and the route deliberately reverses the rule.                                                                                                                                                                                                   | Phase 10                   |
| OQ-40 | `ai-gateway/config/routing.yaml` vs `providers/llm_provider.py`              | The two-tier routing table is loaded by nothing; `MODEL_BY_HINT` is empty, so every hint resolves to the hardcoded `DEFAULT_MODEL = "gpt-4o"` and the FAST tier never activates.                                                                                                                                                                                         | Phase 11                   |
| OQ-41 | Phase 12 hallucination-guard check 2 vs its implementation                   | The mandatory source-attribution check is `confidence != 0`; no output model carries a citation field, so a confident fabrication passes it by construction.                                                                                                                                                                                                             | Phase 12                   |
| OQ-42 | Phase 14 cache invalidation vs its callers                                   | `AnalyticsService.invalidate()` is implemented correctly and wired to no Kafka consumer; the 5-minute TTL is the only staleness bound.                                                                                                                                                                                                                                   | Phase 14                   |
| OQ-43 | `cos-alerts.yml` vs every producer of its Kafka gauges                       | `KafkaDLQNonEmpty` and `KafkaConsumerLagCritical` — both critical, both paging — evaluate on `kafka_dlq_depth` / `kafka_consumer_lag`, which no production code emits. The Go side names the TypeScript side as owner; the TypeScript registrations have no caller.                                                                                                      | Phase 15                   |
| OQ-7  | QM-9 / §9.7.1 vs `backend/prisma/` and CI                                    | **Closed 2026-08-22** — 89/89 migrations paired, the enum rollback verified on a live database, and the CI gate §9.7.1 always claimed now actually exists.                                                                                                                                                                                                               | Phase 2                    |
| OQ-8  | `00_master` § PHASE 2 COMMAND vs `schema.prisma`                             | `users.department` and `UserAdditionalRole` exist on disk; the phase command describes a single `role` per membership and neither field.                                                                                                                                                                                                                                 | Phase 2                    |
| OQ-9  | `05-security-compliance` §5.4                                                | **Closed** — unified login recorded in new §5.4.4; five documents and ADR-017 now reference it. The entry's original claim that §5.4 held the binding was itself wrong.                                                                                                                                                                                                  | Phase 2                    |
| OQ-12 | `11-database-schema` §11.1                                                   | `platform.users` omits `phone_number` and its `keycloak_user_id` note describes pre-F-1 behaviour.                                                                                                                                                                                                                                                                       | Phase 2                    |
| OQ-13 | `14-api-architecture` §14.5                                                  | Table says Path A carries no `azp`; measured value is `azp=cos-backend`.                                                                                                                                                                                                                                                                                                 | Phase 2                    |
| OQ-14 | §5.4.4 vs `POST /api/v1/users`                                               | Nothing provisions one user for both paths, so unified login is policy rather than capability for existing accounts.                                                                                                                                                                                                                                                     | Phase 2                    |
| OQ-15 | `11-database-schema` §11.4 vs §11.1                                          | §11.4's "every record has `created_by` / `deleted_at`, all records soft-delete" contradicts §11.1's platform tables and QM-4's append-only audit log.                                                                                                                                                                                                                    | Phase 2                    |
| OQ-17 | QM-7 vs the OTP login path                                                   | QM-7's "account lockout after 5 failures for 15 minutes" is not implemented on Path A; the only lockout lives in the deprecated TOTP module.                                                                                                                                                                                                                             | Phase 2                    |
| OQ-11 | `OtpService` vs the Path A denial                                            | With privileged roles denied at Keycloak, `OtpService` still sends them an OTP and the failure surfaces as an opaque token-endpoint error. A pre-send decline returning `COS-AUTH-001` is proposed, not built.                                                                                                                                                           | Phase 2                    |
| OQ-10 | ADR-067 realm config + `MFA_ENFORCE`                                         | Layer 1 landed in the realm file 2026-08-22 (verified live; ADR-067's role-based mechanism was proven unusable and replaced). Layer 2 and existing Keycloak instances remain ops actions.                                                                                                                                                                                | Phase 2                    |

---

## Verification basis

Every citation on these pages was checked against the spec file itself, not against a quotation of it
in `00_master` or `context.md`. Read in full as of **2026-08-22**:

| Spec | Lines | Spec | Lines | Spec | Lines |
| ---- | ----- | ---- | ----- | ---- | ----- |
| 03   | 150   | 09   | 439   | 16   | 214   |
| 04   | 207   | 11   | 1,280 | 30   | 600   |
| 05   | 776   | 14   | 692   | 31   | 489   |
| 06   | 402   | 15   | 295   | 32   | 2,054 |
| 07   | 517   |      |       |      |       |

Plus `context.md`, `context/00_master_construction_os.md`, `context/01_build_priority_execution.md`,
`context/02_build_deep_systems.md`, and ADR-014 / 017 / 050 / 067 / 074 / 078.

The pass was worth running: it caught one error on these pages — § 4 of the Phase 2 page said the
`platform` schema holds four tables because the phase command lists four, where `11-database-schema`
§11.1 defines eight — and surfaced OQ-12 through OQ-15, none of which is visible from the compiled
views alone. A page that cites a section nobody opened is a page that repeats whatever the last
summary got wrong.

Specs **not** read in full, because no page cites them yet: 00, 01, 02, 08, 10, 12, 13, 18–29, 33, 34.

**All 25 phase command blocks in `00_master` have now been read line by line** (Rule 38), together with
the specification sections and ADRs each page cites. Specification files consulted beyond the 13 read
in full: `12`, `17` §17.2/§17.4/§17.5, `19`, `22`, `33`, `34`. ADRs consulted: 008, 017, 020, 022, 023,
024, 029, 030, 031, 032, 033, 038, 039, 040, 041, 048, 055, 056, 057, 058, 065, 067, 070, 072, 074,
075, 081, 082, 090, 094.

**Status: all 25 pages drafted.** Every page's § 12 was verified against this working tree on
2026-08-22 by running `ls` / `grep` per Generate item, and no page claims a deliverable it did not
observe.
A phase page that needs one reads it first.

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

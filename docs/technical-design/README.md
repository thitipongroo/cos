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

The envelope is ten fields: seven core, `trace_id`, `span_id` and `payload`. §32.4 listed only eight
until 2026-08-23 — see [OQ-2](#open-questions-register), which also covers why nothing populated the
two trace fields and what that cost.

### Financial precision

`DECIMAL(19,4)` for money, `VARCHAR(3)` ISO 4217 for currency, `DECIMAL(19,6)` for exchange rates.
`FLOAT`, `DOUBLE` and JavaScript `Number` are prohibited. `decimal.js` (TypeScript) and Python
`decimal` with `ROUND_HALF_UP`. Round only final results, never intermediates
(`32-implementation-specifications` §32.5).

### Record lifecycle — soft delete and PII erasure

> **Rewritten 2026-08-23.** This section restated §11.4's universal rule, and §11.4 was wrong — see
> [OQ-15](#open-questions-register). What follows is measured against the live schema instead.

Every domain record carries `tenant_id`, `created_at` and `updated_at`; project-scoped records add
`project_id`. `created_by` is present where the actor is part of the record's meaning — 22 of 271
tables — and absent from join rows like `procurement.delivery_items`.

**Soft delete is opt-in per table, not universal.** Six tables carry `deleted_at`: `crm.leads`,
`crm.contacts`, `crm.opportunities`, `files.files`, `files.photo_annotations` and
`platform.sync_tombstones`. Everything else deletes for real, or never deletes. Two categories must
never soft-delete — `platform.audit_logs`, which QM-4 makes append-only, and rows whose deletion IS
the business fact, where a flag left behind grants access to any reader who forgets to filter. Where
`deleted_at` exists, queries filter `WHERE deleted_at IS NULL` by default.

**PII erasure exists, but not as `pii_erased_at`, and not everywhere.** No table in the database has
that column. What is built is `POST /subject-requests/:id/erase` (`TENANT_ADMIN`, PDPA §33), which
anonymises **in place** and irreversibly — a hard delete would break `crm.contacts.lead_id` out of a
chain Thai accounting law retains for seven years (ADR-090 §5) — with an optional WORM snapshot first
under legal hold.

It reaches four tables: `crm.contacts` (name, email, phone), `crm.leads` (contact_name),
`procurement.vendors`, and — since 2026-08-23 — `workforce.workers` (`full_name`, `contact_phone`),
which §11.4 had listed as "Employee" all along and no code had ever touched. It still does **not**
reach `platform.users`; see [OQ-48](#open-questions-register) for why that half is a decision rather
than an omission.

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

Contradictions found in the source material while compiling these pages. Each is recorded here and
carried into the § 14 of the affected phase page. Entries the product owner has since decided are
marked **Closed** with the date and the evidence; the rest are open and await a decision.

| ID   | Where                                                                                                      | What                                                                                                                                                                                                | Affects            |
| ---- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| OQ-1 | `03-system-design` §3.2 vs `backend/src/modules/`                                                          | **Closed** — full mapping with sources now in `architecture/README.md` § Level 3, together with the C4 Component view. Forecasting Service turns out to be unbuilt and unspecified beyond its name. | Phase 1, Phase 3–7 |
| OQ-2 | `32-implementation-specifications` §32.4 vs `15-event-driven-workflow` §15.6 vs `base-event-envelope.avsc` | **Closed 2026-08-23 — the counts were not three claims about one thing, and the gap behind them was a QM-8 violation.** §15.6's ten and the wire schema agree: every event `.avsc` carries the seven core fields plus `trace_id`, `span_id` and `payload`. `base-event-envelope.avsc`'s nine is the same list without `payload`, which a base record correctly omits. §32.4's eight was simply stale, and is now corrected. **What the discrepancy was hiding:** nothing populated `trace_id`/`span_id` anywhere, and `OutboxPollerService` called `producer.publish(envelope)` with no options — so no `traceparent`, no `trace_id`, no `span_id` header on any backend domain event, which since ADR-094 is all of them. QM-8 requires exactly those headers. `EventOutboxService` now captures the active context at publish time (nulls, not the all-zeros id `getTraceId()` returns when no span is active) and the poller lifts it back into the headers — captured at write time and not at delivery, because the poller runs minutes later in another process under its own span. Nine tests, all proven to fail against the old code. | Phase 8            |
| OQ-3 | `15-event-driven-workflow` §15.6                                                                           | **Closed 2026-08-23 — the schemas settle it.** §15.6's "CloudEvents v1.0-**inspired** … NOT a strict CloudEvents-compliant envelope" is the accurate statement; ECO-001's "**Envelope:** CloudEvents v1.0 (**normative**)", four paragraphs below it in the same section, was not. `base-event-envelope.avsc` carries none of CloudEvents v1.0's four REQUIRED attributes — no `id`, no `source`, no `specversion`, no `type` — so nothing on the wire would pass a validator, and the word "normative" committed the platform to a conformance it has never had. ECO-001 now points at §15.6. Its neighbouring line also claimed Avro→JSON deserialisation "at Kong Gateway layer" for webhook subscribers: no deployed Kong ([OQ-46](#open-questions-register)), and no bridge anywhere else — the only webhook code is an INBOUND receiver — so that is marked unbuilt rather than sited. | Phase 8            |
| OQ-4 | `07-multi-tenant-architecture` §7.3                                                                        | **Closed 2026-08-23 — not a contradiction, a tier split stated universally.** Both sentences are true of different tiers, and §7.3 said neither. Shared tenants: `TenantService.createTenant` provisions no topics and `KafkaProducer.ensureTopic` creates each on first publish, because eager provisioning cost 46 topics / 414 replicas per tenant regardless of usage and made broker capacity scale with customer count. Enterprise tenants: `provisionKafkaTopicsActivity` still provisions the whole catalogue eagerly at onboarding, because a dedicated MSK namespace bounds the topic count by one tenant rather than by headcount. §7.3's creation procedure now carries the split as a table. | Phase 8, Phase 25  |

Phase-local questions, raised on the page named and repeated here so the register is complete:

| ID    | Where                                                                        | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Raised on                  |
| ----- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| OQ-1a | `packages/@cos/`                                                             | **Closed 2026-08-22** — both have traceable origins after Phase 1: `@cos/ui-logic` extracted 2026-07-24 (92d4e542), `@cos/schemas` added 2026-08-03 (598c8b11). Rule 31(a) binds the packages listed in a phase's own Directory Structure, so neither is a missed Phase 1 deliverable; all twelve packages carry the required README. Phase 1's list now names them anyway, so the inventory stops reading as incomplete.                                                                                                                                                           | Phase 1                    |
| OQ-5  | root `pnpm-workspace.yaml` comment                                           | **Closed 2026-08-22** — the root comment was the wrong one: it attributed hoisting to `apps/mobile/.npmrc` and required `--ignore-workspace`. `nodeLinker: hoisted` lives in `apps/mobile/pnpm-workspace.yaml`, and a directory with its own workspace file needs no flag. `.npmrc` and `00_master` already said so.                                                                                                                                                                                                                                                                | Phase 1                    |
| OQ-6  | `32-implementation-specifications` §32.4                                     | **Closed** — the stale 27-row table is replaced by a verified status; 10 unreferenced rename targets dropped.                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Phase 8                    |
| OQ-16 | §32.4 #16 vs code + 3 documents                                              | `finance.budget.variance_detected.v1` (spec) against `finance.variance.alert.v1` (on the wire). Aligning to the spec is a breaking `.v2`, not a rename.                                                                                                                                                                                                                                                                                                                                                                                                                             | Phase 8                    |
| OQ-18 | `00_master` § PHASE 8 + `15-event-driven-workflow` §15.3 vs ADR-094          | **Closed 2026-08-22** — the specs were amended to match ADR-094 rather than the write paths refactored. Four places corrected: `00-glossary` §Outbox Pattern, `15-event-driven-workflow` §15.3, `30-testing-strategy` §Outbox row, and `00_master` § PHASE 8 (purpose, guarantee, and the `publish()` / `write(tx, …)` distinction). Durability is what ships; the atomic form exists as `EventOutboxService.write(tx, event)` and has no caller yet. | Phase 8                    |
| OQ-19 | `00_master` § PHASE 3 COMMAND, internally | **Closed 2026-08-22 — the shorthand was the outlier.** Two of the three authorities already agreed: the `States:` block enumerates `DRAFT`/`ACTIVE`/`ON_HOLD` → `CANCELLED`, and `project.state-machine.ts` implements exactly that with `COMPLETED: []`. `ANY → CANCELLED` also contradicted its own next line, since ANY would include the terminal `CANCELLED`. Replaced with the enumeration; no behaviour change. | Phase 3 |
| OQ-20 | ADR-065 implementation note + `21-mvp-scope` §21 vs `modules/project/risks/` | **Closed 2026-08-22** — BOTH follow-ups the note lists are built: the AI feed writes `source = 'AI_SUGGESTED'` via `RisksService`, and the heat map is `RiskHeatMap.tsx`. ADR-065's note and §21's row corrected; the Decision is unchanged.                                                                                                                                                                                                                                                                                                                                        | Phase 3                    |
| OQ-21 | `GET /projects/user/:userId`                                                 | **Closed 2026-08-22 — written into the spec.** `GET /projects/user/:userId` and its sibling `GET /projects/mine` are now in `14-api-architecture` §14.4 with the reason they are two endpoints rather than one with an optional `?user_id`: asking about ANOTHER person is a `TENANT_ADMIN` action, and a query parameter that silently changes who you are asking about is the shape that ships without a guard. A `TENANT_ADMIN` needs it to offboard someone. | Phase 3                    |
| OQ-22 | `indexProject` vs the absence of any reindex path                            | **Closed 2026-08-22** — index writes moved onto the outbox. `SearchIndexerConsumer` (`modules/search`) consumes `construction.project.*`, `site.report.created.v1` and `site.issue.created.v1`, reads the CURRENT row, and indexes it; a failure now propagates into KafkaConsumer's 3 retries and then the DLQ instead of being logged and lost, and replaying a topic rebuilds the index. The inline calls in `ProjectService` and `SiteOpsService` are gone, guarded by a test that fails against the old code. Verifying this surfaced [OQ-45](#open-questions-register). | Phase 3                    |
| OQ-23 | `00_master` § PHASE 4 calculation rules vs the hierarchy it defines          | **Closed 2026-08-22** — version total now sums every category's subtotal, not just the roots. Three regression tests added; proven to fail against the old code (5,000,000 → 0.0000). Existing APPROVED versions still carry the old figure — backfill is a separate decision.                                                                                                                                                                                                                                                                                                      | Phase 4                    |
| OQ-24 | `copyVersionContents` vs an unconstrained `parent_category_id`               | **Closed 2026-08-22** — `copyVersionContents` is now ONE statement that maps old category ids to new ones up front, so the copy is depth-independent. Reproduced against PostgreSQL first: a five-category source totalling 500.0000 copied to **4 categories and 600.0000** — the old join on `category_code` both dropped depth ≥3 and, because nothing makes `(version_id, category_code)` unique, fanned out across duplicate codes and inflated the total. After the fix: 5 / 5 / 500.0000, depth 4 intact, verified as `app_user` under FORCE ROW LEVEL SECURITY. | Phase 4                    |
| OQ-25 | `workflows/worker.ts` vs every deployment surface                            | **Closed 2026-08-22 by [OQ-32](#open-questions-register)** — the procurement worker now runs in the `cos-temporal-worker` Deployment. Recorded separately because this entry named only the procurement queue; OQ-32 is the platform-wide form and carries the fix.                                                                                                                                                                                                                                                                                                                 | Phase 5                    |
| OQ-26 | `vendor-scoring.ts` vs the spec                                              | The scoring adapter is built, but how `quality` and `price` criterion values are derived from data is defined nowhere. The score endpoint is live.                                                                                                                                                                                                                                                                                                                                                                                                                                  | Phase 5                    |
| OQ-27 | `procurement.delivery_items` vs `11-database-schema`                         | **Closed 2026-08-23 — defined in §11.2.** `procurement.delivery_items` decides whether a PO line is fulfilled and was described only by one passing sentence in `17-offline-mobile-sync` §17.4. Its definition now sits beside the other procurement entities in §11.2 and in `00_master`, read from the live DDL: the `ON DELETE RESTRICT` to `po_line_items` (a PO line with receipts cannot be deleted under them), and the `UNIQUE (delivery_id, line_id)` that doubles as the idempotency key keeping a replayed offline sync item from closing a PO on goods that arrived once. It carries no `created_by` / `deleted_at` / `created_at`, which is the concrete case §11.4 now cites for why neither is a universal column. | Phase 5                    |
| OQ-28 | Phase 6 `LAST_WRITE_WINS` vs an unbounded device clock                       | `client_submitted_at` from the handset is the ordering key; no skew bound is specified anywhere, so a fast clock wins every merge until corrected.                                                                                                                                                                                                                                                                                                                                                                                                                                  | Phase 6                    |
| OQ-29 | `site-ops/ep/file-service.stub.ts`                                           | Throws `NotImplementedException`, has zero callers, and promises a Phase 9 activation that never happened — photo linkage went the other way, via `files.stored_files.entity_id`.                                                                                                                                                                                                                                                                                                                                                                                                   | Phase 6                    |
| OQ-30 | `procurement.wht_rules` vs `finance.wht_rules`                               | **Closed 2026-08-22** — `procurement.wht_rules` dropped, rows carried across, four references corrected, RLS added (it had none), and the §13.3 Thailand defaults now seeded at tenant creation and backfilled. Migration and rollback both exercised on PostgreSQL.                                                                                                                                                                                                                                                                                                                | Phase 5, Phase 7           |
| OQ-31 | Phase 7's Kafka-only rule vs [OQ-18](#open-questions-register)               | A dropped `po.created` silently under-commits a budget, and the no-direct-query rule forbids the reconciliation that would catch it.                                                                                                                                                                                                                                                                                                                                                                                                                                                | Phase 7                    |
| OQ-32 | Every Temporal worker vs every deployment surface                            | **Closed 2026-08-22** — two Deployments now run all five queues (`cos-temporal-worker` chart for the backend's three; a second Deployment in the `cos-file-service` chart for its two), wired into ArgoCD, Compose and §32.2. A second defect surfaced while verifying: all three backend workers passed `require.resolve('./')` to `workflowsPath`, and no `index` module existed in any of those directories — so they could never have started even if launched. Fixed and guarded; pollers confirmed on a live Temporal server.                                                 | Phase 5, Phase 9, Phase 25 |
| OQ-33 | Phase 9 command's ClamAV deferral vs the same command block                  | **Closed 2026-08-22** — the deferral line contradicted the File Constraints block above it, which already specifies the quarantine bucket, retention, event and recovery path. Line corrected to record that antivirus is built.                                                                                                                                                                                                                                                                                                                                                    | Phase 9                    |
| OQ-34 | `19-notification-architecture` §19.6 vs the preference filter                | **Closed 2026-08-22** — the critical-safety exemption now covers the disable path as well as quiet hours, through one shared `isCriticalSafetyEvent()` so the two rules cannot diverge again. Set membership stays narrow (`safety.incident.created.v1` only) pending OQ-35.                                                                                                                                                                                                                                                                                                        | Phase 20                   |
| OQ-35 | `SafetyViolationDetected` in §19.6 and §16 vs everywhere else                | **Closed 2026-08-22** — built as `safety.violation.detected.v1` (§32.4 #23, Avro + TS interface) with two producers: the hourly permit-expiry sweep and a failed safety checklist. Added to §19.6's un-disableable set, so that rule now covers both events it names. Building it uncovered a separate defect: **nothing ever set a permit to `EXPIRED`** — the status was read by `/safety/compliance` and task gate #4 and written by nothing, so an expired permit never blocked a task and the compliance count was always 0. The sweep transitions and emits in one statement. | Phase 20, Phase 6          |
| OQ-36 | `32-implementation-specifications` §32.4 #9 vs the emitted payload           | The check-in event carries 3 of 6 specified fields and names one differently; the DTO cannot capture `method` or `location`. The Phase 22 command agrees with the code, so the two authorities disagree.                                                                                                                                                                                                                                                                                                                                                                            | Phase 22                   |
| OQ-37 | `modules/workforce/README.md` vs the tree                                    | **Closed 2026-08-22** — the phantom `EP-DOMAIN-008` stub is gone, and three further errors found in the same file are fixed: a stale "module scaffolded" status, two missing routes, and a Usage example calling `PATCH /workers/:id/attendance/latest`, which does not exist.                                                                                                                                                                                                                                                                                                      | Phase 22                   |
| OQ-38 | `17-offline-mobile-sync` §17.2 vs `runPushSync.ts` + the server              | **Closed 2026-08-22** — `platform.sync_exhaustions` (RLS, constraint-checked, migration and rollback exercised on PostgreSQL), `POST /sync/exhausted`, the TENANT_ADMIN queue endpoints, `platform.sync.exhausted.v1` (§32.4 #22, Avro + TS interface), and the missing `onExhausted` callback. Notification routing is payload-driven so §17.2's per-entity alert targets are honoured exactly — material consumption still alerts nobody.                                                                                                                                         | Phase 10                   |
| OQ-39 | `32-implementation-specifications` §32.7 vs `serwist/[path]/route.ts`        | **Closed 2026-08-22** — the spec's premise was falsified: `esbuild` IS a dependency now, version-locked to `esbuild-wasm`, with `allowBuilds` support. The MUST was inverted rather than kept, because pinning `false` broke the Windows build it was written to protect. §32.7 and `00_master` both corrected.                                                                                                                                                                                                                                                                     | Phase 10                   |
| OQ-40 | `ai-gateway/config/routing.yaml` vs `providers/llm_provider.py`              | **Closed 2026-08-22** — `providers/routing.py` now loads the table; the FAST tier resolves `summarization`/`classification`/`autocomplete` to the cheap model and an unknown hint falls back to FAST, not to GPT-4o. Model names moved into the YAML as `${VAR:-default}`; a test parses the source with `ast` to keep them out of Python.                                                                                                                                                                                                                                          | Phase 11                   |
| OQ-41 | Phase 12 hallucination-guard check 2 vs its implementation                   | The mandatory source-attribution check is `confidence != 0`; no output model carries a citation field, so a confident fabrication passes it by construction.                                                                                                                                                                                                                                                                                                                                                                                                                        | Phase 12                   |
| OQ-42 | Phase 14 cache invalidation vs its callers                                   | **Closed 2026-08-22** — `AnalyticsInvalidationConsumer` calls `invalidate()` on the eight events that feed the dashboards' ClickHouse tables. The list is not a judgement call: it is derived from `02-kafka-tables.sql`, and a test re-derives it from that file so a ninth table cannot be added without this consumer noticing. Needs no CLS (OQ-45) because `invalidate(tenantId, projectId)` takes both explicitly and reaches Redis, not a tenant-scoped table. Verifying it surfaced [OQ-47](#open-questions-register). | Phase 14                   |
| OQ-43 | `cos-alerts.yml` vs every producer of its Kafka gauges                       | **Closed 2026-08-22** — `KafkaLagService` registers both gauges at bootstrap and computes them from the kafkajs admin API. Verified against a live broker: engineered lag of 3 and DLQ depth of 3 both reported exactly, and a real leftover DLQ message was found that the old code could never have alerted on.                                                                                                                                                                                                                                                                   | Phase 15                   |
| OQ-45 | Every Kafka consumer vs `TenantPrismaService`                                | **Closed 2026-08-22** — found while building OQ-22's consumer. `FinanceConsumer` and `RisksConsumer` resolved their request-scoped service with `moduleRef.registerRequestByContextId({ tenantId })`, which reads as though it passes the tenant along — but `TenantPrismaService` is a singleton that resolves the tenant from CLS and never looks at the request, and a Kafka handler runs outside every request. So the first `db.run()` in each threw `Tenant context missing from request`: no cost transaction was ever written for a PO, an invoice or a BOQ publication, and no AI-suggested risk was ever created. Verified directly against `TenantPrismaService`. Fixed with `runInTenantContext`, which uses `cls.run` rather than `enterWith` so concurrent events cannot inherit each other's tenant; guarded in all three consumer specs, each proven to fail against the old code. | Phase 3, Phase 7, Phase 8 |
| OQ-46 | `14-api-architecture` §14.5 + three services' auth layers vs what is deployed      | **Closed 2026-08-22 — both halves, as decided.** The finding: `infrastructure/kubernetes/kong/kong-declarative.yml` is referenced by no ArgoCD Application, there are no `KongPlugin` CRDs, no chart has an Ingress template, and the repository's only `kind: Ingress` names `ingressClassName: nginx` — so the gateway three services' auth layers were defended by does not exist. **(a) Identity.** `ai-gateway/auth.py` accepted `x-tenant-id` with no token at all; `file-service` and `credential-service` did the same and file-service took `x-user-role` from a header too, so an unauthenticated pod could act as `SYSTEM_ADMIN` in any tenant. All three now require a verified token. The backend authenticates with a `client_credentials` token for the `cos-backend` service account (`ServiceTokenService`) and the headers continue to name the principal — the trusted-subsystem pattern, needed because the backend also calls from Temporal activities and Kafka consumers holding no user token. Service and user tokens are told apart by `preferred_username`, **not** `azp`: both were fetched from a live Keycloak 26.6.4 and `azp` reads `cos-backend` on both. **(b) Network.** NetworkPolicies added to all three charts, off by default with the caveats the kg-ingestion-worker policy already documents. **(c) Routing.** `/api/v1/ai` and `/api/v1/rag` are proxied by the backend (`AiProxyModule`), forwarding the caller's own token so the gateway still verifies it independently. | Phase 16, Phase 17, Phase 9, Phase 11 |
| OQ-47 | `02-kafka-tables.sql` vs `KafkaProducer.publish`                              | **The analytics warehouse cannot ever have received a message.** All eight ClickHouse Kafka-engine tables set an exact `kafka_topic_list` — `construction.project.created`, `procurement.po.created`, and so on — with no tenant prefix and no `.v1` suffix. The producer publishes to `topicForEvent(event_type, tenant_id)` = `{tenant_id}.{event_type}`, and every event type ends in `.v1`. `kafka_topic_list` is an exact list, not a pattern, and ClickHouse's Kafka engine has no regex form — so none of the eight has ever matched, and `analytics.project_cost_daily`, `analytics.procurement_activity_daily` and `analytics.site_activity_daily` — the only tables the executive and PM dashboards read — are empty. Fixing it is structural, not a rename: a per-tenant topic set cannot be enumerated in a static list, so it needs either a shared analytics topic or a bridging worker (the Go `analytics-worker` already does exactly this for `carbon.record.created.v1`, using a `TopicRegex`). | Phase 14 |
| OQ-48 | `11-database-schema` §11.4 PII erasure vs `SubjectRequestService.erase`          | **Half closed 2026-08-23 — `workforce.workers` now erases; `platform.users` is the decision that remains.** §11.4 specified a `pii_erased_at` column, a filtered view and a four-state lifecycle: **no table has that column**, and the mechanism built instead anonymises in place. It reached `crm.contacts`, `crm.leads` and `procurement.vendors` only. **Fixed without a ruling, because the spec already required it:** §11.4's erasure table has always listed the `Employee` entity with exactly `full_name` and `contact_phone`, and there is no `employees` table — that is `workforce.workers`, the only table in the database holding both columns. It is now in `findMatches` and in `anonymise`, matched by phone directly or by email through `user_id` (the row has no email column of its own; `uq_workers_user_id` makes the join single-valued). `full_name = '[ERASED]'` because the column is NOT NULL; `employee_code`, `trade_type` and `is_active` are untouched — a rights request is not a resignation. Verified on the live database as `app_user` under RLS: email matched case-insensitively through the join, phone matched directly, exactly one row erased, the `project_workforce` FK survived, and a second tenant saw nothing. **Still open:** `platform.users` was never in §11.4's list, and its row anchors audit logs, memberships and foreign keys that must outlive erasure — plus whether the per-entity `pii.erased` audit entry the old text specified should exist at all, given a per-request record already does. | Phase 2, Phase 16, Phase 22 |
| OQ-7  | QM-9 / §9.7.1 vs `backend/prisma/` and CI                                    | **Closed 2026-08-22** — 89/89 migrations paired, the enum rollback verified on a live database, and the CI gate §9.7.1 always claimed now actually exists.                                                                                                                                                                                                                                                                                                                                                                                                                          | Phase 2                    |
| OQ-8  | `00_master` § PHASE 2 COMMAND vs `schema.prisma` | **Closed 2026-08-22 — the command was incomplete, not wrong, and the gap was the authorisation model itself.** `platform.user_additional_roles` (migration `20260730000002`) is live and load-bearing: `RolesGuard` falls back to it when the JWT's primary role does not satisfy an endpoint and `PermissionsGuard` unions `ROLE_PERMISSIONS` across every role held, so effective permissions are a UNION — yet the table appeared in no specification, only in an Android screen README. Now documented in `06-rbac-permission-matrix` §6.4.1 (new), `11-database-schema` §11.1 and `00_master`, together with `users.department` and the `GET`/`PUT /users/:id/roles` endpoints the command omitted. | Phase 2 |
| OQ-9  | `05-security-compliance` §5.4                                                | **Closed** — unified login recorded in new §5.4.4; five documents and ADR-017 now reference it. The entry's original claim that §5.4 held the binding was itself wrong.                                                                                                                                                                                                                                                                                                                                                                                                             | Phase 2                    |
| OQ-12 | `11-database-schema` §11.1 | **Closed 2026-08-22.** §11.1 was missing `phone_number`, `department` and `last_seen_at`, and its `keycloak_user_id` note ("Path A: phone_number") described pre-F-1 behaviour — `UserService.create` provisions a Keycloak user on **both** paths and stores the UUID it returns, with the phone in its own column under a partial unique index. All read from the live database and the provisioning code, and mirrored into `00_master`. | Phase 2 |
| OQ-13 | `14-api-architecture` §14.5 | **Closed 2026-08-22, and the finding grew.** Path A does carry `azp=cos-backend` — `KeycloakAdminService` mints the token with that client. But verifying what the value is *for* showed §14.5 describes a gateway deployed nowhere: see [OQ-46](#open-questions-register). §14.5 now carries the measured value, a warning, and the reason `cos-backend` must never be registered as a Kong Consumer — doing so would meter every Path A field worker under the external-API monthly quota. | Phase 2 |
| OQ-14 | §5.4.4 vs `POST /api/v1/users`                                               | Nothing provisions one user for both paths, so unified login is policy rather than capability for existing accounts.                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Phase 2                    |
| OQ-15 | `11-database-schema` §11.4 vs §11.1                                          | **Closed 2026-08-23 — measured, and the universal rule was never built.** §11.4 claimed every record carries `created_by` and `deleted_at` and that all records soft-delete. Counted on the live schema: of **271** tables, **22** have `created_by` and **6** have `deleted_at` — `crm.leads`, `crm.contacts`, `crm.opportunities`, `files.files`, `files.photo_annotations`, `platform.sync_tombstones`. §11.4 now states soft delete as opt-in per table with the reason each one opts in, names the two categories that must never soft-delete (QM-4's append-only audit log, and rows whose deletion IS the business fact — a revoked membership kept behind a flag grants access to any reader who forgets to filter), and notes that a defensive `WHERE deleted_at IS NULL` on a table without the column is a syntax error, not a safety net. | Phase 2                    |
| OQ-17 | QM-7's account lockout vs Path A                                             | **Closed 2026-08-22 — risk accepted.** Narrowed first: QM-7's lockout IS implemented for Path B (`bruteForceProtected: true`, `failureFactor: 5`, `maxFailureWaitSeconds: 900` in the realm), and the original entry claiming no path had it was wrong. Path A gets no lock of its own: guessing is already bounded at 30/day/number against a 10⁶ space with a fresh unreadable code per attempt, a per-account lock is a DoS lever against the only login a `SITE_WORKER` has, and it does nothing about T1/T3, which are why SMS is restricted. Acceptance recorded and bounded in `docs/security/sms-otp-restricted-authenticator.md` §3.3. | Phase 2                    |
| OQ-11 | `OtpService` vs the Path A denial                                            | With privileged roles denied at Keycloak, `OtpService` still sends them an OTP and the failure surfaces as an opaque token-endpoint error. A pre-send decline returning `COS-AUTH-001` is proposed, not built.                                                                                                                                                                                                                                                                                                                                                                      | Phase 2                    |
| OQ-10 | ADR-067 realm config + `MFA_ENFORCE`                                         | Layer 1 landed in the realm file 2026-08-22 (verified live; ADR-067's role-based mechanism was proven unusable and replaced). Layer 2 and existing Keycloak instances remain ops actions.                                                                                                                                                                                                                                                                                                                                                                                           | Phase 2                    |

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

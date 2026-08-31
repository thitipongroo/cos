---
title: 'Implementation Specifications'
version: '2.1.0'
status: Active
last_updated: '2026-06-10'
authors:
  - thitipongroo
related_docs:
  - 03-system-design.md
  - 08-enterprise-deployment.md
  - 09-data-architecture.md
  - 11-database-schema.md
  - 14-api-architecture.md
  - 15-event-driven-workflow.md
  - 20-ux-flow.md
  - 21-mvp-scope.md
  - 30-testing-strategy.md
---

# 32. Implementation Specifications

> **Authority note:** This document is part of `docs/specifications/` — the source of truth
> sections from this document. On any conflict, this document wins.

## Table of Contents

- [32.1 Phase Dependency Graph](#321-phase-dependency-graph)
- [32.2 Deployable Units](#322-deployable-units)
- [32.3 AI Provider Interfaces](#323-ai-provider-interfaces)
- [32.4 Cross-Service Event Contracts](#324-cross-service-event-contracts)
- [32.5 Financial Precision Rules](#325-financial-precision-rules)
- [32.6 Workflow State Machines](#326-workflow-state-machines)
- [32.7 Design Token Specification](#327-design-token-specification)
- [32.9 Integration Stub Pattern](#329-integration-stub-pattern)
- [32.10 Feature Flag Lifecycle](#3210-feature-flag-lifecycle)

---

## 32.1 Phase Dependency Graph

Build phases must complete in dependency order. A phase cannot begin until all its listed
prerequisites are complete and CI is green.

```text
[Phase 1: Foundation Repo]
        │
        ▼
[Phase 2: Auth + Tenant] ──────────────────────────────────────────────────┐
        │                                                                   │
        ▼                                                                   │
[Phase 8: Event Infrastructure] ◄── MUST complete before Ph 3–7           │
        │                                                                   │
        ├──► [Phase 3: Project Service]                                     │
        │           │                                                       │
        ├──► [Phase 4: BOQ Service] ◄─── depends on Ph 3                  │
        │           │                                                       │
        ├──► [Phase 5: Procurement] ◄─── depends on Ph 3, Ph 4            │
        │           │                                                       │
        ├──► [Phase 6: Site Operations] ◄─── depends on Ph 3              │
        │           │                                                       │
        ├──► [Phase 7: Finance] ◄─── depends on Ph 4, Ph 5               │
        │           │                                                       │
        ├──► [Phase 20: Notification Service] ◄─── depends on Ph 2, Ph 3 │
        │           │                                                       │
        ├──► [Phase 21: Equipment Service] ◄─── depends on Ph 2, Ph 3    │
        │           │                                                       │
        ├──► [Phase 22: Workforce Service] ◄─── depends on Ph 2, Ph 3    │
        │           │                                                       │
        └──► [Phase 25: Enterprise Provisioning] ◄─── depends on Ph 2, Ph 3, Ph 20 │
                    │                                                       │
                    ▼                                                       │
         [Phase 9: File Service] ◄─── depends on Ph 2 (tenant)           │
                    │                                                       │
                    ▼                                                       │
         [Phase 10: Mobile Offline] ◄─── depends on Ph 3–7, Ph 20–22    │
                    │                                                       │
                    ▼                                                       │
         [Phase 11: AI Foundation] ◄─── depends on Ph 8, Ph 9            │
                    │                                                       │
                    ▼                                                       │
         [Phase 12: AI Report Assistant] ◄─── depends on Ph 11           │
                    │                                                       │
                    ▼                                                       │
         [Phase 13: Knowledge Graph] ◄─── depends on Ph 3–7, Ph 11      │
                    │                                                       │
                    ▼                                                       │
         [Phase 14: Analytics] ◄─── depends on Ph 3–7, Ph 8, Ph 13      │
                    │                                                       │
                    ▼                                                       │
         [Phase 23: MLOps Pipeline] ◄─── depends on Ph 11, Ph 14         │
                    │                                                       │
                    ▼                                                       │
         [Phase 15: Observability] ◄─── depends on Ph 1–14, Ph 20–25    │
                    │                                                       │
                    ▼                                                       │
         [Phase 16: Security] ◄─── depends on Ph 2, Ph 15               │
                    │                                                       │
                    ▼                                                       │
         [Phase 17: DevOps] ◄─── depends on Ph 1, Ph 15, Ph 16          │
                    │                                                       │
                    ▼                                                       │
         [Phase 18: Testing] ◄─── depends on Ph 1–17, Ph 20–25          │
                    │                                                       │
                    ▼                                                       │
         [Phase 19: Production Readiness] ◄─── depends on Ph 1–18       │
                                                                            │
BLOCKING RULE: Phase 8 must complete before Ph 3–7 begin.                ◄┘
All domain services depend on the shared event SDK output from Phase 8.
```

### SaaS Maturity Model — Phase to Stage Mapping

| Stage   | Name                     | Phases                                                                                                                                                 |
| ------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Stage 1 | Multi-tenant MVP         | Phase 1–2 (Foundation + Auth)                                                                                                                          |
| Stage 2 | Multi-project SaaS       | Phase 3–7 (Core Domains)                                                                                                                               |
| Stage 3 | Multi-company Enterprise | Phase 8–14, 25 (Events + AI + Analytics + Enterprise Provisioning)                                                                                     |
| Stage 4 | Cross-region Deployment  | Phase 17 + multi-region Terraform module (active-passive, primary ap-southeast-7 Bangkok, DR ap-southeast-1 — GLOB-001 §8.8; Route 53 latency routing) |
| Stage 5 | AI-native Ecosystem      | Phase 23–24 (MLOps + Digital Twin)                                                                                                                     |

> **Phase 24 — Digital Twin:** Phase 24 corresponds to the Digital Twin / IoT capability in
> 28-ecosystem-expansion section 28.2 Phase 5 (Smart Infrastructure Layer). The full Phase 24
> specification — including entry criteria, architecture, data model, Kafka events, API layer,
> extension points, infrastructure, revenue model, and success metrics — is defined in
> **[33-digital-twin-iot.md](33-digital-twin-iot.md)**. Phase 24 is not included in the Phase
> Dependency Graph above because it is a Stage 5 capability with a hardware-partner stage gate;
> it may not begin until Phase 4 (Financial Infrastructure) achieves its entry criteria and the
> IoT hardware partner relationship is confirmed (see 33-digital-twin-iot.md §33.2 for full
> entry criteria).
>
> **Phase 25 — Enterprise Provisioning:** Automates end-to-end dedicated RDS provisioning for
> Enterprise tenants upon contract signing via `EnterpriseProvisioningWorkflow` (Temporal).
> Full specification is defined in **[34-enterprise-tenant-provisioning.md](34-enterprise-tenant-provisioning.md)**.
> Phase 25 is a Stage 3 capability — it automates the enterprise tenant dedicated-DB model
> already established in Stage 3 (see §7 multi-tenant-architecture §7.3). It depends on
> Phase 2 (Auth + Tenant), Phase 8 (Event Infrastructure — Temporal + Kafka), and
> Phase 20 (Notification Service).

Agent rule: implement a feature in the stage its phase belongs to.
Never implement a Stage N+1 feature during Stage N work.

> **Build-order exception — Phase 8:** Phase 8 (Event Infrastructure) is classified as Stage 3
> because it enables enterprise-grade event-driven architecture. However, the Phase Dependency Graph
> above shows Phase 8 as a **build-order prerequisite** for Phase 3–7 (Stage 2 domain services):
> Phase 8 MUST be completed first because all domain services depend on the shared event SDK it
> produces. The "Stage N+1" agent rule applies to _domain feature work_ (e.g., do not build
> AI report generation (Phase 12, Stage 3) while completing Stage 2 procurement). Phase 8 is
> infrastructure that MUST be laid before Stage 2 domain work begins — its Stage 3 classification
> reflects its _capability category_ (enterprise event bus), not its _build position_ in the
> dependency graph.

---

## 32.2 Deployable Units

The platform deploys as distinct units. Do **not** merge runtimes or split prematurely.

> **This table is the CANONICAL source for every service's runtime.** Any other table that shows a
> runtime — `context/00_master_construction_os.md` §DEPLOYABLE UNITS, `33-digital-twin-iot.md`, the
> root `README.md` — is a **mirror** and must never be edited independently: change this table first,
> then propagate. `scripts/readiness/check-service-runtimes.sh` verifies every row here against the
> build files actually present in `services/<name>/` (`go.mod` → Go, `requirements.txt` → Python,
> `package.json` → Node) and fails CI on any mismatch.
>
> **Why the two worker rows were added on 2026-08-22.** They are not new code — five Temporal worker
> files had existed for months, each exporting a `run*Worker()` and self-starting under
> `require.main === module`, and **nothing launched any of them**: no `package.json` script, no
> Dockerfile, no Compose service, no CI step, no Helm chart, and no row in this table. The Temporal
> server is deployed, so every workflow the services started was accepted and recorded as Running
> while no process polled its task queue. `POST /procurement/rfqs/:id/publish` returned 200 and the
> RFQ stayed `DRAFT`; soft-deleted files were never hard-deleted. The workflow unit tests pass
> because `TestWorkflowEnvironment` starts its own in-process worker — no gate in the pipeline checks
> that a built component is reachable in production. Recorded as OQ-32 in
> `docs/architecture/technical-design/README.md`; resolved by product-owner decision on 2026-08-22.
>
> **Why the rule exists.** On 2026-08-07 commit `8857bb1` added a BIM Import Worker row reading
> **Go**, inferred from the three `*-worker` rows above it rather than from the directory — which has
> never contained a `.go` file. `33-digital-twin-iot.md` had said Python since 2026-05-29, but that
> file was not open in the same commit. One fact stored in three hand-maintained places, with nothing
> comparing any of them to the repo, is the condition that made a plausible guess survive review.

| Deployable                                                         | Runtime                       | Contents                                                                                                                                                                                                        |
| ------------------------------------------------------------------ | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Main Application (`backend/`)                                      | NestJS (monolith)             | identity, tenant, project, boq, procurement, site-ops, finance, notification, equipment, workforce                                                                                                              |
| File Service (`services/file-service/`)                            | Fastify                       | Multipart upload I/O (extracted for I/O throughput)                                                                                                                                                             |
| AI Gateway (`services/ai-gateway/`)                                | FastAPI (Python)              | LLM routing, RAG, token tracking                                                                                                                                                                                |
| AI Embedding Worker (`services/ai-embedding-worker/`)              | FastAPI (Python)              | Embedding generation                                                                                                                                                                                            |
| AI OCR Pipeline (`services/ai-ocr-pipeline/`)                      | FastAPI (Python)              | OCR processing                                                                                                                                                                                                  |
| Analytics Worker (`services/analytics-worker/`)                    | Go                            | ClickHouse aggregation                                                                                                                                                                                          |
| KG Ingestion Worker (`services/kg-ingestion-worker/`)              | Go                            | Neo4j ingestion — Kafka client: `github.com/twmb/franz-go` via coskafka (`kgo.ConsumeRegex`; consumer group: `kg-ingestion-worker.shared`)                                                                      |
| IoT Ingestion Worker (`services/iot-ingestion-worker/`)            | Go                            | EMQX (MQTT) → Kafka telemetry forwarding. EMQX's native/Enterprise Kafka data-bridge is a paid feature and is **not** used — see `33-digital-twin-iot.md` §33.8                                                 |
| BIM Import Worker (`services/bim-import-worker/`)                  | Python                        | IFC parsing / quantity extraction for the BIM extension point (§13.4)                                                                                                                                           |
| AI Transcription Pipeline (`services/ai-transcription-pipeline/`)  | FastAPI (Python)              | Voice-note transcription — the server half of the mobile capture flow (ADR-052)                                                                                                                                 |
| Credential Service (`services/credential-service/`)                | Node                          | W3C DID/VC issuance and verification — backs contract e-signature (ADR-019, ADR-058; §5.4)                                                                                                                      |
| Temporal Worker (`backend/src/workers/main.ts`)                    | NestJS image, worker command  | Executes the backend's workflows — task queues `procurement`, `enterprise-provisioning`, `data-export`. Runs the **cos-backend image** with a different command; chart `cos-temporal-worker` (added 2026-08-22) |
| File Service Workers (`services/file-service/src/workers/main.ts`) | Fastify image, worker command | Task queues `file-cleanup` (retention hard-delete) and `zip-extraction`. Second Deployment from the `cos-file-service` chart, same image (added 2026-08-22)                                                     |
| Web App (`apps/web/`)                                              | Next.js + Serwist             | Tablet/laptop browser — online + offline unified                                                                                                                                                                |
| Mobile (`apps/mobile/`)                                            | React Native + Expo           | Smartphone native app                                                                                                                                                                                           |

> The last four rows were added on 2026-08-07. All four already existed under `services/` and are
> wired in `docker-compose.yml`; this table listed only the original five, so a reader counting
> deployables from the spec got nine where the tree has thirteen. Each is backed by the decision
> cited in its Contents column — `ai-transcription-pipeline` is the one whose _directory name_ is not
> written in any spec, only its capability (ADR-052).

### Service Extraction Rules

A module may be extracted from the NestJS monolith **only** when **both** conditions are true:

- **Condition A:** Team ownership boundary is confirmed (a dedicated team owns it exclusively)
- **Condition B:** The module has independent scaling pressure with production evidence

If either condition is absent → keep as a module inside the monolith.

### Internal vs Cross-deployable Communication

| Communication path                      | Protocol                                      |
| --------------------------------------- | --------------------------------------------- |
| Module-to-module (within monolith)      | NestJS dependency injection — never HTTP/gRPC |
| Async events (within monolith)          | Kafka (same process, external infra)          |
| Main App ↔ File Service                 | REST API (HTTP)                               |
| Main App ↔ AI Services                  | REST API (HTTP)                               |
| Main App → Go Workers (write/ingestion) | Kafka events                                  |
| Main App ← Go Workers (read/query)      | N/A — NestJS queries each database directly   |

---

## 32.3 AI Provider Interfaces

Formal contracts for `LLMProvider` and `EmbeddingProvider`.
All AI service code **must** depend on these interfaces — never directly on LangChain or OpenAI SDK classes.
Resolved implementations are listed at the bottom of this section.

### TypeScript AI Provider Interfaces

```typescript
// ── Message & Response Types ─────────────────────────────────────────────

export type LLMRole = 'system' | 'user' | 'assistant';

export interface LLMMessage {
  role: LLMRole;
  content: string;
}

export interface LLMUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface LLMResponse {
  content: string; // generated text
  model: string; // actual model used (e.g. "gpt-4o")
  usage: LLMUsage;
  finishReason: 'stop' | 'length' | 'error';
}

export interface LLMOptions {
  model?: string; // override; default: "gpt-4o"
  temperature?: number; // 0.0–1.0; default: 0.2 (construction domain determinism)
  maxTokens?: number; // default: 2048
}

// ── LLMProvider Interface ────────────────────────────────────────────────

export interface LLMProvider {
  /**
   * Send a chat completion request.
   * @throws {LLMProviderError} on provider-side failure (retryable flag set if safe to retry)
   */
  chat(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse>;

  /** Provider identity — used for logging, metrics, and alerting. */
  getInfo(): { provider: string; defaultModel: string };
}

// ── Embedding Types ──────────────────────────────────────────────────────

export interface EmbeddingResponse {
  vector: number[]; // float32[], length must equal `dimensions`
  dimensions: number; // must be 1536 for text-embedding-3-small
  model: string;
  tokensUsed: number;
}

export interface EmbeddingOptions {
  model?: string; // override; default: "text-embedding-3-small"
}

// ── EmbeddingProvider Interface ──────────────────────────────────────────

export interface EmbeddingProvider {
  /**
   * Embed a single text string.
   * @throws {EmbeddingProviderError} on failure
   */
  embed(text: string, options?: EmbeddingOptions): Promise<EmbeddingResponse>;

  /**
   * Batch-embed multiple texts — more token-efficient than looping embed().
   * Result order matches input order.
   */
  embedBatch(texts: string[], options?: EmbeddingOptions): Promise<EmbeddingResponse[]>;

  /** Provider identity and embedding dimensions — validate against VECTOR(1536) column spec. */
  getInfo(): { provider: string; defaultModel: string; dimensions: number };
}

// ── Error Types ──────────────────────────────────────────────────────────

export class LLMProviderError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly statusCode?: number,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = 'LLMProviderError';
  }
}

export class EmbeddingProviderError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = 'EmbeddingProviderError';
  }
}
```

### Python AI Provider Interfaces

```python
from abc import ABC, abstractmethod
from dataclasses import dataclass

# ── Data classes ──────────────────────────────────────────────────────────

@dataclass
class LLMMessage:
    role: str      # 'system' | 'user' | 'assistant'
    content: str

@dataclass
class LLMUsage:
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int

@dataclass
class LLMResponse:
    content: str
    model: str
    usage: LLMUsage
    finish_reason: str    # 'stop' | 'length' | 'error'

@dataclass
class EmbeddingResponse:
    vector: list[float]   # len must equal dimensions (1536 for text-embedding-3-small)
    dimensions: int
    model: str
    tokens_used: int

# ── Abstract providers ────────────────────────────────────────────────────

class LLMProvider(ABC):
    """Abstract base for LLM provider (OpenAI GPT-4o via LangChain 0.2.*)."""

    @abstractmethod
    async def chat(
        self,
        messages: list[LLMMessage],
        model: str | None = None,
        temperature: float = 0.2,
        max_tokens: int = 2048,
    ) -> LLMResponse: ...

    @abstractmethod
    def get_info(self) -> dict[str, str]: ...


class EmbeddingProvider(ABC):
    """Abstract base for embedding provider (text-embedding-3-small via LangChain 0.2.*)."""

    @abstractmethod
    async def embed(
        self, text: str, model: str | None = None
    ) -> EmbeddingResponse: ...

    @abstractmethod
    async def embed_batch(
        self, texts: list[str], model: str | None = None
    ) -> list[EmbeddingResponse]: ...

    @abstractmethod
    def get_info(self) -> dict[str, str | int]: ...
```

### Resolved Implementations (Phase 11)

| Interface           | Implementation class      | Resolved via                  | Package                                                                         |
| ------------------- | ------------------------- | ----------------------------- | ------------------------------------------------------------------------------- |
| `LLMProvider`       | `OpenAILangChainProvider` | OpenAI GPT-4o                 | `langchain-openai>=0.2` — default model: `gpt-4o`, cost fallback: `gpt-4o-mini` |
| `EmbeddingProvider` | `OpenAIEmbeddingProvider` | OpenAI text-embedding-3-small | `langchain-openai>=0.2` — model: `text-embedding-3-small`, 1536 dimensions      |

> **Rule:** If a new LLM or embedding provider is evaluated, it must implement the abstract class above — never swap the
> implementation by monkey-patching the resolved class.

---

## 32.4 Cross-Service Event Contracts

All Kafka events must conform to the base envelope and the field-level payload specs below.
Schemas MUST be registered in Confluent Schema Registry (Avro, `BACKWARD_TRANSITIVE`
compatibility) before first producer deployment.

### Base Event Envelope

```text
{
  event_id:       string (UUID v4)
  event_type:     string (e.g. "construction.project.created.v1")
  event_version:  string (e.g. "1.0" — semantic patch version within the major version)
  tenant_id:      string (UUID)
  actor_id:       string (UUID — user who triggered)
  occurred_at:    string (ISO 8601 UTC)
  correlation_id: string (UUID — for tracing)
  trace_id:       string | null (OTel trace_id, 32 hex — the trace that RAISED the event)
  span_id:        string | null (OTel span_id, 16 hex — the span within it)
  payload:        object (event-specific — see below)
}
```

> **`trace_id` / `span_id` added here 2026-08-23** ([OQ-2](../architecture/technical-design/README.md#open-questions-register)).
> They were already declared in `base-event-envelope.avsc` and in every event `.avsc` as
> `["null","string"]` with a `null` default — this section listed eight fields and
> `15-event-driven-workflow` §15.6 listed ten, and the wire schema agreed with §15.6.
>
> They are populated by `EventOutboxService.publish()`, inside the operation that raised the event,
> and **not** at delivery: `OutboxPollerService` sends minutes later in another process under its own
> span, so a context injected there would point a reader at the delivery instead of the cause. The
> poller lifts them back out of the envelope into the Kafka headers, which is what satisfies QM-8's
> "all Kafka events must carry `trace_id` and `span_id` in headers". Before that change the poller
> published with no options at all, so no backend domain event carried either — and since
> [ADR-094](../architecture/adr/094-durable-event-outbox.md) the outbox is every backend domain event.
>
> Null is a real value here, not a placeholder: an event raised outside a traced request has no
> context, and the alternative — the all-zeros id `getTraceId()` returns when no span is active — is a
> valid-looking id that resolves to nothing.
>
> **Event type naming convention:** `{domain}.{entity}.{action}.{version}` — identical to the
> canonical format defined in 15-event-driven-workflow section 15.6.
> Example: `construction.task.created.v1`, `procurement.purchase_order.approved.v1`.
> The `.v1` suffix in `event_type` denotes the major schema version (breaking changes increment
> this to `.v2`). The `event_version` envelope field carries the semantic patch version (e.g. `"1.0"`,
> `"1.1"`) for non-breaking additions within the same major version.
> Kafka topic names include a `{tenant_id}.` prefix per 07-multi-tenant-architecture section 7.3.

**Event #9 — `method` was made nullable on 2026-08-23**
([OQ-36](../architecture/technical-design/README.md#open-questions-register)). The service emitted
`{ worker_id, project_id, checked_in_at }` — three fields, one misnamed, against the six this row
declares. It could not be Avro-encoded at all (`invalid "string": undefined`), and since
[ADR-094](../architecture/adr/094-durable-event-outbox.md) that failure lands in the outbox poller,
which retries ten times and retires the row. **No check-in event had ever reached Kafka**, visible
only to someone querying `platform.outbox_events` for `attempts >= 10`.

`checkin_id` (the attendance log's own id) and `location` (already captured by
`RecordAttendanceDto` and stored on the row) were available all along and are now sent. `method`
was not: there was no field for it on the DTO and no column on
`workforce_telemetry.attendance_logs`, so the enum became `["null", …]` with a `null` default
rather than being guessed at. Schema Registry accepted it as v2 under `BACKWARD_TRANSITIVE`.

**The capture was built 2026-08-24** — `method` on `RecordAttendanceDto`, a nullable
`VARCHAR(9)` with a CHECK on `attendance_logs` (migration `20260824000001`), and the value
carried onto the wire. ClickHouse had held a `method String` column for it since the Kafka table
was written, receiving an empty string on every row.

**It stays nullable, and null still means "not recorded".** Every row written before that date
genuinely has no method, and a consumer must be able to tell that apart from `MANUAL` — "a person
typed this in" is an assertion, absence is not. It is deliberately NOT derived from the presence of
coordinates: that would put a `GPS` value on the wire that no client ever claimed, and nothing
downstream could tell the two apart.

### Enum Casing Convention

> **PostgreSQL vs Avro enum casing:** PostgreSQL enum values in `11-database-schema.md` use
> **lowercase** (e.g. `project_type: residential / commercial / infrastructure / industrial`)
> following PostgreSQL convention. Event payload enum values in this table use **UPPERCASE**
> (e.g. `project_type: RESIDENTIAL/COMMERCIAL/INFRASTRUCTURE/INDUSTRIAL`) following Avro
> and protobuf convention. Both are correct — the service layer is responsible for mapping
> between storage and event representations.

### Event Payload Specifications

> **This table specifies payloads; it does not assert that every event is emitted** — and as of
> 2026-08-31, **all 63 committed `.avsc` schemas have a producer**. The two that did not (#12
> `finance.budget.exceeded.v1`, #14 `finance.cashflow_risk.detected.v1`) were both built that day.
>
> Being declared was never harmless bookkeeping, which is why both were built. A declared event
> still gets a topic provisioned (`infrastructure/kafka/topics.yaml`), a generated TypeScript type
> exported from `@cos/shared`, an
> `EVENT_AVSC_MAP` entry, and a slot in `scripts/readiness/check-schema-registry.sh` — a gate that
> refuses to pass until the schema is registered. So a declared event is indistinguishable from a
> live one at every layer, and a dashboard row for it sits at zero forever with nothing to say
> whether that means "quiet" or "never built".
>
> `scripts/ci/check-event-producers.mjs` now enforces the distinction in CI: a schema with no
> producer fails unless it is listed as declared-only **with a reason**, and an entry that later
> grows a producer fails too, so the list cannot rot into a lie in either direction (TDD OQ-50).

| #   | Event Type                               | Key Payload Fields                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `construction.project.created.v1`        | `project_id`, `project_code`, `project_name`, `project_type` (enum: RESIDENTIAL/COMMERCIAL/INFRASTRUCTURE/INDUSTRIAL), `budget` {amount: DECIMAL(19,4), currency_code: ISO4217}, `start_date`, `end_date`, `created_by`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2   | `construction.boq.version_created.v1`    | `boq_version_id`, `project_id`, `version_number`, `total_estimated` {amount, currency_code}, `created_by`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 3   | `procurement.po.created.v1`              | `po_id`, `project_id`, `vendor_id`, `po_number`, `total_amount` {amount, currency_code}, `delivery_date`, `line_items[]` {item_id, quantity: DECIMAL(10,4), unit, unit_price: DECIMAL(19,4)}                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 4   | `procurement.invoice.received.v1`        | `invoice_id`, `po_id`, `project_id`, `vendor_id`, `amount` {amount, currency_code}, `invoice_date`, `due_date`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 5   | `site.report.created.v1`                 | `report_id`, `project_id`, `report_date`, `submitted_by`, `summary` (max 2000 chars), `issue_count`, `photo_count`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 6   | `site.inspection.failed.v1`              | `inspection_id`, `project_id`, `checklist_id`, `failed_items[]` {item_id, description}, `inspected_by`, `inspected_at`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 7   | `construction.task.completed.v1`         | `task_id`, `project_id`, `boq_item_id`, `completed_by`, `completed_at`, `progress_percent` (100 at completion), `actual_duration_days`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 8   | `construction.delay.detected.v1`         | `project_id`, `task_id` (nullable), `delay_days`, `cause` (enum: PROCUREMENT/WEATHER/WORKFORCE/EQUIPMENT/SCOPE_CHANGE/OTHER), `detected_by` (enum: AI_FORECAST/MANUAL_REPORT), `severity` (enum: LOW/MEDIUM/HIGH/CRITICAL — thresholds: LOW=1-2 days, MEDIUM=3-6, HIGH=7-13, CRITICAL=14+)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 9   | `workforce.checkin.created.v1`           | `checkin_id`, `worker_id`, `project_id`, `checkin_at`, `method` (enum: QR_CODE/GPS/BIOMETRIC/MANUAL — **nullable; captured from the client since 2026-08-24**, see below), `location` {lat, lng} (nullable)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 10  | `site.material.consumed.v1`              | `consumption_id`, `project_id`, `task_id`, `material_id`, `quantity`: DECIMAL(10,4), `unit`, `consumed_by`, `consumed_at`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 11  | `procurement.delivery.received.v1`       | `delivery_id`, `po_id`, `project_id`, `vendor_id`, `received_by`, `received_at`, `items_received[]` {item_id, quantity_received: DECIMAL(10,4)}, `partial`: boolean                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 12  | `finance.budget.exceeded.v1`             | `project_id`, `cost_category`, `budget_amount` {amount, currency_code}, `actual_amount` {amount, currency_code}, `overage_percent`: DECIMAL(5,2), `detected_at` — **BUILT 2026-08-23.** `cost_category` is the BOQ category CODE. Emitted by `FinanceService.checkBudgetLineOverrun` when one `finance.budget_lines` row is over its `allocated_amount` by more than the project's `variance_alert_threshold` — the same number as #16 `finance.variance.alert.v1` against a smaller denominator, deliberately, rather than a second knob nobody would set. #16 stays per-PROJECT; this is per-CATEGORY, and a project can sit inside its total while one trade has blown its line. The enabling change was attribution: `cost_transactions.budget_line_id` existed from the first finance migration and **nothing ever wrote it**, so every per-category figure in the platform read zero — including `TasksService`'s task-completion gate, which blocks at ratio ≥ 1.0 and therefore never fired once. `procurement.po.created.v1` now carries `boq_item_id` per line (nullable, Avro default — BACKWARD_TRANSITIVE), and Finance resolves `boq_items.category_id` → `budget_lines.boq_category_id`. A PO spanning several categories stays unattributed rather than charging the whole total to one of them |
| 13  | `procurement.vendor_invoice.approved.v1` | `invoice_id`, `po_id`, `project_id`, `vendor_id`, `amount` {amount, currency_code}, `approved_by`, `approved_at`, `payment_due`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 14  | `finance.cashflow_risk.detected.v1`      | `project_id`, `risk_level` (enum: LOW/MEDIUM/HIGH/CRITICAL), `projected_shortfall` {amount, currency_code}, `projected_at`, `detected_by` (enum: AI_FORECAST/RULE_ENGINE) — **BUILT 2026-08-23.** Emitted by `CashflowRiskService`, a daily leased `@Cron` sweep. The forecast exists as a PULL endpoint (`GET /api/v1/finance/cashflow-forecast/:projectId`), returning 13 weekly buckets of `inflow` / `outflow` / `net_flow` / `cumulative_net`. `RULE_ENGINE` grades by HOW SOON `cumulative_net` first goes negative — never in 13 weeks → no event; weeks 9–13 → `LOW`; 5–8 → `MEDIUM`; 2–4 → `HIGH`; 0–1 → `CRITICAL`. `projected_shortfall` is the most negative `cumulative_net` across the horizon. Everything it needs is already computed, so no new figure is invented. It is a SWEEP rather than a write hook because the risk moves on the CALENDAR: nothing changes in the data, a week passes, and a shortfall that was five weeks out is now one week out. It does not emit from the pull endpoint either — that would make an alert depend on somebody opening a screen. It calls the same `buildForecast` the endpoint uses, so an alert cannot disagree with the screen an operator opens to check it. `AI_FORECAST` remains a second, later producer                                      |
| 15  | `ai.risk_prediction.generated.v1`        | `prediction_id`, `project_id`, `model_type` (enum: DELAY_FORECAST/COST_OVERRUN/SAFETY_VISION/RISK_CLASSIFIER), `prediction` (model-specific object), `confidence`: DECIMAL(5,4), `generated_at`, `model_version`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 16  | `finance.variance.alert.v1`              | `project_id`, `budget_id`, `variance_percentage` (DECIMAL string), `threshold_exceeded` (DECIMAL string — the configured threshold that was crossed; default 10%), `actual_amount`, `committed_amount`, `allocated_amount` (all DECIMAL strings), `currency_code` (ISO 4217). Corrected 2026-08-22 — see the naming note below                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 17  | `file.document.uploaded.v1`              | `file_id`, `tenant_id`, `entity_type` (nullable — e.g. "site_report", "purchase_order"), `entity_id` (nullable UUID), `mime_type`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 18  | `file.document.quarantined.v1`           | `file_id`, `tenant_id`, `threat_type` (nullable string — ClamAV threat name, null if unknown)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 19  | `construction.boq.created.v1`            | `project_id` (UUID), `version_id` (UUID), `version_number` (integer) — emitted once when the first BOQ version (version_number = 1) is created for a project                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 20  | `construction.boq.updated.v1`            | `version_id` (UUID), `project_id` (UUID), `changed_items_count` (integer), `new_total_estimated_amount` (DECIMAL string — never float), `new_total_estimated_currency` (ISO 4217)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 21  | `procurement.po.approval_requested.v1`   | `po_id`, `project_id`, `approver_id`, `tier` (enum: PM/FINANCE/EXECUTIVE/TENANT-ADMIN), `po_number`, `total_amount` (DECIMAL string — never float), `currency_code` (ISO 4217) — emitted by the PO approval workflow (notifyApprover activity) when a PO enters an approval tier or is escalated on the 48h timeout; consumed by the Notification Service to alert the specific `approver_id`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 22  | `platform.sync.exhausted.v1`             | `exhaustion_id` (UUID of the `platform.sync_exhaustions` row), `entity_type` (enum: safety/attendance/inspection/material — the value the queue holds and the wire carries, 1:1 with §17.2's safety_incidents/workforce_attendance/inspection_results/material_consumption; corrected 2026-08-31, when the server was still keyed on the category names nothing sends and answered 400 to every real report), `entity_id` (UUID), `reported_by` (UUID — from the JWT, not the request body), `retry_count` (integer, always 5), `last_error` (nullable string — diagnostic only) — emitted by `SyncService.reportExhaustion` when a device reports a queued offline mutation that exhausted its 5 retries (§17.2). Consumed by the Notification Service, which routes it **by `entity_type`**: safety incidents alert PM + Safety Officer, attendance and inspections alert PM, and material consumption enters the review queue with no alert — §17.2's table, not a single role list.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 23  | `safety.compliance.failed.v1`            | `failure_type` (enum: PERMIT_EXPIRED/CHECKLIST_ITEM_FAILED), `project_id` (UUID), `detected_by` (PERMIT_EXPIRY_SWEEP or CHECKLIST_SUBMISSION), `detail` (string), plus the producer-specific nullables: `permit_id`/`permit_number`/`permit_type`/`linked_task_id` for PERMIT_EXPIRED, `inspection_id`/`checklist_id`/`failed_item_count` for CHECKLIST_ITEM_FAILED. **The platform's own rules finding a safety requirement unmet** — an expired permit, a failed required checklist item — as opposed to row 24, where a model finds a violation in a photo. Built 2026-08-22 as `safety.violation.detected.v1`; renamed when the merge of 2026-08-31 found that name already assigned to SafetyVisionModel by the product-owner decisions of 2026-08-25. Two payloads cannot share one subject under BACKWARD_TRANSITIVE, and the two events do not describe the same thing. §19.6's "cannot be disabled" applies to this event as well as to row 24: `notification.service.ts` carries both in `CRITICAL_EVENT_TYPES`. Producers: `PermitExpiryService` (sweep) and `SiteOpsService.submitInspection` (FAILED checklist). |
| 24  | `safety.violation.detected.v1`           | `violation_id`, `project_id`, `file_id` (the analysed site photo), `violations[]` (string), `confidence` (DECIMAL string — never a float, matching row 15), `severity` (enum: LOW/MEDIUM/HIGH/CRITICAL). Added 2026-08-25 (Phase 23). This is the `SafetyViolationDetected` of `16-enterprise-event-flow` §Safety and of §19.6's "cannot be disabled" pair — it had no canonical name until the phase that builds `SafetyVisionModel`, the only detector of a violation in this specification. `violations`/`confidence`/`severity` are that model's `SafetyAnalysisResult`; `violation_id` and `project_id` follow the sibling `safety.incident.created.v1`; `file_id` is how every other event references an image. Producer: `services/ai-gateway/reports/safety_violation_event.py` — emits nothing while the model is a stub. |

### Schema Registry Rules

- Compatibility mode: `BACKWARD_TRANSITIVE`
- Subject naming: **RecordNameStrategy** — the subject is the canonical event type
  (`{domain}.{entity}.{action}.v{N}`), e.g. `procurement.po.created.v1`. There is exactly **one
  schema per event, shared across all tenants**. Subjects MUST NOT be derived from the Kafka topic
  name (`TopicNameStrategy`): because topic names carry a `{tenant_id}.` prefix (§7.3, §15.6),
  `TopicNameStrategy` would register a duplicate schema per tenant. The producer registers the
  schema once under the canonical event type regardless of the per-tenant topic it publishes to.
- Version increment on every schema change
- Both TypeScript interface AND Avro schema required for each event
- No producer deployment without prior schema registration

#### Schema Migration Policy

All Kafka event schemas MUST follow the canonical naming convention `{domain}.{entity}.{action}.v{N}`.
Non-canonical schemas MUST be migrated before Phase 8 (Multi-company Enterprise tier onboarding).

**Rules:**

1. All new event producers MUST use canonical schema files (`.v1.avsc`) only — never create new schemas under the legacy
   naming pattern.
2. Existing consumers of non-canonical schemas must migrate to canonical equivalents before Phase 8.
3. A non-canonical file is removed only after all consumers have migrated to the canonical replacement and migration is
   verified.
4. To add a canonical event: (1) add entry to §32.4 Event Payload Specifications, (2) create `.v1.avsc` file,
   (3) migrate consumers, (4) delete legacy file.

#### Canonical-name migration — status 2026-08-22

This section carried a 27-row table of legacy schema files awaiting a canonical rename. **Twenty-six
of those rows are discharged and the table is removed rather than left to be re-read as outstanding
work.** Verified against `packages/@cos/kafka/src/avro/`:

- **No legacy-named `.avsc` remains.** Every event schema on disk uses the canonical
  `{domain}.{entity}.{action}.v{N}.avsc` form; the only non-`.v1` file is `base-event-envelope.avsc`,
  which is the envelope, not an event.
- **Ten of the canonical names the table demanded were never created, and nothing asks for them** —
  `procurement.rfq.deadline_approaching.v1`, `procurement.delivery.delayed.v1`,
  `procurement.inventory.low_threshold_reached.v1`, `site.progress.updated.v1`,
  `site.media.uploaded.v1`, `finance.budget.updated.v1`,
  `finance.budget.warning_threshold_reached.v1`, `finance.cost_entry.created.v1`,
  `ai.inference.queued.v1`, `ai.inference.completed.v1`. Each has zero references in
  `backend/`, `services/` and `packages/`, zero entries in `EVENT_AVSC_MAP`, and **no source outside
  the deleted table** — no phase `Generate:` list and no other spec section names any of them. They
  were rename targets for legacy files that no longer exist, so carrying them forward would invent
  ten events nothing ever asked for. Add one through the §32.4 procedure above if a phase needs it.
- **Every event named in the payload table above exists as `.avsc`** — re-verified 2026-08-23 by
  diffing the table against `packages/@cos/kafka/src/avro/`.

**The one naming conflict is resolved.** Row #16 read `finance.budget.variance_detected.v1` until
2026-08-23; the name on the wire is `finance.variance.alert.v1`, and the table now says so
([OQ-16](../architecture/technical-design/README.md#open-questions-register)).

The spec name had **no implementation at all** — no producer, no consumer, no `.avsc`, no
`EVENT_AVSC_MAP` entry — so aligning the code to it would have been a breaking `.v2` migration
undertaken for a name nothing had ever emitted or read. The implemented name is live at every point:
emitted by `FinanceService`, subscribed by `NotificationConsumer`, routed in `notification.service.ts`
to `FINANCE` / `TENANT_ADMIN`, documented in the notification README, and committed as
`finance.variance.alert.v1.avsc`. It is also what `00_master` § Phase 7 `Generate:` and § Phase 20
notification triggers say, and what `20-ux-flow` §20.7 cites for the `/alerts` page.

> **Worth stating plainly, because the naming convention is otherwise strict:** `variance.alert` does
> not parse as `{domain}.{entity}.{action}` — `variance` is not an entity and `alert` is not an
> action, where `budget.variance_detected` is exactly that shape. The convention lost this one to the
> cost of a breaking rename on a live event. A future `.v2` of this event, if the payload ever forces
> one, is the moment to take the name back.

**Not renamed here, deliberately.** The event type is in `EVENT_AVSC_MAP`, so it is on the wire:
renaming it is a breaking change by this section's own Event Versioning rules, which require a new
major version plus a migration consumer bridge — not an edit to a filename. Whether §32.4 #16 changes
to match the implementation, or the implementation migrates to `.v2` under the spec name, is a
product-owner decision. Recorded as OQ-16 in
`docs/architecture/technical-design/phase-08-event-infrastructure.md`.

> **`finance.variance.alert.v1` — corrected 2026-08-22.** This row used to require a rename to
> `finance.budget.variance_detected.v1` ("Name clarified"), and row 16 of the payload table above
> was written against that name with a `budget_amount` / `detected_at` shape. Neither was ever
> adopted, and by the time it was checked the platform had converged on the original name across
> every layer that carries it: `finance.variance.alert.v1.avsc`, the topic catalogue key, the typed
> contract exported from `@cos/shared`, the emitter in FinanceService, the NotificationConsumer
> subscription, the escalation rule, and three screens in the mobile app — eleven production files,
> plus master:2989 and `20-ux-flow` §Alerts, which both call it by this name.
>
> The other renames in this table WERE applied wherever the event exists (`equipment.unit.assigned.v1`,
> `workforce.checkout.created.v1` — schema file, catalogue and emitter all agree), so this is the one
> that was left behind rather than a table nobody acted on. It is recorded as migrated-in-place
> because renaming it now would be a breaking change across three surfaces, including a live
> notification and escalation path, in exchange for nothing but the name.
>
> Row 16 above now states the payload the schema actually enforces. `detected_at` is not among the
> payload fields because the envelope's `occurred_at` already carries it, and `budget_amount` was
> split into `allocated_amount` + `currency_code`, alongside `committed_amount` and `budget_id`,
> which the alert needs in order to be actionable without a follow-up read.

---

## 32.5 Financial Precision Rules

All monetary values across all services must comply with these rules.

### Storage

| Rule                      | Value                                                |
| ------------------------- | ---------------------------------------------------- |
| PostgreSQL column type    | `DECIMAL(19, 4)`                                     |
| Currency column type      | `VARCHAR(3)` — ISO 4217 code (e.g. `"THB"`, `"USD"`) |
| Exchange rate column type | `DECIMAL(19, 6)`                                     |
| Prohibited types          | `FLOAT`, `DOUBLE`, JavaScript `Number`               |

### Arithmetic Libraries

| Runtime              | Library          | Mode                    |
| -------------------- | ---------------- | ----------------------- |
| TypeScript / Node.js | `decimal.js`     | —                       |
| Python               | `decimal` module | `ROUND_HALF_UP` context |

### Rounding Rules

| Context               | Rule                                                                |
| --------------------- | ------------------------------------------------------------------- |
| Default               | `HALF_UP` (standard commercial rounding)                            |
| Tax calculation       | `HALF_UP` per line item, then sum — never round intermediate values |
| Unit price × quantity | Round final result to 4 decimal places                              |
| UI display            | 2 decimal places (4 stored internally)                              |

### Multi-currency

- Store all amounts in original transaction currency
- Reporting currency: configurable per tenant (stored in tenant settings)
- Exchange rate source: Open Exchange Rates API
  - Daily cache in Redis, TTL 24h
  - Fallback: last cached rate if API unavailable
- Currency conversion: `original_amount × exchange_rate`, rounded to 4 decimal places

### Prohibited Patterns

- Never store money as integer cents without explicit spec
- Never use native JavaScript `Number` for monetary calculations
- Never round intermediate values — round only final results

---

## 32.6 Workflow State Machines

Temporal.io is the workflow engine (see [04-tech-stack §4.4](04-tech-stack.md)).
State machines below are authoritative — do not add states or transitions without a spec change.

> **Role names:** All role identifiers below use the canonical names from
> 06-rbac-permission-matrix section 6.2. Approval thresholds (PO value limits) follow
> 15-event-driven-workflow section 15.5.

### RFQ (Request for Quotation) Workflow

```text
DRAFT → PUBLISHED → CLOSED → EVALUATED → AWARDED
                                        → CANCELLED
```

| Transition            | Trigger                                      | Role                                           |
| --------------------- | -------------------------------------------- | ---------------------------------------------- |
| DRAFT → PUBLISHED     | Manual action                                | `Procurement Officer`                          |
| PUBLISHED → CLOSED    | Deadline expiry (Temporal timer) or manual   | `Procurement Officer`                          |
| CLOSED → EVALUATED    | System — after quotation comparison complete | System                                         |
| EVALUATED → AWARDED   | Manual approval                              | `Procurement Officer` or `Procurement Manager` |
| EVALUATED → CANCELLED | Manual                                       | `Procurement Officer` or `Procurement Manager` |

### Purchase Order Workflow

```text
DRAFT → PENDING_APPROVAL → APPROVED → SENT → ACKNOWLEDGED
                        → DRAFT (reject/revise)
                                               → PARTIALLY_DELIVERED
                                               → FULLY_DELIVERED → INVOICED → PAID
                                                                             → DISPUTED
```

| Transition                            | Trigger                      | Role                                                                 |
| ------------------------------------- | ---------------------------- | -------------------------------------------------------------------- |
| DRAFT → PENDING_APPROVAL              | Manual                       | `Procurement Officer`                                                |
| PENDING_APPROVAL → APPROVED           | Manual approval              | `Project Manager` (see thresholds in 15-event-driven-workflow §15.5) |
| PENDING_APPROVAL → DRAFT              | Reject / revise              | `Project Manager`                                                    |
| APPROVED → SENT                       | System (auto after approval) | System                                                               |
| SENT → ACKNOWLEDGED                   | Vendor confirmation event    | System                                                               |
| ACKNOWLEDGED → PARTIALLY_DELIVERED    | Delivery recording           | System                                                               |
| PARTIALLY_DELIVERED → FULLY_DELIVERED | Delivery completion          | System                                                               |
| FULLY_DELIVERED → INVOICED            | Invoice receipt              | System                                                               |
| INVOICED → PAID                       | Manual                       | `Finance`                                                            |
| INVOICED → DISPUTED                   | Manual                       | `Finance`                                                            |

### Workflow Rules

- All state transitions MUST emit a Kafka event
- Temporal workflow functions MUST be deterministic (no side-effectful non-determinism)
- Compensation logic (rollback) MUST be implemented for all CANCELLED transitions
- Do not add states or roles beyond those listed above

---

## 32.7 Design Token Specification

### Brand Identity

| Token             | Value                                                                         | Usage                                 |
| ----------------- | ----------------------------------------------------------------------------- | ------------------------------------- |
| Brand name        | CONSTRUCTION OS                                                               | —                                     |
| Product shortform | COS                                                                           | Favicon, app icon, monogram           |
| Tagline           | "AI-Native Construction Platform"                                             | 11px, uppercase, letter-spacing 3.5px |
| Personality       | Industrial · Intelligent · Enterprise · AI-native · Mission-critical          | —                                     |
| Positioning       | Palantir / Datadog / Linear aesthetic — not construction contractor aesthetic | —                                     |

Prohibited in the signed-in app: building/crane/hard hat/blueprint/gear icons;
orange/amber colour; rounded playful shapes; gradients or glow effects.

**Exception 1 — pre-auth entry screens** (login, OTP verify, verification/loading overlay, Privacy
Policy). These screens may use the "technical / mission-critical" motif — a rotating gear, the
`architecture` mark, and a cyan glow on progress/accent elements — because the entry sequence is
where the "mission-critical operating system" personality is set, before any project data is on
screen (product-owner decision 2026-07-16; reference
`mockup/mobile/01_authen/01_login/04_verification_loading_mobile`). **Privacy Policy** was added to
this exception by product-owner decision 2026-08-03 (reference
`mockup/mobile/02_shared/01_privacy_policy/00_policy_dashboard` — `00_policy_data` →
`01_authen/05_privacy_policy/01_privacy_policy` on 2026-08-15 → its present path on 2026-08-18, where
it joins the shared set because one `<PrivacyPolicyDocument />` serves both the pre-auth and
post-auth routes): it is reached from the login footer and is pre-auth by construction, so the same
"no project data on screen" rationale applies — the glow is scoped to the brand logo on that screen
and nothing else.

**Exception 2 — loading states** (product-owner decision 2026-07-17; ADR-055; reference
`mockup/mobile/00_loading` + `mockup/desktop/imp_002_universal_loading_component_desktop_view`).
`<LoadingState />` may use the same motif on the `ai` variant — **for the same reason the pre-auth
exception exists: no project data is on screen yet**. A loading state is by definition the interval
before data arrives, so the motif never competes with project content.

**The motif is per platform, because the two mockups genuinely differ** (product-owner decision
2026-08-17 — the earlier wording named one motif for both and did not match either drawing):

| Platform | `ai` motif                                                      | Reference                            |
| -------- | --------------------------------------------------------------- | ------------------------------------ |
| Mobile   | cyan glow · **scan-line gradient** · **waveform** · left border | `mockup/mobile/00_loading` section C |
| Web      | cyan glow · **processor plate** · **ping dot** · full border-2  | `mockup/desktop/imp_002_…` Variant C |

The web drawing carries neither a scan-line nor a waveform; it signals work with a pulsing processor
glyph on a tinted plate and a `ping` dot on its status row. Do not port the mobile pair onto web to
"make them match" — they are two drawings of one component, and each platform follows its own.

The exception is scoped to `<LoadingState />` itself:

- It applies **only while loading**. The moment real data renders, the motif unmounts with the
  component — a loaded dashboard, list, or form carries none of it.
- It does **not** extend to any other signed-in surface, and it does not license a new palette:
  the glow/scan-line/waveform take `--cos-cyan` / `--cos-dark-cyan`, and every other colour takes
  an existing §32.7 token (see "Mobile Core Component Library" → `<LoadingState />`).

The prohibition still holds everywhere the signed-in app shows project data — the dashboard, lists,
and forms drop these motifs (§32.7 Mobile Dark Surfaces). Amber remains a semantic warning token
throughout; only its use as a _brand_ colour is prohibited.

### Brand Colour Tokens (web/PWA + desktop)

| Token         | Hex       | Usage                                                |
| ------------- | --------- | ---------------------------------------------------- |
| `--cos-navy`  | `#0B1020` | Infrastructure Core — wordmark, headers, dark UI     |
| `--cos-blue`  | `#2563EB` | System Blue — CTAs, active states, navigation        |
| `--cos-cyan`  | `#06B6D4` | AI Cyan — AI modules, insights, event highlights     |
| `--cos-gray`  | `#64748B` | Steel Gray — secondary text, borders, inactive       |
| `--cos-white` | `#F8FAFC` | Concrete White — page backgrounds, surfaces, reports |

#### Dark Theme Tokens

| Token                          | Hex       |
| ------------------------------ | --------- |
| `--cos-dark-bg`                | `#020617` |
| `--cos-dark-surface`           | `#0F172A` |
| `--cos-dark-elevated`          | `#111827` |
| `--cos-dark-text`              | `#F8FAFC` |
| `--cos-dark-muted`             | `#94A3B8` |
| `--cos-dark-blue`              | `#2563EB` |
| `--cos-dark-cyan`              | `#22D3EE` |
| `--cos-dark-success`           | `#10B981` |
| `--cos-dark-warning`           | `#F59E0B` |
| `--cos-dark-danger`            | `#EF4444` |
| `--cos-dark-outline`           | `#46464C` |
| `--cos-dark-accent`            | `#4CD7F6` |
| `--cos-dark-surface-container` | `#102034` |

> `--cos-dark-accent` added 2026-08-06 (product-owner decision), and it exists for an accessibility
> reason rather than a stylistic one. Dark screens previously drew their accent — icons, eyebrows,
> card titles, inline tags — in `--mobile-primary` `#0066FF`, which measures **4.17:1** against
> `--cos-dark-bg`. That clears SC 1.4.11's 3:1 for a non-text control but **fails SC 1.4.3's 4.5:1
> for text**, and §20.8 makes WCAG 2.2 AA a shipping gate. `#4CD7F6` measures 11.87:1.
>
> **`--mobile-primary` remains the CTA colour**, unchanged: a filled button puts the blue behind
> white text, so the text contrast is the button's, not the blue's, and the tap target a field worker
> learns never changes colour (§32.7 Mobile Colour Tokens). This token is only for accent marks drawn
> **on** the dark background.
>
> This narrows, and does not contradict, the note under Mobile Dark Surfaces that scopes
> `--cos-dark-cyan` to auth entry screens: that rule exists so the AI/technical cyan does not leak
> into ordinary product chrome as decoration. An accent that a legibility requirement forces is a
> different thing from a decorative one.
>
> `--cos-dark-outline` added 2026-08-06 (product-owner decision). This set previously had **no**
> outline token, so every dark card border was invented at the call site — `apps/mobile` had settled
> on `rgba(148, 163, 184, 0.24)` (muted at low alpha), which reads as a soft glow rather than an
> edge and made cards look blurrier than the approved mockups. The border is now a specified opaque
> grey rather than a derived translucent one. Same class of gap as Mobile Border Radius below — a
> token that existed for web and not for dark surfaces.
>
> > **Why `#46464C` and not `#434655` — the mockups do not agree with each other.** This entry
> > originally justified the value as "the `outline-variant` value the `mockup/mobile/**` designs
> > use". That is not what the designs say. Counted across every `code.html` on 2026-08-06,
> > `outline-variant` is `#434655` in **189** files and `#46464C` in **28** — so the value shipped is
> > the _minority_ one, and the sentence claiming otherwise has been removed rather than left to be
> > cited again.
> >
> > **`#46464C` stands (product-owner decision 2026-08-07).** A 189-to-28 count is evidence about the
> > mockups, not an instruction: the two differ by `(70,70,76)` against `(67,70,85)` — nine steps of
> > blue — and the neutral grey is the one that reads as an _edge_ against a navy surface rather than
> > blending into it, which is the whole reason this token replaced the translucent glow. The token
> > is also not free to change: it is every card, field row, chip and chrome hairline in the dark app
> > (16,504 pixels in `01-identity.png` alone — the rule under the top bar at `y=309` full width, and
> > the USER ID card's edges at `y=1000, x=42–43 / 1036–1037`), so switching it would invalidate
> > every committed dark capture for a difference of nine points in one channel.
> >
> > Recorded because the count is real and will be re-discovered: anyone re-deriving tokens from
> > `mockup/mobile/**` will land on `#434655` and should find this note before "correcting" it.

### Mobile Colour Tokens (React Native — field app)

Optimised for outdoor sunlight visibility.

| Token                     | Hex       | Usage                            |
| ------------------------- | --------- | -------------------------------- |
| `--mobile-primary`        | `#0066FF` | Bright blue (outdoor visibility) |
| `--mobile-success`        | `#00C853` | Confirmation green               |
| `--mobile-warning`        | `#FF9500` | Caution orange                   |
| `--mobile-danger`         | `#FF3B30` | Urgent / delete red              |
| `--mobile-bg`             | `#FFFFFF` | Background                       |
| `--mobile-surface`        | `#F5F5F5` | Card surface                     |
| `--mobile-text-primary`   | `#1C1C1E` | Primary text                     |
| `--mobile-text-secondary` | `#6C6C70` | Secondary text                   |
| `--mobile-offline`        | `#8E8E93` | Offline indicator                |
| `--mobile-syncing`        | `#FFD60A` | Syncing indicator                |
| `--mobile-synced`         | `#00C853` | Synced indicator                 |

> **Design decision:** `--mobile-primary #0066FF` ≠ `--cos-blue #2563EB` — intentional.
> Field workers use the app in direct sunlight; `#0066FF` has higher outdoor visibility.
> Use `--mobile-primary` for tap targets and CTAs in React Native only.
> Use `--cos-blue` for all web (Next.js) and PWA surfaces.

#### Mobile Dark Surfaces

> **Superseded 2026-08-04 (product-owner decision).** Dark is now the **product default for every
> screen and every role**, and light is a **user-selectable preference** rather than a per-screen
> decision. The mode lives in `apps/mobile/src/store/themeStore.ts` (`DEFAULT_THEME = 'dark'`,
> persisted in `expo-secure-store`, hydrated in `app/_layout.tsx` before the first frame) and is read
> through `theme/usePalette.ts`. The sunlight-visibility rationale below is why light must stay
> **reachable** — a worker outdoors switches to it in Profile — not why particular screens are pinned
> to it. The table that follows is retained as the record of which screens were dark **before** that
> decision, because those are the ones already authored against `--cos-dark-*` and the ones whose
> mockups are dark; it is no longer a limit on what may render dark.
>
> Two surfaces remain **pinned** regardless of the preference, and both are deliberate:
>
> | Pinned surface                                                                                        | Why                                                                                                                                                             |
> | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
> | Pre-auth screens (login, OTP, overlay, and the Privacy Policy / Terms of Use / Support Centre routes) | The preference is per-user and there is no user yet. They are pushed from a dark login, so following a light preference would break mid-flow.                   |
> | Navigation drawer                                                                                     | An overlay panel, not a page. It reads as a raised dark sheet over either mode — the same way its mockup drew it (withdrawn 2026-08-16; the pin is unaffected). |
>
> `--cos-dark-cyan` stays scoped to the **auth entry screens** (see the accent note under Mobile
> Colour Tokens). The post-auth Privacy Policy route therefore takes `primary` as its accent, not
> cyan, even though it renders the same document.

The table above applies to **task screens** — the forms and lists a field worker keeps open all day.
A defined set of screens renders **dark** instead, on the shared `--cos-dark-*` tokens above: the
same surface as the web login and the Keycloak `cos` theme, so the product looks like one product.

Dark screens (the pre-2026-08-04 set — see the note above):

| Screen                                  | Reference                                                            |
| --------------------------------------- | -------------------------------------------------------------------- |
| Login                                   | `mockup/mobile/01_authen/01_login/01_landing_page_login_mobile/`     |
| OTP verify                              | `mockup/mobile/01_authen/01_login/02_login_otp_verification_mobile/` |
| Session-securing overlay                | `mockup/mobile/01_authen/01_login/04_verification_loading_mobile/`   |
| Privacy Policy                          | `mockup/mobile/02_shared/01_privacy_policy/00_policy_dashboard`      |
| Terms of Use (pre-auth)                 | `mockup/mobile/01_authen/04_terms_of_use/01_terms_of_use_dashboard/` |
| Support Centre (pre-auth)               | `mockup/mobile/01_authen/05_get_help/01_home_support/`               |
| IT Support Hotline (pre-auth)           | `mockup/mobile/01_authen/05_get_help/02_hotline_details/`            |
| Help Chat (pre-auth)                    | `mockup/mobile/01_authen/05_get_help/03_help_chat/`                  |
| Project Manager / Proc Manager screens  | `mockup/mobile/06_project_manager/`                                  |
| Site Engineer Home                      | `mockup/mobile/03_site_engineer/01_home/01_se_home_dashboard/`       |
| Tenant Admin Home                       | `mockup/mobile/04_tenant_admin/01_home/01_home_dashboard/`           |
| Notification preferences (Tenant Admin) | drawing withdrawn 2026-08-13 — see the note below it                 |
| Navigation drawer                       | drawing withdrawn 2026-08-16 — see the note below it                 |

**Notification preferences keeps its row without a drawing.** The directory
`mockup/mobile/04_tenant_admin/06_notification/` (`01_notification_preferences` + `02_success_state`) was deleted from
the mockup set on 2026-08-13. The row stays because this table rules on **which screens render dark**, not on which
screens have a drawing — withdrawing the drawing does not relight the screen. The screen itself also stands: it is
wired into `MobileNav`, `roleTabs`, `AccountSettings`, `Breadcrumb` and `routeRegistry.spec`, and master §Phase 10
still lists it as the TENANT_ADMIN **Settings** tab, so ADR-085 applies as written — a drawing does not remove
reviewed working capability. The Reference cell is deliberately NOT repointed at the surviving desktop drawing
(`mockup/desktop/notification_desktop_view/notification_preferences_tenant_admin`): that is a different surface and
would claim a mobile layout it does not specify. Both drawings were dark (`<html class="dark">`, `#031427`), which is
the evidence the dark ruling rests on.

**The navigation drawer keeps its row on exactly the same terms** (product-owner decision 2026-08-16).
`mockup/mobile/02_shared/01_navigation_drawer/` was deleted from the mockup set on 2026-08-16, in the commit that
also removed `mockup/mobile/04_tenant_admin/05_navigation_drawer/` — the two were byte-identical, which is what the
2026-08-14 "shared drawing leads every role" decision rested on — together with `02_shared/03_account_settings/` and
`02_shared/04_profile_settings/`, leaving `02_shared/01_mfa/` as that directory's only occupant. The row stays for the
reason given above: this table rules on **which screens render dark**, not on which screens have a drawing. The drawer
is additionally one of the two **pinned** surfaces named at the top of this note, and a withdrawn drawing does not
unpin it. The Reference cell is deliberately NOT repointed at a surviving per-role drawer drawing
(`03_site_engineer/05_profile/01_se_navigation_drawer`, `06_project_manager/05_navigation_drawer/01_pm_profile`,
`07_safety_officer/05_profile/01_sa_drawer`, `role_executive/05_profile/01_executive_navigation_drawer`): since
2026-08-14 **no role takes a drawing verbatim** — every drawer is DERIVED from the §6.4 module matrix with the four
drawn rows leading — so citing one role's drawing would claim a menu this product does not build.
`apps/mobile/src/lib/drawerLinks.ts` names those four rows and is now the record of what the withdrawn drawings
specified. ADR-085 applies as written: a drawing is authoritative for STYLE, not for existence, and does not remove
reviewed working capability — the drawer, Account Settings and Profile Settings screens all stand.

**The whole `01_authen/` tree was renumbered on 2026-08-18**, and every Reference cell above is
repointed to match. Login, OTP and the overlay moved into `01_login/`; MFA came back from
`02_shared/01_mfa` to `01_authen/02_mfa`; `05_privacy_policy/` became `03_privacy_policy/` with its
screens shifted down one (`02_data_collection` → `01_data_collection`, and so on to
`09_privacy_download_success` → `08_privacy_download_success`); `06_terms_of_use/` → `04_terms_of_use/`
and `07_get_help/` → `05_get_help/`. The policy DOCUMENT went the other way, out of `01_authen/`
entirely and into `02_shared/`, which is the one move that is more than renumbering: one
`<PrivacyPolicyDocument />` renders it at both `(auth)/privacy-policy` and `(app)/privacy-policy`, so
it belongs to neither flow. `docs/screens/android/` was restructured the same way on the same day.
Terms of Use also gained a second drawing, `02_terms_of_use_download`. **Both are implemented as of
2026-08-18 (ADR-092)**, reversing the 2026-08-09 decision that left the download button disabled. That
decision was correct while there was no terms PDF and no endpoint to serve one — a receipt could then
only have shown invented figures — and stopped being correct when ADR-091 built exactly that
machinery for the Privacy Policy the day before. The terms now have their own byte-stable PDF
(`GET /api/v1/terms/metadata`, `GET /api/v1/terms/pdf`), the receipt renders at
`(auth)/terms-of-use-downloaded` from measured values only, and `scripts/ci/check-legal-parity.mjs`
(formerly `check-policy-parity.mjs`) holds BOTH documents' screens and PDFs to the same text. The
document screen was corrected against its own drawing in the same change: the title moved into the top
bar, the summary tiles took the drawn blue/`#4cd7f6` accents instead of cyan/amber, and clause 03's
edge and numerals stopped being cyan.

**The Support Centre keeps its row on the same terms, and the Privacy Policy row was repointed rather
than withdrawn.** One commit on **2026-08-15** restructured `mockup/mobile/01_authen/05_privacy_policy/`
from **123 drawings to 9**, and deleted `01_authen/07_get_help/01_support_center/` outright:

| Drawing                                   | What happened                                                                                                                                                                                                                                                                        |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `05_privacy_policy/00_policy_data`        | **Renamed** to `05_privacy_policy/01_privacy_policy` (git records `R075`). Every reference to it is repointed, not withdrawn.                                                                                                                                                        |
| `05_privacy_policy/01_data_collection/**` | **Withdrawn — about 114 drawings**, the whole Transparency Portal set. It is deliberately NOT repointed at the surviving `02_data_collection`: that is a single-screen folder, not the container, and claiming it would be a lie.                                                    |
| `01_authen/07_get_help/01_support_center` | **Withdrawn.** `mockup/mobile/support_center/01_dashboard` exists, but it was added by a DIFFERENT, earlier commit with no rename record linking the two, and the files differ (329 lines against 293) — so it is not asserted as the successor (product-owner decision 2026-08-16). |

**The Support Centre has drawings again as of 2026-08-17 — three of them, and two are new screens.**
Commit `76c8225c` added `01_authen/07_get_help/{01_home_support,02_hotline_details,03_help_chat}` and
`c086e600` renumbered the folder to `05_get_help/` the next day with zero content change. This is not
the withdrawn `01_support_center` returning: that folder name does not reappear, and no rename record
links it to `01_home_support`, so the row above stands as written and the three Reference cells in the
dark-screens table point at the new drawings on their own authority. `01_home_support` re-draws the
screen already in the product and adds a `chevron_right` to the IT Hotline and Help Chat cards; the
other two are screens that never existed. **All three are implemented as of 2026-08-18 (ADR-093)** —
see "Support Centre — two routes" below, which the same change rewrites.

ADR-085 applies throughout: **every screen those drawings specified is still in the product and still
captured.** The Transparency Portal's 14 committed Android frames, `TransparencyKit.tsx`, the
`/transparency*` routes and ADR-078 / 080 / 081 / 082 / 083 / 084 — each of which resolved a specific
figure in those drawings as untrue and recorded what replaced it — are all unaffected. What was
withdrawn is the drawings, and the rules taken from them now live in tests (`cardBodyLength.spec.ts`,
`headingStutter.spec.ts`) rather than in a directory that can be reorganised out from under them.

The Tenant-Admin notification control panel and the navigation drawer were added by product-owner
decision (2026-07-26); the **Tenant Admin Home** was added by product-owner decision (2026-07-28); the
**Privacy Policy** was added by product-owner decision (2026-08-03) — it is reached from the login
footer and therefore continues the dark pre-auth surface it is pushed from, rather than dropping the
user onto the light task palette mid-flow. The **Terms of Use** was added by product-owner decision
(2026-08-09) for the same reason: it is the login footer's other link, and it is PRE-AUTH ONLY — the
Privacy Policy's second, post-auth entry was a later decision that this document did not receive. The
**Support Centre** followed on the same day and on the same terms — pre-auth, entered from the
OTP step's GET SUPPORT item, which is the only entry any mockup draws for it (**no longer pre-auth
_only_ as of 2026-08-17 — see § Support Centre: two routes, below**). Its drawing carries a
`Field | Tasks | Support | Profile` bottom bar, which is **not** implemented: there is no tab bar
before sign-in, and that is no role's tab set (see the four-tab rule above). All
ship on the dark surface as their mockups define, continuing the signed-in dark identity rather than the
light task palette. They are control / dashboard surfaces (configure / navigate / monitor), not all-day
outdoor task screens, so the sunlight-visibility rationale for the light palette does not apply. A
dark-shell role renders the **whole** shell dark — top bar AND bottom nav, and it drops the light
`SyncStatusBar` strip — so no light chrome ever sits over dark content (the Site Engineer Home already
works this way).

Since 2026-08-04 the shell follows the **theme**, not the role: `app/(app)/_layout.tsx` reads
`useIsDark()` rather than testing for a dark-shell role. In the same change the full-width
`SyncStatusBar` strip was **deleted outright** and the compact `<SyncPill />` in the top bar became
the standard sync indicator for **every** role, as `01_home_dashboard` draws it (product-owner
decision 2026-08-04). Nothing in the shell branches on the role any more — only the tab SET differs.
Two consequences worth knowing:

- The component `components/SyncStatusBar.tsx` is gone. The three Detox specs that asserted
  `by.id('sync-status-bar')` now assert `by.id('sync-pill')`, and because the pill is icon-only they
  match its `accessibilityLabel` (`sync.pill.*`) with `by.label()` rather than on-screen text.

**Extended 2026-08-06 (product-owner decision): `<OfflineBanner />` is gone too, and the pill carries
offline as well.** The 2026-08-04 change left two indicators of the same subject in the same shell —
a compact glyph in the top bar, and a full-width red strip below it that appeared whenever the device
lost network. On the transparency screens the strip pushed the whole page down and dominated a screen
whose job is to be read calmly. One surface now answers "is my work saved": the pill.

**Offline is not a distinct pill state — it is what produces the `pending` one.** Every write made
without a network enqueues, `pendingCount` rises, and the pill already reads `cloud-upload` with the
count. Adding an `offline` branch would give one fact two names, and offline with an empty queue
genuinely is synced: nothing is waiting. The states stay `error → syncing → pending → synced`.

The spec's `queue count` requirement is therefore already satisfied by the pending state, whose
`accessibilityLabel` (`sync.pill.pending`) announces the number. Colour is never the only signal —
the glyph changes with the state — per Mobile Colour Tokens.

- `components/OfflineBanner.tsx` is deleted. The five Detox assertions across `offline-checkin`,
  `offline-inspection` and `sync-conflict` that matched `by.id('offline-banner')` now match the pill
  by label, exactly as the `SyncStatusBar` migration above did. (`offline-checkin` was itself retired
  on 2026-08-21 with the self check-in feature — see §30 "Mobile E2E (Detox)". The sentence above
  records what this migration did at the time and is left as written.)
- The signed-in shell got **64px shorter** on a 1080×2400 frame, which moves the fixed band the
  full-page screenshot stitcher clips to (`TOP` 375 → 311 in the capture scripts).

Screen migration to the palette is **staged** (product-owner decision 2026-08-04): the shell,
the Privacy Policy and the Transparency Portal read the store today; the remaining task screens still
render their own palette until migrated, so a dark shell over lighter content is expected mid-rollout
rather than a defect.

| Surface            | Token                 | Hex       |
| ------------------ | --------------------- | --------- |
| Background         | `--cos-dark-bg`       | `#020617` |
| Card               | `--cos-dark-surface`  | `#0F172A` |
| Input / border     | `--cos-dark-elevated` | `#111827` |
| Text               | `--cos-dark-text`     | `#F8FAFC` |
| Secondary / footer | `--cos-dark-muted`    | `#94A3B8` |
| CTA                | `--mobile-primary`    | `#0066FF` |

> **Why these screens and not the rest:** the sunlight-visibility rationale is about all-day outdoor
> use. Signing in is a one-off, usually indoor. The Site Engineer Home is a read-first command view
> — glanced at, not worked in — and a product-owner decision (2026-07-16) put it on the dark entry
> surface. Screens a worker _acts_ in (daily report, task list, issue capture, inspection checklist)
> stay light. CTAs keep `--mobile-primary` everywhere, so the tap target a field worker learns never
> changes colour.
>
> Dark screens use the `--cos-dark-*` values above verbatim. The Site Engineer Home mockup's
> `#031427` background and `#4cd7f6` accent are **not** adopted — they are not tokens, and §32.7
> "Mobile Implementation" forbids hardcoded hex.

### Typography Tokens

**Brand font:** Inter Tight

- Package: `@fontsource-variable/inter-tight` (web/PWA) · expo-font with Inter Tight (React Native).
  The variable build is one 44,872 B latin file covering weights 100–900, against 67,424 B for the
  three static weights `/login` was loading — measured 2026-08-03, and worth 24 KB plus two fewer
  requests on every page. Its CSS registers the family as **`Inter Tight Variable`**, which must be
  first in the Tailwind `fontFamily.sans` stack: with only `"Inter Tight"` there the font is
  downloaded and never matched, and the page silently renders in a system font.
- Fallback: Inter, -apple-system, BlinkMacSystemFont, system-ui, sans-serif
- Weights: 400 (body), 500 (labels/UI), 600 (headings), 700 (wordmark)

#### Web / Desktop Typography Scale

Base unit: 14px (compact enterprise SaaS standard)

| Token                | Size | Weight | Usage                                  |
| -------------------- | ---- | ------ | -------------------------------------- |
| `--web-text-display` | 32px | 700    | Hero numbers, project budgets          |
| `--web-text-h1`      | 24px | 600    | Page titles                            |
| `--web-text-h2`      | 20px | 600    | Section headers, card titles           |
| `--web-text-h3`      | 16px | 500    | Sub-section headers, table headers     |
| `--web-text-body`    | 14px | 400    | Default body, table content            |
| `--web-text-small`   | 12px | 400    | Metadata, timestamps, secondary labels |
| `--web-text-tiny`    | 11px | 400    | Badges, footnotes, fine print          |

#### Mobile Typography Scale

| Token                   | Size | Usage                    |
| ----------------------- | ---- | ------------------------ |
| `--mobile-text-hero`    | 28px | Page titles              |
| `--mobile-text-title`   | 22px | Card titles              |
| `--mobile-text-body`    | 17px | Body text (iOS standard) |
| `--mobile-text-caption` | 15px | Metadata                 |
| `--mobile-text-label`   | 13px | Input labels             |

### Spacing Tokens

#### Web / Desktop Spacing (base unit: 4px)

| Token            | Value | Usage                                |
| ---------------- | ----- | ------------------------------------ |
| `--web-space-1`  | 4px   | Icon-to-text tight gap               |
| `--web-space-2`  | 8px   | Inline element gaps, icon padding    |
| `--web-space-3`  | 12px  | Form field internal padding          |
| `--web-space-4`  | 16px  | Card internal padding, standard gaps |
| `--web-space-6`  | 24px  | Card padding, section internal gap   |
| `--web-space-8`  | 32px  | Between cards/components             |
| `--web-space-12` | 48px  | Major page section gap               |

Border radius: `--web-radius-sm` 4px · `--web-radius-md` 8px · `--web-radius-lg` 12px · `--web-radius-xl` 16px

### Web Implementation — token wiring (Next.js + Tailwind)

Defining the tokens above is **not** sufficient: the web app must wire the Tailwind/PostCSS
pipeline, or every page renders unstyled (utility classes resolve to no CSS). The following
files MUST exist in `apps/web` — this is the implementation contract for the tokens:

| File                        | Required content                                                                                                                                                                                                                                                                                                                        |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `postcss.config.js`         | `plugins: { tailwindcss: {}, autoprefixer: {} }` (Next.js auto-runs it)                                                                                                                                                                                                                                                                 |
| `tailwind.config.js`        | `content: ['./src/**/*.{ts,tsx,js,jsx}']`, `darkMode: 'class'`, and `theme.extend` mapping the tokens — `colors.cos.*`, `borderRadius` `sm/md/lg/xl` → `--web-radius-*`, `fontSize` `display/h1/h2/h3/body/small/tiny` (named token utilities), `fontFamily.sans` = Inter Tight stack. Use `extend` so the default palette still works. |
| `src/app/globals.css`       | `@tailwind base/components/utilities` + `:root { --cos-*, --web-* }` declaring the token values + a `.dark { … }` block for the Dark Theme tokens                                                                                                                                                                                       |
| `src/app/layout.tsx` (root) | `import '@fontsource-variable/inter-tight'` then `import './globals.css'` — global CSS only loads when imported from a layout                                                                                                                                                                                                           |

Notes:

- **Spacing:** do not override Tailwind's scale — its default 4px base already equals the
  `--web-space-*` tokens (`p-4`=16px, `p-6`=24px, …).
- **Radius:** `rounded`=4px (sm), `rounded-md`=8px, `rounded-lg`=12px, `rounded-xl`=16px (mapped to `--web-radius-*`).
- **Font:** brand font is `@fontsource-variable/inter-tight` (one file, weights 100–900); fallback `Inter, -apple-system,
system-ui, sans-serif`.
- **Verification:** a build must emit non-empty utility CSS (compiling `globals.css` yields > 0 bytes) — an empty result
  means the pipeline is not wired.

### Web Implementation — App Router build constraints (Next.js)

These constraints are enforced by the CI `build` gate (`turbo run build`), not by `type-check`
(`tsc --noEmit` does not run `next build`) — see `30-testing-strategy` §30.12.

- **CSR-bailout hooks require a `<Suspense>` boundary.** `useSearchParams()`, `usePathname()`, and `useRouter()` opt
  the subtree into client-side rendering; without an enclosing `<Suspense>`, `next build` fails the route's static
  export with `missing-suspense-with-csr-bailout` ("Error occurred prerendering page"). Isolate the hook in a child
  component and wrap it: `export default function Page() { return <Suspense fallback={…}><Inner /></Suspense>; }`.
- **Serwist serves the service worker from a route — nothing is emitted to `public/`.** PWA is provided by
  `@serwist/turbopack` (Workbox-successor, Turbopack-compatible; next-pwa is webpack-only and unmaintained — ADR-047).
  The SW source lives at `apps/web/src/app/sw.ts` (excluded from `tsconfig.json` so its WebWorker lib does not conflict
  with the app's DOM types) and is bundled by `esbuild-wasm` at build time via the `/serwist/[path]` route handler
  (`createSerwistRoute`, `dynamic = 'force-static'`), which serves `/serwist/sw.js` with `Service-Worker-Allowed: /`.
  The client registers it via `<SerwistProvider swUrl="/serwist/sw.js">` in `app/layout.tsx`, and `next.config.mjs`
  wraps the config with `withSerwist`. Unlike next-pwa (`dest: 'public'`), **no `sw.js` / `workbox-*.js` artifacts land
  in `apps/web/public/`** — the SW is part of the `.next` build output, so there is nothing to git-ignore under `public/`.
- **`createSerwistRoute` keeps `useNativeEsbuild` at its `process.platform === 'win32'` default** — corrected
  2026-08-23; this rule previously read "MUST pass `useNativeEsbuild: false`".

  The original reasoning held at the time: the option defaults to `process.platform === 'win32'`, `esbuild` was not
  a dependency, and `next build` therefore failed on a Windows dev machine with `Cannot find package 'esbuild'`
  while Linux CI stayed green. Forcing the option to `false` made both platforms use the one declared bundler.

  It stopped holding once that fix was tried. `esbuild-wasm` validates the working directory it is handed and
  rejects a Windows absolute path (`C:\...`), so pinning the option to `false` moves the failure rather than
  removing it, and the working directory cannot be overridden from the route: `absWorkingDir` is absent from
  `@serwist/turbopack`'s 55-entry `SUPPORTED_ESBUILD_OPTIONS` allowlist, whose zod schema drops any key outside
  the list, and the `cwd` option feeds `outdir` instead. Using the native binary on Windows sidesteps the path
  validation entirely, which is why upstream defaults to it there.

  What the premise above got wrong is now fixed at the source: `esbuild` IS a declared devDependency of
  `apps/web`, **pinned to the same version as `esbuild-wasm`** so the two can never disagree on the service
  protocol, and `allowBuilds.esbuild: true` in `pnpm-workspace.yaml` lets its postinstall link the platform
  binary. Keep those two versions equal whenever either is bumped. See commit `332e75a7` and the comment in
  `apps/web/src/app/serwist/[path]/route.ts`, which records the investigation (TDD OQ-39).

#### Mobile Spacing

| Token               | Value | Usage                    |
| ------------------- | ----- | ------------------------ |
| `--mobile-space-xs` | 8px   | Icon padding             |
| `--mobile-space-sm` | 12px  | Card internal padding    |
| `--mobile-space-md` | 16px  | Section padding          |
| `--mobile-space-lg` | 24px  | Screen edge padding      |
| `--mobile-space-xl` | 32px  | Major section separation |

#### Mobile Border Radius

Added 2026-08-05, **corrected 2026-08-06** (product-owner decision both times). Until then this
section defined mobile colour, type and spacing but **no radius**, while `--web-radius-*` existed —
so every React Native card picked its own corner value and `TransparencyKit` had drifted to three
invented numbers (10 / 12 / 18) that appear in no specification.

**Mobile deliberately uses a TIGHTER scale than web, and the values are taken from the approved
mockups rather than copied from `--web-radius-*`.** The first version of this section copied the web
scale on the stated grounds that "the mockups were already drawn against it" — that claim was not
checked and was wrong. Every mockup under `mockup/mobile/` overrides Tailwind's radius in its own
`tailwind.config` (`theme.extend.borderRadius`): `DEFAULT` 0.125rem = 2px, `lg` 0.25rem = 4px, `xl`
0.5rem = 8px, `full` 0.75rem = 12px. A phone is held closer than a monitor, and the mockups reflect
that with corners half the size of the web scale.

| Token                 | Value | Usage                                                                             |
| --------------------- | ----- | --------------------------------------------------------------------------------- |
| `--mobile-radius-sm`  | 2px   | Chips, inline tags, small status pills                                            |
| `--mobile-radius-md`  | 4px   | List rows, icon tiles, accordion items, **buttons**                               |
| `--mobile-radius-lg`  | 8px   | Standard cards, input fields                                                      |
| `--mobile-radius-xl`  | 12px  | Hero / summary cards, emphasised panels                                           |
| `--mobile-radius-2xl` | 16px  | The dashed closing panel — the one radius the mockups leave at Tailwind's default |

**`--mobile-radius-lg` 8px ≠ `--web-radius-lg` 12px.** The names are shared but the values are not,
because the two surfaces are viewed at different distances. Do not "harmonise" them.

**Every status pill and badge takes `--mobile-radius-xl` (12px) — one token, no exceptions.**

The mockups do not agree with each other, so this is a platform ruling rather than a reading.
Recounted 2026-08-08 across all 321 `mockup/mobile/**/code.html` (was 226 on 2026-08-06 — the set has
grown, so the earlier 153 / 52 no longer describe it):

| `borderRadius.full` in the file's own `tailwind.config` | files   | families                                                                    |
| ------------------------------------------------------- | ------- | --------------------------------------------------------------------------- |
| `9999px` — a true capsule                               | **155** | tenant admin, procurement, CRM, most dashboards                             |
| `0.75rem` / `12px` (overridden)                         | **146** | authen, privacy policy, loading, site-engineer issues/AI, executive, worker |
| no `borderRadius` config in the file at all             | **20**  | —                                                                           |

Of the 155 capsules, 154 declare `9999px` explicitly and 1 omits `full` and inherits Tailwind's
default. The 12px family has gone from roughly a fifth of the set to nearly half; the ruling is
unchanged, and is now closer to what the mockups actually do than when it was written.

Two earlier versions of this paragraph were each wrong in one direction: the first assumed every
`rounded-full` was a capsule; the second (2026-08-06) read the override in the data-collection family
and generalised it to "every badge in `mockup/mobile/**`", which the count above disproves.

**The ruling costs nothing visually, which is why it is safe to make.** These badges run 18–26px
tall. Any radius at or above half the height renders identically, so at 18px `xl` IS a capsule, and
at 26px it is one pixel shy of one. The two mockup families were never more than ~1px apart on the
elements in question — the disagreement is in the config, not on the screen. One token therefore
serves both, and `borderRadius: 999` is not used for badges anywhere in `apps/mobile`.

This does not extend to genuinely round things — status dots, avatars, radio marks — which are
circles by construction (`borderRadius` = half the width) and are not on this scale at all.

`borderRadius: 999` is reserved for elements that are genuinely circular — avatars, the round icon
plate on a flow node, a dot indicator. Those are shapes, not steps on this scale.

#### Square icon plates — a quarter of the side

**A square plate 28px or larger takes `plateRadius(side)` = `round(side / 4)`.** Added 2026-08-06.

These are the tinted tile behind a glyph, an avatar box, a logo box. They are neither on the five-step
scale nor circles, which is why they were the last cluster of magic numbers left after the sweep:
nine sizes from 28px to 96px carrying six hand-picked radii. A fixed step cannot serve them — `md`
(4) reads as a hard square at 96px and `xxl` (16) swallows a 28px plate — so the radius scales with
the plate instead.

Below 28px a quarter is under 7px and stops reading as deliberate; those take `md` like any other
icon tile. A plate meant to be **round** takes half its width, not a quarter — a different shape, not
a smaller radius.

Applying the rule moved six plates by 1–2px, left three unchanged, and moved one — the 64px avatar on
the reset-password screen, which had been carrying a 40px plate's radius — by 6px.

| Plate                                   | Side | Was | Now |
| --------------------------------------- | ---- | --- | --- |
| `shieldPlate` (MFA)                     | 96   | 24  | 24  |
| `logoBox` (login)                       | 88   | 20  | 22  |
| `avatar` (reset-password)               | 64   | 10  | 16  |
| `sheetAvatar` / `sheetAvatarFallback`   | 52   | 14  | 13  |
| `iconPlate` (QuickAddMenu)              | 48   | 10  | 12  |
| `methodIcon` (reset-password)           | 44   | 10  | 11  |
| `moduleIcon` · `iconPlate` (admin home) | 40   | 10  | 10  |
| `brandIcon` (QuickAddMenu)              | 28   | 6   | 7   |

**One named exception remains**, recorded in place rather than left to be re-discovered: the
bottom-nav active-tab highlight (`MobileNav.tabBarItemStyle`) stays at 20. It is not a square plate,
and it is not a capsule either — the bar's height comes from `@react-navigation/bottom-tabs` and is
nearer 56 than 40, so 20 draws the rounded rectangle the mockups show.

**Sweep and ratchet (2026-08-06).** Because mobile had no radius token until 2026-08-05, components
had invented **253 literals across 56 files, using 21 distinct numbers** for a five-step scale. The
sweep took that to **28**, and `theme/__tests__/radiusRatchet.spec.ts` holds the count so it can only
fall. What remains is **circles** — radius = half the width, off this scale by the rule above — plus
the one named tab-highlight exception documented above. The square plates that were the last real
cluster now follow `plateRadius()` rather than nine hand-picked numbers.

#### Card body length — three lines, ellipsis past it

**A card's detail text renders at most three lines and truncates with `…`.** Added 2026-08-06.

Enforced in two places, and the distinction matters:

| Layer                                                      | What it does                                                                            |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `CARD_BODY_LINES = 3` + `ellipsizeMode="tail"` in the kit  | The runtime guarantee. Holds under Thai, a larger system font and a narrow handset.     |
| 140-character budget on `*Body` / `*.body` / `*.desc` keys | The editorial rule, tested in `cardBodyLength.spec.ts`, so the clamp never has to fire. |

140 characters is three lines measured off `01-identity.png` at 1080px, where a card body sits
between a 44px icon tile and a chevron and fits 42–48 characters per line. It is a proxy for the
line count, which no unit test can measure; the mockups (one to two lines per card throughout
`mockup/mobile/01_authen/05_privacy_policy/01_data_collection`, **withdrawn 2026-08-15** — see the
note under the dark-screen table) are the reason for the number. The measurement stands: it was taken
off a committed capture, and `cardBodyLength.spec.ts` is what holds it now.

**Truncation is a safety net, not a layout tool.** An ellipsis on a transparency screen hides the
thing the reader opened the screen for, and gives them no way to recover it. A card that truncates
in practice has copy that needs editing, not a ceiling that needs raising. Seventeen bodies were
over budget when this rule landed — `transparency.portal.retentionBody` was 306 characters, five
rendered lines — and all were shortened rather than clamped.

**Dynamic content is out of scope.** The clamp applies to the kit's card bodies, whose text is
authored copy. User- and API-supplied strings — issue descriptions, report bodies, vendor notes —
are not truncated by this rule; cutting a user's own words off at three lines is a different
decision and has not been taken.

#### A heading is stated once

**A card directly under a section label does not repeat that label as its own title.** Added
2026-08-06 (PO approval).

Eight pairs shipped with the label and the card's `title` reading from the SAME i18n key, so seven
screens said things like "HOW LONG THIS IS KEPT / How long this is kept": `delete.why`,
`delete.how`, `identity.access`, `iot.note`, `location.where`, `logs.retention`,
`network.retention`, `portal.rights`. The mockups under
`mockup/mobile/01_authen/05_privacy_policy/01_data_collection` (**withdrawn 2026-08-15**) head a
section once — the identity mockup put "Who Can Access?" above the card and left the card body alone.
The rule outlives the drawings: `headingStutter.spec.ts` scans screen source and is what enforces it.

`InfoCard`'s `title` is therefore optional, and omitting it is correct wherever the enclosing
`SectionLabel` already carries the words. A card that is one of SEVERAL in a section keeps its title:
there it names that card, it does not restate the section. Both elements set
`accessibilityRole="header"`, so a duplicate was also announced twice in a row with nothing between.

Held by `theme/__tests__/headingStutter.spec.ts`, which scans the screen sources rather than a render
tree: the defect is in what a screen passes, and a redundantly-titled card renders perfectly.

### Touch Target Standards (mobile)

| Element                 | Minimum         | Recommended    |
| ----------------------- | --------------- | -------------- |
| Primary button          | 44px            | 52px           |
| Secondary button        | 44px            | 48px           |
| Icon button             | 44px (WCAG AAA) | —              |
| List item               | 52px            | 60px           |
| Form input              | 48px            | 52px           |
| Checkbox / radio        | 44px tap area   | 24–28px visual |
| Spacing between targets | 8px minimum     | —              |

### Mobile Core Component Library (React Native)

| Component             | Description                                                        |
| --------------------- | ------------------------------------------------------------------ |
| `<TopBar />`          | Standard top app bar, every role — see below                       |
| `<MobileNav />`       | Bottom navigation, **exactly 4 items**, icons + labels — see below |
| `<QuickActionCard />` | 60px min height, icon + label + badge, single tap                  |
| `<PhotoCapture />`    | Camera + gallery grid, inline annotation, offline queue            |
| `<VoiceNoteButton />` | Hold-to-record, waveform animation, auto-transcription             |
| `<SyncPill />`        | Top-bar glyph carrying **every** sync state, offline included      |
| `<TaskCard />`        | Swipeable (swipe-right = done), status badge, photo count          |
| `<StatusChip />`      | Visual status: Todo / InProgress / Done / Syncing / Synced         |
| `<OptimisticList />`  | Instant UI update, rollback on failure, retry option               |
| `<LoadingState />`    | Loading placeholder / progress, 4 variants — see below             |
| `<PhotoAnnotation />` | Draw/erase over a captured photo, undo, flatten — see below        |

Do **not** implement on mobile: tables (use cards), navigation deeper than 3 levels,
modal-on-modal (use bottom sheets), dropdowns with 50+ items (add search).

#### Photo Annotation (`<PhotoAnnotation />`)

Mark up a site photo — the "inline annotation" `<PhotoCapture />` above has always specified but has
never had. **Mobile only** (product-owner decision 2026-07-17): photo markup is a field task done on
the phone where the photo is taken. A web (Konva) annotator was scoped and then dropped — research
into Procore, SiteCam, Fieldwire and Bluebeam found photo markup to be a predominantly mobile
feature, with no verifiable evidence of web photo annotation as an industry norm. Rationale and
on-device measurements in ADR-056.

**Engine: `@shopify/react-native-skia`** — React Native has no Canvas 2D, and Skia's own
`makeImageSnapshot` exports without a second capture library. Requires RN ≥ 0.79 / React ≥ 19
(satisfied on SDK 56 / RN 0.85.3). `tldraw` was rejected during the web evaluation and remains
**prohibited** for any future annotation surface — its SDK licence permits development use only and
bars production without a paid agreement (`LICENSE.md`: "Not to use the Software in Production
Environments"); the free hobby key forces a watermark.

**Rules — each one is load-bearing, not a preference:**

- **Draw the photo INSIDE the annotation canvas**, never as a separate view under a transparent
  overlay. Skia's `canvasRef.makeImageSnapshot()` captures Skia content only, so an overlay exports
  the strokes on a blank background. Drawing the photo as a Skia `<Image>` in the same canvas also
  sidesteps the `collapsable={false}` view-flattening trap entirely (which Fabric widened to iOS).
- **Undo is a retained-mode stroke list, not a pixel buffer.** Skia exposes no
  `getImageData`/`putImageData`, so the browser pixel-snapshot idiom does not apply. Batch strokes at
  interaction boundaries (pointer-up), not per frame.
- **Strokes persist in NORMALISED (0..1) coordinates**, so one stroke list renders correctly at both
  the editing size and the full-resolution export. Annotations stay re-editable; the flattened image
  is an export artifact, not the record.
- **Edit on a downscaled copy (long edge 2048), export at full resolution.** Measured: a 4000×3000
  photo costs 45.8 MB decoded vs 12.0 MB at 2048×1536.
- **`dispose()` every `SkImage`/`SkData`.** Measured: it genuinely returns the memory — a second
  identical decode round added ~5 MB rather than another 275 MB. Native heap does not shrink after
  dispose (the allocator keeps the pages); that is expected and is not a leak.
- **Never call `takePictureAsync({ skipProcessing: true })`.** On SDK 56 expo-camera bakes rotation
  into the pixels; `skipProcessing` returns the raw sensor image and is the documented cause of
  cross-device orientation chaos. `exif` defaults to false and its shape is device-dependent
  (typed `any`), so orientation must never be read from it. Normalise orientation before the photo
  reaches the canvas — an SDK 57 revert (merged 2026-07-16) returns iOS to EXIF-tagged, unrotated
  pixels, so code that relies on SDK 56's baking will break on upgrade.

Conflict resolution for the persisted stroke list is `CONFLICT_FLAGGED` — see
[17-offline-mobile-sync §17.5](17-offline-mobile-sync.md).

#### Loading State (`<LoadingState />`)

One component per platform, same name and same props, so a loading state reads identically on
mobile and web (product-owner decision 2026-07-17; ADR-055). It is **presentational only** — it
owns no data source, no timer, and no i18n copy.

| Prop       | Type                       | Behaviour                                                                                                                                                                                                                                                                                                                 |
| ---------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `variant`  | see table below            | Required. Selects the layout.                                                                                                                                                                                                                                                                                             |
| `progress` | `number` (0–100)           | Optional. Omitted → indeterminate (no bar, no %). Given → clamped and shown.                                                                                                                                                                                                                                              |
| `label`    | `string`                   | Optional. Caller passes **already-translated** text — the component never holds a key or a literal (QM-3).                                                                                                                                                                                                                |
| `theme`    | `'light' \| 'dark'`        | Required on mobile. Selects `colors` vs `darkColors` (§32.7 Mobile Dark Surfaces).                                                                                                                                                                                                                                        |
| `tone`     | `'default' \| 'onPrimary'` | Mobile, `micro` only. `onPrimary` for a loader INSIDE a primary-filled control (a submit button mid-request — the mockup's "inside a button" case); the default ink is the button's own fill colour and would vanish in it.                                                                                               |
| `color`    | `string`                   | Mobile, `micro` only. Overrides `tone` for a host carrying a meaningful colour of its own — `<QuickActionRow />`'s per-action accent, where a `primary` ring would erase the grouping the accent makes. **A palette colour, never a hex**, and it must clear WCAG SC 1.4.11 (3:1) against the surface it sits on (§20.8). |

**Variants are per platform** — the layouts genuinely differ, so the union is not shared:

| Platform | Variants                      | Notes                                                                               |
| -------- | ----------------------------- | ----------------------------------------------------------------------------------- |
| Mobile   | `widget` `list` `ai` `micro`  | `list` = stacked card skeletons. **No `table`** — §32.7 prohibits tables on mobile. |
| Web      | `widget` `table` `ai` `micro` | `table` = row skeletons across columns. **No `list`.**                              |

Rules:

- **This component is the only way to render a loading state.** A screen, region, list, card or
  button that waits for data — a fetch, a submit, a sync flush, an AI job — renders that wait with
  `<LoadingState />`, never a raw `ActivityIndicator`, a hand-made skeleton `View`/`div`, a line of
  text, or a placeholder glyph (`…`). On 2026-08-17 a sweep found 24 hand-rolled indicators that had
  accumulated beside this component, and web's own copy had reached **zero** production consumers
  while ~35 list pages showed a plain "Loading…" line through one shared `DataTable` — a component
  can be specified here and still go unused, which is what this rule exists to stop. The per-task
  obligation, including which variant a given shape takes, is **Rule 40**
  (`context/00_master_construction_os.md` § ROOT CAUSE PREVENTION RULES);
  `scripts/ci/check-loading-state.sh` gates the two machine-checkable classes in the CI lint job and
  by design cannot see the text and placeholder ones.
- **Tokens only.** Mobile reads `colors` / `darkColors` from `apps/mobile/src/theme/tokens.ts`;
  web reads Tailwind token utilities. No hardcoded hex, no arbitrary values.
- **Caller owns progress.** The component does not read the sync queue, an AI job, or any store —
  §17.6 sync ordering and AI progress are the caller's concern. This keeps one component usable for
  sync, AI, and plain fetch alike.
- **Caller owns copy.** No default string. A `<LoadingState />` with no `label` renders no text.
- **Not a screen.** It is a presentational component, not a screen or workflow step, so QM-15 does
  not require a feature flag (ADR-055).
- **The `ai` variant is the only one carrying the motif** — see "Exception 2 — loading states" above
  for the per-platform motif. `widget` / `list` / `table` / `micro` are flat skeletons and spinners.
- **A determinate loader must finish its run before it is replaced** (product-owner decision
  2026-08-17). A fetch settles whenever it settles, usually mid-travel, so a loader that unmounted on
  that instant vanished at, say, 70% and the completion the user was watching never happened on
  screen. Mobile's `<LoadingBoundary />` therefore drives the bar to 100, holds one fill duration,
  then crossfades to the content. Indeterminate loaders do not hold: with no honest percentage there
  is nothing to arrive at, and waiting would delay content for a sweep that never completes.
- **Every loader animates.** The mockup's own bar counts up and eases (`mockup/mobile/00_loading`
  runs it on a timer; its bar carries `transition-all duration-1000`), so a determinate loader counts
  its percentage up and eases its fill to the value — one animated value driving both, so the number
  and the bar can never disagree. An indeterminate loader sweeps a segment across the track instead
  of standing still, and never shows a percentage.
- **The percentage and the bar are ONE animated value, and it is JS-driven.** Splitting them — the
  bar on React Native's native driver for smoothness, the number on JS because only JS can write
  text — makes them disagree exactly when it matters: the native driver's purpose is to keep
  animating **while the JS thread is blocked**, which on the app launch is the moment React mounts
  the whole app tree. The bar ran to full while the percentage sat at 0 (observed 2026-08-17, fixed
  the same day). Smoothness is bought instead by what the bar animates — a `translateX` transform
  behind `overflow: hidden`, never an animated `width`, so no layout pass runs per frame — and by
  isolating the counting text in its own component so a 1% tick re-renders one text node instead of
  every skeleton on the card.
- **Skeletons animate per element, never as one band across the card** (product-owner decision
  2026-08-17). The mockup puts `.skeleton-pulse` on each bar and plate separately — eleven of them on
  one screen, each running its own gradient sweep. A single band drawn over the whole card reads as a
  pane sliding across it rather than as each placeholder filling in, and it crosses elements that
  have nothing to do with each other.
- **A percentage requires more than one load step.** A surface that loads with a single request can
  only ever report 0% and then 100% — the number never moves, so it reads as a stuck loader. Such a
  surface passes no `progress` and shows an indeterminate loader instead. This is the same rule that
  keeps a `micro` ring inside a submit button wordless: one POST, one step. `loadProgress(doneSteps,
totalSteps)` in each app's `lib/loadingState.ts` encodes it — it returns `null` below two steps —
  and the count is of the steps that settle **while the loader is on screen**, not of every API the
  file imports. (Vendors looks multi-step and is not: its directory fetch clears the loader, and the
  per-vendor scores land afterwards, against a list the reader can already see.)

#### Standard Top Bar (`<TopBar />`)

Every role's authenticated screens carry one shared top app bar (product-owner decision 2026-07-16),
so the mobile app frames its content between two pieces of chrome — the top bar and the bottom nav.

**On dark the two bars take DIFFERENT backgrounds, and neither is `--cos-dark-surface`
(product-owner decision 2026-08-06, reversing the "each on a **surface** background distinct from the
content area" wording that stood here from 2026-07-16):**

| Bar             | Dark background                          | Mockup class                                     |
| --------------- | ---------------------------------------- | ------------------------------------------------ |
| `<TopBar />`    | `--cos-dark-bg` `#020617`                | `bg-surface dark:bg-dark-bg`                     |
| `<MobileNav />` | `--cos-dark-surface-container` `#102034` | `bg-surface-container dark:bg-surface-container` |

Resolved from `mockup/mobile/04_tenant_admin/01_home/01_home_dashboard/code.html`, which sets
`<html class="dark">` with `darkMode: "class"`. The header carries three background utilities; the
`dark:` one is emitted as `.dark .dark\:bg-dark-bg`, so it wins on **specificity** (two classes to
one) over `bg-surface` and `bg-surface-container-low` regardless of source order. The nav names the
same value in both modes, and additionally carries `rounded-t-xl` and a top border — it is drawn as a
raised sheet, which is why it does not follow the header onto the page colour.

The original rule assumed chrome must differ from the content. On the dark default what matters is
that `--cos-dark-surface` `#0F172A` is the **card** colour, so chrome drawn in it reads as a card
welded to the edge of the screen. `04-tenant-admin/01-Home/02-ta-quick-action.png` shows the intended
top bar already, because `QuickAddMenu` draws its own header on `bg`.

Light is unaffected. There the mobile palette inverts — `bg` is the grey `#F5F5F5` page and `surface`
the white card — so chrome on `surface` is already distinct from the content without borrowing the
card colour; `<MobileNav />` overrides `tabBarStyle` only on dark.

> `--cos-dark-surface-container` `#102034` was added by this decision: the set had no token meaning
> "chrome sheet", which is why the nav had been on the card colour. Counted across `mockup/mobile/**`,
> 217 `code.html` files define `surface-container` as `#102034` and 5 as `#0F172A`.
>
> **Still open — the bar's other mockup properties.** The nav also has `rounded-t-xl` (12px top
> corners), `shadow-lg`, and `border-t border-outline-variant/10` — a 10%-alpha hairline, against the
> opaque `--cos-dark-outline` the implementation uses. Only the background was decided here.

| Element | Content                                                                                                                                                |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Left    | App icon + `CONSTRUCTION OS` wordmark (doubles as the drawer trigger, PO 2026-07-31); leading `<` on child screens only (PO 2026-08-04)                |
| Right   | `<SyncPill />` · Help `?` → `/support` · notification bell (unread badge → `/notifications`) · avatar (photo/initials → the drawer's Account Settings) |

> **The Right cell listed only the bell and the avatar until 2026-08-17**, while the implementation
> had carried four controls for months. Both missing entries were decided in prose elsewhere in this
> document and never reached the table: `<SyncPill />` became the standard sync indicator for every
> role on 2026-08-04 (recorded three paragraphs below, where the `SyncStatusBar` strip was deleted),
> and the Help `?` was added to every authenticated screen on 2026-07-29 with no spec entry at all —
> `apps/mobile/src/components/TopBar.tsx` was its only record. A table that omits half a bar is worse
> than no table: it reads as a complete contract. Both are now listed, per Rule 37.
>
> **The Help `?` navigates as of 2026-08-17** (product-owner decision). It had opened an
> `Alert.alert('Help & Support', 'coming soon')` since 2026-07-29 — honest at the time, because the
> Support Centre existed only pre-auth and could not be reached from a signed-in screen (AuthGate
> redirects `isAuthenticated && inAuthGroup → /(app)/home`). The post-auth route added that day makes
> it a real destination, and it is the **single** post-auth entry: the drawer's Support row was
> removed in the same change. See § Support Centre below.

- **One component, all roles.** It is not per-screen; it lives in the authenticated layout so a role
  screen never renders its own header. The safe-area strip above it takes the same background, so
  the notch region reads as part of the bar.
- **Palette follows the theme** (product-owner decision 2026-08-04; previously "follows the screen").
  In dark mode the bar uses `--cos-dark-bg`, in light mode `--mobile-surface`.
- Avatar falls back to initials, then a person glyph, when there is no `photo_url` (§11 `platform.users`).
- **Back control on child screens.** A pushed child screen carries a leading bare chevron `<`
  (product-owner decision 2026-08-04, reversing the 2026-07-31 removal). It is rendered **in addition
  to** the clickable breadcrumb below the bar, not instead of it: the chevron is the one-tap gesture,
  the breadcrumb shows depth and can jump more than one level. "Is a child screen" has a single
  source of truth — `isChildRoute()` in `components/Breadcrumb.tsx`, backed by the breadcrumb map —
  so a route cannot get one affordance without the other. Top-level tab screens get neither.
- **A screen is named ONCE, and a top-level tab screen is named by its TAB.** A tab screen must not
  render an in-content page title: the active bottom-nav item already carries the name, and repeating
  it inside the content states it twice — the same defect `headingStutter.spec.ts` guards between a
  `<SectionLabel />` and the card beneath it, one level up. A pushed **child** screen is named by its
  breadcrumb, not by an in-content title either. So no screen in the app draws its own `<h1>`.

  > **This rule was undocumented until 2026-08-08 and cost a full screen set.** It had been applied
  > consistently in code since the 2026-07-31 shell rework — all 25 tab routes comply — but it was
  > written down only in `docs/screens/android/README.md`, a per-capture narrative, and never here.
  > Three of the four Site Worker screens therefore shipped with a title, and the reason is worth
  > keeping: the **mockups draw one** (`รายการงานวันนี้`, `บันทึกกิจกรรมประจำวัน`,
  > `เช็คลิสต์ความปลอดภัย`), ADR-085 makes mockups authoritative for style, and the only nearby
  > sentence in this section — "a role screen never renders its own header" — sits under **TopBar**
  > and reads as being about the bar, not about page titles. Following the spec and the mockups
  > faithfully produced the wrong screen. Held by `theme/__tests__/pageTitle.spec.ts`.
  >
  > A record's own name is NOT a page title and is unaffected: `inspections`, `portfolio`, `invoices`
  > and `orders` each render the selected checklist / project / invoice number / PO number when the
  > tab switches to a detail view, which names the RECORD rather than the screen.

#### Support Centre — two routes (`?` and GET SUPPORT)

The Support Centre has **two** routes as of 2026-08-17 (product-owner decision), not one. They share
their content and differ in frame and extras — the shape `PrivacyPolicyDocument` already uses for the
same pre-auth/post-auth pair (PO 2026-08-04).

|         | Pre-auth                                     | Post-auth                                              |
| ------- | -------------------------------------------- | ------------------------------------------------------ |
| Route   | `app/(auth)/support.tsx`                     | `app/(app)/support.tsx`                                |
| Entry   | OTP step's `GET SUPPORT` footer item         | `<TopBar />` Help `?` — the **only** post-auth entry   |
| Palette | pinned dark (§32.7 pinned pre-auth surfaces) | follows the user's theme                               |
| Chrome  | own back + title bar, connection mark, build | none — `<TopBar />` + `Breadcrumb` supply it           |
| Adds    | `FIELD ASSISTANT` panel                      | identity · active project · diagnostics · role modules |

**Shared** (`components/SupportCenterDocument.tsx`): system status (a real `GET /health/live` probe) ·
search · emergency contacts · field troubleshooting.

**Why two routes and not one link.** `AuthGate` (`app/_layout.tsx`) redirects in both directions —
`isAuthenticated && inAuthGroup → /(app)/home` — so a signed-in screen cannot push to anything in the
`(auth)` group. Any "post-auth entry" that points at an `(auth)` route silently lands on Home. This is
not hypothetical: `/support` was added to the drawer's `SHARED_LINKS` on 2026-08-10 for exactly this
purpose and never once worked, because the reasoning recorded there — "expo-router groups add no path
segment" — is true of path resolution and irrelevant to the guard. It went unnoticed for a week
because `drawerLinks.spec.ts` asserted the ARRAY, not that its routes resolve; the spec now checks the
route directory instead.

**The `?` is the single post-auth entry.** The drawer's Support row was removed in the same change
rather than kept alongside it (product-owner decision 2026-08-17), so `drawer.support` is gone from
the i18n catalogues.

**The two screens are deliberately not identical** (product-owner decision 2026-08-17). Everything the
post-auth route adds is data the app already holds — signing in adds **no backend** here:

- **Identity** — name + role from `authStore`, so the person on the phone need not recite them.
- **Active project** — from `projectStore`, the same answer `<ProjectContextBar />` prints; a
  "none selected" line rather than a placeholder when the picker has not been answered.
- **Diagnostics** — connection, queued changes, unresolved conflicts, build. These replace the
  `FIELD ASSISTANT` panel, which exists to say something when the app knows nothing else.
- **Role modules** — derived from `drawerLinksFor(role)`, i.e. the §6.4 matrix. It answers "should I
  be able to see X?". It is **not** a help-article list.

**What it does not add.** Identity, project and diagnostics are all the app's own state — signing in
adds no backend _to this pair of screens_. **Search stays disabled on BOTH routes** (PO 2026-08-09,
re-affirmed 2026-08-17 and again 2026-08-18): there is still no `help_article`/`faq` table and no
search endpoint, and ADR-093 gives it none — a signed-in user can see a dead control as clearly as a
signed-out one.

> **The two paragraphs this one replaced stopped being true on 2026-08-18 (ADR-093).** They read
> _"No better phone number … both routes read the same `EXPO_PUBLIC_SUPPORT__` deployment config"*,
> _"No ticket: no ticket table exists either"_ and _"Quick Help Chat stays unavailable on BOTH
> routes"_. Each was accurate when written and each was a statement about what the schema held, so
> each fell the moment the product owner decided (2026-08-18) to build the backing rather than keep
> drawing dead controls. What replaced them:
>
> - **The desk is data.** `platform.support_desk_default` (no `tenant_id`, no RLS, one row, public
>   read — a support number you must sign in to read is useless to someone who cannot sign in) merged
>   under `platform.tenant_support_desks` (RLS, `TENANT_ADMIN`). `GET /api/v1/support/desk` is public
>   and returns the default alone; with a JWT the tenant row is merged over it field by field. The
>   `EXPO_PUBLIC_SUPPORT_*` variables survive **below both** as the offline fallback — the one state a
>   support screen must survive, since a person opens it _because_ something is broken.
> - **Tickets exist.** `platform.support_tickets` + `platform.support_messages`, both carrying the
>   widened `rls_tenant_or_anonymous` policy, because Help Chat is open **pre-auth and post-auth**
>   (PO 2026-08-18) and a pre-auth ticket has no tenant to be scoped by. An anonymous ticket is
>   addressed by a one-time token (SHA-256 stored, spec §5.4.3) — RLS scopes the anonymous set but
>   cannot divide it.
> - **Help Chat is answered by AI first and escalates to a person.** Every AI turn goes through
>   `LLMProvider` and the Phase 12 `HallucinationGuard`, and the verdict (`model_used`, `confidence`,
>   `low_confidence`) is **stored on the message and rendered**, the way `<ProcurementInsight />`
>   renders exactly what its endpoint returns. The chat is advisory (§22.3): it may not transition a
>   workflow, approve anything, or mutate financial data.
> - **`AGENT ONLINE` is not implemented as drawn**, and neither is the drawing's
>   `"I'm Terminal 01, your technical support agent"`. There is no agent presence service and no
>   `SUPPORT_AGENT` role in §6.2, so an `ESCALATED` ticket waits on `SYSTEM_ADMIN` until that role and
>   its console exist. The header says the assistant is ready, or that a person has been asked for and
>   has not answered — labelling an AI turn as a human is the same misstatement ADR-081 forbids in the
>   other direction.

#### IT Support Hotline (`02_hotline_details`)

A child of the Support Centre on both sides of login, reached by the **chevron** the 2026-08-17
drawing puts on the IT Hotline card — which is why that card no longer dials in place (PO decision
2026-08-18). `CALL NOW` on the detail screen is the dial.

Everything on it is desk data or editorial copy; nothing is asserted by this repository. The drawn
numbers `+1 (800) 555-0199`, `+66 2 555 0100` and `+66 38 555 0101`, and the drawn hours `24/7` and
`08:00 - 18:00`, are **placeholders committed nowhere** — they render only what a deployment or a
tenant has set, and an unset block does not render at all.

The **preparation checklist is rewritten against what this product actually has** (ADR-093
Rationale). The drawing asks for `Device ID or Asset Tag` — _"located on the back of the device
hardware"_ — `Site Location` and `Error Code`. There is no asset tag on the back of anything here, but
there is a device record the app can read (ADR-082/083), a project code in `projectStore`, and a
`COS-{DOMAIN}-{NNN}` code that every error response really carries (QM-10). The checklist names those.

The drawing's own two files disagree about the top bar: `code.html` ends it with an empty 44px spacer,
`screen.png` shows a trailing call glyph. `code.html` is followed — it is the drawing; the PNG is a
render of some state of it — and the dial stays the one full-width `CALL NOW` control, so the screen
has exactly one way to place the same call.

Neither route is a tab for any role: the withdrawn drawing's `Field | Tasks | Support | Profile` bar
is no role's set, and §32.7 fixes each role at exactly four tabs. The post-auth route is registered
`href: null` in `<MobileNav />` and carries a `Breadcrumb` entry (Home → Support), which is what makes
it a child screen.

#### Bottom Navigation (`<MobileNav />`)

**Exactly four items, varying by role** (product-owner decision 2026-08-04). Four is the standard,
not a ceiling: it keeps every tap target wide enough on a 360dp phone and makes the nav learnable
across roles.

- **No Profile tab, for any role.** Profile is reached from the avatar in the top bar, which is
  present on every screen. A tab would have spent one of the four slots on a destination that
  already has a permanent affordance.
- **Account-level destinations belong in the drawer, not the nav** — Settings, Security & MFA and
  **Privacy Policy** (the last added by product-owner decision 2026-08-04; it is not in the drawer
  mockup, which only ever reaches the policy from the login footer and so leaves a signed-in user
  with no route to a notice PDPA §23 requires to remain available).

  > **This rule was silently broken for three days, and the notice was unreachable for them.** The
  > Privacy Policy row was added to the drawer on 2026-08-04 exactly as this bullet says. Commit
  > `44d46a40` (2026-08-09, "split account settings out of the drawer") deleted the row and left its
  > five-line justification comment orphaned in `NavigationDrawer.tsx`; the screen stayed reachable
  > only because `AccountSettings` still carried its own `profile-privacy-link`. Commit `7f65cc59`
  > (2026-08-14) removed that copy too, giving as its reason "it is a drawer row now" — false since
  > 08-09. From 2026-08-14 to 2026-08-17 **nothing in the app pushed `/privacy-policy`**, which also
  > stranded the Transparency Portal and its eight child screens: `/transparency` is entered from the
  > policy's Data Collection card and from nowhere else.
  >
  > Nothing failed. The route file existed, `<MobileNav />` mounted it `href: null`, `Breadcrumb` had
  > a crumb for it, `pageTitle.spec.ts` and `routeRegistry` were green — because **no test asked
  > whether anything navigates there.** Restored to `SHARED_LINKS` on 2026-08-17 and now held by
  > `drawerLinks.spec.ts` ("the Privacy Policy is reachable after sign-in (PDPA §23)"), which asserts
  > the entry point exists rather than that the destination does.
  >
  > **A row onto a screen that exists in both route groups must name its group.** `/privacy-policy`
  > resolves to both `app/(auth)/privacy-policy.tsx` and `app/(app)/privacy-policy.tsx` — groups add
  > no path segment — so a bare push is ambiguous, and the `(auth)` candidate is behind AuthGate's
  > `isAuthenticated && inAuthGroup → /(app)/home` redirect. `DrawerLink.href` carries the qualified
  > form (`/(app)/privacy-policy`) while `route` stays bare for the active-state comparison, since
  > `usePathname()` never reports the group. The same rule is why the TopBar `?` pushes
  > `/(app)/support` rather than `/support`.

- Child screens stay mounted as `href: null` siblings so `router.push()` reaches them and
  `backBehavior="history"` returns to the screen they were pushed from.
- **Palette follows the theme**, the same as the top bar — the whole shell is one mode.

All twelve roles are resolved as of **2026-08-04**. Eleven carry four tabs; `SYSTEM_ADMIN` carries
one, and that is the correct answer for it rather than an outstanding gap:

| Role                | Tabs                                     | Note                                                                                                                      |
| ------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `CRM_SALES_MANAGER` | Home · Leads · Opportunities · Customers | Built 2026-08-04 — exactly the three pages §20.7.10 defines                                                               |
| `VIEWER`            | Home · Projects · Procurement · Budget   | See the read-only constraint below                                                                                        |
| `SAFETY_OFFICER`    | Home · Incidents · Checklists · Permits  | Settled 2026-08-13 — see below; "Checklists" is the `/inspections` route relabelled                                       |
| `SYSTEM_ADMIN`      | Home                                     | **Not a gap.** §20.7.11 puts its work in the `/admin` panel (§20.4), a web route explicitly "not visible to tenant users" |

**`SAFETY_OFFICER`'s bar was never actually decided until 2026-08-13, and this table is where that
is now recorded.** From 2026-08-04 the role rendered `Home | Inspections | Reports | Incidents` — not
by decision but as a by-product of the order of the tab table in code, while the comment above that
table claimed `Home | Incidents | Inspections | Reports`. Both lines were written in the same commit
and disagreed from that day. Nothing caught it: master §Phase 10 enumerates no Safety Officer mobile
nav (§20.7.7 says so in those words), this table listed only the three roles resolved on 2026-08-04,
no test asserted the order, and the role has never appeared in `docs/screens/android/`.

The bar now follows `mockup/mobile/07_safety_officer/`, whose three drawings agree on
`Home | Incidents | Checklists | Profile`. Profile is no role's tab (the rule above), so the freed
slot takes **Permits** — §20.7.7's fourth page for this role, and the step master §9 assigns to it
alone (initiator → Safety Officer → PM final). Every slot but Home is therefore a §20.7.7 page,
which neither `reports` nor `inspections` could claim under the old bar. `reports` returns to the
role's drawer, derived from §6.4's "Site reports" R cell, exactly as `/inspections` did for
`SITE_ENGINEER` on 2026-08-12. Held by `apps/mobile/src/lib/__tests__/drawerLinks.spec.ts`, which
asserts the ORDER — the assertion that was missing for nine days.

**VIEWER's tab set is constrained, not chosen freely.** §6.8 grants read on seven modules (Project,
BOQ, Tasks, Site reports, Issues, Procurement, Finance), but §20.7.9 also requires that **no
create/edit/approve actions are rendered**. An audit on 2026-08-04 found that several otherwise
eligible screens render write controls that are **not** role-gated — `issues` has an unconditional
`create-issue-button`, `tasks` has `onSave`, `payments` has `approve` — so granting them to VIEWER
would breach the read-only rule rather than merely look untidy. The three screens chosen
(`projects`, `procurement`, `budget`) were each verified to contain no `onPress`/`Pressable` at all.
BOQ has no mobile screen at any status.

Adding `reports` / `issues` / `tasks` to VIEWER therefore requires building a read-only mode for
those screens first — it is not a `MobileNav` configuration change.

### Mobile Implementation — token wiring (React Native + Expo)

As with web, defining the mobile tokens above is **not** sufficient — they take effect only when
wired into the React Native app. The contract for `apps/mobile`:

| Item                  | Required content                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/theme/tokens.ts` | Export the `--mobile-*` colours, typography (hero/title/body/caption/label), spacing (xs–xl), touch-target minimums, and `fontFamily` names as typed JS objects (RN has no CSS variables — tokens are a module, not `:root`).                                                                                                                                                       |
| Brand font            | Add `expo-font` + `@expo-google-fonts/inter-tight`; load `InterTight_400Regular/500Medium/600SemiBold/700Bold` via `useFonts` in the root `app/_layout.tsx` and hold render until `fontsLoaded`.                                                                                                                                                                                    |
| Icon library          | `@expo/vector-icons` (product-owner decision 2026-07-16) — add it explicitly with `npx expo install @expo/vector-icons`; it is **not** a transitive dependency of the `expo` package. Use the `MaterialIcons` set — the family the mockups are drawn in. Icons are glyphs, so they take `color` from the theme like text. Emoji are acceptable only where a glyph would read worse. |
| Components            | Use `colors.*` / `fontFamily.*` from the theme — never hardcode hex or `fontWeight`. With custom fonts, select weight by `fontFamily` (e.g. `fontFamily.semibold`), not `fontWeight`.                                                                                                                                                                                               |
| Expo config           | `app.json` (or `app.config.js`) MUST exist with `expo-router` + `expo-font` plugins and `main: 'expo-router/entry'`, or the app does not boot and fonts never load.                                                                                                                                                                                                                 |

Notes:

- Mobile tokens are React-Native-only; do **not** reuse web `--cos-*` values (e.g. `--mobile-primary`
  `#0066FF` ≠ `--cos-blue` `#2563EB`, by design — outdoor sunlight visibility).
- **Verification:** `apps/mobile` type-checks and the components reference `theme/tokens` (no hardcoded hex).

---

## 32.8 Known Deferred Deliverables

Items in this section are **known** (implementation is understood) but **not yet done**
because of a dependency or resource constraint. These are distinct from Extension Points,
which mark architectural uncertainty where the implementation strategy is unknown.

When a deferred deliverable is completed, remove it from this section and commit the
implementation in the same PR.

### Phase 2 — Auth + Tenant System

#### KD-AUTH-001: Keycloak Admin REST API Integration for Path A and Path B User Provisioning

**Status:** READY — implemented in Phase 2 via `KeycloakAdminService`

**Scope — Path A (phone/OTP):**

When OTP verification succeeds, before creating the COS user record:

1. Call `POST /admin/realms/{realm}/users` with `username=phone`, `enabled=true`, custom attributes `tenant_id`,
   `user_id`, `role`
2. Retrieve Keycloak UUID from `Location` response header
3. Call `PUT /admin/realms/{realm}/users/{id}/reset-password` — set ephemeral one-time credential (`temporary: true`)
4. Call Keycloak Direct Grant: `POST /realms/{realm}/protocol/openid-connect/token` with `grant_type=password`,
   username=phone, password=ephemeralCredential — returns RS256 access token + refresh token
5. Create `platform.users` record with `keycloak_user_id` = Keycloak UUID
6. Create `platform.tenant_memberships` record; emit `identity.user.created.v1`

**Scope — Path B (email/Keycloak OIDC):**

When a Tenant Admin creates a Path B user:

1. Call `POST /admin/realms/{realm}/users` with `username=email`, `email`, `enabled=true`, custom attributes `tenant_id`,
   `user_id`, `role`
2. Retrieve Keycloak UUID from `Location` response header
3. Set user attributes: `tenant_id`, `user_id`, `role` (see `05-security-compliance` §5.4.2)
4. Create `platform.users` record with `keycloak_user_id` = Keycloak UUID
5. Create `platform.tenant_memberships` record; emit `identity.user.created.v1`

**Implementation:**

- `@keycloak/keycloak-admin-client` added as a backend dependency
- `KeycloakAdminService` (identity module) exposes:
  - `provisionPhoneUser(phone, displayName, realm): Promise<{ keycloakUserId: string }>` — Path A
  - `createEmailUser(email, displayName, realm): Promise<{ keycloakUserId: string }>` — Path B
  - `getDirectGrantToken(phone, ephemeralCredential, realm): Promise<KeycloakTokenResponse>` — Path A token exchange
  - `deleteUser(userId, realm): Promise<void>` — rollback on downstream failure
- `directAccessGrantsEnabled: true` on `cos-backend` Keycloak client (required for Direct Grant)
- Keycloak Admin credentials: client `cos-backend` with `realm-management` role — inject via `KEYCLOAK_ADMIN_CLIENT_SECRET`
  env var (AWS Secrets Manager / Vault — see `05-security-compliance` §5.2; never hardcode)

### Phase 6 — Site Operations

#### KD-SITE-001: site.material.consumed.v1 Event Emission

**Resolution approach:**
A `material_consumptions` table is added to the `site_ops` schema in Phase 6. `task_id` is stored
as a free-text reference (nullable) — no FK to a Task entity — so the event can be emitted with a
valid payload now. `material_id` is a UUID generated on insert (acts as the record's own identity);
it will gain a FK to a Material catalogue entity when that entity is built in a future phase.

**Endpoint:** `POST /api/v1/site-reports/:reportId/materials`

**Emits:** `site.material.consumed.v1` on every successful insert.

**Future migration:** when a Material catalogue entity is built, add FK constraint
`material_consumptions.material_id → materials.material_id` via a non-breaking migration.

---

## 32.9 Integration Stub Pattern

Every integration EP (Extension Point) that is deferred until a trigger condition is met must be
implemented as a **stub** from day one so that the service compiles and starts without the real
integration active.

### Stub Behaviour by Integration Type

Two behaviours are defined depending on whether the integration is on a **critical path**:

#### Type A — Non-critical-path integrations (CRM, BIM, ERP, and similar)

The stub **must**:

1. Log at `WARN` level when called, including the integration name and method — so operators know
   the code path was reached without a real implementation active.
2. Throw a typed exception immediately (fail-fast). Returning `null` or an empty value is
   prohibited because the caller may interpret it as a successful result and continue, leading to
   silent data corruption or invalid workflow state.

Rationale: reaching a non-critical-path stub in production means either a misconfiguration or a
tenant was granted access to a feature before it was activated. Failing fast makes the problem
immediately visible.

#### Type B — Critical-path integrations where the service must remain operational without the integration (IoT)

The stub **must**:

1. Log at `WARN` level when called.
2. Return safe defaults so the calling service continues to operate in a degraded but valid state.

Which integrations are Type B is explicitly stated in the phase spec for that integration. If the
phase spec does not state Type B, the integration is Type A.

Currently specified as Type B:

| Integration                             | Specified in                   |
| --------------------------------------- | ------------------------------ |
| IoT Device (Phase 21+)                  | `33-digital-twin-iot.md` §33.7 |
| Digital Twin — IoT ingestion (Phase 24) | `33-digital-twin-iot.md` §33.2 |
| Digital Twin — BIM import (Phase 24)    | `33-digital-twin-iot.md` §33.2 |

### Stub Implementation Rules

- The stub must implement the full interface defined in the phase spec — no partial implementations.
- The stub must be registered in the NestJS DI container from the first phase that introduces the
  interface, replaced by the real implementation when the trigger condition is met.
- The stub file is committed alongside the interface definition in the same PR — never as a
  follow-up.
- When the trigger condition is met and the real implementation is built, the stub file is deleted
  in the same PR as the real implementation.

### Reference

See `13-product-architecture.md` §13.3–13.5 for the list of all integration EPs and their trigger
conditions.

---

## 32.10 Feature Flag Lifecycle

Feature flags must not accumulate indefinitely. A flag that has reached 100% rollout
is dead code — it must be removed within 30 days.

### Lifecycle States

| State        | Definition                                         | Required action                                                         |
| ------------ | -------------------------------------------------- | ----------------------------------------------------------------------- |
| ACTIVE       | Flag live; rollout < 100%                          | Monitor, iterate                                                        |
| FULL_ROLLOUT | Flag at 100% rollout for < 30 days                 | Schedule cleanup PR in current sprint                                   |
| STALE        | Flag at 100% rollout for > 30 days without cleanup | Add to `docs/registers/feature-flag-cleanup-backlog.md`; escalate in next sprint |
| REMOVED      | Flag check deleted from code and registry          | Strike through entry in backlog; must be in same PR as code deletion    |

### Rules

- A flag transitions to STALE automatically 30 days after reaching 100% rollout
- Stale flags are tracked in `docs/registers/feature-flag-cleanup-backlog.md`
- Flag cleanup (code deletion + backlog update) must be a single PR — never split
- Flag cleanup is a hard prerequisite before each Stage gate (Stage 1→2, Stage 2→3)
- No new flags may be introduced in the same PR that adds a feature if that PR already
  has an unresolved STALE flag on any code path it touches

---

## 32.11 Production Verification Artifacts

### cos-audit/ Directory

**Purpose:** Stores product owner sign-off audit logs from production readiness
verification runs. Every production-readiness verification run that results in a
product owner approval must be recorded here.

**Location:** `cos-audit/` at repository root.

**File format:** `cos-audit/audit-<timestamp>.log`

- `<timestamp>` — ISO 8601 UTC format: `YYYYMMDDTHHMMSSZ`
  (e.g. `cos-audit/audit-20260616T143000Z.log`)
- Content: production-readiness verification output + product owner sign-off statement
- One file per verification run

**Git configuration:**

- Directory `cos-audit/` is committed to the repository (so the directory exists)
- Log file contents are git-ignored (`.gitignore` entry: `cos-audit/*.log`)
- Rationale: directory must exist for scripts to write to it; logs contain
  potentially sensitive operational state and are not version-controlled

**When to write:** Product owner must sign off in `cos-audit/audit-<timestamp>.log`
at two mandatory gates:

| Gate                      | Trigger                                                        |
| ------------------------- | -------------------------------------------------------------- |
| Phase completion sign-off | After product owner approves a Phase via Rule 38               |
| Production readiness gate | After production-readiness verification passes and PO confirms |

---

## 32.12 Project Progress Metric

Product-owner decision 2026-07-16. Defines the single figure a role Home shows for "how far along
is this project", and the schedule verdict beside it. Served by `GET /projects/{projectId}/progress`
(`docs/api/project.openapi.yaml`); consumed by the Site Engineer Home (§32.7 Mobile Dark Surfaces).

> **Why this is not an `/analytics/*` endpoint.** The analytics module reads ClickHouse
> (`analytics.project_cost_daily`, `procurement_activity_daily`, `site_activity_daily`), and none of
> those tables carry task progress, BOQ value, or planned dates. This metric joins `tasks` × `boq` in
> PostgreSQL, so it lives with the other `/projects/{projectId}/*` task routes. It is also a
> read-your-writes figure — a site engineer who logs progress expects the bar to move — whereas the
> ClickHouse aggregates are Kafka-fed and eventually consistent.

### Earned percent (EV%)

Heterogeneous work cannot be averaged raw — a task is weighted by the **value** of the BOQ line it
delivers, not by task count. This is the cost-ratio / equivalent-units method used across the
industry (AACE EVM practice).

```text
EV% = Σ(task.progress_percent × boq.estimated_total) / Σ(boq.estimated_total)
```

over every Task joined to its BOQ item: `projects.tasks.boq_item_id` → `boq.boq_items.item_id`.

> **Column names differ from §11.** §11 names the BOQ key `boq_item_id` and gives BOQ a `project_id`.
> The implemented table is `boq.boq_items` with PK `item_id` and no `project_id` — a BOQ item reaches
> its project through `version_id` → `boq.boq_versions.project_id`. The join above uses the
> implemented names. The project filter comes from `projects.tasks.project_id`, so `boq_versions`
> does not need to be joined at all.

### Planned percent (PV%)

Where the project _should_ be right now, using the same weights:

```text
task.planned% = clamp01((now − planned_start) / (planned_end − planned_start)) × 100
PV%           = Σ(task.planned% × boq.estimated_total) / Σ(boq.estimated_total)
```

PV% is summed over the **schedulable subset** only: BOQ-linked, not cancelled, and carrying both
`planned_start` and `planned_end`. A task with no planned dates has nothing to be measured against.

### Schedule verdict

SPI must compare like with like, so **both sides are summed over the schedulable subset** — not the
EV% published above, which spans every BOQ-linked task including undated ones. Mixing the two bases
would make SPI drift with how many tasks happen to lack dates.

```text
EV%(scheduled) = Σ(progress_percent × estimated_total) / Σ(estimated_total)   ← schedulable subset
SPI            = EV%(scheduled) / PV%
```

| SPI         | Status     |
| ----------- | ---------- |
| > 1.05      | `ahead`    |
| 0.95 – 1.05 | `on_track` |
| < 0.95      | `behind`   |

`percentComplete` (the headline figure) therefore uses the wider base, while `spi` / `status` use the
schedulable base. When every task has planned dates the two bases are identical.

### Schedule variance in days (Earned Schedule)

`spi` says _whether_ a project is behind but not _how far_ in terms a site engineer plans around —
days. `scheduleDaysBehind` answers that (product-owner decision 2026-07-16): a positive number of
days behind, negative ahead, from Earned Schedule.

Define the time-phased planned curve over the schedulable subset (same subset as `spi`):

```text
PV(d) = Σ(clamp01((d − planned_start) / (planned_end − planned_start)) × 100 × estimated_total)
        / Σ(estimated_total)
```

`PV(d)` rises monotonically from 0 (before the earliest start) to 100 (after the latest end). The
**earned schedule date** `ES` is the date the plan expected to reach today's actual earned percent:

```text
ES                 = the date d where PV(d) = EV%(scheduled)
scheduleDaysBehind = round(today − ES)      (+ behind · − ahead)
```

- `EV%(scheduled) ≥ 100` (all scheduled work done) → `ES` = the latest `planned_end`; the value is how
  many days after the plan's finish the project still stands (0 if finished on time or early).
- `EV%(scheduled) ≤ 0` → `ES` = the earliest `planned_start`.
- No schedulable task → `null` (same as `spi`).

Unlike `spi`, this does not collapse to "on track" at a late finish — a project done a month late
reads `+31`.

### Display (Site Engineer Home)

How the Site Engineer Home (§32.7 Mobile Dark Surfaces) renders the figures — product-owner decision
2026-07-16. The API contract is unchanged; these are presentation rules only.

- **Headline** is `percentComplete`, rounded, with the progress bar.
- **Schedule verdict** is one line: the status word carrying the day-variance —
  "ช้ากว่าแผน 21 วัน" (behind), "เร็วกว่าแผน N วัน" (ahead), or "เป็นไปตามแผน" (on_track, no number).
  The word/colour come from `status`/`spi`; the number is `|scheduleDaysBehind|`. Behind and ahead
  agree in sign with `spi` (behind ⇒ spi < 1 ⇒ days > 0). Hidden when `scheduleDaysBehind` is null.
  The earlier percentage ratio ("ตามแผน N%") was replaced by this — days are what a site engineer
  plans around, and a percentage of a fully-aged plan was unintuitive.
- **Status colour** is a three-band split of the same `spi`, finer than the `status` enum so a
  gentle slip and a serious one do not look the same:

  | SPI           | Colour | (status)       |
  | ------------- | ------ | -------------- |
  | ≥ 0.95        | green  | ahead/on_track |
  | 0.90 – < 0.95 | amber  | behind         |
  | < 0.90        | red    | behind         |

  The colour is derived on the client from `spi`; the `status` string is unchanged. `null` spi shows
  no colour/verdict. Amber is a semantic warning token (`--cos-dark-warning`), not a brand colour, so
  §32.7:622's amber prohibition does not apply.

### Rules

- **Tasks with `boq_item_id = null` are excluded** from both sums — they carry no value weight, so
  including them at zero weight would silently drag the figure down. This means the metric measures
  BOQ-linked work only.
- **Tasks with `status = CANCELLED` are excluded** from both sums (product-owner decision
  2026-07-16). Cancelled work is descoped, and EVM removes descoped work from the baseline; leaving
  it in at `progress_percent = 0` would cap the project below 100% forever.
- **BOQ version status is not filtered** (product-owner decision 2026-07-16). A task is weighted by
  whatever item it points at, whether that item's `boq_versions.status` is `DRAFT`, `APPROVED`, or
  `SUPERSEDED`. The weights are ratios and self-normalise, and a task must not lose its weight the
  moment a new BOQ version supersedes the old one.
- **`Σ(estimated_total) = 0`** (no BOQ-linked task) → return `null` for all four fields. Do not
  return `0`; "no data" and "zero progress" are different, and a `0%` bar is a lie.
- **`PV% = 0`** (nothing planned to have started yet) → `spi = null`, `status = null`. Division by
  zero, and "ahead of schedule" is meaningless before the first task was due to start.
- **`planned_end ≤ planned_start`** → that task's `planned%` is `100` if `now ≥ planned_end`, else
  `0`. A zero-length task is a milestone, not a ramp.
- **`planned_start` or `planned_end` null** → the task contributes to EV% but is excluded from PV%.
  It has no schedule to be measured against.
- Money is weight-only here, never displayed — §32.5 Financial Precision Rules governs any figure
  shown as currency. The weights are ratios, so `DECIMAL` reads may be summed as numbers.

### Known limits — state these before trusting the number

- **SPI converges to 1.0 as a project completes**, even for a late project: once every task is done
  `EV% = PV% = 100`. A late project reads `on_track` at the finish line. The standard fix is Earned
  Schedule (Lipke 2003; now in the PMI EVM practice standard), which measures the variance in **time**
  rather than value — and COS **does** have the time-phased baseline it needs: `planned_start` /
  `planned_end` per task. The day-variance below is that Earned Schedule, and it does not converge to
  zero at a late finish (a project completed a month late reads "31 days behind", not "on track").
- The metric trusts `Tasks.progress_percent`, which is self-reported by the field and conflict-resolved
  Max-wins (§17.5). It is not a physical-quantity survey.

---

## References

| ID                 | Title                                                              | Source                                                                                                                      |
| ------------------ | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| [IEEE 830]         | IEEE Recommended Practice for Software Requirements Specifications | IEEE Std 830-1998                                                                                                           |
| [Avro]             | Apache Avro Specification                                          | [avro.apache.org/docs/current/spec.html](https://avro.apache.org/docs/current/spec.html)                                    |
| [ConfluentSR]      | Confluent Schema Registry Documentation                            | [docs.confluent.io/platform/current/schema-registry](https://docs.confluent.io/platform/current/schema-registry/index.html) |
| [Temporal]         | Temporal Workflow Documentation                                    | [docs.temporal.io](https://docs.temporal.io/)                                                                               |
| [Kafka]            | Apache Kafka Documentation                                         | [kafka.apache.org/documentation](https://kafka.apache.org/documentation/)                                                   |
| [PostgreSQL]       | PostgreSQL Documentation                                           | [postgresql.org/docs](https://www.postgresql.org/docs/)                                                                     |
| [W3C-DesignTokens] | W3C Design Tokens Community Group Report                           | [tr.designtokens.org/format](https://tr.designtokens.org/format/)                                                           |
| [IEEE-754]         | IEEE Standard for Floating-Point Arithmetic                        | IEEE Std 754-2019                                                                                                           |
| [AACE-EVM]         | Earned Value Analysis — Why It Doesn't Work (progress measurement) | AACE International Transactions EVM.01, Lukas 2008                                                                          |
| [EarnedSchedule]   | Earned Schedule — schedule performance analysis from EVM measures  | Lipke, W., PM World Today Vol XIII (2011) — [earnedschedule.com](https://www.earnedschedule.com/)                           |

> 📎 See also: [03-system-design](03-system-design.md) — service decomposition and architecture overview
> · [09-data-architecture](09-data-architecture.md) — data domains and storage strategy
> · [11-database-schema](11-database-schema.md) — core entity schemas
> · [14-api-architecture](14-api-architecture.md) — API contracts and endpoint patterns
> · [15-event-driven-workflow](15-event-driven-workflow.md) — event bus and workflow architecture
> · [20-ux-flow](20-ux-flow.md) — role-based UX flows
> · [21-mvp-scope](21-mvp-scope.md) — MVP modules and phase scope
> · [30-testing-strategy](30-testing-strategy.md) — test strategy for event contracts, state machines, and financial
> precision rules defined here

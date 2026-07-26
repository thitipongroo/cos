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

| Deployable                                            | Runtime             | Contents                                                                                                                                   |
| ----------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Main Application (`backend/`)                         | NestJS (monolith)   | identity, tenant, project, boq, procurement, site-ops, finance, notification, equipment, workforce                                         |
| File Service (`services/file-service/`)               | Fastify             | Multipart upload I/O (extracted for I/O throughput)                                                                                        |
| AI Gateway (`services/ai-gateway/`)                   | FastAPI (Python)    | LLM routing, RAG, token tracking                                                                                                           |
| AI Embedding Worker (`services/ai-embedding-worker/`) | FastAPI (Python)    | Embedding generation                                                                                                                       |
| AI OCR Pipeline (`services/ai-ocr-pipeline/`)         | FastAPI (Python)    | OCR processing                                                                                                                             |
| Analytics Worker (`services/analytics-worker/`)       | Go                  | ClickHouse aggregation                                                                                                                     |
| KG Ingestion Worker (`services/kg-ingestion-worker/`) | Go                  | Neo4j ingestion — Kafka client: `github.com/twmb/franz-go` via coskafka (`kgo.ConsumeRegex`; consumer group: `kg-ingestion-worker.shared`) |
| Web App (`apps/web/`)                                 | Next.js + Serwist   | Tablet/laptop browser — online + offline unified                                                                                           |
| Mobile (`apps/mobile/`)                               | React Native + Expo | Smartphone native app                                                                                                                      |

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
  payload:        object (event-specific — see below)
}
```

> **Event type naming convention:** `{domain}.{entity}.{action}.{version}` — identical to the
> canonical format defined in 15-event-driven-workflow section 15.6.
> Example: `construction.task.created.v1`, `procurement.purchase_order.approved.v1`.
> The `.v1` suffix in `event_type` denotes the major schema version (breaking changes increment
> this to `.v2`). The `event_version` envelope field carries the semantic patch version (e.g. `"1.0"`,
> `"1.1"`) for non-breaking additions within the same major version.
> Kafka topic names include a `{tenant_id}.` prefix per 07-multi-tenant-architecture section 7.3.

### Enum Casing Convention

> **PostgreSQL vs Avro enum casing:** PostgreSQL enum values in `11-database-schema.md` use
> **lowercase** (e.g. `project_type: residential / commercial / infrastructure / industrial`)
> following PostgreSQL convention. Event payload enum values in this table use **UPPERCASE**
> (e.g. `project_type: RESIDENTIAL/COMMERCIAL/INFRASTRUCTURE/INDUSTRIAL`) following Avro
> and protobuf convention. Both are correct — the service layer is responsible for mapping
> between storage and event representations.

### Event Payload Specifications

| #   | Event Type                               | Key Payload Fields                                                                                                                                                                                                                                                                                                                                                                            |
| --- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `construction.project.created.v1`        | `project_id`, `project_code`, `project_name`, `project_type` (enum: RESIDENTIAL/COMMERCIAL/INFRASTRUCTURE/INDUSTRIAL), `budget` {amount: DECIMAL(19,4), currency_code: ISO4217}, `start_date`, `end_date`, `created_by`                                                                                                                                                                       |
| 2   | `construction.boq.version_created.v1`    | `boq_version_id`, `project_id`, `version_number`, `total_estimated` {amount, currency_code}, `created_by`                                                                                                                                                                                                                                                                                     |
| 3   | `procurement.po.created.v1`              | `po_id`, `project_id`, `vendor_id`, `po_number`, `total_amount` {amount, currency_code}, `delivery_date`, `line_items[]` {item_id, quantity: DECIMAL(10,4), unit, unit_price: DECIMAL(19,4)}                                                                                                                                                                                                  |
| 4   | `procurement.invoice.received.v1`        | `invoice_id`, `po_id`, `project_id`, `vendor_id`, `amount` {amount, currency_code}, `invoice_date`, `due_date`                                                                                                                                                                                                                                                                                |
| 5   | `site.report.created.v1`                 | `report_id`, `project_id`, `report_date`, `submitted_by`, `summary` (max 2000 chars), `issue_count`, `photo_count`                                                                                                                                                                                                                                                                            |
| 6   | `site.inspection.failed.v1`              | `inspection_id`, `project_id`, `checklist_id`, `failed_items[]` {item_id, description}, `inspected_by`, `inspected_at`                                                                                                                                                                                                                                                                        |
| 7   | `construction.task.completed.v1`         | `task_id`, `project_id`, `boq_item_id`, `completed_by`, `completed_at`, `progress_percent` (100 at completion), `actual_duration_days`                                                                                                                                                                                                                                                        |
| 8   | `construction.delay.detected.v1`         | `project_id`, `task_id` (nullable), `delay_days`, `cause` (enum: PROCUREMENT/WEATHER/WORKFORCE/EQUIPMENT/SCOPE_CHANGE/OTHER), `detected_by` (enum: AI_FORECAST/MANUAL_REPORT), `severity` (enum: LOW/MEDIUM/HIGH/CRITICAL — thresholds: LOW=1-2 days, MEDIUM=3-6, HIGH=7-13, CRITICAL=14+)                                                                                                    |
| 9   | `workforce.checkin.created.v1`           | `checkin_id`, `worker_id`, `project_id`, `checkin_at`, `method` (enum: QR_CODE/GPS/BIOMETRIC/MANUAL), `location` {lat, lng} (nullable)                                                                                                                                                                                                                                                        |
| 10  | `site.material.consumed.v1`              | `consumption_id`, `project_id`, `task_id`, `material_id`, `quantity`: DECIMAL(10,4), `unit`, `consumed_by`, `consumed_at`                                                                                                                                                                                                                                                                     |
| 11  | `procurement.delivery.received.v1`       | `delivery_id`, `po_id`, `project_id`, `vendor_id`, `received_by`, `received_at`, `items_received[]` {item_id, quantity_received: DECIMAL(10,4)}, `partial`: boolean                                                                                                                                                                                                                           |
| 12  | `finance.budget.exceeded.v1`             | `project_id`, `cost_category`, `budget_amount` {amount, currency_code}, `actual_amount` {amount, currency_code}, `overage_percent`: DECIMAL(5,2), `detected_at`                                                                                                                                                                                                                               |
| 13  | `procurement.vendor_invoice.approved.v1` | `invoice_id`, `po_id`, `project_id`, `vendor_id`, `amount` {amount, currency_code}, `approved_by`, `approved_at`, `payment_due`                                                                                                                                                                                                                                                               |
| 14  | `finance.cashflow_risk.detected.v1`      | `project_id`, `risk_level` (enum: LOW/MEDIUM/HIGH/CRITICAL), `projected_shortfall` {amount, currency_code}, `projected_at`, `detected_by` (enum: AI_FORECAST/RULE_ENGINE)                                                                                                                                                                                                                     |
| 15  | `ai.risk_prediction.generated.v1`        | `prediction_id`, `project_id`, `model_type` (enum: DELAY_FORECAST/COST_OVERRUN/SAFETY_VISION/RISK_CLASSIFIER), `prediction` (model-specific object), `confidence`: DECIMAL(5,4), `generated_at`, `model_version`                                                                                                                                                                              |
| 16  | `finance.budget.variance_detected.v1`    | `project_id`, `variance_percentage`: DECIMAL(5,2), `threshold_exceeded`: DECIMAL(5,2) (the configured threshold that was crossed; default 10%), `budget_amount` {amount, currency_code}, `actual_amount` {amount, currency_code}, `detected_at`                                                                                                                                               |
| 17  | `file.document.uploaded.v1`              | `file_id`, `tenant_id`, `entity_type` (nullable — e.g. "site_report", "purchase_order"), `entity_id` (nullable UUID), `mime_type`                                                                                                                                                                                                                                                             |
| 18  | `file.document.quarantined.v1`           | `file_id`, `tenant_id`, `threat_type` (nullable string — ClamAV threat name, null if unknown)                                                                                                                                                                                                                                                                                                 |
| 19  | `construction.boq.created.v1`            | `project_id` (UUID), `version_id` (UUID), `version_number` (integer) — emitted once when the first BOQ version (version_number = 1) is created for a project                                                                                                                                                                                                                                  |
| 20  | `construction.boq.updated.v1`            | `version_id` (UUID), `project_id` (UUID), `changed_items_count` (integer), `new_total_estimated_amount` (DECIMAL string — never float), `new_total_estimated_currency` (ISO 4217)                                                                                                                                                                                                             |
| 21  | `procurement.po.approval_requested.v1`   | `po_id`, `project_id`, `approver_id`, `tier` (enum: PM/FINANCE/EXECUTIVE/TENANT_ADMIN), `po_number`, `total_amount` (DECIMAL string — never float), `currency_code` (ISO 4217) — emitted by the PO approval workflow (notifyApprover activity) when a PO enters an approval tier or is escalated on the 48h timeout; consumed by the Notification Service to alert the specific `approver_id` |

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

#### Required Canonical Names — Pending Spec Addition

Each legacy file below requires a canonical spec entry in §32.4 before migration can proceed.

| Legacy File                            | Required Canonical Name                          | Notes                                                                                           |
| -------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `procurement.rfq.created.avsc`         | `procurement.rfq.created.v1`                     | Core procurement event — high priority                                                          |
| `procurement.rfq.alert.avsc`           | `procurement.rfq.deadline_approaching.v1`        | Rename for clarity                                                                              |
| `procurement.po.status_changed.avsc`   | `procurement.po.status_changed.v1`               | No rename required                                                                              |
| `procurement.delivery.delayed.avsc`    | `procurement.delivery.delayed.v1`                | Version suffix only                                                                             |
| `procurement.inventory.low.avsc`       | `procurement.inventory.low_threshold_reached.v1` | Rename for clarity                                                                              |
| `project.updated.avsc`                 | `construction.project.updated.v1`                | Domain prefix added                                                                             |
| `project.status_changed.avsc`          | `construction.project.status_changed.v1`         | Domain prefix added                                                                             |
| `boq.version.approved.avsc`            | `construction.boq.version_approved.v1`           | Domain prefix aligned                                                                           |
| `site.report.submitted.avsc`           | `site.report.submitted.v1`                       | "submitted" is correct — reports are directly submitted; distinct from `site.report.created.v1` |
| `site.progress.updated.avsc`           | `site.progress.updated.v1`                       | Version suffix only                                                                             |
| `site.issue.created.avsc`              | `site.issue.created.v1`                          | Version suffix only                                                                             |
| `site.media.uploaded.avsc`             | `site.media.uploaded.v1`                         | Version suffix only                                                                             |
| `inspection.passed.avsc`               | `site.inspection.passed.v1`                      | Domain prefix added                                                                             |
| `issue.status_changed.avsc`            | `site.issue.status_changed.v1`                   | Domain prefix added                                                                             |
| `equipment.assigned.avsc`              | `equipment.unit.assigned.v1`                     | Entity name added                                                                               |
| `equipment.returned.avsc`              | `equipment.unit.returned.v1`                     | Entity name added                                                                               |
| `equipment.maintenance_scheduled.avsc` | `equipment.unit.maintenance_scheduled.v1`        | Entity name added                                                                               |
| `workforce.checkout.avsc`              | `workforce.checkout.created.v1`                  | Action + version added                                                                          |
| `workforce.timesheet_approved.avsc`    | `workforce.timesheet.approved.v1`                | Entity name added                                                                               |
| `cost.budget.updated.avsc`             | `finance.budget.updated.v1`                      | Domain renamed cost→finance                                                                     |
| `cost.budget.warning.avsc`             | `finance.budget.warning_threshold_reached.v1`    | Domain + name clarified                                                                         |
| `cost.entry.created.avsc`              | `finance.cost_entry.created.v1`                  | Domain + entity added                                                                           |
| `finance.budget.created.avsc`          | `finance.budget.created.v1`                      | Version suffix only                                                                             |
| `finance.payment.processed.avsc`       | `finance.payment.processed.v1`                   | Version suffix only                                                                             |
| `finance.variance.alert.avsc`          | `finance.budget.variance_detected.v1`            | Name clarified                                                                                  |
| `ai.queue.request.avsc`                | `ai.inference.queued.v1`                         | Name clarified                                                                                  |
| `ai.result.ready.avsc`                 | `ai.inference.completed.v1`                      | Name clarified                                                                                  |

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

**Exception 1 — pre-auth entry screens** (login, OTP verify, verification/loading overlay). These
screens may use the "technical / mission-critical" motif — a rotating gear, the `architecture`
mark, and a cyan glow on progress/accent elements — because the entry sequence is where the
"mission-critical operating system" personality is set, before any project data is on screen
(product-owner decision 2026-07-16; reference `mockup/00_authen/mobile/04_verification_loading_mobile`).

**Exception 2 — loading states** (product-owner decision 2026-07-17; ADR-055; reference
`mockup/mobile/universal_loading_component_mobile_view` + `mockup/desktop/universal_loading_component_desktop_view`).
`<LoadingState />` may use the same motif — a cyan glow, a scan-line gradient, and a waveform on
the `ai` variant — **for the same reason the pre-auth exception exists: no project data is on
screen yet**. A loading state is by definition the interval before data arrives, so the motif never
competes with project content. The exception is scoped to `<LoadingState />` itself:

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

| Token                 | Hex       |
| --------------------- | --------- |
| `--cos-dark-bg`       | `#020617` |
| `--cos-dark-surface`  | `#0F172A` |
| `--cos-dark-elevated` | `#111827` |
| `--cos-dark-text`     | `#F8FAFC` |
| `--cos-dark-muted`    | `#94A3B8` |
| `--cos-dark-blue`     | `#2563EB` |
| `--cos-dark-cyan`     | `#22D3EE` |
| `--cos-dark-success`  | `#10B981` |
| `--cos-dark-warning`  | `#F59E0B` |
| `--cos-dark-danger`   | `#EF4444` |

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

The table above applies to **task screens** — the forms and lists a field worker keeps open all day.
A defined set of screens renders **dark** instead, on the shared `--cos-dark-*` tokens above: the
same surface as the web login and the Keycloak `cos` theme, so the product looks like one product.

Dark screens (exhaustive — do not extend this list without a product-owner decision):

| Screen                                  | Reference                                                    |
| --------------------------------------- | ----------------------------------------------------------- |
| Login                                   | `mockup/00_login_flow/mobile/`                              |
| OTP verify                              | `mockup/00_login_flow/mobile/`                              |
| Session-securing overlay                | `mockup/00_login_flow/mobile/`                              |
| Site Engineer Home                      | `mockup/site-engineer/dashboard-mobile/`                    |
| Notification preferences (Tenant Admin) | `mockup/mobile/04_tenant_admin/01_notification_preferences/` |
| Navigation drawer                       | `mockup/mobile/04_tenant_admin/04_navigation_drawer/`       |

The last two were added by product-owner decision (2026-07-26): the Tenant-Admin notification control
panel and the navigation drawer ship on the dark surface as their mockups define, continuing the
signed-in dark identity rather than the light task palette. They are control surfaces (configure /
navigate), not all-day outdoor task screens, so the sunlight-visibility rationale for the light palette
does not apply.

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

- Package: `@fontsource/inter-tight` (web/PWA) · expo-font with Inter Tight (React Native)
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
| `src/app/layout.tsx` (root) | `import '@fontsource/inter-tight/{400,500,600,700}.css'` then `import './globals.css'` — global CSS only loads when imported from a layout                                                                                                                                                                                              |

Notes:

- **Spacing:** do not override Tailwind's scale — its default 4px base already equals the
  `--web-space-*` tokens (`p-4`=16px, `p-6`=24px, …).
- **Radius:** `rounded`=4px (sm), `rounded-md`=8px, `rounded-lg`=12px, `rounded-xl`=16px (mapped to `--web-radius-*`).
- **Font:** brand font is `@fontsource/inter-tight` (weights 400/500/600/700); fallback `Inter, -apple-system, system-ui,
sans-serif`.
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
- **`createSerwistRoute` MUST pass `useNativeEsbuild: false`.** The option defaults to
  `process.platform === 'win32'`, so on a Windows dev machine Serwist imports the **native** `esbuild` package —
  which is not a dependency here (only `esbuild-wasm` is, per the line above). Left at the default, `next build`
  fails on Windows with `Cannot find package 'esbuild'` / `ERR_MODULE_NOT_FOUND` while passing on Linux CI, so the
  gate cannot catch it. Pinning the option keeps one bundler on every platform and matches the declared dependency.

#### Mobile Spacing

| Token               | Value | Usage                    |
| ------------------- | ----- | ------------------------ |
| `--mobile-space-xs` | 8px   | Icon padding             |
| `--mobile-space-sm` | 12px  | Card internal padding    |
| `--mobile-space-md` | 16px  | Section padding          |
| `--mobile-space-lg` | 24px  | Screen edge padding      |
| `--mobile-space-xl` | 32px  | Major section separation |

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

| Component             | Description                                                 |
| --------------------- | ----------------------------------------------------------- |
| `<TopBar />`          | Standard top app bar, every role — see below                |
| `<MobileNav />`       | Bottom navigation, 4–5 items max, icons + labels            |
| `<QuickActionCard />` | 60px min height, icon + label + badge, single tap           |
| `<PhotoCapture />`    | Camera + gallery grid, inline annotation, offline queue     |
| `<VoiceNoteButton />` | Hold-to-record, waveform animation, auto-transcription      |
| `<OfflineBanner />`   | Fixed top, queue count, auto-dismiss on reconnect           |
| `<TaskCard />`        | Swipeable (swipe-right = done), status badge, photo count   |
| `<StatusChip />`      | Visual status: Todo / InProgress / Done / Syncing / Synced  |
| `<OptimisticList />`  | Instant UI update, rollback on failure, retry option        |
| `<LoadingState />`    | Loading placeholder / progress, 4 variants — see below      |
| `<PhotoAnnotation />` | Draw/erase over a captured photo, undo, flatten — see below |

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

| Prop       | Type                | Behaviour                                                                                                  |
| ---------- | ------------------- | ---------------------------------------------------------------------------------------------------------- |
| `variant`  | see table below     | Required. Selects the layout.                                                                              |
| `progress` | `number` (0–100)    | Optional. Omitted → indeterminate (no bar, no %). Given → clamped and shown.                               |
| `label`    | `string`            | Optional. Caller passes **already-translated** text — the component never holds a key or a literal (QM-3). |
| `theme`    | `'light' \| 'dark'` | Required on mobile. Selects `colors` vs `darkColors` (§32.7 Mobile Dark Surfaces).                         |

**Variants are per platform** — the layouts genuinely differ, so the union is not shared:

| Platform | Variants                      | Notes                                                                               |
| -------- | ----------------------------- | ----------------------------------------------------------------------------------- |
| Mobile   | `widget` `list` `ai` `micro`  | `list` = stacked card skeletons. **No `table`** — §32.7 prohibits tables on mobile. |
| Web      | `widget` `table` `ai` `micro` | `table` = row skeletons across columns. **No `list`.**                              |

Rules:

- **Tokens only.** Mobile reads `colors` / `darkColors` from `apps/mobile/src/theme/tokens.ts`;
  web reads Tailwind token utilities. No hardcoded hex, no arbitrary values.
- **Caller owns progress.** The component does not read the sync queue, an AI job, or any store —
  §17.6 sync ordering and AI progress are the caller's concern. This keeps one component usable for
  sync, AI, and plain fetch alike.
- **Caller owns copy.** No default string. A `<LoadingState />` with no `label` renders no text.
- **Not a screen.** It is a presentational component, not a screen or workflow step, so QM-15 does
  not require a feature flag (ADR-055).
- **The `ai` variant is the only one carrying the glow/scan-line/waveform** — see "Exception 2 —
  loading states" above. `widget` / `list` / `table` / `micro` are flat skeletons and spinners.

#### Standard Top Bar (`<TopBar />`)

Every role's authenticated screens carry one shared top app bar (product-owner decision 2026-07-16),
so the mobile app frames its content between two pieces of chrome — the top bar and the bottom nav —
each on a **surface** background distinct from the content area, exactly as the bottom nav is:

| Element | Content                                                                                    |
| ------- | ------------------------------------------------------------------------------------------ |
| Left    | App icon + `CONSTRUCTION OS` wordmark                                                      |
| Right   | Notification bell (unread badge → `/notifications`) · avatar (photo/initials → `/profile`) |

- **One component, all roles.** It is not per-screen; it lives in the authenticated layout so a role
  screen never renders its own header. The safe-area strip above it takes the same surface colour, so
  the notch region reads as part of the bar.
- **Palette follows the screen.** On a dark surface (Site Engineer Home, §32.7 Mobile Dark Surfaces)
  the bar uses `--cos-dark-surface`; on the light field app it uses `--mobile-surface`.
- Avatar falls back to initials, then a person glyph, when there is no `photo_url` (§11 `platform.users`).

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
| STALE        | Flag at 100% rollout for > 30 days without cleanup | Add to `docs/feature-flags/cleanup-backlog.md`; escalate in next sprint |
| REMOVED      | Flag check deleted from code and registry          | Strike through entry in backlog; must be in same PR as code deletion    |

### Rules

- A flag transitions to STALE automatically 30 days after reaching 100% rollout
- Stale flags are tracked in `docs/feature-flags/cleanup-backlog.md`
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

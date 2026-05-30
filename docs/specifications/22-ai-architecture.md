---
title: "AI Architecture"
version: "1.6.0"
status: Active
last_updated: "2026-05-28"
authors:
  - thitipongroo
related_docs:
  - 09-data-architecture.md
  - 12-construction-knowledge-graph.md
  - 21-mvp-scope.md
  - 23-ai-native-operating-model.md
  - 24-ai-training-pipeline.md
---

# 22. AI Architecture

## Table of Contents

- [22.1 AI Philosophy](#221-ai-philosophy)
- [22.2 AI Capability Layers](#222-ai-capability-layers)
- [22.3 AI System Components](#223-ai-system-components)
- [22.4 AI Use Cases](#224-ai-use-cases)
- [22.5 LLM Provider Strategy](#225-llm-provider-strategy)

---

## 22.1 AI Philosophy

AI should act as :

- Operational copilot
- Risk analyst
- Knowledge engine
- Forecasting system
- Workflow automation layer

NOT just chatbot.

---

## 22.2 AI Capability Layers

Layer A — Assistive AI :

- Document summarization
- Voice transcription
- OCR
- Daily report generation
- Translation  (post-MVP Layer A — not in MVP AI scope; see 21-mvp-scope section 21.4)

Layer B — Analytical AI :

- Delay prediction
- Budget overrun prediction
- Procurement forecasting
- Workforce optimization

Layer C — Autonomous AI :

- Auto-create RFQs
- Auto-detect risks
- Auto-generate schedules
- Auto-route approvals

---

## 22.3 AI System Components

| Component | Responsibility |
| --- | --- |
| LLM Gateway | Multi-model routing — implemented via LangChain (`langchain==0.2.*`, `langchain-openai==0.1.*`); provider interface abstracted via `LLMProvider`; primary: OpenAI GPT-4o / gpt-4o-mini (cost fallback); no direct SDK coupling in domain services |
| RAG Engine | Context retrieval |
| Vector DB | Embeddings |
| Knowledge Graph | Construction relationships |
| Feature Store | ML features |
| Training Pipeline | Continuous learning |
| Agent Orchestrator | Multi-step AI workflows — see note below |

Note on Agent Orchestrator :

The Agent Orchestrator is responsible for coordinating multi-step AI workflows where an AI
agent must plan, invoke tools, and act across multiple services.

- MVP scope (Layer A only) : no Agent Orchestrator required. Layer A features (report
  generation, summarization, OCR, voice transcription) are single-step LLM calls — no
  orchestration needed.
- Post-MVP Layer B/C : durable multi-step AI workflows (e.g., AI-triggered procurement,
  auto-schedule generation) MUST be orchestrated via Temporal.io (see 15-event-driven-workflow
  section 15.4). Temporal.io provides durable execution, retries, and human-in-the-loop
  steps — the same engine used for approval workflows.
- Full autonomous multi-agent framework (Layer C) : framework selection deferred until
  post-Stage 2, when Layer B capabilities are validated in production.

> ⚠️ **DECISION PENDING [LAYER-C-001]:** Agent orchestration framework for Layer C has not been
> selected. Candidates: LangGraph, CrewAI, AutoGen, or custom Temporal.io activity chains.
> **Decision trigger:** Layer B deployed to production and first Analytical AI feature is
> stable for ≥ 30 days.
> **Owner:** AI/Platform Lead (thitipongroo — update when role is assigned).
> **Decision deadline:** No later than 4 weeks after Layer B goes live in production.
> **Leading candidate:** Temporal.io (already in use for approval workflows — see
> 15-event-driven-workflow section 15.4); evaluate against LangGraph before committing.
> **Evaluation rubric** (apply when trigger fires — see §22.5 LAYER-C-001 Evaluation Rubric):
> rank each candidate on 5 axes: (1) LangChain 0.2.* compatibility, (2) Temporal.io co-existence,
> (3) Thai-language tool-calling accuracy, (4) durable execution / human-in-the-loop support,
> (5) operational complexity. Select the highest scorer; document rationale in a one-page ADR.
> **Action:** Open a spec issue tagged `layer-c-decision` when Layer B stabilises.

### Vector Store Tenant Isolation

The vector store (pgvector) must enforce tenant isolation consistent with the tiered model in
07-multi-tenant-architecture section 7.1. A data leak between tenants' embeddings is a
**security boundary violation**, not a data quality issue.

#### Embedding Table Schema

All embedding tables must include `tenant_id` as a non-nullable isolation key:

```sql
-- Shared table (SMB tier) — applied in the `public` schema or the relevant tenant schema
CREATE TABLE document_embeddings (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        NOT NULL,           -- isolation key
  source_type   VARCHAR(50) NOT NULL,           -- 'document' | 'site_report' | 'boq' | 'rfq'
  source_id     UUID        NOT NULL,           -- FK to the source entity
  content_hash  VARCHAR(64) NOT NULL,           -- SHA-256 of chunked text (dedup guard)
  chunk_index   INTEGER     NOT NULL,           -- 0-based position within source
  embedding     VECTOR(1536) NOT NULL,          -- text-embedding-3-small output
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index 1: HNSW approximate nearest neighbour search (covers all tenants in shared tier)
CREATE INDEX ON document_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Index 2: tenant + recency filter — applied before HNSW scan to reduce candidate set
CREATE INDEX ON document_embeddings (tenant_id, source_type, created_at DESC);
```

#### Tier-by-Tier Isolation Strategy

| Tenant Tier | Isolation Method | pgvector Location |
| --- | --- | --- |
| SMB (Shared DB) | Row-level `WHERE tenant_id = $tenantId` on **every** query — enforced at application layer | Shared `document_embeddings` table with `tenant_id` index |
| Mid-market (Schema-per-tenant) | Separate `{tenant_schema}.document_embeddings` table per schema — no cross-schema query possible by construction | Per-tenant schema |
| Enterprise (Dedicated DB) | Separate PostgreSQL instance with pgvector — no shared infrastructure | Dedicated PostgreSQL database |

#### Enforcement Rules

1. **JWT-bound tenant_id:** Every RAG query binds `tenant_id` from the decoded JWT claim
   (`tenantId`) — never from a user-supplied body or query parameter.
2. **No cross-tenant results:** Vector similarity search must never return rows from a different
   `tenant_id` than the requesting user's. A single mis-scoped query is a security incident.
3. **SMB shared HNSW index trade-off:** The shared HNSW index covers all tenants for write
   performance; `tenant_id` acts as a post-filter. Accepted risk: a very large SMB tenant
   inflating the shared index is the trigger to upgrade that tenant to mid-market tier.
   **Upgrade trigger (quantified):** If any single SMB tenant's embedding row count exceeds
   **500,000 rows**, OR if RAG p95 query latency for that tenant exceeds **200 ms** measured
   over a 7-day rolling window, that tenant MUST be migrated to the mid-market
   (schema-per-tenant) tier. Monitor via the metric `rag_retrieval_duration_seconds` per tenant
   (see 31-monitoring-observability section 31.3). Migration path: `pg_dump` the tenant's
   rows from the shared table → restore to a dedicated `{tenant_schema}.document_embeddings`
   table → update the tenant's isolation tier in the `tenants` table → rebuild the HNSW index
   on the new table.
4. **Content dedup is per-tenant:** `content_hash` dedup is scoped per `(tenant_id, source_id)`
   — two tenants storing identical documents is not a cross-tenant leak.
5. **Audit logging:** All embedding reads must emit a structured log entry with `tenant_id`,
   `actor_id`, `source_type`, `query_vector_hash` for compliance with 05-security-compliance §5.5.

---

## 22.4 AI Use Cases

Note : All use cases in this section are Layer B — Analytical AI. They are post-MVP.
MVP activates Layer A (Assistive AI) only — see 21-mvp-scope section 21.4 and
section 22.2 above for the full layer boundary.

### Delay Prediction

Inputs :

- Weather
- Workforce
- Procurement delays
- Historical productivity

Outputs :

- Delay probability
- Critical path risk
- Mitigation recommendation

### Cost Anomaly Detection

AI detects :

- Material cost spikes
- Fraud patterns
- Procurement inefficiency
- Abnormal labor productivity

---

## 22.5 LLM Provider Strategy

Provider Hierarchy :

| Provider | Role |
| --- | --- |
| GPT-4o (OpenAI) | **Primary** — reasoning, vision tasks, Thai language (resolved EP-AI-001) |
| gpt-4o-mini (OpenAI) | **Cost fallback** — same provider, lower cost for high-volume simple tasks (resolved EP-AI-001) |
| Additional providers | Optional — accessed via `LLMProvider` interface without code changes; provider switching is a configuration-only operation |

Routing :

- LLM Gateway selects model based on task type, cost, and latency
- All providers accessed via unified `LLMProvider` interface (LangChain abstraction) — no direct SDK coupling in domain services
- Provider switching does not require application code changes

RAG Architecture :

- Documents ingested → text extracted (OCR for PDFs, photos)
- Text chunked (512–1024 tokens with overlap)
- Embedded via **text-embedding-3-small** (OpenAI, 1536 dimensions — resolved EP-AI-012) via `EmbeddingProvider` interface
- Stored in pgvector (MVP) → Weaviate (at scale)
- Query-time: hybrid search — semantic similarity + keyword BM25
- Retrieved chunks injected into LLM prompt as context

Thai Language :

- Thai is first-class — all prompts, outputs, and UI support Thai
- Embedding model: text-embedding-3-small supports Thai adequately for construction domain queries
- LLM evaluation benchmarks include Thai construction terminology accuracy
- Fallback: if primary model Thai quality is insufficient, route to alternative provider via `LLMProvider` interface

---

## 22.6 LAYER-C-001 Evaluation Rubric

> This section is **not active** — it is a decision template to be used when the
> trigger condition fires: *Layer B deployed to production and stable for ≥ 30 days.*
> Do not use this rubric to justify selecting a framework before the trigger.

### Candidates

| Candidate | Description |
| --- | --- |
| **Temporal.io** | Already deployed for approval workflows (15-event-driven-workflow §15.4). Durable execution, human-in-the-loop, retry semantics. Not an LLM-native framework. |
| **LangGraph** | LangChain ecosystem. Stateful agent graphs, native tool-calling, compatible with `langchain==0.2.*` already in use. |
| **CrewAI** | Role-based agent collaboration. Simple to prototype, limited enterprise durability features. |
| **AutoGen** | Microsoft multi-agent conversation framework. Good for reasoning chains; less proven for production durable workflows. |

### Scoring Rubric (score 1–5 per axis, select highest total)

| Axis | Weight | What to evaluate |
| --- | --- | --- |
| LangChain 0.2.* compatibility | 25% | Can agents use the existing `LLMProvider` / `EmbeddingProvider` interfaces without wrapping or replacing them? |
| Temporal.io co-existence | 20% | Can agent workflows be durably orchestrated via Temporal activities, or does the framework require its own persistence layer? |
| Thai-language tool-calling accuracy | 20% | Run the standard Thai construction scenario benchmark (see below) — measure correct tool selection rate and output accuracy |
| Durable execution + human-in-the-loop | 20% | Does the framework natively support: retry on failure, pause-for-human-approval, resume from checkpoint? |
| Operational complexity | 15% | How many new infra components does this add? Does it require a dedicated process / database / broker beyond what is already deployed? |

### Thai Construction Benchmark (run before deciding)

Execute these 5 scenarios in Thai against each candidate. Score pass/fail per scenario.
Minimum pass rate for consideration: **4/5**.

1. `"สร้าง RFQ สำหรับวัสดุ rebar 50 ตัน โครงการ proj_001 ภายใน 3 วัน"` — agent must call procurement tool, not just answer text
2. `"ตรวจสอบ PO ที่รออนุมัติเกิน 48 ชั่วโมง และส่ง notification ให้ Finance"` — multi-step with notification tool
3. `"พยากรณ์ความล่าช้าของโครงการ proj_002 จากข้อมูล 30 วันล่าสุด"` — must retrieve data, not hallucinate
4. `"หยุดรอการอนุมัติจาก PM ก่อนดำเนินการต่อ"` — human-in-the-loop pause + resume
5. `"ถ้า cost variance > 15% ให้แจ้ง Executive และสร้าง risk report อัตโนมัติ"` — conditional branching with multiple tool calls

### Decision Output Required

When the decision is made, produce a one-page ADR (Architecture Decision Record) containing:

- **Date decided:**
- **Trigger met:** (confirm Layer B was stable for ≥ 30 days)
- **Candidates evaluated:** (list all scored)
- **Scores table:** (axis scores for each candidate)
- **Thai benchmark results:** (pass/fail per scenario per candidate)
- **Selected framework:**
- **Rationale:** (why this framework, what was ruled out and why)
- **Migration impact:** (any changes to existing Temporal.io approval workflows)
- **Owner:** (who is responsible for implementation in Phase C)

File the ADR as `docs/architecture/adr-layer-c-agent-framework.md` and update
[LAYER-C-001] status in `extension-points.md` from `PENDING` to `DECIDED`.

---

## References

| ID | Title | Source |
| --- | --- | --- |
| [IEEE 830] | IEEE Recommended Practice for Software Requirements Specifications | IEEE Std 830-1998 |
| [RAG] | Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks | Lewis et al., NeurIPS 2020 |
| [pgvector] | pgvector: Open-source vector similarity search for Postgres | [github.com/pgvector/pgvector](https://github.com/pgvector/pgvector) |
| [Whisper] | Robust Speech Recognition via Large-Scale Weak Supervision | Radford et al., OpenAI 2022 |
| [OpenAI] | OpenAI API Documentation | [platform.openai.com/docs](https://platform.openai.com/docs/) |
| [LangChain] | LangChain Python Documentation | [python.langchain.com/docs/introduction](https://python.langchain.com/docs/introduction/) |
| [LangGraph] | LangGraph Documentation | [langchain-ai.github.io/langgraph](https://langchain-ai.github.io/langgraph/) |
| [Temporal] | Temporal Workflow Documentation | [docs.temporal.io](https://docs.temporal.io/) |
| [IFC4] | Industry Foundation Classes IFC4 | buildingSMART International |

> 📎 See also: [09-data-architecture](09-data-architecture.md) · [12-construction-knowledge-graph](12-construction-knowledge-graph.md) · [21-mvp-scope](21-mvp-scope.md) · [23-ai-native-operating-model](23-ai-native-operating-model.md) · [24-ai-training-pipeline](24-ai-training-pipeline.md)

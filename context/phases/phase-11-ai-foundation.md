# Phase 11 — Ai Foundation

> Moved out of `context/00_master_construction_os.md` on 2026-09-02, verbatim.
> That file keeps the index row pointing here; `.claude/skills/phase-index/SKILL.md`
> is the map. Depends on Phase 8, 9 · SaaS Maturity Stage 3.
>
> Rule 36 applies at the end of this phase and Rule 38 before it starts.

```text
Build AI foundation layer.

AI Provider Decision:
  LLM Provider: OpenAI GPT-4o (primary) / gpt-4o-mini (cost fallback)
    LLMProvider (implement via interface — never call OpenAI SDK directly)
    Interface (Python):
      class LLMProvider(ABC):
        @abstractmethod
        async def complete(
          self, messages: list[Message], model_hint: str
        ) -> LLMResponse: ...
    model_hint mapping: "report-generation" → gpt-4o, "summarization" → gpt-4o-mini
    Consuming: LLM Gateway — ทุก AI call ผ่าน interface นี้เสมอ
    Swap path: Claude API (cloud fallback) + Ollama (on-premise); drop-in replacement via LLMProvider interface (see spec §22.6)

  Embedding Model: OpenAI text-embedding-3-small
    Dimensions: 1536
    EmbeddingProvider (implement via interface)
    Interface (Python):
      class EmbeddingProvider(ABC):
        @abstractmethod
        async def embed(self, texts: list[str]) -> list[list[float]]: ...
        @property
        @abstractmethod
        def dimensions(self) -> int: ...  # returns 1536
    Consuming: Embedding Worker — ทุก embedding call ผ่าน interface นี้
    Embedding storage: pgvector (vector(1536)) + OpenSearch k-NN index

  LangChain: langchain>=0.3, langchain-openai>=0.2 (langgraph: fallback candidate only — LAYER-C-001
    provisionally resolved to Temporal.io, PO decision 2026-07-10; final commit gated by spec §22.6 benchmark)
    LangChainProviderConfig
    Interface: { getProviderPackage(): str, getModelClass(): type }

  OCR Engine: pytesseract + pdf2image (open-source, self-hosted) for basic PDF extraction
    Cloud OCR: AWS Textract AnalyzeDocument API (FORMS feature) for invoice photo extraction; IAM IRSA auth (see spec §22.6)
    High-accuracy extraction: OCR text → LLM Gateway document-extraction (gpt-4o) for layout-variable/handwritten docs (RESOLVED — see spec §22.7 OCR-001)

AI Services (FastAPI — all in ai/ directory):

1. LLM Gateway (ai-gateway):

   Purpose: single entrypoint for all LLM calls from other services
   Responsibilities:
     - LLM client management via LLMProvider interface (no direct SDK calls)
     - Model routing: route to model_hint based on task type (RESOLVED — two-tier
       configurable routing table; store in env/YAML, never hardcode model names)
       Tier POWERFUL (gpt-4o):   report-generation, risk-analysis, document-extraction
       Tier FAST (gpt-4o-mini):  summarization, classification, autocomplete
       Routing evolution: static tiering (now) → cascade → predictive (RESOLVED — see spec §22.7 RT-001)
     - Token usage tracking (persisted to PostgreSQL for billing/monitoring)
     - Prompt template rendering (Jinja2 templates from ai/prompts/)
     - Response caching (Redis, TTL configurable per template)
     - Gateway resilience: provider fallback/failover, per-tenant token budget enforcement, virtual keys (RESOLVED — see spec §22.7 GW-001)
     - RAG Pipeline (LangChain chain — implemented inside ai-gateway, not a separate service;
       see spec §22-ai-architecture §22.7 LangChain Configuration):
         Retrieval: hybrid search (keyword via OpenSearch + vector via pgvector), fused via Reciprocal Rank Fusion (RRF) (RESOLVED — see spec §22.7 RAG-001)
         Reranking: sentence-transformers cross-encoder/ms-marco-MiniLM-L-6-v2; activate when RAG p95 relevance < 0.7
         Context assembly: top-k=5 chunks, max context 4000 tokens
         Chunking strategy:
           - Documents: recursive character splitter, chunk_size=500, overlap=100
           - Site reports: treat each report as one chunk (typically <500 tokens)
         Chain config: stored in services/ai-gateway/ai/chains/ as YAML per chain type
                       (service-local — resolved via providers.langchain_config.CHAINS_DIR,
                        override AI_CHAINS_DIR; NOT repo-root ai/chains/ — PO decision 2026-07-21)
         Interface: LangChainProviderConfig.buildChain(chainType, tenantId): Chain
   API: POST /api/v1/ai/completions  { template_name, variables, model_hint? }
        POST /api/v1/rag/query       { query, tenant_id, entity_types?, top_k? }

2. Embedding Worker (ai-embedding-worker):

   Purpose: generate and store vector embeddings
   Responsibilities:
     - Embed text documents via EmbeddingProvider interface
     - Store in pgvector: vector column dimensions set per provider config
     - Store in OpenSearch: index to {tenant_id}-embeddings index (k-NN)
     - Batch processing: Kafka consumer on file.document.uploaded.v1 and site.report.created.v1
       AMENDED 2026-08-29. This line read "file.uploaded and report.submitted events". Both names
       were wrong in a way that mattered:
         · `site.report.submitted.v1` exists and is NOT the one to consume — its payload is
           report_id / project_id / report_date / submitted_by, with no text in it at all. The event
           that carries the report's prose is `site.report.created.v1` (payload adds `summary`), and
           the worker's own README had named that one correctly the whole time. Spec §32:510 records
           that both events exist deliberately and are distinct, so this was a choice between two
           real events, and the wrong one was named.
         · `file.uploaded` is not an event type either; the catalogue name is
           `file.document.uploaded.v1`, which is what consumer.py actually subscribes to.
       WHAT IS NOT WIRED, and why it stays that way for now: only the file consumer exists. The
       report consumer is deliberately not built here, because the whole embedding path is a stub —
       `main.py` wires `StubEmbeddingProvider`, `ingestion.py` states "no OPENAI_API_KEY here, so
       real vectors have never been produced", and docs/architecture/service-interaction.md records
       the AI/RAG layer as stubbed by design pending §22. A second consumer feeding a stub embedder
       would add a pipeline nobody can observe. There is a further reason to wait: master:3434-3438
       removed the free-text summary from the mobile daily report (`summary` is nullable and is sent
       null), so today the only site-report prose to embed at all is what a web user types.
       Pinned by tests/conformance/ai/02-rag-prompts-ocr.spec.ts so the gap stays visible.
   API: POST /api/v1/embeddings/generate  { text, entity_type, entity_id, tenant_id }

3. OCR Pipeline (ai-ocr-pipeline):

   Input: file_id (fetch from File Service signed URL)
   Process: pdf2image → pytesseract → extracted text → embedding worker
   Supported: PDF (scanned), image files (JPEG, PNG)
   Output: { file_id, extracted_text, confidence_score }
   API: POST /api/v1/ocr/process  { file_id, tenant_id }
   Triggered by: Kafka consumer on file.uploaded (mime_type = PDF or image)

Token Tracking Schema (PostgreSQL — schema: ai):
  ai_usage_logs:
    log_id          UUID PK
    tenant_id       UUID NOT NULL
    service_caller  VARCHAR(100) NOT NULL  — which service requested
    template_name   VARCHAR(255)
    model_used      VARCHAR(100) NOT NULL
    prompt_tokens   INTEGER NOT NULL
    completion_tokens INTEGER NOT NULL
    total_tokens    INTEGER NOT NULL
    latency_ms      INTEGER
    created_at      TIMESTAMPTZ DEFAULT now()
    INDEX: (tenant_id, created_at)

Tenant SaaS-subscription billing (spec §26.1) — the tenant-billing model; distinct from Finance
Service AR **client** billing (project→customer). `ai_usage_logs` above is the AI-usage half;
the subscription-fee half:
  - SMB (Shared SaaS): per-active-project base fee + per-active-user seat fee (above an included
    minimum) — the two charges apply independently + simultaneously
  - Mid-market: annual subscription + per-active-user
  - Enterprise: annual contract + platform fee + usage-based AI
  - AI tokens metered per-tenant from `ai_usage_logs` (SMB 500K/mo · Mid 5M/mo · Enterprise custom;
    overage per 1K tokens); OCR per-page, voice per-minute; usage visible in the Tenant-Admin dashboard
  - Rate values set at commercial launch, configurable per market (spec §26.1)

Prompt Template Management:
  Storage: ai/prompts/ directory, Jinja2 .j2 files, version-controlled
  Naming: {phase}-{use-case}-v{version}.j2 (e.g. report-summary-v1.j2)
  No hardcoded prompts in source code — all via template files
  Template variables: always typed via Pydantic model

Generate:

- FastAPI application for each AI service (ai-gateway, ai-embedding-worker, ai-ocr-pipeline)
- LLMProvider stub + interface (StubLLMProvider raises NotImplementedError)
- EmbeddingProvider stub + interface
- LangChainProviderConfig stub + interface
- LLM Gateway: routing table config (YAML-based, no hardcoded model names)
- Embedding Worker: pgvector schema with vector(1536) — dimensions from text-embedding-3-small
- Hybrid RAG retrieval service (keyword + vector, provider-agnostic)
- Chunking utility (LangChain text splitter)
- OCR pipeline with pytesseract (open-source, runs without provider decision)
- Token usage logger (middleware on every LLM call — logs model_used as string)
- Prompt template loader (Jinja2 — provider-agnostic)
- Redis response cache for LLM Gateway
- PostgreSQL migration for ai_usage_logs (Prisma — add to backend/prisma/migrations/ consistent with all other schemas)
- Unit tests: chunking, RAG retrieval logic, OCR, stub provider behavior
- Integration tests: full RAG query pipeline using StubLLMProvider (no real API call)

MLOps Stack (from source §19.4 — separate Phase 23, referenced here):
  MLflow 3.x          — experiment tracking, model registry (bumped 2.x→3.x: latest stable, product-owner decision 2026-06-30)
  Apache Airflow 3.x  — training pipeline orchestration (bumped 2.x→3.x: latest stable, product-owner decision 2026-06-30)
  Kubeflow Pipelines  — Kubernetes-native ML workflows
  Feast               — feature store
  Evidently AI        — model/output evaluation + drift monitoring (open-source, self-hosted; replaced W&B per ADR-038; source: spec §22-ai-architecture §22.6)
  Full MLOps implementation: Phase 23
  Phase 11 generates: interfaces for model versioning and deployment
    ModelRegistry — interface for MLflow model registration post-training
    FeatureStore — interface for Feast feature retrieval in inference

AI Operating Modes (from source §22.3 — all three modes are specified):
  Mode A: Assistive — AI helps users compose content (active in Phase 12)
  Mode B: Advisory  — AI recommends actions (active in Phase 12)
  Mode C: Autonomous — AI executes low-risk workflows automatically
    Autonomous mode is SPECIFIED in source but NOT implemented in Phase 11–12.
    Autonomous mode: ONLY for notifications + report generation; financial actions require human approval (see spec §22.6)
      Low-risk (autonomous): send notifications, generate report drafts, flag risks
      High-risk (human required): PO approval, budget changes, workflow state transitions
      HIGH-RISK PROHIBITION: autonomous mode must NEVER trigger financial transactions,
        status transitions requiring human approval, or data deletions
      Interface: { execute(workflowType: string, payload: object,
                           tenantId: string): Promise<AutonomousResult> }

Stubs in Phase 11 (generate stub, do NOT implement yet):
  CloudOCRProvider:
    Trigger:  invoice photo OCR pipeline is ready to activate
    Interface: { extract(fileUrl: string): Promise<OCRResult> }
    OCRResult: { text: string, fields: Record<string, string>, confidence: float }
    Candidates: AWS Textract, Google Document AI, Azure Form Recognizer
    Note:     provider RESOLVED — AWS Textract (AnalyzeDocument API, FORMS feature)
              Auth: IAM role (EKS IRSA); source: spec §22-ai-architecture §22.6

  AlternativeLLMProvider:
    Trigger:  need to swap from OpenAI (cost, latency, compliance, or availability)
    Interface: same as LLMProvider — drop-in, zero refactor
    Candidates: Anthropic Claude (claude-sonnet-4-6), Azure OpenAI, Ollama (self-hosted)
    Note:     LLMProvider interface was designed for this swap — no code change required
              outside of identity.module.ts DI token swap

Constraints:

- Before marking Phase 11 complete: read every Generate item above line by line,
  run ls/grep to verify each exists on disk, show output — Rule 36

```

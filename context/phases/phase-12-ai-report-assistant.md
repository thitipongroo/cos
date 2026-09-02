# Phase 12 — Ai Report Assistant

> Moved out of `context/00_master_construction_os.md` on 2026-09-02, verbatim.
> That file keeps the index row pointing here; `.claude/skills/phase-index/SKILL.md`
> is the map. Depends on Phase 11 · SaaS Maturity Stage 3.
>
> Rule 36 applies at the end of this phase and Rule 38 before it starts.

```text
Build AI Report Assistant.

Depends on: Phase 11 (AI Foundation) — must be complete first.

Hallucination Guard (mandatory — all AI outputs must pass through):
  Implementation: output validation layer before returning to client
  Checks:
    1. Length check: summary must be 50–500 words
    2. Source attribution: every factual claim must be traceable to input context
       (implementation: require LLM to cite source in structured output)
       Implemented 2026-08-23 as `sources: string[]` on every report output model —
       non-empty, and every entry must appear verbatim in the retrieval context after
       whitespace normalisation (spec 22 §22.3 "Note on HallucinationGuard source
       attribution"). Until then this check tested `confidence == 0.0`, which check 4
       already subsumed and which no fabrication would ever trip. An empty retrieval
       context now yields the check-4 fallback instead of an ungrounded narrative.
    3. Confidence score: LLM returns confidence field (0.0–1.0) via structured output
    4. Low confidence threshold: if confidence < 0.7 → return fallback response
       Fallback response: { status: "LOW_CONFIDENCE", summary: null,
                            message: "Insufficient data for reliable summary",
                            raw_data_available: true }
    5. Contradiction check: if summary contains data not in input context,
       flag as POTENTIAL_HALLUCINATION (logged, not returned to user)

  Confidence score implementation:
    Prompt instructs LLM to output JSON with:
    {
      "summary": "...",
      "confidence": 0.85,   — 0.0 to 1.0
      "data_points_used": 12,
      "data_gaps": ["manpower data missing for 3 days"]
    }
    Parse confidence from structured output — do NOT ask LLM to estimate confidence
    in a separate call (latency cost)

Capabilities:
  1. Daily Site Report Summary
     Input: site_reports (last 7 days), issues (open), manpower_logs
     Output: { summary, key_issues, manpower_trend, confidence, data_gaps }
     Prompt template: report-daily-summary-v1.j2

  2. Procurement Status Summary
     Input: rfqs (open), pos (pending delivery), invoices (overdue)
     Output: { summary, overdue_count, risk_items, confidence, data_gaps }
     Prompt template: report-procurement-status-v1.j2

  3. Executive Summary
     Input: project_health (from Finance), procurement_summary, site_summary
     Output: { executive_summary, risk_flags, recommendations, confidence }
     Prompt template: report-executive-v1.j2

  4. Delay Risk Detection
     Input: project end_date, PM-entered estimated_completion_date (nullable DATE field on project entity —
            PM updates via PATCH /api/v1/projects/:id; if null, falls back to planned end_date)
            procurement delivery dates, open critical issues
     Output: { delay_risk_level: ENUM(LOW,MEDIUM,HIGH,CRITICAL),
               risk_factors: string[],
               confidence,
               disclaimer: "AI-generated estimate — verify with project schedule" }
     Risk level thresholds (days of projected delay): LOW=1-2, MEDIUM=3-6, HIGH=7-13, CRITICAL=14+

APIs:
  POST /api/v1/ai/reports/site-summary        { project_id, date_range }
  POST /api/v1/ai/reports/procurement-summary { project_id }
  POST /api/v1/ai/reports/executive-summary   { project_id }
  POST /api/v1/ai/reports/delay-risk          { project_id }
  GET  /api/v1/ai/reports/history             { project_id }  — past generated reports

Orchestration:
  Framework: plain Python sequential pipeline (no Agent Orchestrator — Layer A scope;
             Layer C orchestration = LAYER-C-001, provisionally resolved to Temporal.io
             (PO 2026-07-10; final commit gated by §22.6 benchmark);
             see docs/specifications/22-ai-architecture.md §22.3)
  Step 1: Context retrieval — RELATIONAL for figures, RAG for documents.
          AMENDED 2026-08-29 (product-owner). This line read "RAG retrieval (via Phase 11 RAG API)",
          and under that wording three of the four reports shipped with NO context at all: nothing
          called the RAG API, and nothing would have helped if it had. The Phase 11 index holds one
          thing — chunks of uploaded files (ai-embedding-worker subscribes to
          {tenant}.file.document.uploaded.v1 and nothing else). Site reports, RFQs, POs, invoices and
          budgets are not in it, and vector similarity cannot answer what these reports ask anyway:
          "how many POs are past their delivery date" is an aggregate, and a top-k similarity search
          returns the passages that read most like the question, not a count.
          So retrieval is routed by the SHAPE of the question, which is also what the delay-risk
          report had already been doing since 2026-08-23 via risk/context.py:
            · figures, counts, dates, money  -> tenant-scoped SQL, assembled deterministically
              (services/ai-gateway/reports/context/{site,procurement,executive}.py + risk/context.py)
            · narrative and documents        -> the Phase 11 RAG API, unchanged and still available
          This is the stronger hallucination control as well as the correct one: the guard's
          contradiction check can only catch a figure that disagrees with the context, so a report
          generated from an empty context had nothing to disagree with and every number in it was
          unfalsifiable.
  Step 2: Context assembly and token budget check
  Step 3: LLM generation with structured output (JSON mode)
  Step 4: Hallucination guard validation
  Step 5: Persist report to database
  Step 6: Return to caller

  ai_generated_reports:
    report_id       UUID PK
    tenant_id       UUID NOT NULL
    project_id      UUID NOT NULL
    report_type     ENUM('SITE_SUMMARY','PROCUREMENT_SUMMARY',
                         'EXECUTIVE_SUMMARY','DELAY_RISK') NOT NULL
    content         JSONB NOT NULL
    confidence      DECIMAL(4,3)
    model_used      VARCHAR(100) NOT NULL
    tokens_used     INTEGER NOT NULL
    generated_at    TIMESTAMPTZ DEFAULT now()
    generated_by    UUID  — user who requested
    INDEX: (project_id, report_type, generated_at DESC)

Generate:

- Plain Python sequential orchestration pipeline for each report type (the 6 steps in the
  Orchestration section above). Corrected 2026-08-22: this line previously said "LangGraph
  orchestration chain", contradicting BOTH the Orchestration section in this same phase block
  ("plain Python sequential pipeline — no Agent Orchestrator; LangGraph deferred to LAYER-C-001")
  AND the context.md Never rule "Implement LangGraph in Phase 11–12". Authoritative: spec
  §22-ai-architecture §22.3. See docs/architecture/test-design/README.md §35.13 ESC-09.
- HallucinationGuard class with all 5 checks above
- Structured output Pydantic models for each report type
- Prompt templates (ai/prompts/): one per report type
- Report persistence service
- PostgreSQL migration for ai_generated_reports
- APIs (FastAPI routes on ai-gateway)
- Unit tests: HallucinationGuard (test each check independently)
- Integration tests: full generation pipeline using StubLLMProvider (no real API call)
- Token budget enforcement: max 4000 tokens input context, 1000 tokens output

Constraints:

- All AI outputs are advisory — no autonomous actions to other services
- Hallucination guard is mandatory — never skip
- Confidence score must accompany every report
- Fallback response must be graceful — never surface raw LLM errors to user

Stubs in Phase 12 (generate stub, do NOT implement yet):
  CrossEncoderReranking:
    Trigger:  retrieval quality insufficient — when RAG top-k results are irrelevant
    Interface: { rerank(query: string, documents: Document[]): RankedDocument[] }
    Candidates: cohere-rerank, bge-reranker, cross-encoder/ms-marco
    Note:     model RESOLVED — sentence-transformers cross-encoder/ms-marco-MiniLM-L-6-v2
              Trigger: activate when RAG p95 relevance < 0.7 over 7-day window
              source: spec §22-ai-architecture §22.6

- Before marking Phase 12 complete: read every Generate item above line by line,
  run ls/grep to verify each exists on disk, show output — Rule 36
```

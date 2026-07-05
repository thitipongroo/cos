"""Construction OS — AI Gateway (FastAPI)
Phase 11: AI Foundation — LLM completions + RAG query endpoints.
Phase 12: AI Report Assistant — 4 report types + history.
Phase 15: OpenTelemetry — OTLP trace exporter, FastAPI + HTTPX auto-instrumentation.
Source: context/00_master_construction_os.md §Phase 11–12, §Phase 15
"""
import os

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

import flags
from otel import configure_telemetry
from providers.llm_provider import Message, StubLLMProvider
from reports.pipeline import generate_report
from templates.loader import render_template

app = FastAPI(title="COS AI Gateway", version="0.2.0")
configure_telemetry(app)

_provider = StubLLMProvider()
_db_pool = None  # injected at startup in production


# ── Phase 11: completions + RAG ───────────────────────────────────────────────

class CompletionsRequest(BaseModel):
    template_name: str
    variables: dict
    model_hint: str = "summarization"


class CompletionsResponse(BaseModel):
    content: str
    model_used: str
    total_tokens: int


class RAGQueryRequest(BaseModel):
    query: str
    tenant_id: str
    entity_types: list[str] | None = None
    top_k: int = 5


class RAGQueryResponse(BaseModel):
    answer: str
    sources: list[dict]


@app.get("/health/live")
async def liveness():
    return {"status": "ok", "service": os.environ.get("OTEL_SERVICE_NAME", "ai-gateway")}


@app.post("/api/v1/ai/completions", response_model=CompletionsResponse)
async def completions(req: CompletionsRequest):
    try:
        prompt = render_template(req.template_name, _VariablesModel(**req.variables))
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    messages = [Message(role="user", content=prompt)]
    try:
        response = await _provider.complete(messages, req.model_hint)
    except NotImplementedError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    return CompletionsResponse(
        content=response.content,
        model_used=response.model_used,
        total_tokens=response.total_tokens,
    )


@app.post("/api/v1/rag/query", response_model=RAGQueryResponse)
async def rag_query(req: RAGQueryRequest):
    raise HTTPException(
        status_code=503,
        detail="RAG pipeline requires LLMProvider and vector store — not yet configured",
    )


# ── Phase 12: report endpoints ────────────────────────────────────────────────

class SiteSummaryRequest(BaseModel):
    project_id: str
    date_range: str = "last 7 days"
    tenant_id: str
    generated_by: str = "system"


class ProcurementSummaryRequest(BaseModel):
    project_id: str
    tenant_id: str
    generated_by: str = "system"


class ExecutiveSummaryRequest(BaseModel):
    project_id: str
    tenant_id: str
    generated_by: str = "system"


class DelayRiskRequest(BaseModel):
    project_id: str
    tenant_id: str
    generated_by: str = "system"


class ReportResponse(BaseModel):
    report_id: str | None
    report_type: str
    content: dict
    confidence: float | None
    low_confidence: bool


async def _run_report(report_type: str, project_id: str, tenant_id: str,
                      generated_by: str, extra_vars: dict) -> ReportResponse:
    # QM-15 retrofit kill-switch (ADR-049) — single gate for all four report endpoints
    if not await flags.is_enabled(flags.FLAG_AI_REPORTS):
        raise HTTPException(
            status_code=503,
            detail="COS-FLAG-001: AI report generation is temporarily disabled",
        )
    try:
        result = await generate_report(
            report_type=report_type,
            context_data="",  # RAG retrieval wired in Phase 13+
            template_extra_vars=extra_vars,
            provider=_provider,
            db_pool=_db_pool,
            tenant_id=tenant_id,
            project_id=project_id,
            generated_by=generated_by,
        )
    except NotImplementedError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    return ReportResponse(
        report_id=result.report_id,
        report_type=result.report_type,
        content=result.content,
        confidence=result.confidence,
        low_confidence=result.low_confidence,
    )


@app.post("/api/v1/ai/reports/site-summary", response_model=ReportResponse)
async def site_summary(req: SiteSummaryRequest):
    return await _run_report(
        "SITE_SUMMARY", req.project_id, req.tenant_id, req.generated_by,
        {"date_range": req.date_range},
    )


@app.post("/api/v1/ai/reports/procurement-summary", response_model=ReportResponse)
async def procurement_summary(req: ProcurementSummaryRequest):
    return await _run_report(
        "PROCUREMENT_SUMMARY", req.project_id, req.tenant_id, req.generated_by, {},
    )


@app.post("/api/v1/ai/reports/executive-summary", response_model=ReportResponse)
async def executive_summary(req: ExecutiveSummaryRequest):
    return await _run_report(
        "EXECUTIVE_SUMMARY", req.project_id, req.tenant_id, req.generated_by, {},
    )


@app.post("/api/v1/ai/reports/delay-risk", response_model=ReportResponse)
async def delay_risk(req: DelayRiskRequest):
    return await _run_report(
        "DELAY_RISK", req.project_id, req.tenant_id, req.generated_by, {},
    )


@app.get("/api/v1/ai/reports/history")
async def report_history(project_id: str, tenant_id: str, limit: int = 20):
    if _db_pool is None:
        raise HTTPException(status_code=503, detail="Database not configured")
    from reports.persistence import fetch_report_history
    rows = await fetch_report_history(_db_pool, tenant_id, project_id, limit)
    return {"project_id": project_id, "reports": rows}


# ── Shared helpers ─────────────────────────────────────────────────────────────

class _VariablesModel(BaseModel):
    model_config = {"extra": "allow"}

"""Construction OS — AI Gateway (FastAPI)
Phase 11: AI Foundation — LLM completions + RAG query endpoints.
Phase 12: AI Report Assistant — 4 report types + history.
Phase 15: OpenTelemetry — OTLP trace exporter, FastAPI + HTTPX auto-instrumentation.
Source: context/00_master_construction_os.md §Phase 11–12, §Phase 15
"""
import logging
import math
import os
from contextlib import asynccontextmanager

import httpx
from fastapi import Depends, FastAPI, HTTPException
from pydantic import BaseModel

import flags
import metering
import metrics
from auth import get_verified_tenant
from otel import configure_telemetry
from providers.llm_provider import Message, build_llm_provider
from rag.retrieval import HybridRetriever
from reports.pipeline import generate_report
from reports.risk_event import emit_risk_prediction
from intent.classify import classify_intent
from templates.loader import render_template
from digital_twin.router import router as digital_twin_router

@asynccontextmanager
async def _lifespan(_app: FastAPI):
    """Startup wiring. Replaces the deprecated `@app.on_event("startup")` decorators.

    `on_event` emits a DeprecationWarning, and pytest.ini sets `filterwarnings = error`, so merely
    importing this module aborted collection of every test file that touches it — three files failed
    for that reason alone. Both handlers stay individually guarded, so the gateway still starts when
    RAG backends or Kafka are unavailable.
    """
    metrics.start_metrics_server()
    await _wire_rag()
    await _wire_digital_twin()
    yield


app = FastAPI(title="COS AI Gateway", version="0.2.0", lifespan=_lifespan)
configure_telemetry(app)
metrics.install(app)

# Phase 24 Digital Twin API (§33.3 — the Digital Twin Service runs inside the AI Gateway). The
# router 503s when the DB pool is unconfigured, matching the RAG/LLM posture, so mounting it is safe
# even in a stage that has not provisioned TimescaleDB.
app.include_router(digital_twin_router)

# Real provider when OPENAI_API_KEY is configured, else the stub (→ 503). Same posture as before,
# but factory-selected rather than hardcoded, so a provisioned key activates the real path with no
# code change (§22.7).
_provider = build_llm_provider()
_db_pool = None  # injected at startup in production
# Kafka producer for the F4b delay-risk feed (ai.risk_prediction.generated.v1). Injected at startup
# in production, same posture as _db_pool; None → emit_risk_prediction is a no-op (no per-request broker).
_risk_producer = None
# Injected at startup in production (keyword=OpenSearch + vector=pgvector backends). Stage-1 leaves
# it None — the /rag/query endpoint then returns 503, consistent with the StubLLMProvider posture.
_retriever: HybridRetriever | None = None

# Voice transcription (spec 21.4 Layer A) runs in the internal ai-transcription-pipeline service;
# the gateway is the client-facing entry (Kong routes /api/v1/ai here) and meters usage.
_transcription_url = os.environ.get(
    "TRANSCRIPTION_SERVICE_URL", "http://ai-transcription-pipeline:8000"
)
_usage_logger = logging.getLogger("cos.ai.usage")


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


async def _wire_rag() -> None:
    """Build the real RAG retriever when the backends are configured (§22.7). Guarded and non-fatal:
    an unconfigured or unreachable backend leaves _retriever = None and /rag/query keeps its 503
    posture rather than crashing the gateway."""
    global _retriever
    if _retriever is not None:
        return  # a test injected one
    try:
        from rag.wiring import build_retriever

        _retriever = await build_retriever()
    except Exception:  # noqa: BLE001 — startup must not fail because RAG deps are absent
        _usage_logger.warning("RAG retriever wiring skipped (backends unavailable)")
        _retriever = None


async def _wire_digital_twin() -> None:
    """Launch the Digital Twin telemetry consumer (§33.3 write path) when Kafka + a DB pool are
    available. Fire-and-forget background task; guarded so a missing broker leaves the twin API's
    read side working and does not crash the gateway.

    KNOWN GAP: kafka_handler.start_telemetry_consumer decodes JSON, but the bus is Confluent Avro
    (the wire format the Go workers decode). Until a Python Avro decoder is wired here, this consumer
    would not decode real events — the same seam flagged for the RAG ingestion consumer.
    """
    if os.environ.get("DIGITAL_TWIN_CONSUMER_ENABLED", "").lower() not in ("1", "true"):
        return  # opt-in: off by default until the Avro decoder + a real broker are in place
    try:
        import redis.asyncio as aioredis

        from digital_twin.kafka_handler import start_telemetry_consumer

        if _db_pool is None:
            _usage_logger.warning("digital twin consumer skipped — DB pool not configured")
            return
        redis_client = await aioredis.from_url(os.environ.get("REDIS_URL", "redis://localhost:6379/0"))
        import asyncio

        asyncio.create_task(start_telemetry_consumer(db_pool=_db_pool, redis_client=redis_client))
    except Exception:  # noqa: BLE001
        _usage_logger.warning("digital twin consumer wiring skipped (deps unavailable)")


@app.get("/health/live")
async def liveness():
    return {"status": "ok", "service": os.environ.get("OTEL_SERVICE_NAME", "ai-gateway")}


@app.post("/api/v1/ai/completions", response_model=CompletionsResponse)
async def completions(req: CompletionsRequest, tenant_id: str = Depends(get_verified_tenant)):
    # tenant_id comes from the verified token/gateway (get_verified_tenant), never a request body —
    # parity with every other AI endpoint. Without it this endpoint alone depended on Kong, had no
    # per-tenant metering, and was not behind a kill-switch.
    # QM-15 kill-switch (ADR-049) — fail-open per flags.py, same 503 posture as the report endpoints.
    if not await flags.is_enabled(flags.FLAG_AI_COMPLETIONS):
        raise HTTPException(
            status_code=503,
            detail="COS-FLAG-001: AI completions are temporarily disabled",
        )
    try:
        prompt = render_template(req.template_name, _VariablesModel(**req.variables))
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    messages = [Message(role="user", content=prompt)]
    try:
        response = await metering.complete_and_meter(
            _provider, messages, req.model_hint, tenant_id, "ai.completions", _db_pool, req.template_name
        )
    except NotImplementedError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    return CompletionsResponse(
        content=response.content,
        model_used=response.model_used,
        total_tokens=response.total_tokens,
    )


class IntentRequest(BaseModel):
    transcript: str


class IntentResponse(BaseModel):
    intent: str
    target: str | None
    text: str | None
    confidence: float | None


@app.post("/api/v1/ai/intent", response_model=IntentResponse)
async def voice_intent(req: IntentRequest, tenant_id: str = Depends(get_verified_tenant)):
    """Classify a transcribed voice command into an intent for the SITE_ENGINEER FAB (ADR-073).
    Under the same AI kill-switch + stub-safe 503 posture as completions (intent IS an LLM completion)."""
    if not await flags.is_enabled(flags.FLAG_AI_COMPLETIONS):
        raise HTTPException(
            status_code=503,
            detail="COS-FLAG-001: AI completions are temporarily disabled",
        )
    try:
        result = await classify_intent(req.transcript, _provider, _db_pool, tenant_id)
    except NotImplementedError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return IntentResponse(
        intent=result.intent,
        target=result.target,
        text=result.text,
        confidence=result.confidence,
    )


@app.post("/api/v1/rag/query", response_model=RAGQueryResponse)
async def rag_query(req: RAGQueryRequest, tenant_id: str = Depends(get_verified_tenant)):
    # Hybrid retrieval (keyword + vector, fused via RRF) runs whenever the backends are injected.
    # Stage-1 leaves them unconfigured, so this returns 503 — same posture as StubLLMProvider.
    # tenant_id comes from the verified token/gateway (auth.get_verified_tenant), NOT req.tenant_id —
    # a client-supplied body tenant must never scope another tenant's retrieval (cross-tenant IDOR).
    if _retriever is None:
        raise HTTPException(
            status_code=503,
            detail="RAG retrieval backends (OpenSearch + pgvector) not configured",
        )

    chunks = await _retriever.retrieve(
        req.query, tenant_id, req.entity_types, req.top_k
    )
    context = _retriever.assemble_context(chunks)
    messages = [
        Message(
            role="system",
            content="Answer strictly from the provided context. If it is insufficient, say so.",
        ),
        Message(role="user", content=f"Context:\n{context}\n\nQuestion: {req.query}"),
    ]
    try:
        response = await metering.complete_and_meter(
            _provider, messages, "report-generation", tenant_id, "ai.rag", _db_pool
        )
    except NotImplementedError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    return RAGQueryResponse(
        answer=response.content,
        sources=[chunk.to_dict() for chunk in chunks],
    )


# ── Voice transcription (Layer A) — client-facing entry; delegates to the pipeline ────────────────

class TranscribeRequest(BaseModel):
    file_id: str
    tenant_id: str
    language: str | None = "th"  # app default locale


class TranscribeResponse(BaseModel):
    file_id: str
    transcript: str
    language: str
    duration_seconds: float
    billed_minutes: int


def _billed_minutes(duration_seconds: float) -> int:
    """Voice transcription is metered per minute at the tenant level (spec 26 §57): round up, min 1
    for any non-empty audio; 0 for empty."""
    if duration_seconds <= 0:
        return 0
    return max(1, math.ceil(duration_seconds / 60))


def _usage_record(tenant_id: str, billed_minutes: int) -> dict:
    return {
        "tenant_id": tenant_id,
        "service": "ai.transcription",
        "unit": "minute",
        "quantity": billed_minutes,
    }


@app.post("/api/v1/ai/transcribe", response_model=TranscribeResponse)
async def transcribe(req: TranscribeRequest, tenant_id: str = Depends(get_verified_tenant)):
    # tenant_id is taken from the verified token/gateway, not req.tenant_id — the downstream pipeline
    # and the usage meter are both scoped by it, so a client cannot bill or transcribe as another tenant.
    async with httpx.AsyncClient(timeout=120) as client:
        try:
            resp = await client.post(
                f"{_transcription_url}/api/v1/ai/transcribe",
                json={
                    "file_id": req.file_id,
                    "tenant_id": tenant_id,
                    "language": req.language,
                },
            )
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f"Transcription service unreachable: {exc}")

    if resp.status_code == 503:
        detail = resp.json().get("detail", "Transcription provider not configured")
        raise HTTPException(status_code=503, detail=detail)
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="Transcription service error")

    data = resp.json()
    billed = _billed_minutes(data["duration_seconds"])
    # A4 — per-minute usage metering (spec 26 §57). No metering store exists yet, so emit a
    # structured usage record for the billing aggregator; the Tenant-Admin usage dashboard
    # (spec 26 §58) consumes these downstream and is a separate concern.
    _usage_logger.info("ai.usage %s", _usage_record(tenant_id, billed))

    return TranscribeResponse(
        file_id=data["file_id"],
        transcript=data["transcript"],
        language=data["language"],
        duration_seconds=data["duration_seconds"],
        billed_minutes=billed,
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


# tenant_id on every report endpoint comes from the verified token/gateway (get_verified_tenant),
# never from the request body — otherwise a caller could generate/read another tenant's reports.
@app.post("/api/v1/ai/reports/site-summary", response_model=ReportResponse)
async def site_summary(req: SiteSummaryRequest, tenant_id: str = Depends(get_verified_tenant)):
    return await _run_report(
        "SITE_SUMMARY", req.project_id, tenant_id, req.generated_by,
        {"date_range": req.date_range},
    )


@app.post("/api/v1/ai/reports/procurement-summary", response_model=ReportResponse)
async def procurement_summary(
    req: ProcurementSummaryRequest, tenant_id: str = Depends(get_verified_tenant)
):
    return await _run_report(
        "PROCUREMENT_SUMMARY", req.project_id, tenant_id, req.generated_by, {},
    )


@app.post("/api/v1/ai/reports/executive-summary", response_model=ReportResponse)
async def executive_summary(
    req: ExecutiveSummaryRequest, tenant_id: str = Depends(get_verified_tenant)
):
    return await _run_report(
        "EXECUTIVE_SUMMARY", req.project_id, tenant_id, req.generated_by, {},
    )


@app.post("/api/v1/ai/reports/delay-risk", response_model=ReportResponse)
async def delay_risk(req: DelayRiskRequest, tenant_id: str = Depends(get_verified_tenant)):
    resp = await _run_report(
        "DELAY_RISK", req.project_id, tenant_id, req.generated_by, {},
    )
    # F4b feed: a confident delay-risk assessment becomes a risk-prediction event, which the backend
    # consumes to create an AI_SUGGESTED ProjectRisk (ADR-065). Non-fatal — the report is already
    # returned/persisted, so an emit failure must never fail the response. Low-confidence output is not
    # emitted (the register must not fill with noise).
    if not resp.low_confidence and resp.content.get("delay_risk_level"):
        try:
            await emit_risk_prediction(
                req.project_id, tenant_id, resp.content, resp.confidence, producer=_risk_producer
            )
        except Exception as exc:  # noqa: BLE001 - emit is best-effort, report already succeeded
            logging.getLogger("cos.ai.risk").warning(
                "risk-prediction emit failed for %s: %s", req.project_id, exc
            )
    return resp


@app.get("/api/v1/ai/reports/history")
async def report_history(
    project_id: str, tenant_id: str = Depends(get_verified_tenant), limit: int = 20
):
    if _db_pool is None:
        raise HTTPException(status_code=503, detail="Database not configured")
    from reports.persistence import fetch_report_history
    rows = await fetch_report_history(_db_pool, tenant_id, project_id, limit)
    return {"project_id": project_id, "reports": rows}


# ── Shared helpers ─────────────────────────────────────────────────────────────

class _VariablesModel(BaseModel):
    model_config = {"extra": "allow"}

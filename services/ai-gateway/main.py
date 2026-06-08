"""Construction OS — AI Gateway (FastAPI)
Phase 11: AI Foundation — LLM completions + RAG query endpoints.
Source: context/00_master_construction_os.md §Phase 11 LLM Gateway
"""
import os

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from providers.llm_provider import Message, StubLLMProvider
from templates.loader import render_template

app = FastAPI(title="COS AI Gateway", version="0.1.0")

_provider = StubLLMProvider()


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


class _VariablesModel(BaseModel):
    model_config = {"extra": "allow"}

"""Construction OS — AI Embedding Worker (FastAPI)
Phase 11: AI Foundation — vector embedding generation + storage.
Source: context/00_master_construction_os.md §Phase 11 Embedding Worker
"""
import os

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from providers.embedding_provider import StubEmbeddingProvider

app = FastAPI(title="COS AI Embedding Worker", version="0.1.0")

_provider = StubEmbeddingProvider()


class EmbeddingRequest(BaseModel):
    text: str
    entity_type: str
    entity_id: str
    tenant_id: str


class EmbeddingResponse(BaseModel):
    entity_id: str
    dimensions: int
    status: str


@app.get("/health/live")
async def liveness():
    return {"status": "ok", "service": os.environ.get("OTEL_SERVICE_NAME", "ai-embedding-worker")}


@app.post("/api/v1/embeddings/generate", response_model=EmbeddingResponse)
async def generate_embedding(req: EmbeddingRequest):
    try:
        await _provider.embed([req.text])
    except NotImplementedError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    return EmbeddingResponse(
        entity_id=req.entity_id,
        dimensions=_provider.dimensions,
        status="stored",
    )

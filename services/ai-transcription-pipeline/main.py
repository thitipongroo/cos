"""Construction OS — AI Transcription Pipeline (FastAPI)
Voice transcription — spec 21-mvp-scope §21.4 (Layer A assistive AI) + 22-ai-architecture §22.2
(Whisper). Exposes `POST /api/v1/ai/transcribe`, the endpoint noted as pending in
14-api-architecture §348. Self-host faster-whisper (STT_PROVIDER=faster_whisper); defaults to the
stub provider until the model image is deployed (mirrors ai-embedding-worker).
"""
import os
from uuid import UUID

import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from providers.transcription_provider import (
    FasterWhisperProvider,
    StubTranscriptionProvider,
    TranscriptionProvider,
)

app = FastAPI(title="COS AI Transcription Pipeline", version="0.1.0")


def _select_provider() -> TranscriptionProvider:
    if os.environ.get("STT_PROVIDER", "stub").lower() == "faster_whisper":
        return FasterWhisperProvider()
    return StubTranscriptionProvider()


_provider = _select_provider()


class TranscribeRequest(BaseModel):
    # UUID, not str. This value is interpolated straight into the file-service URL below,
    # so an unvalidated string let a caller walk the path with "../" and reach endpoints on
    # file-service that were never meant to be reachable from here. file_id is a UUID
    # everywhere it is stored (20260605000002_file_service), so constraining the type costs
    # nothing and makes the interpolation safe by construction.
    # Found by CodeQL py/partial-ssrf; neither bandit nor the Semgrep packs reported it.
    file_id: UUID
    tenant_id: str
    language: str | None = "th"  # app default locale is Thai


class TranscribeResponse(BaseModel):
    file_id: str
    transcript: str
    language: str
    duration_seconds: float


@app.get("/health/live")
async def liveness():
    return {"status": "ok", "service": os.environ.get("OTEL_SERVICE_NAME", "ai-transcription-pipeline")}


@app.post("/api/v1/ai/transcribe", response_model=TranscribeResponse)
async def transcribe(req: TranscribeRequest):
    file_service_url = os.environ.get("FILE_SERVICE_URL", "http://file-service:8000")
    signed_url_endpoint = f"{file_service_url}/api/v1/files/{req.file_id}/signed-url"

    async with httpx.AsyncClient(timeout=60) as client:
        url_resp = await client.get(signed_url_endpoint)
        if url_resp.status_code != 200:
            raise HTTPException(status_code=404, detail=f"File not found: {req.file_id}")

        signed_url = url_resp.json()["url"]
        audio_resp = await client.get(signed_url)
        if audio_resp.status_code != 200:
            raise HTTPException(status_code=502, detail="Failed to fetch audio from storage")

    try:
        result = await _provider.transcribe(audio_resp.content, language=req.language)
    except NotImplementedError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    return TranscribeResponse(
        # str() at the boundary: file_id is a UUID on the request model, str on the response.
        file_id=str(req.file_id),
        transcript=result.transcript,
        language=result.language,
        duration_seconds=result.duration_seconds,
    )

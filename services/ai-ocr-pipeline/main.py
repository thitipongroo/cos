"""Construction OS — AI OCR Pipeline (FastAPI)
Phase 11: AI Foundation — PDF/image text extraction via pytesseract.
Source: context/00_master_construction_os.md §Phase 11 OCR Pipeline
"""
import os
from uuid import UUID

import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from ocr_pipeline import process_file

app = FastAPI(title="COS AI OCR Pipeline", version="0.1.0")


class OCRRequest(BaseModel):
    # UUID, not str. This value is interpolated straight into the file-service URL below,
    # so an unvalidated string let a caller walk the path with "../" and reach endpoints on
    # file-service that were never meant to be reachable from here. file_id is a UUID
    # everywhere it is stored (20260605000002_file_service), so constraining the type costs
    # nothing and makes the interpolation safe by construction.
    # Found by CodeQL py/partial-ssrf; neither bandit nor the Semgrep packs reported it.
    file_id: UUID
    tenant_id: str


class OCRResponse(BaseModel):
    file_id: str
    extracted_text: str
    confidence_score: float


@app.get("/health/live")
async def liveness():
    return {"status": "ok", "service": os.environ.get("OTEL_SERVICE_NAME", "ai-ocr-pipeline")}


@app.post("/api/v1/ocr/process", response_model=OCRResponse)
async def ocr_process(req: OCRRequest):
    file_service_url = os.environ.get("FILE_SERVICE_URL", "http://file-service:8000")
    signed_url_endpoint = f"{file_service_url}/api/v1/files/{req.file_id}/signed-url"

    async with httpx.AsyncClient(timeout=30) as client:
        url_resp = await client.get(signed_url_endpoint)
        if url_resp.status_code != 200:
            raise HTTPException(status_code=404, detail=f"File not found: {req.file_id}")

        signed_url = url_resp.json()["url"]
        mime_type = url_resp.json().get("mime_type", "application/octet-stream")

        file_resp = await client.get(signed_url)
        if file_resp.status_code != 200:
            raise HTTPException(status_code=502, detail="Failed to fetch file from storage")

    # str() at the boundary: file_id is a UUID on the request model (see OCRRequest) while the
    # pipeline and the response model both speak str.
    result = process_file(str(req.file_id), file_resp.content, mime_type)
    return OCRResponse(
        file_id=result.file_id,
        extracted_text=result.extracted_text,
        confidence_score=result.confidence_score,
    )

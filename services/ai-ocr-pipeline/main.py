"""Construction OS — AI OCR Pipeline (FastAPI)
Phase 11: AI Foundation — PDF/image text extraction via pytesseract.
Source: context/00_master_construction_os.md §Phase 11 OCR Pipeline
"""
import os

import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from ocr_pipeline import process_file

app = FastAPI(title="COS AI OCR Pipeline", version="0.1.0")


class OCRRequest(BaseModel):
    file_id: str
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

    result = process_file(req.file_id, file_resp.content, mime_type)
    return OCRResponse(
        file_id=result.file_id,
        extracted_text=result.extracted_text,
        confidence_score=result.confidence_score,
    )

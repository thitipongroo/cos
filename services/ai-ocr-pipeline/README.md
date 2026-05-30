# Construction OS — AI OCR Pipeline (FastAPI)

**Runtime:** Python 3.11 + FastAPI
**Phase:** Phase 11 — AI Foundation
**Deployable:** Separate from NestJS monolith (Python ecosystem)

## Purpose

Extracts structured text from uploaded PDF and image files (scanned invoices, delivery notes, site documents). Feeds extracted text into the embedding worker for semantic search.

Processing pipeline:
```
file.uploaded (Kafka) → fetch from File Service → pdf2image → pytesseract → extracted text → Embedding Worker
```

OCR engine: `pytesseract` + `pdf2image` (open-source, self-hosted — no cloud provider dependency at Phase 11).
Cloud OCR (AWS Textract / Google Document AI): EP-AI-003 stub — activate after measuring invoice photo quality in production.

## Public API

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/ocr/process` | Extract text from file |

## Dependencies

- File Service (fetch signed URL for input file)
- ai-embedding-worker (POST extracted text for embedding)
- Kafka (consumer: `file.uploaded` where mime_type = PDF or image)
- tesseract-ocr (system package — installed in Dockerfile)

## Extension points

| EP | Status | Trigger |
|----|--------|---------|
| EP-AI-003 | STUB | Cloud OCR — activate after production photo quality assessment |

## Configuration

```bash
FILE_SERVICE_URL=http://localhost:3001
EMBEDDING_WORKER_URL=http://localhost:8002
KAFKA_BROKERS=localhost:29092
```

## Usage

```bash
cd services/ai-ocr-pipeline
pip install -r requirements.txt
uvicorn main:app --reload --port 8003
```

# Construction OS — AI Transcription Pipeline (FastAPI)

**Runtime:** Python 3.12 + FastAPI
**Phase:** AI Foundation — Layer A assistive AI
**Deployable:** Separate from the NestJS monolith (Python ecosystem)

## Purpose

Voice transcription (speech-to-text) for field notes — spec
[`21-mvp-scope`](../../docs/specifications/21-mvp-scope.md) §21.4 (Layer A) and
[`22-ai-architecture`](../../docs/specifications/22-ai-architecture.md) §22.2 (Whisper). Implements
`POST /api/v1/ai/transcribe`, the endpoint noted as pending in
[`14-api-architecture`](../../docs/specifications/14-api-architecture.md) §348.

Responsibilities:

- Transcribe audio via the `TranscriptionProvider` interface (callers never import a model SDK
  directly — mirrors `EmbeddingProvider` in `ai-embedding-worker`).
- Return `duration_seconds` so the caller can meter per-minute at the tenant level (spec
  [`26-pricing-model`](../../docs/specifications/26-pricing-model.md) §57).

## Provider

Self-host **faster-whisper** (`providers/transcription_provider.py::FasterWhisperProvider`). The
`faster-whisper` package + model weights are a prod/deploy-image dependency, lazy-imported so the
base install and unit tests run without them. Enable with `STT_PROVIDER=faster_whisper`
(`WHISPER_MODEL_SIZE`, `WHISPER_DEVICE`, `WHISPER_COMPUTE_TYPE` tune it). Until then the service
answers with `StubTranscriptionProvider` (HTTP 503), matching the current `ai-embedding-worker`
baseline.

## Endpoint

`POST /api/v1/ai/transcribe` — body `{ file_id, tenant_id, language? }` (audio is fetched from
`file-service` by `file_id`, mirroring `ai-ocr-pipeline`). Returns
`{ file_id, transcript, language, duration_seconds }`. `language` defaults to `th`.

## Test

```bash
python -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
pytest
```

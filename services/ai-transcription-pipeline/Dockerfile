# Multi-stage Python build — spec §8.9
# builder: installs venv; runner: copies venv (no build tools in final image)
#
# BUILD CONTEXT IS THE REPO ROOT, not services/ai-transcription-pipeline. requirements.txt installs
# the shared metrics package via the local path ../../libs/python/cosmetrics (ADR-069), which sits
# outside a service-scoped context. Build with:  docker build -f services/ai-transcription-pipeline/Dockerfile .

# ─── Stage 1: builder ────────────────────────────────────────────────────────
FROM python:3.12-slim AS builder
WORKDIR /app
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
# libs/python must be present so `../../libs/python/cosmetrics` in requirements.txt resolves from the
# service dir below. Installed non-editable, so pip bakes it into /opt/venv (the runner needs no copy).
COPY libs/python ./libs/python
COPY services/ai-transcription-pipeline/requirements.txt ./services/ai-transcription-pipeline/
WORKDIR /app/services/ai-transcription-pipeline
RUN pip install --no-cache-dir -r requirements.txt

# ─── Stage 2: runner ─────────────────────────────────────────────────────────
FROM python:3.12-slim AS runner
WORKDIR /app
RUN useradd --system --uid 1001 cosuser
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
COPY services/ai-transcription-pipeline/ .
USER cosuser
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=10s --retries=3 CMD python -c "import httpx; httpx.get('http://localhost:8000/health/live')" || exit 1
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]

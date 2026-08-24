# Multi-stage Python build — spec §8.9
# builder: installs venv; runner: copies venv (no build tools in final image)
#
# BUILD CONTEXT IS THE REPO ROOT, not services/ai-gateway. Two reasons the service cannot build from
# a service-scoped context:
#   1. The versioned prompt templates at repo-root ai/prompts (§22.7) live outside the service dir.
#   2. requirements.txt installs the shared metrics package via ../../libs/python/cosmetrics (ADR-069),
#      also outside the service dir.
# With a service-scoped context the image shipped without the prompts, so templates/loader.py raised
# `FileNotFoundError: Could not locate ai/prompts` at import time and the container never started —
# docker-compose papered over it with a bind mount, but the Helm chart sets no PROMPTS_DIR and mounts
# nothing, so a Kubernetes deploy would CrashLoop.
# Build with:  docker build -f services/ai-gateway/Dockerfile .   (root .dockerignore applies)

# ─── Stage 1: builder ────────────────────────────────────────────────────────
FROM python:3.12-slim AS builder
WORKDIR /app
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
# libs/python must be present so `../../libs/python/cosmetrics` in requirements.txt resolves from the
# service dir below. Installed non-editable, so pip bakes it into /opt/venv (the runner needs no copy).
COPY libs/python ./libs/python
COPY services/ai-gateway/requirements.txt ./services/ai-gateway/
WORKDIR /app/services/ai-gateway
RUN pip install --no-cache-dir -r requirements.txt

# ─── Stage 2: runner ─────────────────────────────────────────────────────────
FROM python:3.12-slim AS runner
WORKDIR /app
RUN useradd --system --uid 1001 cosuser
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
COPY services/ai-gateway/ .
# Prompt templates live at repo root, outside the service dir. Landing them at /app/ai/prompts lets
# templates/loader.py find them by its own parent walk — no PROMPTS_DIR needed in any environment.
COPY ai/prompts/ ./ai/prompts/
USER cosuser
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=10s --retries=3 CMD python -c "import httpx; httpx.get('http://127.0.0.1:8000/health/live')" || exit 1
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]

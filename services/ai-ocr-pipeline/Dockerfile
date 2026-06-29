# Multi-stage Python build — spec §8.9
# builder: installs venv; runner: copies venv (no build tools in final image)

# ─── Stage 1: builder ────────────────────────────────────────────────────────
FROM python:3.12-slim AS builder
WORKDIR /app
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ─── Stage 2: runner ─────────────────────────────────────────────────────────
FROM python:3.12-slim AS runner
WORKDIR /app
# Tier-1 OCR runtime dependencies (spec §22.7 OCR Provider):
#   tesseract-ocr  — binary that pytesseract wraps
#   poppler-utils  — pdftoppm/pdftocairo, required by pdf2image
#   add tesseract-ocr-tha for Thai-language OCR if Tier-1 must read Thai documents
RUN apt-get update && apt-get install -y --no-install-recommends \
      tesseract-ocr poppler-utils \
    && rm -rf /var/lib/apt/lists/*
RUN useradd --system --uid 1001 cosuser
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
COPY . .
USER cosuser
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=10s --retries=3 CMD python -c "import httpx; httpx.get('http://127.0.0.1:8000/health/live')" || exit 1
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]

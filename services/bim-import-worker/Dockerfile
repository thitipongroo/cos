# BIM (IFC4) import worker (spec §33.3, §33.4). Multi-stage Python build like the other
# Python services (ai-embedding-worker, ai-gateway).
#
# HONEST SCOPE: this worker is currently an injectable mapping library (bim_import.py) with
# ``parse_ifc`` and ``register`` seams supplied by a caller — it has NO standalone MQTT/Kafka
# consumer loop yet (T4 is mock-verified only). So the image packages the library and verifies
# it imports; it does not start a service. The real ifcopenshell parse path is not exercised here.

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
RUN useradd --system --uid 1001 cosuser
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
COPY . .
USER cosuser
# No service loop yet — import-check only so the image build fails loudly if deps or module break.
CMD ["python", "-c", "import bim_import; print('bim-import-worker library OK (no consumer loop yet, mock-only §33.3)')"]

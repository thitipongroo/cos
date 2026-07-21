"""Unit tests for the embedding worker's FastAPI surface.

Endpoint coroutines are awaited directly rather than driven through `fastapi.testclient`: TestClient
needs `httpx2` (its absence raises a StarletteDeprecationWarning, which `filterwarnings = error`
turns into a collection error) and its portal leaks sockets that resurface as unraisable
ResourceWarnings at teardown. The `HTTPException` each handler raises is the same contract FastAPI
serialises, so the status mapping is still asserted.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import main as main_module
import pytest
from fastapi import HTTPException
from main import EmbeddingRequest, generate_embedding, liveness
from providers.embedding_provider import EMBEDDING_DIMENSIONS, StubEmbeddingProvider


class _RecordingProvider:
    """Succeeds, and remembers what it was asked to embed."""

    def __init__(self, dimensions: int = EMBEDDING_DIMENSIONS):
        self.calls: list = []
        self._dimensions = dimensions

    async def embed(self, texts):
        self.calls.append(texts)
        return [[0.0] * self._dimensions for _ in texts]

    @property
    def dimensions(self) -> int:
        return self._dimensions


def _request(**overrides) -> EmbeddingRequest:
    payload = {
        "text": "รายงานหน้างานประจำวัน",
        "entity_type": "site_report",
        "entity_id": "22222222-2222-2222-2222-222222222222",
        "tenant_id": "11111111-1111-1111-1111-111111111111",
    }
    payload.update(overrides)
    return EmbeddingRequest(**payload)


class TestLiveness:
    @pytest.mark.asyncio
    async def test_reports_ok_with_default_service_name(self, monkeypatch):
        monkeypatch.delenv("OTEL_SERVICE_NAME", raising=False)
        assert await liveness() == {"status": "ok", "service": "ai-embedding-worker"}

    @pytest.mark.asyncio
    async def test_service_name_comes_from_otel_env(self, monkeypatch):
        monkeypatch.setenv("OTEL_SERVICE_NAME", "embed-canary")
        assert (await liveness())["service"] == "embed-canary"


class TestGenerateEmbedding:
    @pytest.mark.asyncio
    async def test_returns_stored_with_the_provider_dimensions(self, monkeypatch):
        provider = _RecordingProvider()
        monkeypatch.setattr(main_module, "_provider", provider)

        resp = await generate_embedding(_request())

        assert resp.entity_id == "22222222-2222-2222-2222-222222222222"
        assert resp.dimensions == EMBEDDING_DIMENSIONS
        assert resp.status == "stored"

    @pytest.mark.asyncio
    async def test_embeds_the_request_text_as_a_single_item_batch(self, monkeypatch):
        provider = _RecordingProvider()
        monkeypatch.setattr(main_module, "_provider", provider)

        await generate_embedding(_request(text="ปูนซีเมนต์ 50 ถุง"))

        assert provider.calls == [["ปูนซีเมนต์ 50 ถุง"]]

    @pytest.mark.asyncio
    async def test_dimensions_come_from_the_provider_not_a_constant(self, monkeypatch):
        # Swapping the embedding model must change the reported width, or callers sizing a
        # VECTOR(n) column would be told the wrong number.
        monkeypatch.setattr(main_module, "_provider", _RecordingProvider(dimensions=768))

        assert (await generate_embedding(_request())).dimensions == 768

    @pytest.mark.asyncio
    async def test_503_when_no_embedding_provider_is_configured(self, monkeypatch):
        # Default deployment posture: the stub is wired until an API key exists → advertise
        # unavailable rather than 500.
        monkeypatch.setattr(main_module, "_provider", StubEmbeddingProvider())

        with pytest.raises(HTTPException) as exc:
            await generate_embedding(_request())

        assert exc.value.status_code == 503
        assert "not configured" in exc.value.detail


class TestModuleWiring:
    def test_defaults_to_the_stub_provider(self):
        # main.py binds the provider at import; the default must be the safe 503 path.
        assert isinstance(main_module._provider, StubEmbeddingProvider)

    def test_endpoints_are_registered_at_the_spec_paths(self):
        routes = {getattr(r, "path", None) for r in main_module.app.routes}
        assert "/api/v1/embeddings/generate" in routes
        assert "/health/live" in routes

"""Unit tests for the embedding worker FastAPI surface — Phase 11.

§35.13 ESC-24: main.py had no test, so all 25 of its statements counted against the QM-1
--cov-fail-under=99 gate.

The service ships with StubEmbeddingProvider wired in, which raises NotImplementedError — so the
503 path is what production actually returns today, and the 200 path only exists once a real
provider is configured. Both are covered here, the latter by swapping the module-level provider.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from fastapi.testclient import TestClient

import main as main_module
from main import app
from providers.embedding_provider import EmbeddingProvider

client = TestClient(app)


class _WorkingProvider(EmbeddingProvider):
    """A provider that behaves like a configured one, for the success path."""

    def __init__(self, dimensions: int = 1536):
        self._dimensions = dimensions
        self.calls: list[list[str]] = []

    async def embed(self, texts: list[str]) -> list[list[float]]:
        self.calls.append(texts)
        return [[0.0] * self._dimensions for _ in texts]

    @property
    def dimensions(self) -> int:
        return self._dimensions


def _payload(**overrides) -> dict:
    body = {
        "text": "Concrete pour on level 3 completed",
        "entity_type": "site_report",
        "entity_id": "sr-1",
        "tenant_id": "t1",
    }
    body.update(overrides)
    return body


class TestLiveness:
    def test_reports_the_default_service_name(self, monkeypatch):
        monkeypatch.delenv("OTEL_SERVICE_NAME", raising=False)
        resp = client.get("/health/live")
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok", "service": "ai-embedding-worker"}

    def test_reports_the_configured_service_name(self, monkeypatch):
        monkeypatch.setenv("OTEL_SERVICE_NAME", "embedding-canary")
        assert client.get("/health/live").json()["service"] == "embedding-canary"


class TestGenerateEmbedding:
    def test_503_while_the_stub_provider_is_wired(self):
        """The shipped default: no real provider, so the endpoint must refuse, not fake a result."""
        resp = client.post("/api/v1/embeddings/generate", json=_payload())
        assert resp.status_code == 503
        assert "not configured" in resp.json()["detail"]

    def test_200_and_reports_dimensions_once_a_provider_is_configured(self, monkeypatch):
        provider = _WorkingProvider(dimensions=1536)
        monkeypatch.setattr(main_module, "_provider", provider)

        resp = client.post("/api/v1/embeddings/generate", json=_payload(entity_id="sr-9"))

        assert resp.status_code == 200
        assert resp.json() == {"entity_id": "sr-9", "dimensions": 1536, "status": "stored"}
        # the request text is what gets embedded — one call, one text
        assert provider.calls == [["Concrete pour on level 3 completed"]]

    def test_reports_whatever_dimension_count_the_provider_declares(self, monkeypatch):
        monkeypatch.setattr(main_module, "_provider", _WorkingProvider(dimensions=3072))
        resp = client.post("/api/v1/embeddings/generate", json=_payload())
        assert resp.json()["dimensions"] == 3072

    @pytest.mark.parametrize("missing", ["text", "entity_type", "entity_id", "tenant_id"])
    def test_rejects_a_body_missing_any_required_field(self, missing):
        body = _payload()
        del body[missing]
        assert client.post("/api/v1/embeddings/generate", json=body).status_code == 422

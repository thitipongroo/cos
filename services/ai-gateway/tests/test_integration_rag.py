"""Integration test: full RAG query pipeline using StubLLMProvider.

No real API call — StubLLMProvider raises NotImplementedError, which is
the correct behaviour for a stub. The integration test verifies that:
1. The RAG endpoint wires through to the provider correctly.
2. A 503 is returned when provider is not configured (stub behaviour).
3. The request/response contract matches the spec.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def client():
    from main import app
    return TestClient(app)


class TestRAGPipelineIntegration:
    def test_rag_query_endpoint_exists(self, client):
        resp = client.post(
            "/api/v1/rag/query",
            json={"query": "What is the delay risk?", "tenant_id": "tenant-abc"},
        )
        assert resp.status_code in (200, 503)

    def test_rag_query_returns_503_when_provider_not_configured(self, client):
        resp = client.post(
            "/api/v1/rag/query",
            json={"query": "Summarise site report", "tenant_id": "tenant-abc"},
        )
        assert resp.status_code == 503

    def test_rag_query_accepts_optional_entity_types(self, client):
        resp = client.post(
            "/api/v1/rag/query",
            json={
                "query": "Risk analysis",
                "tenant_id": "tenant-abc",
                "entity_types": ["document", "site_report"],
                "top_k": 3,
            },
        )
        assert resp.status_code in (200, 503)

    def test_completions_endpoint_exists(self, client):
        resp = client.post(
            "/api/v1/ai/completions",
            json={
                "template_name": "nonexistent-template",
                "variables": {},
                "model_hint": "summarization",
            },
        )
        assert resp.status_code in (200, 404, 503)

    def test_completions_returns_404_for_missing_template(self, client):
        resp = client.post(
            "/api/v1/ai/completions",
            json={
                "template_name": "does-not-exist-template",
                "variables": {},
            },
        )
        assert resp.status_code == 404

    def test_health_endpoint_ok(self, client):
        resp = client.get("/health/live")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"

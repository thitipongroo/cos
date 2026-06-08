"""Integration tests: full report generation pipeline using StubLLMProvider.

StubLLMProvider raises NotImplementedError — the pipeline surfaces this as HTTP 503.
Tests verify: endpoint contracts, 503 behaviour, request schema, history endpoint.
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


SITE_PAYLOAD = {
    "project_id": "proj-001",
    "tenant_id": "tenant-abc",
    "date_range": "last 7 days",
    "generated_by": "user-001",
}

PROC_PAYLOAD = {
    "project_id": "proj-001",
    "tenant_id": "tenant-abc",
    "generated_by": "user-001",
}


class TestSiteSummaryEndpoint:
    def test_endpoint_exists(self, client):
        resp = client.post("/api/v1/ai/reports/site-summary", json=SITE_PAYLOAD)
        assert resp.status_code in (200, 503)

    def test_returns_503_with_stub_provider(self, client):
        resp = client.post("/api/v1/ai/reports/site-summary", json=SITE_PAYLOAD)
        assert resp.status_code == 503

    def test_request_schema_validated(self, client):
        resp = client.post("/api/v1/ai/reports/site-summary", json={})
        assert resp.status_code == 422


class TestProcurementSummaryEndpoint:
    def test_endpoint_exists(self, client):
        resp = client.post("/api/v1/ai/reports/procurement-summary", json=PROC_PAYLOAD)
        assert resp.status_code in (200, 503)

    def test_returns_503_with_stub_provider(self, client):
        resp = client.post("/api/v1/ai/reports/procurement-summary", json=PROC_PAYLOAD)
        assert resp.status_code == 503


class TestExecutiveSummaryEndpoint:
    def test_endpoint_exists(self, client):
        resp = client.post("/api/v1/ai/reports/executive-summary", json=PROC_PAYLOAD)
        assert resp.status_code in (200, 503)

    def test_returns_503_with_stub_provider(self, client):
        resp = client.post("/api/v1/ai/reports/executive-summary", json=PROC_PAYLOAD)
        assert resp.status_code == 503


class TestDelayRiskEndpoint:
    def test_endpoint_exists(self, client):
        resp = client.post("/api/v1/ai/reports/delay-risk", json=PROC_PAYLOAD)
        assert resp.status_code in (200, 503)

    def test_returns_503_with_stub_provider(self, client):
        resp = client.post("/api/v1/ai/reports/delay-risk", json=PROC_PAYLOAD)
        assert resp.status_code == 503


class TestReportHistoryEndpoint:
    def test_endpoint_exists(self, client):
        resp = client.get(
            "/api/v1/ai/reports/history",
            params={"project_id": "proj-001", "tenant_id": "tenant-abc"},
        )
        assert resp.status_code in (200, 503)

    def test_returns_503_when_db_not_configured(self, client):
        resp = client.get(
            "/api/v1/ai/reports/history",
            params={"project_id": "proj-001", "tenant_id": "tenant-abc"},
        )
        assert resp.status_code == 503

    def test_accepts_optional_limit_param(self, client):
        resp = client.get(
            "/api/v1/ai/reports/history",
            params={"project_id": "proj-001", "tenant_id": "tenant-abc", "limit": 5},
        )
        assert resp.status_code in (200, 503)


class TestHealthEndpoint:
    def test_health_ok(self, client):
        resp = client.get("/health/live")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"

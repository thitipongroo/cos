"""Feature-flag client tests (ADR-049; QM-15) — server-evaluated via backend /api/v1/flags.

Covers: fallback default without BACKEND_FLAGS_URL, TTL-cached fetch, fail-open on
backend errors, and the 503 COS-FLAG-001 gate on report endpoints.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from fastapi.testclient import TestClient

import flags


@pytest.fixture(autouse=True)
def reset_flags(monkeypatch):
    flags._reset_cache()
    monkeypatch.delenv("BACKEND_FLAGS_URL", raising=False)
    yield
    flags._reset_cache()


async def test_default_true_without_backend_url():
    assert await flags.is_enabled(flags.FLAG_AI_REPORTS) is True


async def test_default_false_can_be_overridden():
    assert await flags.is_enabled("s9.unknown.flag", default=False) is False


async def test_fetches_and_caches_flags(monkeypatch):
    monkeypatch.setenv("BACKEND_FLAGS_URL", "http://backend/api/v1/flags")
    calls = {"n": 0}

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {"flags": {flags.FLAG_AI_REPORTS: False}}

    class FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        async def get(self, url):
            calls["n"] += 1
            return FakeResponse()

    monkeypatch.setattr(flags.httpx, "AsyncClient", FakeClient)
    assert await flags.is_enabled(flags.FLAG_AI_REPORTS) is False
    # second call within TTL uses the cache — no extra fetch
    assert await flags.is_enabled(flags.FLAG_AI_REPORTS) is False
    assert calls["n"] == 1


async def test_fail_open_when_backend_unreachable(monkeypatch):
    monkeypatch.setenv("BACKEND_FLAGS_URL", "http://backend/api/v1/flags")

    class BrokenClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        async def get(self, url):
            raise RuntimeError("backend down")

    monkeypatch.setattr(flags.httpx, "AsyncClient", BrokenClient)
    assert await flags.is_enabled(flags.FLAG_AI_REPORTS) is True


def test_report_endpoint_returns_503_when_flag_disabled(monkeypatch):
    from main import app

    async def disabled(flag, default=True):
        return False

    monkeypatch.setattr(flags, "is_enabled", disabled)
    client = TestClient(app)
    resp = client.post("/api/v1/ai/reports/site-summary", json={
        "project_id": "proj-001",
        "tenant_id": "tenant-abc",
        "date_range": "last 7 days",
        "generated_by": "user-001",
    })
    assert resp.status_code == 503
    assert "COS-FLAG-001" in resp.json()["detail"]

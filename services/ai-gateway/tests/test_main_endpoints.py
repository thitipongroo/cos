"""ai-gateway HTTP surface — the paths the existing suite left uncovered.

§35.13 ESC-24: main.py sat at 82%. The gaps were the refusal branches (503 when a provider or the
DB is not configured, 404 for a missing template, 502 when a downstream service is unreachable) and
the transcription proxy's per-minute metering. Those are the paths that run in production today,
because the service ships with StubLLMProvider and no DB pool.
"""

import pytest
from fastapi.testclient import TestClient

import main as main_module
from main import _billed_minutes, _usage_record, app

client = TestClient(app)


class _Resp:
    def __init__(self, status_code: int, payload: dict | None = None):
        self.status_code = status_code
        self._payload = payload or {}

    def json(self) -> dict:
        return self._payload


class _FakeAsyncClient:
    def __init__(self, response=None, error: Exception | None = None):
        self._response = response
        self._error = error
        self.posts: list[tuple[str, dict]] = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_exc):
        return False

    async def post(self, url, json=None):
        self.posts.append((url, json))
        if self._error:
            raise self._error
        return self._response


def _client_factory(captured, response=None, error=None):
    def factory(*_a, **_k):
        c = _FakeAsyncClient(response=response, error=error)
        captured.append(c)
        return c

    return factory


class TestBilledMinutes:
    @pytest.mark.parametrize(
        "seconds,expected",
        [(0, 0), (-1, 0), (0.5, 1), (1, 1), (59, 1), (60, 1), (61, 2), (600, 10), (601, 11)],
    )
    def test_rounds_up_with_a_one_minute_minimum(self, seconds, expected):
        # spec 26 §57 — any non-empty audio bills at least one minute.
        assert _billed_minutes(seconds) == expected


class TestUsageRecord:
    def test_carries_the_tenant_service_and_unit(self):
        rec = _usage_record("t1", 3)
        assert rec["tenant_id"] == "t1"
        assert rec["service"] == "ai.transcription"
        assert rec["unit"] == "minute"


class TestCompletions:
    def test_503_while_the_stub_provider_is_wired(self, monkeypatch):
        """Shipped default — the gateway must refuse rather than fabricate a completion."""
        resp = client.post(
            "/api/v1/ai/completions",
            json={"template_name": "report-daily-summary-v1", "variables": {"context": "x"}},
        )
        assert resp.status_code == 503

    def test_404_for_a_template_that_does_not_exist(self):
        resp = client.post(
            "/api/v1/ai/completions",
            json={"template_name": "no-such-template-v9", "variables": {}},
        )
        assert resp.status_code == 404


class TestTranscribeProxy:
    def test_proxies_to_the_transcription_service_and_meters_usage(self, monkeypatch, caplog):
        captured: list[_FakeAsyncClient] = []
        payload = {
            "file_id": "a1",
            "transcript": "เทคอนกรีต",
            "language": "th",
            "duration_seconds": 90.0,
        }
        monkeypatch.setattr(
            main_module.httpx, "AsyncClient", _client_factory(captured, response=_Resp(200, payload))
        )

        with caplog.at_level("INFO", logger="cos.ai.usage"):
            resp = client.post(
                "/api/v1/ai/transcribe", json={"file_id": "a1", "tenant_id": "t1"}
            )

        assert resp.status_code == 200
        assert resp.json()["transcript"] == "เทคอนกรีต"
        # the request is forwarded verbatim to the transcription service
        url, body = captured[0].posts[0]
        assert url.endswith("/api/v1/ai/transcribe")
        assert body == {"file_id": "a1", "tenant_id": "t1", "language": "th"}
        # 90s rounds up to 2 billed minutes and is emitted for the billing aggregator
        assert any("ai.usage" in r.message for r in caplog.records)

    def test_502_when_the_transcription_service_is_unreachable(self, monkeypatch):
        captured: list[_FakeAsyncClient] = []
        monkeypatch.setattr(
            main_module.httpx,
            "AsyncClient",
            _client_factory(captured, error=main_module.httpx.ConnectError("refused")),
        )

        resp = client.post("/api/v1/ai/transcribe", json={"file_id": "a1", "tenant_id": "t1"})

        assert resp.status_code == 502
        assert "unreachable" in resp.json()["detail"]

    def test_503_is_forwarded_with_the_downstream_detail(self, monkeypatch):
        captured: list[_FakeAsyncClient] = []
        monkeypatch.setattr(
            main_module.httpx,
            "AsyncClient",
            _client_factory(captured, response=_Resp(503, {"detail": "provider not configured"})),
        )

        resp = client.post("/api/v1/ai/transcribe", json={"file_id": "a1", "tenant_id": "t1"})

        assert resp.status_code == 503
        assert resp.json()["detail"] == "provider not configured"

    def test_503_falls_back_to_a_default_detail(self, monkeypatch):
        captured: list[_FakeAsyncClient] = []
        monkeypatch.setattr(
            main_module.httpx, "AsyncClient", _client_factory(captured, response=_Resp(503, {}))
        )

        resp = client.post("/api/v1/ai/transcribe", json={"file_id": "a1", "tenant_id": "t1"})

        assert resp.status_code == 503
        assert resp.json()["detail"] == "Transcription provider not configured"

    def test_any_other_downstream_status_becomes_502(self, monkeypatch):
        captured: list[_FakeAsyncClient] = []
        monkeypatch.setattr(
            main_module.httpx, "AsyncClient", _client_factory(captured, response=_Resp(500))
        )

        resp = client.post("/api/v1/ai/transcribe", json={"file_id": "a1", "tenant_id": "t1"})

        assert resp.status_code == 502
        assert resp.json()["detail"] == "Transcription service error"


class TestReportHistory:
    def test_503_when_no_database_pool_is_configured(self, monkeypatch):
        monkeypatch.setattr(main_module, "_db_pool", None)
        resp = client.get(
            "/api/v1/ai/reports/history",
            params={"tenant_id": "t1", "project_id": "p1"},
        )
        assert resp.status_code == 503
        assert resp.json()["detail"] == "Database not configured"

    def test_returns_the_history_when_a_pool_is_configured(self, monkeypatch):
        rows = [{"report_id": "r1", "report_type": "SITE_SUMMARY"}]

        class _Pool:
            async def fetch(self, _q, *_a):
                return rows

        monkeypatch.setattr(main_module, "_db_pool", _Pool())

        resp = client.get(
            "/api/v1/ai/reports/history",
            params={"tenant_id": "t1", "project_id": "p1"},
        )

        assert resp.status_code == 200
        assert resp.json() == {"project_id": "p1", "reports": rows}

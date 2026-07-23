"""The ai-gateway app paths the existing suites leave untested.

Handlers are awaited directly (no TestClient — httpx2 requirement + socket leaks under
`filterwarnings = error`). Covers the lifespan wiring, the two startup guards, the transcribe proxy,
and the report-history endpoint.

The startup guards are the important ones: `_wire_rag` and `_wire_digital_twin` are deliberately
non-fatal, so if their `except` ever stopped swallowing, the gateway would refuse to boot whenever
OpenSearch, pgvector or Kafka were briefly unavailable — an outage amplifier. Nothing here reaches a
backend; every dependency is faked.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import main as main_module
import pytest
from fastapi import HTTPException
from main import (
    TranscribeRequest,
    _lifespan,
    _wire_digital_twin,
    _wire_rag,
    report_history,
    transcribe,
)


class _FakeResponse:
    def __init__(self, status_code=200, json_body=None):
        self.status_code = status_code
        self._json = json_body or {}

    def json(self):
        return self._json


class _FakeAsyncClient:
    response = None
    raises = None
    posted: list = []
    init_kwargs: dict = {}

    def __init__(self, *args, **kwargs):
        type(self).init_kwargs = kwargs

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc_info):
        return False

    async def post(self, url, json=None):
        type(self).posted.append((url, json))
        if type(self).raises is not None:
            raise type(self).raises
        return type(self).response


@pytest.fixture
def fake_http(monkeypatch):
    _FakeAsyncClient.response = _FakeResponse(
        200,
        {
            "file_id": "f-1",
            "transcript": "สวัสดีครับ",
            "language": "th",
            "duration_seconds": 65.0,
        },
    )
    _FakeAsyncClient.raises = None
    _FakeAsyncClient.posted = []
    _FakeAsyncClient.init_kwargs = {}
    monkeypatch.setattr(main_module.httpx, "AsyncClient", _FakeAsyncClient)
    return _FakeAsyncClient


def _transcribe_request(**overrides) -> TranscribeRequest:
    payload = {"file_id": "f-1", "tenant_id": "t-1", "language": "th"}
    payload.update(overrides)
    return TranscribeRequest(**payload)


class TestLifespan:
    @pytest.mark.asyncio
    async def test_runs_both_startup_handlers(self, monkeypatch):
        called: list = []

        async def fake_rag():
            called.append("rag")

        async def fake_twin():
            called.append("twin")

        monkeypatch.setattr(main_module, "_wire_rag", fake_rag)
        monkeypatch.setattr(main_module, "_wire_digital_twin", fake_twin)
        # The lifespan also opens the Prometheus exporter on :9464. Stubbed here so the suite never
        # binds a real socket — otherwise a second entry into the lifespan, a parallel test run, or
        # a CI runner that already has 9464 taken fails with EADDRINUSE.
        started = []
        monkeypatch.setattr(
            main_module.metrics, "start_metrics_server", lambda: started.append(True)
        )

        async with _lifespan(main_module.app):
            pass

        assert called == ["rag", "twin"]
        assert started == [True]


class TestWireRag:
    @pytest.mark.asyncio
    async def test_keeps_an_injected_retriever(self, monkeypatch):
        # A test (or a previous startup) already provided one — do not rebuild it.
        sentinel = object()
        monkeypatch.setattr(main_module, "_retriever", sentinel)

        await _wire_rag()

        assert main_module._retriever is sentinel

    @pytest.mark.asyncio
    async def test_builds_the_retriever_when_backends_are_available(self, monkeypatch):
        monkeypatch.setattr(main_module, "_retriever", None)
        built = object()

        async def fake_build():
            return built

        import rag.wiring as wiring

        monkeypatch.setattr(wiring, "build_retriever", fake_build)

        await _wire_rag()

        assert main_module._retriever is built
        monkeypatch.setattr(main_module, "_retriever", None)

    @pytest.mark.asyncio
    async def test_unavailable_backends_leave_the_gateway_running(self, monkeypatch, caplog):
        # The whole point of the guard: a missing OpenSearch/pgvector must not stop the process.
        import logging

        monkeypatch.setattr(main_module, "_retriever", None)

        async def boom():
            raise RuntimeError("opensearch unreachable")

        import rag.wiring as wiring

        monkeypatch.setattr(wiring, "build_retriever", boom)

        with caplog.at_level(logging.WARNING, logger="cos.ai.usage"):
            await _wire_rag()

        assert main_module._retriever is None
        assert "RAG retriever wiring skipped" in caplog.text


class TestWireDigitalTwin:
    @pytest.mark.asyncio
    async def test_is_off_unless_explicitly_enabled(self, monkeypatch):
        # Opt-in until the Avro decoder exists — an accidental default-on would consume telemetry
        # it cannot decode.
        monkeypatch.delenv("DIGITAL_TWIN_CONSUMER_ENABLED", raising=False)
        monkeypatch.setattr(main_module, "_db_pool", object())

        await _wire_digital_twin()  # must return without touching Redis/Kafka

    @pytest.mark.asyncio
    @pytest.mark.parametrize("value", ["0", "false", "no", ""])
    async def test_non_truthy_values_keep_it_off(self, monkeypatch, value):
        monkeypatch.setenv("DIGITAL_TWIN_CONSUMER_ENABLED", value)
        monkeypatch.setattr(main_module, "_db_pool", object())

        await _wire_digital_twin()

    @pytest.mark.asyncio
    async def test_skips_when_no_database_pool_is_configured(self, monkeypatch, caplog):
        import logging

        monkeypatch.setenv("DIGITAL_TWIN_CONSUMER_ENABLED", "true")
        monkeypatch.setattr(main_module, "_db_pool", None)

        with caplog.at_level(logging.WARNING, logger="cos.ai.usage"):
            await _wire_digital_twin()

        assert "DB pool not configured" in caplog.text

    @pytest.mark.asyncio
    async def test_starts_the_consumer_when_enabled_and_configured(self, monkeypatch):
        monkeypatch.setenv("DIGITAL_TWIN_CONSUMER_ENABLED", "1")
        monkeypatch.setattr(main_module, "_db_pool", object())
        started: list = []

        async def fake_from_url(url):
            return f"redis@{url}"

        async def fake_consumer(*, db_pool, redis_client):
            started.append((db_pool, redis_client))

        import redis.asyncio as aioredis

        import digital_twin.kafka_handler as kh

        monkeypatch.setattr(aioredis, "from_url", fake_from_url)
        monkeypatch.setattr(kh, "start_telemetry_consumer", fake_consumer)

        await _wire_digital_twin()

        # The consumer is launched as a background task; yield once so it runs.
        import asyncio

        await asyncio.sleep(0)
        assert started

    @pytest.mark.asyncio
    async def test_missing_dependencies_do_not_crash_startup(self, monkeypatch, caplog):
        import logging

        monkeypatch.setenv("DIGITAL_TWIN_CONSUMER_ENABLED", "true")
        monkeypatch.setattr(main_module, "_db_pool", object())

        async def boom(url):
            raise RuntimeError("redis unreachable")

        import redis.asyncio as aioredis

        monkeypatch.setattr(aioredis, "from_url", boom)

        with caplog.at_level(logging.WARNING, logger="cos.ai.usage"):
            await _wire_digital_twin()

        assert "digital twin consumer wiring skipped" in caplog.text


class TestTranscribeProxy:
    @pytest.mark.asyncio
    async def test_proxies_to_the_transcription_service(self, fake_http):
        await transcribe(_transcribe_request(), tenant_id="t-1")

        url, body = fake_http.posted[0]
        assert url.endswith("/api/v1/ai/transcribe")
        assert body == {"file_id": "f-1", "tenant_id": "t-1", "language": "th"}

    @pytest.mark.asyncio
    async def test_returns_the_downstream_transcript(self, fake_http):
        resp = await transcribe(_transcribe_request(), tenant_id="t-1")

        assert resp.file_id == "f-1"
        assert resp.transcript == "สวัสดีครับ"

    @pytest.mark.asyncio
    async def test_emits_a_per_minute_usage_record(self, fake_http, caplog):
        # Voice is billed per minute (spec §26.1); a missing record is unbilled usage.
        import logging

        with caplog.at_level(logging.INFO, logger="cos.ai.usage"):
            await transcribe(_transcribe_request(), tenant_id="t-1")

        assert "ai.usage" in caplog.text

    @pytest.mark.asyncio
    async def test_502_when_the_service_is_unreachable(self, fake_http):
        import httpx

        fake_http.raises = httpx.ConnectError("connection refused")

        with pytest.raises(HTTPException) as exc:
            await transcribe(_transcribe_request(), tenant_id="t-1")

        assert exc.value.status_code == 502
        assert "unreachable" in exc.value.detail

    @pytest.mark.asyncio
    async def test_503_is_passed_through_with_its_detail(self, fake_http):
        # The downstream stub-provider 503 must reach the caller as 503, not be masked as 502.
        fake_http.response = _FakeResponse(503, {"detail": "provider not configured"})

        with pytest.raises(HTTPException) as exc:
            await transcribe(_transcribe_request(), tenant_id="t-1")

        assert exc.value.status_code == 503
        assert exc.value.detail == "provider not configured"

    @pytest.mark.asyncio
    async def test_503_without_a_detail_body_gets_a_default(self, fake_http):
        fake_http.response = _FakeResponse(503, {})

        with pytest.raises(HTTPException) as exc:
            await transcribe(_transcribe_request(), tenant_id="t-1")

        assert exc.value.detail == "Transcription provider not configured"

    @pytest.mark.asyncio
    async def test_other_error_statuses_become_502(self, fake_http):
        fake_http.response = _FakeResponse(500, {})

        with pytest.raises(HTTPException) as exc:
            await transcribe(_transcribe_request(), tenant_id="t-1")

        assert exc.value.status_code == 502
        assert exc.value.detail == "Transcription service error"

    @pytest.mark.asyncio
    async def test_uses_a_long_timeout_for_audio(self, fake_http):
        # Transcription is slow; the default httpx timeout would cut long recordings off.
        await transcribe(_transcribe_request(), tenant_id="t-1")

        assert fake_http.init_kwargs.get("timeout") == 120


class TestReportHistory:
    @pytest.mark.asyncio
    async def test_503_when_no_database_is_configured(self, monkeypatch):
        monkeypatch.setattr(main_module, "_db_pool", None)

        with pytest.raises(HTTPException) as exc:
            await report_history(project_id="p-1", tenant_id="t-1")

        assert exc.value.status_code == 503

    @pytest.mark.asyncio
    async def test_returns_history_scoped_to_the_project(self, monkeypatch):
        captured = {}

        class _Pool:
            async def fetch(self, query, *params):
                captured["params"] = params
                return [{"report_id": "r-1"}]

        monkeypatch.setattr(main_module, "_db_pool", _Pool())

        result = await report_history(project_id="p-1", tenant_id="t-1", limit=5)

        assert result == {"project_id": "p-1", "reports": [{"report_id": "r-1"}]}
        assert captured["params"] == ("t-1", "p-1", 5)
        monkeypatch.setattr(main_module, "_db_pool", None)


class TestCompletionsProviderCall:
    """`completions` past the template render — the LLM call and its 503.

    Every AI feature funnels through this endpoint, and the stub provider is the DEFAULT deployment
    posture (no OPENAI_API_KEY), so the 503 branch is the path most real installs actually take.
    """

    @pytest.mark.asyncio
    async def test_returns_the_provider_response(self, monkeypatch):
        from main import CompletionsRequest, completions

        class _Resp:
            content = "สรุปแล้ว"
            model_used = "gpt-4o-mini"
            total_tokens = 42

        class _Provider:
            def __init__(self):
                self.calls = []

            async def complete(self, messages, model_hint):
                self.calls.append((messages, model_hint))
                return _Resp()

        provider = _Provider()
        monkeypatch.setattr(main_module, "_provider", provider)
        monkeypatch.setattr(main_module, "render_template", lambda name, vars_: "PROMPT")

        resp = await completions(
            CompletionsRequest(template_name="t", variables={}, model_hint="report-generation")
        )

        assert resp.content == "สรุปแล้ว"
        assert resp.model_used == "gpt-4o-mini"
        assert resp.total_tokens == 42
        assert provider.calls[0][1] == "report-generation"

    @pytest.mark.asyncio
    async def test_503_when_the_provider_is_the_stub(self, monkeypatch):
        from main import CompletionsRequest, completions

        class _Stub:
            async def complete(self, messages, model_hint):
                raise NotImplementedError("StubLLMProvider: no API key configured")

        monkeypatch.setattr(main_module, "_provider", _Stub())
        monkeypatch.setattr(main_module, "render_template", lambda name, vars_: "PROMPT")

        with pytest.raises(HTTPException) as exc:
            await completions(CompletionsRequest(template_name="t", variables={}))

        assert exc.value.status_code == 503
        assert "no API key" in exc.value.detail


class TestRunReportErrorMapping:
    """`_run_report`'s remaining branches: a missing prompt template, and the success return."""

    @pytest.mark.asyncio
    async def test_missing_prompt_template_is_a_404(self, monkeypatch):
        # A report type whose .j2 file was deleted must not read as "AI unavailable" (503).
        async def boom(**kwargs):
            raise FileNotFoundError("report-daily-summary-v1.j2 not found")

        monkeypatch.setattr(main_module, "generate_report", boom)

        with pytest.raises(HTTPException) as exc:
            await main_module._run_report("SITE_SUMMARY", "p-1", "t-1", "u-1", {})

        assert exc.value.status_code == 404
        assert ".j2" in exc.value.detail

    @pytest.mark.asyncio
    async def test_successful_generation_is_mapped_to_the_response_model(self, monkeypatch):
        from reports.pipeline import ReportResult

        async def ok(**kwargs):
            return ReportResult(
                report_id="r-1",
                report_type="SITE_SUMMARY",
                content={"summary": "ok"},
                confidence=0.91,
                low_confidence=False,
            )

        monkeypatch.setattr(main_module, "generate_report", ok)

        resp = await main_module._run_report("SITE_SUMMARY", "p-1", "t-1", "u-1", {})

        assert resp.report_id == "r-1"
        assert resp.confidence == 0.91
        assert resp.low_confidence is False

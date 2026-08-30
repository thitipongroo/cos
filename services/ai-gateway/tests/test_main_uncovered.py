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

from tests.fake_pool import TenantScopedPoolMixin  # noqa: E402

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

        class _Pool(TenantScopedPoolMixin):
            async def fetch(self, query, *params):
                captured["params"] = params
                return [{"report_id": "r-1"}]

        monkeypatch.setattr(main_module, "_db_pool", _Pool())

        result = await report_history(project_id="p-1", tenant_id="t-1", limit=5)

        assert result == {"project_id": "p-1", "reports": [{"report_id": "r-1"}]}
        assert captured["params"] == ("t-1", "p-1", 5)
        monkeypatch.setattr(main_module, "_db_pool", None)


class TestCompletionsProviderCall:
    """`completions` past the template render — the LLM call, its metering, its flag gate and its 503.

    Every AI feature funnels through this endpoint, and the stub provider is the DEFAULT deployment
    posture (no OPENAI_API_KEY), so the 503 branch is the path most real installs actually take.
    """

    @pytest.mark.asyncio
    async def test_returns_response_and_meters_metrics_when_no_db_pool(self, monkeypatch):
        # Stage-1 posture: no DB pool → usage is not persisted, but the QM-8 LLM metrics MUST still
        # fire (the finding was that metering existed but nothing invoked it).
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

        recorded = []
        provider = _Provider()
        monkeypatch.setattr(main_module, "_provider", provider)
        monkeypatch.setattr(main_module, "_db_pool", None)
        monkeypatch.setattr(main_module, "render_template", lambda name, vars_: "PROMPT")
        monkeypatch.setattr(
            main_module.metrics, "record_llm_usage", lambda *a: recorded.append(a)
        )

        resp = await completions(
            CompletionsRequest(template_name="t", variables={}, model_hint="report-generation"),
            tenant_id="tenant-abc",
        )

        assert resp.content == "สรุปแล้ว"
        assert resp.model_used == "gpt-4o-mini"
        assert resp.total_tokens == 42
        assert provider.calls[0][1] == "report-generation"
        # metric emitted per tenant: (tenant_id, model, total_tokens, latency_ms)
        assert recorded and recorded[0][0] == "tenant-abc"
        assert recorded[0][1] == "gpt-4o-mini"
        assert recorded[0][2] == 42

    @pytest.mark.asyncio
    async def test_persists_usage_via_token_logger_when_db_pool_present(self, monkeypatch):
        # With a DB pool, TokenLoggerMiddleware persists the call to ai.ai_usage_logs.
        from main import CompletionsRequest, completions

        class _FullResp:
            content = "ok"
            model_used = "gpt-4o"
            prompt_tokens = 10
            completion_tokens = 20
            total_tokens = 30

        class _Provider:
            async def complete(self, messages, model_hint):
                return _FullResp()

        class _Pool(TenantScopedPoolMixin):
            def __init__(self):
                self.executed = []

            async def _on_execute(self, *args):
                self.executed.append(args)

        pool = _Pool()
        monkeypatch.setattr(main_module, "_provider", _Provider())
        monkeypatch.setattr(main_module, "_db_pool", pool)
        monkeypatch.setattr(main_module, "render_template", lambda name, vars_: "PROMPT")

        resp = await completions(
            CompletionsRequest(template_name="t", variables={}), tenant_id="tenant-xyz"
        )

        assert resp.total_tokens == 30
        # a usage row was written to ai.ai_usage_logs for this tenant
        assert pool.executed and "tenant-xyz" in pool.executed[0]

    @pytest.mark.asyncio
    async def test_returns_503_when_flag_disabled(self, monkeypatch):
        from main import CompletionsRequest, completions

        async def _disabled(flag, default=True):
            return False

        monkeypatch.setattr(main_module.flags, "is_enabled", _disabled)

        with pytest.raises(HTTPException) as exc:
            await completions(
                CompletionsRequest(template_name="t", variables={}), tenant_id="tenant-abc"
            )

        assert exc.value.status_code == 503
        assert "COS-FLAG-001" in exc.value.detail

    @pytest.mark.asyncio
    async def test_503_when_the_provider_is_the_stub(self, monkeypatch):
        from main import CompletionsRequest, completions

        class _Stub:
            async def complete(self, messages, model_hint):
                raise NotImplementedError("StubLLMProvider: no API key configured")

        monkeypatch.setattr(main_module, "_provider", _Stub())
        monkeypatch.setattr(main_module, "_db_pool", None)
        monkeypatch.setattr(main_module, "render_template", lambda name, vars_: "PROMPT")

        with pytest.raises(HTTPException) as exc:
            await completions(
                CompletionsRequest(template_name="t", variables={}), tenant_id="tenant-abc"
            )

        assert exc.value.status_code == 503
        assert "no API key" in exc.value.detail


class TestWireDb:
    """`_wire_db`: the asyncpg pool is built when DATABASE_URL is set, and any failure is swallowed
    so the gateway still boots with an empty (None) pool."""

    @pytest.mark.asyncio
    async def test_returns_without_a_pool_when_no_dsn(self, monkeypatch):
        monkeypatch.delenv("DATABASE_URL", raising=False)
        monkeypatch.setattr(main_module, "_db_pool", None)

        await main_module._wire_db()

        assert main_module._db_pool is None

    @pytest.mark.asyncio
    async def test_builds_the_pool_when_dsn_is_configured(self, monkeypatch):
        monkeypatch.setenv("DATABASE_URL", "postgres://user@host/db")
        monkeypatch.setattr(main_module, "_db_pool", None)
        built = object()
        captured = {}

        import asyncpg

        async def fake_create_pool(dsn, **kwargs):
            captured["dsn"] = dsn
            captured["kwargs"] = kwargs
            return built

        monkeypatch.setattr(asyncpg, "create_pool", fake_create_pool)

        await main_module._wire_db()

        assert main_module._db_pool is built
        assert captured["dsn"] == "postgres://user@host/db"
        assert captured["kwargs"] == {"min_size": 1, "max_size": 4}
        monkeypatch.setattr(main_module, "_db_pool", None)

    @pytest.mark.asyncio
    async def test_unreachable_database_leaves_the_pool_none(self, monkeypatch, caplog):
        import logging

        monkeypatch.setenv("DATABASE_URL", "postgres://user@host/db")
        monkeypatch.setattr(main_module, "_db_pool", None)

        import asyncpg

        async def boom(dsn, **kwargs):
            raise RuntimeError("db unreachable")

        monkeypatch.setattr(asyncpg, "create_pool", boom)

        with caplog.at_level(logging.WARNING, logger="cos.ai.usage"):
            await main_module._wire_db()

        assert main_module._db_pool is None
        assert "db pool not configured" in caplog.text


class TestVoiceIntent:
    """The `/api/v1/ai/intent` endpoint: the kill-switch 503, the happy path, and the two error maps
    (stub-provider NotImplementedError → 503, missing template FileNotFoundError → 404)."""

    @pytest.mark.asyncio
    async def test_503_when_completions_flag_disabled(self, monkeypatch):
        from main import IntentRequest, voice_intent

        async def _disabled(flag, default=True):
            return False

        monkeypatch.setattr(main_module.flags, "is_enabled", _disabled)

        with pytest.raises(HTTPException) as exc:
            await voice_intent(IntentRequest(transcript="ไปหน้า inspections"), tenant_id="t-1")

        assert exc.value.status_code == 503
        assert "COS-FLAG-001" in exc.value.detail

    @pytest.mark.asyncio
    async def test_returns_the_classified_intent(self, monkeypatch):
        from intent.parse import IntentResult
        from main import IntentRequest, voice_intent

        captured = {}

        async def fake_classify(transcript, provider, db_pool, tenant_id):
            captured["args"] = (transcript, provider, db_pool, tenant_id)
            return IntentResult(
                intent="NAVIGATE", target="inspections", text="ไปหน้า inspections", confidence=0.8
            )

        monkeypatch.setattr(main_module, "classify_intent", fake_classify)

        resp = await voice_intent(
            IntentRequest(transcript="ไปหน้า inspections"), tenant_id="tenant-abc"
        )

        assert resp.intent == "NAVIGATE"
        assert resp.target == "inspections"
        assert resp.text == "ไปหน้า inspections"
        assert resp.confidence == 0.8
        # tenant + injected provider/pool are threaded through to classify_intent.
        assert captured["args"][0] == "ไปหน้า inspections"
        assert captured["args"][3] == "tenant-abc"

    @pytest.mark.asyncio
    async def test_stub_provider_becomes_503(self, monkeypatch):
        from main import IntentRequest, voice_intent

        async def stub_classify(*args, **kwargs):
            raise NotImplementedError("StubLLMProvider: no API key configured")

        monkeypatch.setattr(main_module, "classify_intent", stub_classify)

        with pytest.raises(HTTPException) as exc:
            await voice_intent(IntentRequest(transcript="x"), tenant_id="t-1")

        assert exc.value.status_code == 503
        assert "no API key" in exc.value.detail

    @pytest.mark.asyncio
    async def test_missing_template_becomes_404(self, monkeypatch):
        from main import IntentRequest, voice_intent

        async def no_template(*args, **kwargs):
            raise FileNotFoundError("voice-intent-v1.j2 not found")

        monkeypatch.setattr(main_module, "classify_intent", no_template)

        with pytest.raises(HTTPException) as exc:
            await voice_intent(IntentRequest(transcript="x"), tenant_id="t-1")

        assert exc.value.status_code == 404
        assert ".j2" in exc.value.detail


class TestAiUsage:
    """The `/api/v1/ai/usage` endpoint: 503 without a DB pool, else the metering summary."""

    @pytest.mark.asyncio
    async def test_503_when_no_database_is_configured(self, monkeypatch):
        from main import ai_usage

        monkeypatch.setattr(main_module, "_db_pool", None)

        with pytest.raises(HTTPException) as exc:
            await ai_usage(tenant_id="t-1")

        assert exc.value.status_code == 503
        assert "metering not configured" in exc.value.detail

    @pytest.mark.asyncio
    async def test_returns_the_usage_summary(self, monkeypatch):
        from main import ai_usage

        captured = {}
        monkeypatch.setattr(main_module, "_db_pool", object())

        async def fake_summary(db_pool, tenant_id):
            captured["tenant_id"] = tenant_id
            return {
                "tokensUsed": 1234,
                "quota": 500_000,
                "percentUsed": 0,
                "periodMonth": "2026-08",
                "alertLevel": "none",
            }

        monkeypatch.setattr(main_module, "get_usage_summary", fake_summary)

        resp = await ai_usage(tenant_id="tenant-abc")

        assert resp.tokensUsed == 1234
        assert resp.quota == 500_000
        assert resp.periodMonth == "2026-08"
        assert resp.alertLevel == "none"
        assert captured["tenant_id"] == "tenant-abc"
        monkeypatch.setattr(main_module, "_db_pool", None)


class TestDelayRisk:
    """The `/api/v1/ai/reports/delay-risk` endpoint: the best-effort context assembly and the
    best-effort risk-prediction emit, both of whose failures must never fail the response."""

    @staticmethod
    def _report(low_confidence=False, level="HIGH"):
        from reports.pipeline import ReportResult

        return ReportResult(
            report_id="r-1",
            report_type="DELAY_RISK",
            content={"delay_risk_level": level} if level else {},
            confidence=0.9,
            low_confidence=low_confidence,
        )

    @staticmethod
    def _request():
        from main import DelayRiskRequest

        return DelayRiskRequest(project_id="p-1", tenant_id="t-1", generated_by="u-1")

    @pytest.mark.asyncio
    async def test_assembles_context_and_emits_when_confident(self, monkeypatch):
        from main import delay_risk

        monkeypatch.setattr(main_module, "_db_pool", object())
        captured = {}

        async def fake_assemble(db_pool, weather, tenant_id, project_id):
            captured["assemble"] = (tenant_id, project_id)
            return "CONTEXT"

        async def fake_run_report(report_type, project_id, tenant_id, generated_by, extra, context=""):
            captured["run_context"] = context
            return self._report_holder

        self._report_holder = self._report()

        async def fake_emit(project_id, tenant_id, content, confidence, producer=None):
            captured["emit"] = (project_id, tenant_id, confidence)

        monkeypatch.setattr(main_module, "assemble_delay_context", fake_assemble)
        monkeypatch.setattr(main_module, "_run_report", fake_run_report)
        monkeypatch.setattr(main_module, "emit_risk_prediction", fake_emit)

        resp = await delay_risk(self._request(), tenant_id="tenant-abc")

        assert resp.report_id == "r-1"
        assert captured["assemble"] == ("tenant-abc", "p-1")
        assert captured["run_context"] == "CONTEXT"
        assert captured["emit"] == ("p-1", "tenant-abc", 0.9)
        monkeypatch.setattr(main_module, "_db_pool", None)

    @pytest.mark.asyncio
    async def test_context_assembly_failure_falls_back_to_empty(self, monkeypatch, caplog):
        import logging

        from main import delay_risk

        monkeypatch.setattr(main_module, "_db_pool", object())
        captured = {}

        async def boom_assemble(*args, **kwargs):
            raise RuntimeError("schedule query failed")

        async def fake_run_report(report_type, project_id, tenant_id, generated_by, extra, context=""):
            captured["run_context"] = context
            # low_confidence → the emit branch is skipped.
            return self._report(low_confidence=True)

        monkeypatch.setattr(main_module, "assemble_delay_context", boom_assemble)
        monkeypatch.setattr(main_module, "_run_report", fake_run_report)

        with caplog.at_level(logging.WARNING, logger="cos.ai.risk"):
            resp = await delay_risk(self._request(), tenant_id="t-1")

        assert resp.report_id == "r-1"
        assert captured["run_context"] == ""  # fell back to empty context
        assert "context assembly failed" in caplog.text
        monkeypatch.setattr(main_module, "_db_pool", None)

    @pytest.mark.asyncio
    async def test_no_emit_when_no_risk_level(self, monkeypatch):
        from main import delay_risk

        # No DB pool → context assembly skipped entirely (line 470 false branch).
        monkeypatch.setattr(main_module, "_db_pool", None)
        emitted = []

        async def fake_run_report(report_type, project_id, tenant_id, generated_by, extra, context=""):
            return self._report(level=None)  # no delay_risk_level → emit branch skipped

        async def fake_emit(*args, **kwargs):
            emitted.append(True)

        monkeypatch.setattr(main_module, "_run_report", fake_run_report)
        monkeypatch.setattr(main_module, "emit_risk_prediction", fake_emit)

        resp = await delay_risk(self._request(), tenant_id="t-1")

        assert resp.report_id == "r-1"
        assert emitted == []

    @pytest.mark.asyncio
    async def test_emit_failure_never_fails_the_response(self, monkeypatch, caplog):
        import logging

        from main import delay_risk

        monkeypatch.setattr(main_module, "_db_pool", None)

        async def fake_run_report(report_type, project_id, tenant_id, generated_by, extra, context=""):
            return self._report()

        async def boom_emit(*args, **kwargs):
            raise RuntimeError("kafka broker down")

        monkeypatch.setattr(main_module, "_run_report", fake_run_report)
        monkeypatch.setattr(main_module, "emit_risk_prediction", boom_emit)

        with caplog.at_level(logging.WARNING, logger="cos.ai.risk"):
            resp = await delay_risk(self._request(), tenant_id="t-1")

        assert resp.report_id == "r-1"  # response still returned despite the emit failure
        assert "risk-prediction emit failed" in caplog.text


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

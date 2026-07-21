"""Unit tests for the transcription FastAPI app — no file-service, no model, no network.

The endpoint coroutines are awaited directly rather than driven through `fastapi.testclient`.
TestClient was tried first and rejected: it needs `httpx2` (emitting a StarletteDeprecationWarning
that `filterwarnings = error` turns into a collection error), and its portal thread leaks AF_UNIX
sockets plus an event loop that surface as unraisable ResourceWarnings at session teardown — failing
the run even with every test passing and the client closed via a context manager. Awaiting the
handlers keeps the suite free of both workarounds; HTTP status mapping is asserted through the
`HTTPException` each handler raises, which is the same contract FastAPI serialises.

The endpoint's two outbound calls (signed-URL lookup, then the audio download) share one
`httpx.AsyncClient`, so it is replaced by a fake whose `get` serves a queued list of responses. That
keeps the two non-200 branches distinguishable, which a single blanket mock would collapse.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import importlib

import main as main_module
import pytest
from pydantic import ValidationError
from fastapi import HTTPException
from main import TranscribeRequest, liveness, transcribe
from providers.transcription_provider import (
    FasterWhisperProvider,
    StubTranscriptionProvider,
    TranscriptionResult,
)


class _FakeResponse:
    def __init__(self, status_code: int, json_body: dict | None = None, content: bytes = b""):
        self.status_code = status_code
        self._json = json_body or {}
        self.content = content

    def json(self):
        return self._json


class _FakeAsyncClient:
    """Stands in for httpx.AsyncClient; serves `responses` in order and records requested URLs."""

    responses: list = []
    requested_urls: list = []

    def __init__(self, *args, **kwargs):
        self.init_kwargs = kwargs

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc_info):
        return False

    async def get(self, url):
        type(self).requested_urls.append(url)
        return type(self).responses.pop(0)


@pytest.fixture
def fake_http(monkeypatch):
    _FakeAsyncClient.responses = []
    _FakeAsyncClient.requested_urls = []
    monkeypatch.setattr(main_module.httpx, "AsyncClient", _FakeAsyncClient)
    return _FakeAsyncClient


class _OkProvider:
    async def transcribe(self, audio, language=None):
        self.called_with = (audio, language)
        return TranscriptionResult(transcript="สวัสดี", language="th", duration_seconds=1.25)


def _request(**overrides) -> TranscribeRequest:
    payload = {"file_id": "11111111-1111-4111-8111-111111111111", "tenant_id": "t-1"}
    payload.update(overrides)
    return TranscribeRequest(**payload)


class TestProviderSelection:
    def test_defaults_to_stub_when_env_unset(self, monkeypatch):
        monkeypatch.delenv("STT_PROVIDER", raising=False)
        assert isinstance(main_module._select_provider(), StubTranscriptionProvider)

    def test_selects_faster_whisper_when_configured(self, monkeypatch):
        monkeypatch.setenv("STT_PROVIDER", "faster_whisper")
        assert isinstance(main_module._select_provider(), FasterWhisperProvider)

    def test_selection_is_case_insensitive(self, monkeypatch):
        monkeypatch.setenv("STT_PROVIDER", "FASTER_WHISPER")
        assert isinstance(main_module._select_provider(), FasterWhisperProvider)

    def test_unknown_value_falls_back_to_stub(self, monkeypatch):
        # An unrecognised provider must degrade to the stub's 503, never crash at import.
        monkeypatch.setenv("STT_PROVIDER", "whisper-cpp")
        assert isinstance(main_module._select_provider(), StubTranscriptionProvider)


class TestLiveness:
    @pytest.mark.asyncio
    async def test_reports_ok_with_default_service_name(self, monkeypatch):
        monkeypatch.delenv("OTEL_SERVICE_NAME", raising=False)
        assert await liveness() == {"status": "ok", "service": "ai-transcription-pipeline"}

    @pytest.mark.asyncio
    async def test_service_name_comes_from_otel_env(self, monkeypatch):
        monkeypatch.setenv("OTEL_SERVICE_NAME", "custom-name")
        assert (await liveness())["service"] == "custom-name"


class TestTranscribeEndpoint:
    @pytest.mark.asyncio
    async def test_happy_path_returns_transcript(self, fake_http, monkeypatch):
        provider = _OkProvider()
        monkeypatch.setattr(main_module, "_provider", provider)
        fake_http.responses = [
            _FakeResponse(200, {"url": "https://storage.example/audio.m4a"}),
            _FakeResponse(200, content=b"audio-bytes"),
        ]

        resp = await transcribe(_request(language="th"))

        assert resp.file_id == "11111111-1111-4111-8111-111111111111"
        assert resp.transcript == "สวัสดี"
        assert resp.language == "th"
        assert resp.duration_seconds == 1.25
        assert provider.called_with == (b"audio-bytes", "th")

    @pytest.mark.asyncio
    async def test_language_defaults_to_thai(self, fake_http, monkeypatch):
        # Spec: the app's default locale is th — an omitted language must not become None.
        provider = _OkProvider()
        monkeypatch.setattr(main_module, "_provider", provider)
        fake_http.responses = [
            _FakeResponse(200, {"url": "https://storage.example/a.m4a"}),
            _FakeResponse(200, content=b"bytes"),
        ]

        await transcribe(_request())
        assert provider.called_with[1] == "th"

    @pytest.mark.asyncio
    async def test_calls_file_service_signed_url_endpoint(self, fake_http, monkeypatch):
        monkeypatch.setattr(main_module, "_provider", _OkProvider())
        monkeypatch.setenv("FILE_SERVICE_URL", "http://files.internal:9000")
        fake_http.responses = [
            _FakeResponse(200, {"url": "https://storage.example/a.m4a"}),
            _FakeResponse(200, content=b"bytes"),
        ]

        await transcribe(_request(file_id="99999999-9999-4999-8999-999999999999"))

        assert fake_http.requested_urls[0] == (
            "http://files.internal:9000/api/v1/files/99999999-9999-4999-8999-999999999999/signed-url"
        )
        assert fake_http.requested_urls[1] == "https://storage.example/a.m4a"

    @pytest.mark.asyncio
    async def test_file_service_url_has_a_service_dns_default(self, fake_http, monkeypatch):
        monkeypatch.delenv("FILE_SERVICE_URL", raising=False)
        monkeypatch.setattr(main_module, "_provider", _OkProvider())
        fake_http.responses = [
            _FakeResponse(200, {"url": "https://storage.example/a.m4a"}),
            _FakeResponse(200, content=b"bytes"),
        ]

        await transcribe(_request())

        assert fake_http.requested_urls[0].startswith("http://file-service:8000/")

    @pytest.mark.asyncio
    async def test_404_when_file_service_has_no_such_file(self, fake_http):
        fake_http.responses = [_FakeResponse(404)]

        with pytest.raises(HTTPException) as exc:
            await transcribe(_request(file_id="00000000-0000-4000-8000-000000000000"))

        assert exc.value.status_code == 404
        assert "00000000-0000-4000-8000-000000000000" in exc.value.detail

    @pytest.mark.asyncio
    async def test_502_when_storage_download_fails(self, fake_http):
        # The signed URL resolved but object storage did not serve the object.
        fake_http.responses = [
            _FakeResponse(200, {"url": "https://storage.example/a.m4a"}),
            _FakeResponse(500),
        ]

        with pytest.raises(HTTPException) as exc:
            await transcribe(_request())

        assert exc.value.status_code == 502
        assert exc.value.detail == "Failed to fetch audio from storage"

    @pytest.mark.asyncio
    async def test_503_when_provider_is_the_stub(self, fake_http, monkeypatch):
        # Default deployment posture: no model configured → advertise unavailable, do not 500.
        monkeypatch.setattr(main_module, "_provider", StubTranscriptionProvider())
        fake_http.responses = [
            _FakeResponse(200, {"url": "https://storage.example/a.m4a"}),
            _FakeResponse(200, content=b"bytes"),
        ]

        with pytest.raises(HTTPException) as exc:
            await transcribe(_request())

        assert exc.value.status_code == 503
        assert "not configured" in exc.value.detail


class TestRouting:
    def test_transcribe_is_registered_at_the_spec_path(self):
        # spec 14-api-architecture §348 names this exact path; a rename would break mobile clients.
        routes = {getattr(r, "path", None) for r in main_module.app.routes}
        assert "/api/v1/ai/transcribe" in routes
        assert "/health/live" in routes


class TestModuleImport:
    def test_module_level_provider_is_selected_on_import(self, monkeypatch):
        # `_provider` is bound at import time, so the env must be set before the module loads.
        monkeypatch.setenv("STT_PROVIDER", "stub")
        reloaded = importlib.reload(main_module)
        assert isinstance(reloaded._provider, StubTranscriptionProvider)


class TestFileIdIsAUuid:
    """file_id is interpolated into the file-service URL, so its type is the whole defence.

    While it was `str`, a caller could send "../.." and reach a different endpoint on file-service
    entirely — CodeQL py/partial-ssrf, which neither bandit nor the Semgrep packs reported. Typing
    it as UUID makes the interpolation safe by construction, and these cases hold that shut.
    """

    @pytest.mark.parametrize(
        "bad",
        [
            "../../admin",
            "..%2f..%2fadmin",
            "f-1",
            "",
            "http://evil.example/x",
            "11111111-1111-4111-8111-111111111111/../../admin",
        ],
    )
    def test_rejects_anything_that_is_not_a_uuid(self, bad):
        with pytest.raises(ValidationError):
            TranscribeRequest(file_id=bad, tenant_id="t-1")

    def test_accepts_a_uuid_and_stringifies_to_it(self):
        req = TranscribeRequest(file_id="11111111-1111-4111-8111-111111111111", tenant_id="t-1")

        assert str(req.file_id) == "11111111-1111-4111-8111-111111111111"

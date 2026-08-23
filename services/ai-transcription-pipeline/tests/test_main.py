"""Unit tests for the transcription FastAPI surface — spec 22 §22.2, 14-api-architecture §348.

§35.13 ESC-24: main.py had no test, so all 40 of its statements counted against the QM-1
--cov-fail-under=99 gate. Covered here: the liveness probe, provider selection (both STT_PROVIDER
branches), and every exit from /api/v1/ai/transcribe — success, 404, 502 and the 503 the shipped
stub provider actually returns today.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from fastapi.testclient import TestClient

import main as main_module
from main import app, _select_provider
from providers.transcription_provider import (
    FasterWhisperProvider,
    StubTranscriptionProvider,
    TranscriptionProvider,
    TranscriptionResult,
)

client = TestClient(app)


class _FakeResponse:
    def __init__(self, status_code: int, payload: dict | None = None, content: bytes = b""):
        self.status_code = status_code
        self._payload = payload or {}
        self.content = content

    def json(self) -> dict:
        return self._payload


class _FakeAsyncClient:
    def __init__(self, responses):
        self._responses = list(responses)
        self.requested_urls: list[str] = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_exc):
        return False

    async def get(self, url):
        self.requested_urls.append(url)
        return self._responses.pop(0)


def _client_factory(responses, captured):
    def factory(*_args, **_kwargs):
        c = _FakeAsyncClient(responses)
        captured.append(c)
        return c

    return factory


class _WorkingProvider(TranscriptionProvider):
    def __init__(self):
        self.calls: list[tuple[bytes, str | None]] = []

    async def transcribe(self, audio: bytes, language: str | None = None) -> TranscriptionResult:
        self.calls.append((audio, language))
        return TranscriptionResult(transcript="เทคอนกรีตชั้น 3", language="th", duration_seconds=12.5)

    @property
    def model_name(self) -> str:
        return "fake"


def _ok_responses(content: bytes = b"RIFF-audio"):
    return [
        _FakeResponse(200, {"url": "https://s3.example/audio"}),
        _FakeResponse(200, content=content),
    ]


class TestSelectProvider:
    def test_defaults_to_the_stub(self, monkeypatch):
        monkeypatch.delenv("STT_PROVIDER", raising=False)
        assert isinstance(_select_provider(), StubTranscriptionProvider)

    def test_selects_faster_whisper_when_configured(self, monkeypatch):
        monkeypatch.setenv("STT_PROVIDER", "faster_whisper")
        assert isinstance(_select_provider(), FasterWhisperProvider)

    def test_is_case_insensitive(self, monkeypatch):
        monkeypatch.setenv("STT_PROVIDER", "FASTER_WHISPER")
        assert isinstance(_select_provider(), FasterWhisperProvider)

    def test_an_unknown_value_falls_back_to_the_stub(self, monkeypatch):
        monkeypatch.setenv("STT_PROVIDER", "deepgram")
        assert isinstance(_select_provider(), StubTranscriptionProvider)


class TestLiveness:
    def test_reports_the_default_service_name(self, monkeypatch):
        monkeypatch.delenv("OTEL_SERVICE_NAME", raising=False)
        resp = client.get("/health/live")
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok", "service": "ai-transcription-pipeline"}

    def test_reports_the_configured_service_name(self, monkeypatch):
        monkeypatch.setenv("OTEL_SERVICE_NAME", "stt-canary")
        assert client.get("/health/live").json()["service"] == "stt-canary"


class TestTranscribe:
    def test_503_while_the_stub_provider_is_wired(self, monkeypatch):
        """The shipped default — the endpoint must refuse rather than return an empty transcript."""
        captured: list[_FakeAsyncClient] = []
        monkeypatch.setattr(main_module.httpx, "AsyncClient", _client_factory(_ok_responses(), captured))
        monkeypatch.setattr(main_module, "_provider", StubTranscriptionProvider())

        resp = client.post("/api/v1/ai/transcribe", json={"file_id": "a1", "tenant_id": "t1"})

        assert resp.status_code == 503
        assert "not configured" in resp.json()["detail"]

    def test_returns_the_transcript_once_a_provider_is_configured(self, monkeypatch):
        captured: list[_FakeAsyncClient] = []
        provider = _WorkingProvider()
        monkeypatch.setattr(
            main_module.httpx, "AsyncClient", _client_factory(_ok_responses(b"AUDIO"), captured)
        )
        monkeypatch.setattr(main_module, "_provider", provider)
        monkeypatch.setenv("FILE_SERVICE_URL", "http://files:8000")

        resp = client.post("/api/v1/ai/transcribe", json={"file_id": "a2", "tenant_id": "t1"})

        assert resp.status_code == 200
        assert resp.json() == {
            "file_id": "a2",
            "transcript": "เทคอนกรีตชั้น 3",
            "language": "th",
            "duration_seconds": 12.5,
        }
        assert captured[0].requested_urls[0] == "http://files:8000/api/v1/files/a2/signed-url"
        # the fetched audio bytes and the requested language reach the provider unchanged
        assert provider.calls == [(b"AUDIO", "th")]

    def test_language_defaults_to_thai(self, monkeypatch):
        """App default locale is Thai (spec 21 §21.4) — an omitted language must not become None."""
        captured: list[_FakeAsyncClient] = []
        provider = _WorkingProvider()
        monkeypatch.setattr(main_module.httpx, "AsyncClient", _client_factory(_ok_responses(), captured))
        monkeypatch.setattr(main_module, "_provider", provider)

        client.post("/api/v1/ai/transcribe", json={"file_id": "a3", "tenant_id": "t1"})

        assert provider.calls[0][1] == "th"

    def test_an_explicit_language_is_forwarded(self, monkeypatch):
        captured: list[_FakeAsyncClient] = []
        provider = _WorkingProvider()
        monkeypatch.setattr(main_module.httpx, "AsyncClient", _client_factory(_ok_responses(), captured))
        monkeypatch.setattr(main_module, "_provider", provider)

        client.post(
            "/api/v1/ai/transcribe",
            json={"file_id": "a4", "tenant_id": "t1", "language": "en"},
        )

        assert provider.calls[0][1] == "en"

    def test_404_when_the_signed_url_lookup_fails(self, monkeypatch):
        captured: list[_FakeAsyncClient] = []
        monkeypatch.setattr(
            main_module.httpx, "AsyncClient", _client_factory([_FakeResponse(404)], captured)
        )

        resp = client.post("/api/v1/ai/transcribe", json={"file_id": "gone", "tenant_id": "t1"})

        assert resp.status_code == 404
        assert "gone" in resp.json()["detail"]

    def test_502_when_storage_will_not_serve_the_audio(self, monkeypatch):
        captured: list[_FakeAsyncClient] = []
        responses = [_FakeResponse(200, {"url": "https://s3.example/audio"}), _FakeResponse(500)]
        monkeypatch.setattr(main_module.httpx, "AsyncClient", _client_factory(responses, captured))

        resp = client.post("/api/v1/ai/transcribe", json={"file_id": "a5", "tenant_id": "t1"})

        assert resp.status_code == 502
        assert resp.json()["detail"] == "Failed to fetch audio from storage"

    def test_file_service_url_falls_back_to_the_in_cluster_hostname(self, monkeypatch):
        captured: list[_FakeAsyncClient] = []
        monkeypatch.delenv("FILE_SERVICE_URL", raising=False)
        monkeypatch.setattr(
            main_module.httpx, "AsyncClient", _client_factory([_FakeResponse(404)], captured)
        )

        client.post("/api/v1/ai/transcribe", json={"file_id": "a6", "tenant_id": "t1"})

        assert captured[0].requested_urls[0].startswith("http://file-service:8000/")

    @pytest.mark.parametrize("missing", ["file_id", "tenant_id"])
    def test_rejects_a_body_missing_a_required_field(self, missing):
        body = {"file_id": "a7", "tenant_id": "t1"}
        del body[missing]
        assert client.post("/api/v1/ai/transcribe", json=body).status_code == 422

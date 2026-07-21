"""Unit tests for the OCR FastAPI app — no file-service, no tesseract, no network.

Endpoint coroutines are awaited directly rather than driven through `fastapi.testclient`. TestClient
needs `httpx2` (its absence raises a StarletteDeprecationWarning, which `filterwarnings = error`
turns into a collection error) and its portal leaks sockets that resurface as unraisable
ResourceWarnings at teardown — the same trap already hit in ai-transcription-pipeline. HTTP status
mapping is asserted through the `HTTPException` each handler raises, which is exactly what FastAPI
serialises.

`process_file` is patched at the name `main` imported it under, so pytesseract/pdf2image are never
invoked; their real behaviour is covered by tests/test_ocr_pipeline.py.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import main as main_module
import pytest
from fastapi import HTTPException
from main import OCRRequest, liveness, ocr_process
from ocr_pipeline import OCROutput


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
    init_kwargs: dict = {}

    def __init__(self, *args, **kwargs):
        type(self).init_kwargs = kwargs

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
    _FakeAsyncClient.init_kwargs = {}
    monkeypatch.setattr(main_module.httpx, "AsyncClient", _FakeAsyncClient)
    return _FakeAsyncClient


@pytest.fixture
def captured_ocr(monkeypatch):
    """Replaces process_file and records what the endpoint handed it."""
    calls: list = []

    def fake_process_file(file_id, file_bytes, mime_type):
        calls.append((file_id, file_bytes, mime_type))
        return OCROutput(file_id=file_id, extracted_text="ใบส่งของ", confidence_score=0.93)

    monkeypatch.setattr(main_module, "process_file", fake_process_file)
    return calls


def _request(**overrides) -> OCRRequest:
    payload = {"file_id": "f-1", "tenant_id": "t-1"}
    payload.update(overrides)
    return OCRRequest(**payload)


class TestLiveness:
    @pytest.mark.asyncio
    async def test_reports_ok_with_default_service_name(self, monkeypatch):
        monkeypatch.delenv("OTEL_SERVICE_NAME", raising=False)
        assert await liveness() == {"status": "ok", "service": "ai-ocr-pipeline"}

    @pytest.mark.asyncio
    async def test_service_name_comes_from_otel_env(self, monkeypatch):
        monkeypatch.setenv("OTEL_SERVICE_NAME", "ocr-canary")
        assert (await liveness())["service"] == "ocr-canary"


class TestOcrProcess:
    @pytest.mark.asyncio
    async def test_happy_path_returns_extracted_text(self, fake_http, captured_ocr):
        fake_http.responses = [
            _FakeResponse(200, {"url": "https://storage.example/scan.pdf", "mime_type": "application/pdf"}),
            _FakeResponse(200, content=b"%PDF-bytes"),
        ]

        resp = await ocr_process(_request())

        assert resp.file_id == "f-1"
        assert resp.extracted_text == "ใบส่งของ"
        assert resp.confidence_score == 0.93

    @pytest.mark.asyncio
    async def test_forwards_bytes_and_mime_type_to_the_pipeline(self, fake_http, captured_ocr):
        fake_http.responses = [
            _FakeResponse(200, {"url": "https://storage.example/scan.pdf", "mime_type": "application/pdf"}),
            _FakeResponse(200, content=b"%PDF-bytes"),
        ]

        await ocr_process(_request(file_id="f-7"))

        assert captured_ocr == [("f-7", b"%PDF-bytes", "application/pdf")]

    @pytest.mark.asyncio
    async def test_mime_type_defaults_when_file_service_omits_it(self, fake_http, captured_ocr):
        # An absent mime_type must not KeyError; process_file's non-PDF branch handles the fallback.
        fake_http.responses = [
            _FakeResponse(200, {"url": "https://storage.example/photo"}),
            _FakeResponse(200, content=b"jpeg-bytes"),
        ]

        await ocr_process(_request())

        assert captured_ocr[0][2] == "application/octet-stream"

    @pytest.mark.asyncio
    async def test_calls_file_service_signed_url_endpoint(self, fake_http, captured_ocr, monkeypatch):
        monkeypatch.setenv("FILE_SERVICE_URL", "http://files.internal:9000")
        fake_http.responses = [
            _FakeResponse(200, {"url": "https://storage.example/a.png", "mime_type": "image/png"}),
            _FakeResponse(200, content=b"png"),
        ]

        await ocr_process(_request(file_id="f-9"))

        assert fake_http.requested_urls == [
            "http://files.internal:9000/api/v1/files/f-9/signed-url",
            "https://storage.example/a.png",
        ]

    @pytest.mark.asyncio
    async def test_file_service_url_has_a_service_dns_default(self, fake_http, captured_ocr, monkeypatch):
        monkeypatch.delenv("FILE_SERVICE_URL", raising=False)
        fake_http.responses = [
            _FakeResponse(200, {"url": "https://storage.example/a.png", "mime_type": "image/png"}),
            _FakeResponse(200, content=b"png"),
        ]

        await ocr_process(_request())

        assert fake_http.requested_urls[0].startswith("http://file-service:8000/")

    @pytest.mark.asyncio
    async def test_404_when_file_service_has_no_such_file(self, fake_http):
        fake_http.responses = [_FakeResponse(404)]

        with pytest.raises(HTTPException) as exc:
            await ocr_process(_request(file_id="missing"))

        assert exc.value.status_code == 404
        assert "missing" in exc.value.detail

    @pytest.mark.asyncio
    async def test_502_when_storage_download_fails(self, fake_http):
        # The signed URL resolved but object storage did not serve the object.
        fake_http.responses = [
            _FakeResponse(200, {"url": "https://storage.example/a.png", "mime_type": "image/png"}),
            _FakeResponse(500),
        ]

        with pytest.raises(HTTPException) as exc:
            await ocr_process(_request())

        assert exc.value.status_code == 502
        assert exc.value.detail == "Failed to fetch file from storage"

    @pytest.mark.asyncio
    async def test_ocr_is_not_attempted_when_the_download_fails(self, fake_http, captured_ocr):
        # Guards against regressing to "OCR whatever bytes came back", including an error page.
        fake_http.responses = [
            _FakeResponse(200, {"url": "https://storage.example/a.png", "mime_type": "image/png"}),
            _FakeResponse(503),
        ]

        with pytest.raises(HTTPException):
            await ocr_process(_request())

        assert captured_ocr == []

    @pytest.mark.asyncio
    async def test_http_client_uses_a_timeout(self, fake_http, captured_ocr):
        # A hung file-service must not pin an OCR worker forever.
        fake_http.responses = [
            _FakeResponse(200, {"url": "https://storage.example/a.png", "mime_type": "image/png"}),
            _FakeResponse(200, content=b"png"),
        ]

        await ocr_process(_request())

        assert fake_http.init_kwargs.get("timeout") == 30


class TestRouting:
    def test_endpoints_are_registered_at_the_spec_paths(self):
        # §Phase 11 names POST /api/v1/ocr/process; a rename would break the file-uploaded consumer.
        routes = {getattr(r, "path", None) for r in main_module.app.routes}
        assert "/api/v1/ocr/process" in routes
        assert "/health/live" in routes

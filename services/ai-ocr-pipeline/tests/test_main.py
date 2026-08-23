"""Unit tests for the OCR pipeline FastAPI surface — Phase 11.

§35.13 ESC-24: main.py had no test at all, so all 31 of its statements counted against the
QM-1 --cov-fail-under=99 gate. These cover the liveness probe and every branch of ocr_process,
including the two HTTPException paths that only fire on an upstream failure.

httpx.AsyncClient is replaced with a fake rather than a live server: the endpoint's contract is
"ask file-service for a signed URL, fetch the bytes, hand them to process_file", and that is
exactly what these assert.
"""

import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from fastapi.testclient import TestClient

import main as main_module
from main import app
from ocr_pipeline import OCROutput


class _FakeResponse:
    def __init__(self, status_code: int, payload: dict | None = None, content: bytes = b""):
        self.status_code = status_code
        self._payload = payload or {}
        self.content = content

    def json(self) -> dict:
        return self._payload


class _FakeAsyncClient:
    """Stands in for httpx.AsyncClient: returns queued responses in call order."""

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
    """Returns a callable matching httpx.AsyncClient(timeout=...) that yields the fake."""

    def factory(*_args, **_kwargs):
        client = _FakeAsyncClient(responses)
        captured.append(client)
        return client

    return factory


client = TestClient(app)


class TestLiveness:
    def test_reports_the_default_service_name(self, monkeypatch):
        monkeypatch.delenv("OTEL_SERVICE_NAME", raising=False)
        resp = client.get("/health/live")
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok", "service": "ai-ocr-pipeline"}

    def test_reports_the_configured_service_name(self, monkeypatch):
        monkeypatch.setenv("OTEL_SERVICE_NAME", "ocr-canary")
        resp = client.get("/health/live")
        assert resp.json()["service"] == "ocr-canary"


class TestOCRProcess:
    def test_returns_extracted_text_for_a_fetchable_file(self, monkeypatch):
        captured: list[_FakeAsyncClient] = []
        responses = [
            _FakeResponse(200, {"url": "https://s3.example/signed", "mime_type": "application/pdf"}),
            _FakeResponse(200, content=b"%PDF-1.4 fake"),
        ]
        monkeypatch.setattr(main_module.httpx, "AsyncClient", _client_factory(responses, captured))
        monkeypatch.setenv("FILE_SERVICE_URL", "http://files:8000")

        with patch.object(
            main_module,
            "process_file",
            return_value=OCROutput(file_id="f1", extracted_text="INVOICE 123", confidence_score=0.93),
        ) as proc:
            resp = client.post("/api/v1/ocr/process", json={"file_id": "f1", "tenant_id": "t1"})

        assert resp.status_code == 200
        assert resp.json() == {
            "file_id": "f1",
            "extracted_text": "INVOICE 123",
            "confidence_score": 0.93,
        }
        # the signed-url endpoint is built from FILE_SERVICE_URL and the file id
        assert captured[0].requested_urls[0] == "http://files:8000/api/v1/files/f1/signed-url"
        assert captured[0].requested_urls[1] == "https://s3.example/signed"
        proc.assert_called_once_with("f1", b"%PDF-1.4 fake", "application/pdf")

    def test_defaults_the_mime_type_when_file_service_omits_it(self, monkeypatch):
        captured: list[_FakeAsyncClient] = []
        responses = [
            _FakeResponse(200, {"url": "https://s3.example/signed"}),  # no mime_type
            _FakeResponse(200, content=b"bytes"),
        ]
        monkeypatch.setattr(main_module.httpx, "AsyncClient", _client_factory(responses, captured))

        with patch.object(
            main_module,
            "process_file",
            return_value=OCROutput(file_id="f2", extracted_text="", confidence_score=0.0),
        ) as proc:
            resp = client.post("/api/v1/ocr/process", json={"file_id": "f2", "tenant_id": "t1"})

        assert resp.status_code == 200
        proc.assert_called_once_with("f2", b"bytes", "application/octet-stream")

    def test_404_when_the_signed_url_lookup_fails(self, monkeypatch):
        captured: list[_FakeAsyncClient] = []
        responses = [_FakeResponse(404)]
        monkeypatch.setattr(main_module.httpx, "AsyncClient", _client_factory(responses, captured))

        resp = client.post("/api/v1/ocr/process", json={"file_id": "missing", "tenant_id": "t1"})

        assert resp.status_code == 404
        assert "missing" in resp.json()["detail"]

    def test_502_when_storage_will_not_serve_the_file(self, monkeypatch):
        captured: list[_FakeAsyncClient] = []
        responses = [
            _FakeResponse(200, {"url": "https://s3.example/signed", "mime_type": "image/png"}),
            _FakeResponse(500),
        ]
        monkeypatch.setattr(main_module.httpx, "AsyncClient", _client_factory(responses, captured))

        resp = client.post("/api/v1/ocr/process", json={"file_id": "f3", "tenant_id": "t1"})

        assert resp.status_code == 502
        assert resp.json()["detail"] == "Failed to fetch file from storage"

    def test_rejects_a_body_missing_required_fields(self):
        resp = client.post("/api/v1/ocr/process", json={"file_id": "f4"})
        assert resp.status_code == 422


class TestFileServiceUrlDefault:
    def test_falls_back_to_the_in_cluster_hostname(self, monkeypatch):
        captured: list[_FakeAsyncClient] = []
        monkeypatch.delenv("FILE_SERVICE_URL", raising=False)
        responses = [_FakeResponse(404)]
        monkeypatch.setattr(main_module.httpx, "AsyncClient", _client_factory(responses, captured))

        client.post("/api/v1/ocr/process", json={"file_id": "f5", "tenant_id": "t1"})

        assert captured[0].requested_urls[0].startswith("http://file-service:8000/")

"""Covers metrics.py — the :9464 Prometheus endpoint (§31.3, QM-8).

The bug this replaces: prometheus.yml listed this service as a target and the Helm chart declared
the containerPort, but nothing served it, so the target was permanently down and a real outage was
indistinguishable from the missing endpoint.
"""

from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

import main
import metrics


def test_port_defaults_to_the_scraped_port(monkeypatch):
    monkeypatch.delenv("PROMETHEUS_PORT", raising=False)
    assert metrics.port() == metrics.DEFAULT_PORT
    # prometheus.yml scrapes :9464 and the Helm chart declares that containerPort.
    assert metrics.DEFAULT_PORT == "9464"


def test_port_reads_env(monkeypatch):
    monkeypatch.setenv("PROMETHEUS_PORT", "9999")
    assert metrics.port() == "9999"


def test_start_metrics_server_binds_the_scrape_port(monkeypatch):
    monkeypatch.delenv("PROMETHEUS_PORT", raising=False)
    with patch("metrics._start_http_server") as started:
        metrics.start_metrics_server()
    started.assert_called_once()
    assert started.call_args.args[0] == 9464
    assert started.call_args.kwargs["registry"] is metrics.REGISTRY


def test_idle_scrape_is_not_empty():
    """An idle service must still return data, or a scrape proves nothing and panels stay blank."""
    body = metrics.scrape().decode()
    assert "python_info" in body, body[:400]
    assert "python_gc_objects_collected_total" in body


def test_install_records_requests_with_the_route_template():
    app = FastAPI()
    metrics.install(app)

    @app.get("/api/v1/thing/{thing_id}")
    def _thing(thing_id: str):
        return {"id": thing_id}

    with TestClient(app) as client:
        assert client.get("/api/v1/thing/abc-123").status_code == 200

    body = metrics.scrape().decode()
    # The route TEMPLATE, never the raw id — raw paths would explode label cardinality.
    assert 'path="/api/v1/thing/{thing_id}"' in body
    assert "abc-123" not in body
    assert 'http_requests_total{method="GET",path="/api/v1/thing/{thing_id}",status="200"} 1.0' in body
    assert "http_request_duration_seconds_bucket" in body


def test_unmatched_paths_are_labelled_unknown():
    app = FastAPI()
    metrics.install(app)

    with TestClient(app) as client:
        assert client.get("/no/such/route").status_code == 404

    body = metrics.scrape().decode()
    assert 'path="unknown"' in body
    assert "/no/such/route" not in body


def test_lifespan_starts_the_metrics_exporter():
    """The lifespan is what opens :9464 in production — if it stops doing so the scrape target
    goes down silently, which is exactly the bug metrics.py was added to fix."""
    with patch("metrics._start_http_server") as started:
        with TestClient(main.app):
            pass
    started.assert_called_once()

"""Prometheus metrics endpoint (§31.3, QM-8).

WHY THIS EXISTS: prometheus.yml scrapes ``ai-transcription-pipeline:9464`` and the Helm chart declares a 9464
containerPort and annotates the pod for scraping — but nothing ever opened that port or emitted a
metric, so the target could never come up and a real outage was indistinguishable from the
permanently-down scrape. This is the same defect file-service fixed in ``src/plugins/metrics.ts``
and the Go workers fixed in ``internal/metrics``; this is the Python equivalent.

Metric names and label sets match ``packages/@cos/tracing/src/metrics.ts`` and
``backend/src/shared/interceptors/http-metrics.interceptor.ts`` exactly, so one Grafana panel covers
the NestJS, Fastify, Go and Python services alike.

``path`` is the route TEMPLATE (``/api/v1/ocr/process``), never the raw URL — raw paths would put
tenant and entity ids into label values, exploding cardinality and leaking identifiers into metrics.
"""

from __future__ import annotations

import os
import time
from typing import TYPE_CHECKING

from prometheus_client import CollectorRegistry, Counter, Histogram, generate_latest
from prometheus_client import start_http_server as _start_http_server
from prometheus_client.gc_collector import GCCollector
from prometheus_client.platform_collector import PlatformCollector
from prometheus_client.process_collector import ProcessCollector

if TYPE_CHECKING:  # pragma: no cover - import cycle guard, types only
    from fastapi import FastAPI

# The port prometheus.yml scrapes and the Helm chart declares.
DEFAULT_PORT = "9464"

# A dedicated registry rather than the global default: importing this module twice (as the test
# suite does) must not raise "Duplicated timeseries in CollectorRegistry".
REGISTRY = CollectorRegistry()

HTTP_REQUESTS_TOTAL = Counter(
    "http_requests_total",
    "Total HTTP requests",
    ["method", "path", "status"],
    registry=REGISTRY,
)

HTTP_REQUEST_DURATION_SECONDS = Histogram(
    "http_request_duration_seconds",
    "HTTP request duration",
    ["method", "path", "status"],
    registry=REGISTRY,
)

# The HTTP metrics above are label-partitioned, so they expose no series until the first request.
# Without these an idle service returns a scrape body of nothing but HELP/TYPE headers — a healthy
# target that proves nothing. prometheus_client registers these on its default registry only, so a
# custom registry has to instantiate them itself. (ProcessCollector reads /proc and no-ops off
# Linux; the other two work everywhere.)
ProcessCollector(registry=REGISTRY)
PlatformCollector(registry=REGISTRY)
GCCollector(registry=REGISTRY)


def port() -> str:
    """Resolve the scrape port, falling back to :data:`DEFAULT_PORT`."""
    return os.environ.get("PROMETHEUS_PORT") or DEFAULT_PORT


def scrape() -> bytes:
    """Render the current exposition. Used by the tests; Prometheus uses the HTTP server."""
    return generate_latest(REGISTRY)


def start_metrics_server() -> None:
    """Serve /metrics on :func:`port` for Prometheus to scrape."""
    _start_http_server(int(port()), registry=REGISTRY)


def install(app: "FastAPI") -> None:
    """Record every HTTP request into the two metrics above."""

    @app.middleware("http")
    async def _record(request, call_next):  # type: ignore[no-untyped-def]
        started = time.perf_counter()
        response = await call_next(request)
        # `route` is only in scope after routing has run. Unmatched URLs (404s) have none — they are
        # labelled "unknown" rather than by their raw path, which an attacker could otherwise use to
        # create unbounded label values.
        route = request.scope.get("route")
        path = getattr(route, "path", None) or "unknown"
        labels = (request.method, path, str(response.status_code))
        HTTP_REQUEST_DURATION_SECONDS.labels(*labels).observe(time.perf_counter() - started)
        HTTP_REQUESTS_TOTAL.labels(*labels).inc()
        return response

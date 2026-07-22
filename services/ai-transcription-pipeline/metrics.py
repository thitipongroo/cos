"""Prometheus :9464 exposition for ai-transcription-pipeline — re-exports libs/python/cosmetrics (ADR-069).

Kept as a module so ``import metrics`` / ``metrics.<name>`` keep working for main.py and the tests;
the endpoint implementation lives once in cosmetrics, replacing four byte-identical copies jscpd
flagged.
"""

from cosmetrics import (
    DEFAULT_PORT,
    HTTP_REQUEST_DURATION_SECONDS,
    HTTP_REQUESTS_TOTAL,
    REGISTRY,
    install,
    port,
    scrape,
    start_metrics_server,
)

__all__ = [
    "DEFAULT_PORT",
    "HTTP_REQUEST_DURATION_SECONDS",
    "HTTP_REQUESTS_TOTAL",
    "REGISTRY",
    "install",
    "port",
    "scrape",
    "start_metrics_server",
]

"""Prometheus :9464 exposition for ai-gateway — the shared endpoint plus AI metrics (§31.3, QM-8).

The shared endpoint (registry, HTTP metrics, collectors, port/scrape/start_metrics_server/install)
lives once in libs/python/cosmetrics (ADR-069) and is re-exported here so ``import metrics`` keeps
working. This module adds the LLM metrics that only ai-gateway emits.
"""

from prometheus_client import Counter, Histogram

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
    "LLM_TOKENS_CONSUMED_TOTAL",
    "LLM_REQUEST_DURATION_SECONDS",
    "record_llm_usage",
]

# ─── AI metrics (§31.3 "AI metrics") ─────────────────────────────────────────
# Emitted from token_logger.log_usage, the one hook that runs after EVERY LLM completion, so these
# cannot drift out of sync with what lands in ai.ai_usage_logs.
#
# llm_tokens_consumed_total is what the "Tenant Operations" Grafana dashboard reads for AI token
# quota (§31.8) and what the AIHighTokenUsage alert is written against.

LLM_TOKENS_CONSUMED_TOTAL = Counter(
    "llm_tokens_consumed_total",
    "Total LLM tokens consumed",
    ["tenant_id", "model"],
    registry=REGISTRY,
)

LLM_REQUEST_DURATION_SECONDS = Histogram(
    "llm_request_duration_seconds",
    "LLM request duration",
    ["model"],
    registry=REGISTRY,
)


def record_llm_usage(tenant_id: str, model: str, total_tokens: int, latency_ms: int) -> None:
    """Record one completed LLM call. Called from token_logger.log_usage."""
    LLM_TOKENS_CONSUMED_TOTAL.labels(tenant_id, model).inc(total_tokens)
    LLM_REQUEST_DURATION_SECONDS.labels(model).observe(latency_ms / 1000)

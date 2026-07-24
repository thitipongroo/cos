"""Per-tenant LLM usage metering — the single hook every LLM completion goes through (QM-7, QM-8).

When a DB pool is configured, TokenLoggerMiddleware persists the call to ai.ai_usage_logs AND emits the
llm.* Prometheus metrics. Stage-1 has no pool; we still emit the metrics directly so per-tenant token /
latency signal (and the 20/min cost cap it feeds) is never silently lost. Used by /ai/completions,
/rag/query and the report pipeline — the finding was that metering existed but nothing invoked it.
"""
import time

import metrics
from middleware.token_logger import TokenLoggerMiddleware


async def complete_and_meter(
    provider,
    messages: list,
    model_hint: str,
    tenant_id: str,
    service_caller: str,
    db_pool,
    template_name: str | None = None,
):
    if db_pool is not None:
        return await TokenLoggerMiddleware(db_pool, service_caller).complete_and_log(
            provider, messages, model_hint, tenant_id, template_name
        )
    start = time.monotonic()
    response = await provider.complete(messages, model_hint)
    latency_ms = int((time.monotonic() - start) * 1000)
    metrics.record_llm_usage(tenant_id, response.model_used, response.total_tokens, latency_ms)
    return response

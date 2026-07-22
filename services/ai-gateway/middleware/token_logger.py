import time
import uuid
from dataclasses import dataclass

import asyncpg

import metrics


@dataclass
class UsageRecord:
    tenant_id: str
    service_caller: str
    template_name: str | None
    model_used: str
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    latency_ms: int


async def log_usage(db_pool: asyncpg.Pool, record: UsageRecord) -> None:
    """Persist one LLM call to ai.ai_usage_logs.

    Called as middleware after every LLM completion — never skipped.
    Source: context/00_master_construction_os.md §Phase 11 Token Tracking Schema.
    """
    await db_pool.execute(
        """
        INSERT INTO ai.ai_usage_logs (
            log_id, tenant_id, service_caller, template_name,
            model_used, prompt_tokens, completion_tokens, total_tokens, latency_ms
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        """,
        str(uuid.uuid4()),
        record.tenant_id,
        record.service_caller,
        record.template_name,
        record.model_used,
        record.prompt_tokens,
        record.completion_tokens,
        record.total_tokens,
        record.latency_ms,
    )
    # §31.3 AI metrics. Emitted after the insert so a metric never claims a call the usage table
    # does not have — the two always agree.
    metrics.record_llm_usage(
        record.tenant_id, record.model_used, record.total_tokens, record.latency_ms
    )


class TokenLoggerMiddleware:
    """Wraps an LLMProvider call, logs usage after every completion."""

    def __init__(self, db_pool: asyncpg.Pool, service_caller: str) -> None:
        self._pool = db_pool
        self._service_caller = service_caller

    async def complete_and_log(
        self,
        provider,
        messages: list,
        model_hint: str,
        tenant_id: str,
        template_name: str | None = None,
    ):
        start = time.monotonic()
        response = await provider.complete(messages, model_hint)
        latency_ms = int((time.monotonic() - start) * 1000)

        record = UsageRecord(
            tenant_id=tenant_id,
            service_caller=self._service_caller,
            template_name=template_name,
            model_used=response.model_used,
            prompt_tokens=response.prompt_tokens,
            completion_tokens=response.completion_tokens,
            total_tokens=response.total_tokens,
            latency_ms=latency_ms,
        )
        await log_usage(self._pool, record)
        return response

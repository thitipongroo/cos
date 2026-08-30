"""Unit tests for LLM usage logging (§Phase 11 Token Tracking Schema).

At 0% coverage before this file. This is the billing path: `ai_usage_logs` is what per-tenant AI
token metering bills from (§26.1), so a dropped or mis-shaped row is lost revenue or an
over-charge — and neither shows up as an error anywhere. The docstring says "never skipped", which
is a claim worth a test.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tests.fake_pool import TenantScopedPoolMixin  # noqa: E402

import pytest
from middleware.token_logger import TokenLoggerMiddleware, UsageRecord, log_usage


class _FakePool(TenantScopedPoolMixin):
    def __init__(self, raises: Exception | None = None):
        self.calls: list = []
        self._raises = raises

    async def _on_execute(self, query, *params):
        self.calls.append((query, params))
        if self._raises is not None:
            raise self._raises


class _FakeResponse:
    def __init__(self, model_used="gpt-4o", prompt=100, completion=40):
        self.model_used = model_used
        self.prompt_tokens = prompt
        self.completion_tokens = completion
        self.total_tokens = prompt + completion


class _FakeProvider:
    def __init__(self, response=None, raises=None, delay=0.0):
        self.response = response or _FakeResponse()
        self.calls: list = []
        self._raises = raises
        self._delay = delay

    async def complete(self, messages, model_hint):
        self.calls.append((messages, model_hint))
        if self._delay:
            import asyncio

            await asyncio.sleep(self._delay)
        if self._raises is not None:
            raise self._raises
        return self.response


def _record(**overrides) -> UsageRecord:
    payload = {
        "tenant_id": "11111111-1111-1111-1111-111111111111",
        "service_caller": "ai-gateway",
        "template_name": "report-daily-summary-v1",
        "model_used": "gpt-4o",
        "prompt_tokens": 100,
        "completion_tokens": 40,
        "total_tokens": 140,
        "latency_ms": 250,
    }
    payload.update(overrides)
    return UsageRecord(**payload)


class TestLogUsage:
    @pytest.mark.asyncio
    async def test_inserts_into_the_usage_table(self):
        pool = _FakePool()

        await log_usage(pool, _record())

        query, _ = pool.calls[0]
        assert "INSERT INTO ai.ai_usage_logs" in query

    @pytest.mark.asyncio
    async def test_row_carries_every_billing_field_in_order(self):
        pool = _FakePool()

        await log_usage(pool, _record())

        _, params = pool.calls[0]
        # params[0] is a generated log_id; the rest must match the record exactly.
        assert params[1:] == (
            "11111111-1111-1111-1111-111111111111",
            "ai-gateway",
            "report-daily-summary-v1",
            "gpt-4o",
            100,
            40,
            140,
            250,
        )

    @pytest.mark.asyncio
    async def test_each_call_gets_a_distinct_log_id(self):
        # A reused id would collide on the PK and silently lose the second call's usage.
        pool = _FakePool()

        await log_usage(pool, _record())
        await log_usage(pool, _record())

        assert pool.calls[0][1][0] != pool.calls[1][1][0]

    @pytest.mark.asyncio
    async def test_template_name_may_be_absent(self):
        # Not every LLM call comes from a named template (ad-hoc completions).
        pool = _FakePool()

        await log_usage(pool, _record(template_name=None))

        assert pool.calls[0][1][3] is None


class TestTokenLoggerMiddleware:
    @pytest.mark.asyncio
    async def test_returns_the_providers_response_unchanged(self):
        provider = _FakeProvider()
        middleware = TokenLoggerMiddleware(_FakePool(), "ai-gateway")

        result = await middleware.complete_and_log(
            provider, [{"role": "user"}], "report-generation", "tenant-1"
        )

        assert result is provider.response

    @pytest.mark.asyncio
    async def test_forwards_messages_and_model_hint_to_the_provider(self):
        provider = _FakeProvider()
        middleware = TokenLoggerMiddleware(_FakePool(), "ai-gateway")
        messages = [{"role": "user", "content": "สรุปรายงาน"}]

        await middleware.complete_and_log(provider, messages, "summarization", "tenant-1")

        assert provider.calls == [(messages, "summarization")]

    @pytest.mark.asyncio
    async def test_logs_the_tokens_reported_by_the_response(self):
        pool = _FakePool()
        provider = _FakeProvider(_FakeResponse(model_used="gpt-4o-mini", prompt=7, completion=3))
        middleware = TokenLoggerMiddleware(pool, "ai-gateway")

        await middleware.complete_and_log(provider, [], "summarization", "tenant-9")

        _, params = pool.calls[0]
        assert params[4] == "gpt-4o-mini"
        assert (params[5], params[6], params[7]) == (7, 3, 10)

    @pytest.mark.asyncio
    async def test_tags_the_row_with_the_configured_service_caller(self):
        pool = _FakePool()
        middleware = TokenLoggerMiddleware(pool, "ai-report-assistant")

        await middleware.complete_and_log(_FakeProvider(), [], "report-generation", "tenant-1")

        assert pool.calls[0][1][2] == "ai-report-assistant"

    @pytest.mark.asyncio
    async def test_template_name_is_recorded_when_supplied(self):
        pool = _FakePool()
        middleware = TokenLoggerMiddleware(pool, "ai-gateway")

        await middleware.complete_and_log(
            _FakeProvider(), [], "report-generation", "tenant-1", template_name="report-executive-v1"
        )

        assert pool.calls[0][1][3] == "report-executive-v1"

    @pytest.mark.asyncio
    async def test_measures_latency_of_the_provider_call(self):
        pool = _FakePool()
        provider = _FakeProvider(delay=0.02)
        middleware = TokenLoggerMiddleware(pool, "ai-gateway")

        await middleware.complete_and_log(provider, [], "report-generation", "tenant-1")

        latency_ms = pool.calls[0][1][8]
        assert latency_ms >= 15  # ~20ms of sleep, allowing for timer granularity

    @pytest.mark.asyncio
    async def test_nothing_is_logged_when_the_provider_fails(self):
        # A failed call produced no tokens; billing for it would over-charge the tenant.
        pool = _FakePool()
        provider = _FakeProvider(raises=RuntimeError("upstream 500"))
        middleware = TokenLoggerMiddleware(pool, "ai-gateway")

        with pytest.raises(RuntimeError):
            await middleware.complete_and_log(provider, [], "report-generation", "tenant-1")

        assert pool.calls == []

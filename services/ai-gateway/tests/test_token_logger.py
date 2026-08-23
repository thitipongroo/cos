"""Unit tests for LLM token accounting — Phase 11 Token Tracking Schema.

§35.13 ESC-24: middleware/token_logger.py was entirely uncovered (27 statements). This is the
billing path — spec 26 bills AI usage per tenant — so the two things asserted hardest here are that
the INSERT is schema-qualified with every column bound in order (QM-4), and that the middleware
logs after EVERY completion, including one that returns zero tokens.
"""

import asyncio
import uuid

import pytest

from middleware.token_logger import TokenLoggerMiddleware, UsageRecord, log_usage


class _FakePool:
    def __init__(self):
        self.executed: list[tuple] = []

    async def execute(self, query, *args):
        self.executed.append((query, args))


class _FakeResponse:
    def __init__(self, model_used="gpt-4o-mini", prompt=10, completion=5, total=15):
        self.model_used = model_used
        self.prompt_tokens = prompt
        self.completion_tokens = completion
        self.total_tokens = total


class _FakeProvider:
    def __init__(self, response=None, delay=0.0):
        self.response = response or _FakeResponse()
        self.delay = delay
        self.calls: list[tuple[list, str]] = []

    async def complete(self, messages, model_hint):
        self.calls.append((messages, model_hint))
        if self.delay:
            await asyncio.sleep(self.delay)
        return self.response


def _record(**overrides) -> UsageRecord:
    base = dict(
        tenant_id="t1",
        service_caller="report-pipeline",
        template_name="weekly_report",
        model_used="gpt-4o-mini",
        prompt_tokens=10,
        completion_tokens=5,
        total_tokens=15,
        latency_ms=42,
    )
    base.update(overrides)
    return UsageRecord(**base)


class TestUsageRecord:
    def test_carries_every_billed_field(self):
        r = _record()
        assert (r.prompt_tokens, r.completion_tokens, r.total_tokens) == (10, 5, 15)
        assert r.latency_ms == 42

    def test_template_name_is_optional(self):
        assert _record(template_name=None).template_name is None


class TestLogUsage:
    @pytest.mark.asyncio
    async def test_insert_is_schema_qualified_and_binds_every_column(self):
        pool = _FakePool()
        record = _record()

        await log_usage(pool, record)

        query, args = pool.executed[0]
        # QM-4: never an unqualified table name
        assert "ai.ai_usage_logs" in query
        assert len(args) == 9
        # a fresh log_id uuid, then the record fields in declaration order
        uuid.UUID(args[0])
        assert args[1:] == (
            "t1",
            "report-pipeline",
            "weekly_report",
            "gpt-4o-mini",
            10,
            5,
            15,
            42,
        )

    @pytest.mark.asyncio
    async def test_each_call_gets_its_own_log_id(self):
        pool = _FakePool()
        await log_usage(pool, _record())
        await log_usage(pool, _record())
        assert pool.executed[0][1][0] != pool.executed[1][1][0]

    @pytest.mark.asyncio
    async def test_a_null_template_is_bound_as_none(self):
        pool = _FakePool()
        await log_usage(pool, _record(template_name=None))
        assert pool.executed[0][1][3] is None


class TestTokenLoggerMiddleware:
    @pytest.mark.asyncio
    async def test_returns_the_provider_response_unchanged(self):
        pool = _FakePool()
        response = _FakeResponse(model_used="claude-sonnet-5")
        provider = _FakeProvider(response)
        mw = TokenLoggerMiddleware(pool, "report-pipeline")

        got = await mw.complete_and_log(provider, [{"role": "user"}], "fast", "t1")

        assert got is response

    @pytest.mark.asyncio
    async def test_forwards_messages_and_model_hint_to_the_provider(self):
        provider = _FakeProvider()
        mw = TokenLoggerMiddleware(_FakePool(), "rag")
        messages = [{"role": "user", "content": "hi"}]

        await mw.complete_and_log(provider, messages, "quality", "t1")

        assert provider.calls == [(messages, "quality")]

    @pytest.mark.asyncio
    async def test_logs_the_completion_with_the_service_caller_and_template(self):
        pool = _FakePool()
        provider = _FakeProvider(_FakeResponse("gpt-4o", 100, 50, 150))
        mw = TokenLoggerMiddleware(pool, "digital-twin")

        await mw.complete_and_log(
            provider, [], "fast", "tenant-9", template_name="divergence_summary"
        )

        _query, args = pool.executed[0]
        assert args[1] == "tenant-9"
        assert args[2] == "digital-twin"
        assert args[3] == "divergence_summary"
        assert args[4] == "gpt-4o"
        assert args[5:8] == (100, 50, 150)

    @pytest.mark.asyncio
    async def test_template_name_defaults_to_none(self):
        pool = _FakePool()
        mw = TokenLoggerMiddleware(pool, "rag")
        await mw.complete_and_log(_FakeProvider(), [], "fast", "t1")
        assert pool.executed[0][1][3] is None

    @pytest.mark.asyncio
    async def test_records_a_non_negative_latency(self):
        pool = _FakePool()
        mw = TokenLoggerMiddleware(pool, "rag")
        await mw.complete_and_log(_FakeProvider(delay=0.01), [], "fast", "t1")
        latency = pool.executed[0][1][8]
        assert isinstance(latency, int)
        assert latency >= 0

    @pytest.mark.asyncio
    async def test_a_zero_token_completion_is_still_logged(self):
        """"Never skipped" is the contract — an empty completion must not vanish from billing."""
        pool = _FakePool()
        provider = _FakeProvider(_FakeResponse("gpt-4o-mini", 0, 0, 0))
        mw = TokenLoggerMiddleware(pool, "rag")

        await mw.complete_and_log(provider, [], "fast", "t1")

        assert len(pool.executed) == 1
        assert pool.executed[0][1][5:8] == (0, 0, 0)

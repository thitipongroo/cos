"""A5 — Gateway resilience (§22.7 GW-001).

Budget math and failover logic are verified with fakes; the real LLM network paths are not
exercised (no provider keys). The budget SQL is unit-tested against a fake pool here and runs
against the real ai.ai_usage_logs schema in the integration suite.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from providers.llm_provider import LLMResponse, Message, StubLLMProvider
from providers.gateway_resilience import (
    BUDGET_ALERT_FRACTION,
    BudgetStatus,
    ResilientLLMProvider,
    check_budget,
    verify_virtual_key,
)


# ── Budget status math ──────────────────────────────────────────────────────────
def test_budget_alerts_at_80_percent():
    assert BudgetStatus("t", 80, 100).alerting is True
    assert BudgetStatus("t", 79, 100).alerting is False
    assert BUDGET_ALERT_FRACTION == 0.80


def test_budget_over_at_100_percent():
    assert BudgetStatus("t", 100, 100).over_budget is True
    assert BudgetStatus("t", 99, 100).over_budget is False


def test_budget_with_zero_quota_is_over_and_alerting():
    # A tenant with no allocated quota must not be able to spend.
    status = BudgetStatus("t", 0, 0)
    assert status.over_budget is True
    assert status.fraction == 1.0


class _FakePool:
    def __init__(self, used):
        self._used = used
        self.captured = {}

    async def fetchrow(self, sql, tenant_id):
        self.captured["tenant_id"] = tenant_id
        assert "date_trunc('month', now())" in sql  # rolls over monthly
        return {"used": self._used}


@pytest.mark.asyncio
async def test_check_budget_sums_current_month():
    pool = _FakePool(used=12345)
    status = await check_budget(pool, "tenant-1", quota_tokens=100000)
    assert status.used_tokens == 12345
    assert status.quota_tokens == 100000
    assert pool.captured["tenant_id"] == "tenant-1"


# ── Virtual keys ────────────────────────────────────────────────────────────────
def test_virtual_key_open_when_unset(monkeypatch):
    monkeypatch.delenv("AI_GATEWAY_VIRTUAL_KEY", raising=False)
    assert verify_virtual_key(None) is True  # dev/local: fail open


def test_virtual_key_enforced_when_set(monkeypatch):
    monkeypatch.setenv("AI_GATEWAY_VIRTUAL_KEY", "vk-secret")
    assert verify_virtual_key("vk-secret") is True
    assert verify_virtual_key("wrong") is False
    assert verify_virtual_key(None) is False


# ── Failover ────────────────────────────────────────────────────────────────────
class _OKProvider:
    def __init__(self, tag):
        self.tag = tag

    async def complete(self, messages, model_hint):
        return LLMResponse(self.tag, "model", 1, 1, 2)


@pytest.mark.asyncio
async def test_uses_primary_when_it_succeeds():
    resilient = ResilientLLMProvider(_OKProvider("primary"), _OKProvider("fallback"))
    resp = await resilient.complete([Message("user", "hi")], "summarization")
    assert resp.content == "primary"


@pytest.mark.asyncio
async def test_fails_over_when_primary_raises():
    # The stub primary (no key) raises NotImplementedError — must fall through to the alternative.
    resilient = ResilientLLMProvider(StubLLMProvider(), _OKProvider("fallback"))
    resp = await resilient.complete([Message("user", "hi")], "summarization")
    assert resp.content == "fallback"


@pytest.mark.asyncio
async def test_force_fallback_skips_primary():
    # Budget breach path: the caller forces the fallback without touching the (costly) primary.
    class _Boom:
        async def complete(self, messages, model_hint):
            raise AssertionError("primary must not be called when force_fallback=True")

    resilient = ResilientLLMProvider(_Boom(), _OKProvider("fallback"))
    resp = await resilient.complete([Message("user", "hi")], "summarization", force_fallback=True)
    assert resp.content == "fallback"

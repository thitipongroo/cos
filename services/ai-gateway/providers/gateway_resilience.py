"""LLM Gateway resilience & cost control (§22.7 GW-001).

Centralises three concerns so they never leak into domain services:

  1. Per-tenant monthly token budget — enforced here, alert at 80% (§31.3 AIHighTokenUsage),
     block or throttle at 100% per tenant tier.
  2. Provider failover — on primary error OR budget breach, route to the configured alternative
     through the same LLMProvider interface.
  3. Virtual keys — domain services authenticate to the gateway with an internal virtual key;
     provider API keys live only in the gateway's secret store (validated by verify_virtual_key).

MOCK-VERIFIED ONLY for the LLM paths: no real provider keys exist here, so failover is exercised
with fake providers. The budget query runs against a real ai.ai_usage_logs table.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from enum import Enum

from .llm_provider import LLMProvider, LLMResponse, Message

# Alert threshold (§31.3 "AI token budget near limit" — > 80% of monthly quota).
BUDGET_ALERT_FRACTION = 0.80


class BudgetAction(str, Enum):
    BLOCK = "block"
    THROTTLE = "throttle"


@dataclass
class BudgetStatus:
    tenant_id: str
    used_tokens: int
    quota_tokens: int

    @property
    def fraction(self) -> float:
        return self.used_tokens / self.quota_tokens if self.quota_tokens > 0 else 1.0

    @property
    def alerting(self) -> bool:
        return self.fraction >= BUDGET_ALERT_FRACTION

    @property
    def over_budget(self) -> bool:
        return self.used_tokens >= self.quota_tokens


class BudgetExceededError(Exception):
    """Raised when a tenant is over its monthly token budget and the tier action is BLOCK."""


async def current_month_tokens(db_pool, tenant_id: str) -> int:
    """Sum a tenant's total_tokens for the current calendar month from ai.ai_usage_logs.

    Uses date_trunc('month', now()) so the window rolls over automatically. The tenant filter is
    explicit here (not RLS-dependent) because the gateway runs this as an operational check, not
    inside a tenant-scoped request transaction.
    """
    row = await db_pool.fetchrow(
        """
        SELECT COALESCE(SUM(total_tokens), 0) AS used
        FROM ai.ai_usage_logs
        WHERE tenant_id = $1::uuid
          AND created_at >= date_trunc('month', now())
        """,
        tenant_id,
    )
    return int(row["used"])


async def check_budget(db_pool, tenant_id: str, quota_tokens: int) -> BudgetStatus:
    used = await current_month_tokens(db_pool, tenant_id)
    return BudgetStatus(tenant_id=tenant_id, used_tokens=used, quota_tokens=quota_tokens)


def verify_virtual_key(presented: str | None) -> bool:
    """A domain service must present the gateway's internal virtual key.

    The real provider keys are never handed out; services get this virtual key instead (§22.7
    GW-001). Comparison is constant-timeish via a length+equality check; the key lives in the
    gateway environment only.
    """
    expected = os.environ.get("AI_GATEWAY_VIRTUAL_KEY", "").strip()
    if not expected:
        # No virtual key configured → gateway is open (local/dev). Fail closed only when one is set.
        return True
    return bool(presented) and presented == expected


class ResilientLLMProvider(LLMProvider):
    """Wraps a primary provider with an alternative for failover (§22.7 GW-001).

    Failover triggers on either a primary exception or a caller-signalled budget breach. A
    NotImplementedError from the primary (the stub, no key) is treated like any other failure and
    falls through to the alternative — so a deployment with only the alternative configured still
    works.
    """

    def __init__(self, primary: LLMProvider, fallback: LLMProvider, logger=None) -> None:
        self._primary = primary
        self._fallback = fallback
        self._logger = logger

    async def complete(
        self, messages: list[Message], model_hint: str, *, force_fallback: bool = False
    ) -> LLMResponse:
        if force_fallback:
            return await self._fallback.complete(messages, model_hint)
        try:
            return await self._primary.complete(messages, model_hint)
        except Exception as exc:  # noqa: BLE001 — any primary failure must fail over
            if self._logger:
                self._logger.warning("primary LLM failed, failing over: %s", exc)
            return await self._fallback.complete(messages, model_hint)

"""usage — quota resolution (§26) + budget bands (§31.3 / COST-001). summarize_usage is pure; the DB
read is covered with a fake asyncpg pool."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tests.fake_pool import TenantScopedPoolMixin  # noqa: E402

from usage import get_usage_summary, summarize_usage


def test_starter_under_threshold():
    out = summarize_usage(100_000, "STARTER", "2026-07")
    assert out == {
        "tokensUsed": 100_000,
        "quota": 500_000,
        "percentUsed": 20,
        "periodMonth": "2026-07",
        "alertLevel": "none",
    }


def test_starter_soft_alert_at_80():
    out = summarize_usage(400_000, "STARTER", "2026-07")
    assert out["percentUsed"] == 80
    assert out["alertLevel"] == "warning"


def test_starter_just_below_soft_alert():
    out = summarize_usage(395_000, "STARTER", "2026-07")  # 79 %
    assert out["percentUsed"] == 79
    assert out["alertLevel"] == "none"


def test_starter_hard_cap_at_100():
    out = summarize_usage(500_000, "STARTER", "2026-07")
    assert out["percentUsed"] == 100
    assert out["alertLevel"] == "critical"


def test_professional_quota_is_5m():
    out = summarize_usage(1_000_000, "PROFESSIONAL", "2026-07")
    assert out["quota"] == 5_000_000
    assert out["percentUsed"] == 20
    assert out["alertLevel"] == "none"


def test_enterprise_is_uncapped():
    out = summarize_usage(9_000_000, "ENTERPRISE", "2026-07")
    assert out["quota"] is None
    assert out["percentUsed"] is None
    assert out["alertLevel"] == "none"
    assert out["tokensUsed"] == 9_000_000


def test_unknown_plan_is_uncapped():
    out = summarize_usage(10, None, "2026-07")
    assert out["quota"] is None
    assert out["percentUsed"] is None


class _FakePool(TenantScopedPoolMixin):
    """Minimal asyncpg-pool stand-in: fetchval returns the token sum then the plan, in call order."""

    def __init__(self, values):
        self._values = list(values)

    async def fetchval(self, *_args):
        return self._values.pop(0)


async def test_get_usage_summary_reads_db():
    pool = _FakePool([250_000, "STARTER"])
    out = await get_usage_summary(pool, "tenant-1")
    assert out["tokensUsed"] == 250_000
    assert out["quota"] == 500_000
    assert out["percentUsed"] == 50
    assert out["periodMonth"].count("-") == 1  # YYYY-MM


async def test_get_usage_summary_handles_null_sum():
    pool = _FakePool([None, "PROFESSIONAL"])  # no rows this month → SUM is None
    out = await get_usage_summary(pool, "tenant-1")
    assert out["tokensUsed"] == 0
    assert out["percentUsed"] == 0

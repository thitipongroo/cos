"""AI token usage summary — the Tenant Admin home "AI Token Usage" + "AI Insights" widgets.

Reads the REAL metering the gateway already writes on every LLM call (ai.ai_usage_logs, via
middleware/token_logger.py) and compares this billing month's tokens to the plan quota (§26 pricing:
STARTER 500K / PROFESSIONAL 5M / ENTERPRISE uncapped). §31.3 / §22.10 COST-001 bands: warning ≥80 %,
critical ≥100 %. No placeholders (ห้ามเดา): a tenant with no calls this month reads 0.

Split like intent/: summarize_usage() is pure (unit-gated); get_usage_summary() does the DB I/O.
The DB pool is the RLS-exempt owner role, so rows are scoped by explicit WHERE tenant_id (parity with
reports/persistence.py + middleware/token_logger.py).
"""

from datetime import datetime, timezone

from db import tenant_scoped

# §26 "Included Quota" per plan tier. ENTERPRISE is contract-custom → uncapped in-app (None).
QUOTA_BY_PLAN: dict[str, int | None] = {
    "STARTER": 500_000,
    "PROFESSIONAL": 5_000_000,
    "ENTERPRISE": None,
}

SOFT_ALERT_PCT = 80  # §31.3 "AI token budget near limit"
HARD_CAP_PCT = 100  # §22.10 COST-001 hard cap


def summarize_usage(tokens_used: int, plan_type: str | None, period_month: str) -> dict:
    """Pure: turn (tokens used, plan tier, period) into the widget summary. Unknown/ENTERPRISE plan →
    uncapped (quota/percent null, no alert)."""
    quota = QUOTA_BY_PLAN.get(plan_type or "", None)
    if quota is None:
        return {
            "tokensUsed": tokens_used,
            "quota": None,
            "percentUsed": None,
            "periodMonth": period_month,
            "alertLevel": "none",
        }
    percent = round((tokens_used / quota) * 100)  # quota is a positive plan quota when not None
    alert = "critical" if percent >= HARD_CAP_PCT else "warning" if percent >= SOFT_ALERT_PCT else "none"
    return {
        "tokensUsed": tokens_used,
        "quota": quota,
        "percentUsed": percent,
        "periodMonth": period_month,
        "alertLevel": alert,
    }


async def get_usage_summary(db_pool, tenant_id: str) -> dict:
    """Sum this UTC-month's tokens for the tenant + resolve the plan quota → widget summary."""
    now = datetime.now(timezone.utc)
    month_start = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
    period_month = f"{now.year:04d}-{now.month:02d}"

    # RLS (app_user): ai.ai_usage_logs and platform.tenants BOTH scope on the tenant GUC
    # (the latter since 20260804000001_restrict_tenants_read_policy) — without it both
    # reads return NULL/None. See db/tenant_scope.py.
    async with tenant_scoped(db_pool, tenant_id) as conn:
        tokens_used = await conn.fetchval(
            """
            SELECT COALESCE(SUM(total_tokens), 0)::bigint
            FROM ai.ai_usage_logs
            WHERE tenant_id = $1 AND created_at >= $2
            """,
            tenant_id,
            month_start,
        )
        plan_type = await conn.fetchval(
            "SELECT plan_type FROM platform.tenants WHERE tenant_id = $1",
            tenant_id,
        )
    return summarize_usage(int(tokens_used or 0), plan_type, period_month)

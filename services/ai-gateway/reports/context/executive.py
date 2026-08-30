"""EXECUTIVE_SUMMARY context — master:3994 "project_health (from Finance), procurement_summary, site_summary".

The executive report is the only one whose inputs are the OTHER reports' inputs. It therefore reuses
their assemblers rather than re-deriving the same figures: two definitions of "overdue invoice" that
drift apart would put two different numbers in front of a PM and an executive on the same day.
"""

from __future__ import annotations

from decimal import Decimal

from db.tenant_scope import tenant_scoped
from reports.context.procurement import build_procurement_context, fetch_procurement_signals
from reports.context.site import build_site_context, fetch_site_signals


def _variance_pct(budget: dict) -> Decimal | None:
    """Actual against total budget, as a percentage. None when there is no budget to divide by."""
    total = budget.get("total")
    if not total:
        # Zero or absent: a variance against a zero budget is not "0%", it is undefined, and
        # reporting 0% would read as "on budget" for a project with no budget set at all.
        return None
    return (Decimal(budget["actual"]) - Decimal(total)) / Decimal(total) * 100


def build_executive_context(budget: dict | None, site: dict, procurement: dict) -> str:
    """Pure: render project health + the two operational summaries into one context."""
    if budget is None:
        health = "Budget: no budget record exists for this project — financial health is unknown."
    else:
        variance = _variance_pct(budget)
        variance_txt = "undefined (total budget is zero)" if variance is None else f"{variance:+.1f}%"
        health = (
            f"Budget: {budget['actual']} actual and {budget['committed']} committed against"
            f" {budget['total']} total {budget['currency']} — variance {variance_txt}"
            f" (alert threshold {budget['threshold']}%)."
        )
    return "\n".join([health, build_site_context(site), build_procurement_context(procurement)])


async def fetch_budget(pool, tenant_id: str, project_id: str) -> dict | None:
    """The project's finance health line, or None when no budget has been created."""
    async with tenant_scoped(pool, tenant_id) as conn:
        row = await conn.fetchrow(
            """
            SELECT total_budget_amount, total_budget_currency, allocated_amount,
                   committed_amount, actual_amount, variance_alert_threshold
            FROM finance.project_budgets
            WHERE tenant_id = $1 AND project_id = $2
            """,
            tenant_id,
            project_id,
        )
    if row is None:
        return None
    return {
        "total": row["total_budget_amount"],
        "currency": row["total_budget_currency"],
        "allocated": row["allocated_amount"],
        "committed": row["committed_amount"],
        "actual": row["actual_amount"],
        "threshold": row["variance_alert_threshold"],
    }


async def assemble_executive_context(pool, tenant_id: str, project_id: str) -> str:
    budget = await fetch_budget(pool, tenant_id, project_id)
    site = await fetch_site_signals(pool, tenant_id, project_id)
    procurement = await fetch_procurement_signals(pool, tenant_id, project_id)
    return build_executive_context(budget, site, procurement)

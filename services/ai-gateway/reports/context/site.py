"""SITE_SUMMARY context — master:3984 "site_reports (last 7 days), issues (open), manpower_logs"."""

from __future__ import annotations

from db.tenant_scope import tenant_scoped

# master:3984 fixes the window at seven days. It is a CONSTANT, not the caller's `date_range` string:
# that field is free text the client sends for the prompt to echo ("last 7 days", "2026-07-01..07-21"),
# and letting it decide the query would let a caller widen its own report's window silently.
REPORT_WINDOW_DAYS = 7


def build_site_context(signals: dict) -> str:
    """Pure: render the fetched site signals into the daily-summary prompt context."""
    reports = signals["reports_submitted"]
    lines = [
        f"Site reports: {reports} submitted in the last {REPORT_WINDOW_DAYS} days"
        f" ({signals['reports_draft']} still in draft).",
    ]
    if reports == 0:
        # Said outright rather than left to inference. An empty window and a quiet site produce the
        # same silence, and a summary that treats "no reports filed" as "nothing happened" is the
        # failure this report exists to prevent.
        lines.append(
            "No site reports were filed in the window — absence of reports is NOT evidence of an"
            " uneventful site; say so rather than summarising activity."
        )
    lines.append(
        f"Issues: {signals['open_issues']} open, of which {signals['high_issues']} are high or"
        f" critical severity."
    )
    lines.append(
        f"Manpower: {signals['worker_days']} worker-days across {signals['trades']} trades logged"
        f" against those reports ({signals['hours']} hours)."
    )
    return "\n".join(lines)


async def fetch_site_signals(pool, tenant_id: str, project_id: str) -> dict:
    """Site signals for one project. Tenant-scoped by RLS (the GUC) and an explicit predicate."""
    async with tenant_scoped(pool, tenant_id) as conn:
        reports = await conn.fetchrow(
            f"""
            SELECT
              count(*) FILTER (WHERE status IN ('SUBMITTED', 'ACKNOWLEDGED')) AS submitted,
              count(*) FILTER (WHERE status = 'DRAFT')                        AS draft
            FROM site_ops.site_reports
            WHERE tenant_id = $1 AND project_id = $2
              AND report_date >= CURRENT_DATE - INTERVAL '{REPORT_WINDOW_DAYS} days'
            """,
            tenant_id,
            project_id,
        )
        issues = await conn.fetchrow(
            """
            SELECT
              count(*)                                                    AS open_count,
              count(*) FILTER (WHERE severity IN ('HIGH', 'CRITICAL'))    AS high_count
            FROM site_ops.issues
            WHERE tenant_id = $1 AND project_id = $2 AND status = 'OPEN'
            """,
            tenant_id,
            project_id,
        )
        # manpower_logs has no project_id of its own — it hangs off the report (FK report_id), so the
        # project scope comes from the join. Same window as the reports above.
        manpower = await conn.fetchrow(
            f"""
            SELECT
              COALESCE(sum(m.worker_count), 0)       AS worker_days,
              COALESCE(sum(m.hours_worked), 0)       AS hours,
              count(DISTINCT m.trade_type)           AS trades
            FROM site_ops.manpower_logs m
            JOIN site_ops.site_reports r ON r.report_id = m.report_id
            WHERE m.tenant_id = $1 AND r.project_id = $2
              AND r.report_date >= CURRENT_DATE - INTERVAL '{REPORT_WINDOW_DAYS} days'
            """,
            tenant_id,
            project_id,
        )
    return {
        "reports_submitted": reports["submitted"],
        "reports_draft": reports["draft"],
        "open_issues": issues["open_count"],
        "high_issues": issues["high_count"],
        "worker_days": manpower["worker_days"],
        "hours": manpower["hours"],
        "trades": manpower["trades"],
    }


async def assemble_site_context(pool, tenant_id: str, project_id: str) -> str:
    return build_site_context(await fetch_site_signals(pool, tenant_id, project_id))

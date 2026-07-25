"""Delay-risk context assembly (F4b B / §22.4).

Gathers the delay signals a project actually has — schedule slippage, open issues, late procurement,
recent manpower — plus current weather at the site, into the context string the delay-risk report
(report-delay-risk-v1) reasons over. Replaces the empty context_data the endpoint used to send.

Tenant isolation is by an explicit `WHERE tenant_id = $1` in every query (the ai-gateway connects as
the RLS-exempt owner role, the same posture as reports/persistence.py — not by a GUC). The SQL here was
verified against the seeded dev database.

build_context is pure (no DB / no weather client) so it carries a standalone unit gate; the fetchers and
assemble orchestration run against the injected pool (app-level, exercised in CI).
"""

from __future__ import annotations


def build_context(signals: dict, weather_line: str | None) -> str:
    """Pure: render the fetched signals (+ optional weather) into the delay-risk prompt context."""
    lines = [
        f"Schedule: {signals['overdue_tasks']} of {signals['active_tasks']} active tasks are overdue "
        f"(planned end date passed, not yet complete).",
        f"Issues: {signals['open_issues']} open, of which {signals['high_issues']} are high or critical severity.",
        f"Procurement: {signals['late_pos']} purchase orders are past their delivery date.",
        f"Workforce: {signals['attendance_14d']} attendance check-ins in the last 14 days.",
    ]
    if weather_line:
        lines.append(weather_line)
    return "\n".join(lines)


async def fetch_signals(pool, tenant_id: str, project_id: str) -> dict:
    """Delay signals for one project. Every query is tenant-scoped (WHERE tenant_id = $1)."""
    async with pool.acquire() as conn:
        tasks = await conn.fetchrow(
            """
            SELECT
              count(*) FILTER (WHERE status IN ('IN_PROGRESS', 'NOT_STARTED')) AS active,
              count(*) FILTER (WHERE planned_end < CURRENT_DATE AND status <> 'COMPLETED') AS overdue
            FROM projects.tasks WHERE tenant_id = $1 AND project_id = $2
            """,
            tenant_id,
            project_id,
        )
        issues = await conn.fetchrow(
            """
            SELECT
              count(*) AS open_count,
              count(*) FILTER (WHERE severity IN ('HIGH', 'CRITICAL')) AS high_count
            FROM site_ops.issues WHERE tenant_id = $1 AND project_id = $2 AND status = 'OPEN'
            """,
            tenant_id,
            project_id,
        )
        late_pos = await conn.fetchval(
            """
            SELECT count(*) FROM procurement.purchase_orders po
            WHERE po.tenant_id = $1 AND po.project_id = $2
              AND po.delivery_date < CURRENT_DATE
              AND NOT EXISTS (SELECT 1 FROM procurement.deliveries d WHERE d.po_id = po.po_id)
            """,
            tenant_id,
            project_id,
        )
        attendance = await conn.fetchval(
            """
            SELECT count(*) FROM workforce_telemetry.attendance_logs
            WHERE tenant_id = $1 AND project_id = $2 AND recorded_at >= now() - INTERVAL '14 days'
            """,
            tenant_id,
            project_id,
        )
    return {
        "active_tasks": tasks["active"],
        "overdue_tasks": tasks["overdue"],
        "open_issues": issues["open_count"],
        "high_issues": issues["high_count"],
        "late_pos": late_pos,
        "attendance_14d": attendance,
    }


async def fetch_coords(pool, tenant_id: str, project_id: str):
    """Latest geo-tagged site-report coordinate for the project — the weather lookup point, or None."""
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT latitude, longitude FROM site_ops.site_reports
            WHERE tenant_id = $1 AND project_id = $2 AND latitude IS NOT NULL
            ORDER BY report_date DESC LIMIT 1
            """,
            tenant_id,
            project_id,
        )
    return (float(row["latitude"]), float(row["longitude"])) if row else None


async def assemble_delay_context(pool, weather_provider, tenant_id: str, project_id: str) -> str:
    """Fetch the signals + weather and render the context string (F4b B)."""
    signals = await fetch_signals(pool, tenant_id, project_id)
    coords = await fetch_coords(pool, tenant_id, project_id)
    weather = None
    if coords is not None:
        weather = await weather_provider.current(coords[0], coords[1])
    return build_context(signals, weather.as_line() if weather else None)

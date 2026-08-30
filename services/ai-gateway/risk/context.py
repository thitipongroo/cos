"""Delay-risk context assembly (F4b B / §22.4).

Gathers the delay signals a project actually has — schedule slippage, open issues, late procurement,
recent manpower — plus current weather at the site, into the context string the delay-risk report
(report-delay-risk-v1) reasons over. Replaces the empty context_data the endpoint used to send.

Tenant isolation is BOTH the explicit `WHERE tenant_id = $1` in every query AND row-level security.
This module used to acquire a raw connection, justified by a note that the gateway "connects as the
RLS-exempt owner role" — true when it was written, false since the service moved to `app_user`
through PgBouncer (E-1, 2026-08-22). Under `app_user` every table below carries FORCE ROW LEVEL
SECURITY and a policy keyed on `app.current_tenant_id`, so a connection that never sets that GUC
matches no rows at all: each query would return ZERO, and the delay-risk report would describe every
project as having no overdue tasks, no open issues and no late deliveries. That is not an error the
caller can see — it is a confident LOW risk on a project that is months behind.

Every read therefore goes through `tenant_scoped`, exactly as reports/persistence.py does.

build_context is pure (no DB / no weather client) so it carries a standalone unit gate; the fetchers and
assemble orchestration run against the injected pool (app-level, exercised in CI).
"""

from __future__ import annotations

from db.tenant_scope import tenant_scoped


def _schedule_line(signals: dict) -> str:
    """The planned end, the baseline it is measured against, and the delay between them.

    `estimated_completion_date` is the PM's projected completion, entered via
    PATCH /api/v1/projects/:id. When it is NULL the baseline IS the planned end — the
    NULL-means-fall-back-to-end_date rule the column was added for (migration 20260723000001) — so
    the projected delay is zero rather than unknown.
    """
    planned = signals.get("planned_end_date")
    baseline = signals.get("baseline_end_date")
    delay = signals.get("projected_delay_days")

    if planned is None and baseline is None:
        # A project with no dates at all: say so plainly rather than implying a zero-day delay.
        return "Schedule: no planned end date recorded for this project."

    source = (
        "PM-entered estimated completion"
        if signals.get("has_pm_estimate")
        else "planned end date (no PM estimate entered)"
    )
    if delay is None:
        return f"Schedule: planned end {planned}; baseline {baseline} ({source})."
    if delay > 0:
        return (
            f"Schedule: planned end {planned}, baseline {baseline} ({source}) — "
            f"projected delay {delay} days."
        )
    if delay < 0:
        return (
            f"Schedule: planned end {planned}, baseline {baseline} ({source}) — "
            f"running {abs(delay)} days AHEAD of plan."
        )
    return f"Schedule: planned end {planned}, baseline {baseline} ({source}) — on plan, 0 days delay."


def build_context(signals: dict, weather_line: str | None) -> str:
    """Pure: render the fetched signals (+ optional weather) into the delay-risk prompt context."""
    lines = [
        # THE SCHEDULE LINE IS FIRST BECAUSE IT IS THE ONE THE THRESHOLDS ARE DEFINED ON. The prompt
        # asks the model to place the project in a band by "projected delay in days" (LOW 1-2,
        # MEDIUM 3-6, HIGH 7-13, CRITICAL 14+), and until this line existed the context carried no
        # dates at all — the model was asked to threshold a number it had no way to compute, from
        # task counts and issue counts. The subtraction is done here rather than by the model: it is
        # arithmetic on two dates, and a model that miscounts it produces a wrong BAND, not a wrong
        # sentence.
        _schedule_line(signals),
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
    """Delay signals for one project. Tenant-scoped by RLS (the GUC) and by an explicit predicate."""
    async with tenant_scoped(pool, tenant_id) as conn:
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
        # The schedule baseline the thresholds are defined on (master:3984-3985). COALESCE encodes
        # the fallback: no PM estimate means the baseline IS the planned end, so the delay is 0.
        schedule = await conn.fetchrow(
            """
            SELECT
              end_date,
              estimated_completion_date,
              COALESCE(estimated_completion_date, end_date) AS baseline,
              (COALESCE(estimated_completion_date, end_date) - end_date) AS delay_days
            FROM projects.projects WHERE tenant_id = $1 AND project_id = $2
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
        "planned_end_date": schedule["end_date"] if schedule else None,
        "baseline_end_date": schedule["baseline"] if schedule else None,
        "projected_delay_days": schedule["delay_days"] if schedule else None,
        "has_pm_estimate": bool(schedule and schedule["estimated_completion_date"]),
        "active_tasks": tasks["active"],
        "overdue_tasks": tasks["overdue"],
        "open_issues": issues["open_count"],
        "high_issues": issues["high_count"],
        "late_pos": late_pos,
        "attendance_14d": attendance,
    }


async def fetch_coords(pool, tenant_id: str, project_id: str):
    """Latest geo-tagged site-report coordinate for the project — the weather lookup point, or None."""
    async with tenant_scoped(pool, tenant_id) as conn:
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

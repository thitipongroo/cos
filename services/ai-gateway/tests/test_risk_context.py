"""risk.context — pure build_context + the fetch/assemble orchestration (fake pool, no real DB)."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest

from tests.fake_pool import TenantScopedPoolMixin

from risk.context import assemble_delay_context, build_context, fetch_coords, fetch_signals

SIGNALS = {
    "planned_end_date": "2026-09-30",
    "baseline_end_date": "2026-10-05",
    "projected_delay_days": 5,
    "has_pm_estimate": True,
    "active_tasks": 3,
    "overdue_tasks": 2,
    "open_issues": 4,
    "high_issues": 1,
    "late_pos": 2,
    "attendance_14d": 37,
}


# ── build_context (pure) ──────────────────────────────────────────────────────
def test_renders_all_signals():
    out = build_context(SIGNALS, None)
    assert "2 of 3 active tasks are overdue" in out
    assert "4 open, of which 1 are high or critical" in out
    assert "2 purchase orders are past their delivery date" in out
    assert "37 attendance check-ins" in out


def test_appends_weather_when_present():
    out = build_context(SIGNALS, "Weather: light rain")
    assert out.endswith("Weather: light rain")


def test_omits_weather_when_absent():
    assert "Weather" not in build_context(SIGNALS, None)


_DEFAULT_SCHEDULE = {
    "end_date": "2026-09-30",
    "estimated_completion_date": "2026-10-05",
    "baseline": "2026-10-05",
    "delay_days": 5,
}


# ── fetch/assemble (fake pool) ────────────────────────────────────────────────
# The fake is pool AND connection, via TenantScopedPoolMixin: these reads go through
# `tenant_scoped()` now, so the code sets `app.current_tenant_id` inside a transaction before any
# statement. Under `app_user` every table read here has FORCE ROW LEVEL SECURITY, so a connection
# without that GUC matches no rows — the queries would all return zero and the delay-risk report
# would call every project healthy. The mixin swallows the set_config statement and records the
# tenant, so the tests below can assert the scope was actually applied.
class _FakePool(TenantScopedPoolMixin):
    def __init__(self, coords_row=None, schedule_row=_DEFAULT_SCHEDULE):
        self._coords_row = coords_row
        self._schedule_row = schedule_row

    async def fetchrow(self, query, *args):
        if "projects.projects" in query:
            return self._schedule_row
        if "projects.tasks" in query:
            return {"active": 3, "overdue": 2}
        if "site_ops.issues" in query:
            return {"open_count": 4, "high_count": 1}
        if "site_reports" in query:
            return self._coords_row
        raise AssertionError("unexpected fetchrow")

    async def fetchval(self, query, *args):
        return 2 if "purchase_orders" in query else 37


@pytest.mark.asyncio
async def test_fetch_signals_maps_rows():
    signals = await fetch_signals(_FakePool(), "t", "p")
    assert signals == SIGNALS


@pytest.mark.asyncio
async def test_fetch_coords_returns_tuple_when_present():
    pool = _FakePool(coords_row={"latitude": 13.758, "longitude": 100.5654})
    assert await fetch_coords(pool, "t", "p") == (13.758, 100.5654)


@pytest.mark.asyncio
async def test_fetch_coords_returns_none_when_absent():
    assert await fetch_coords(_FakePool(coords_row=None), "t", "p") is None


class _FakeWeather:
    def as_line(self):
        return "Weather: sunny"


class _FakeWeatherProvider:
    def __init__(self, result):
        self._result = result

    async def current(self, lat, lng):
        return self._result


@pytest.mark.asyncio
async def test_assemble_includes_weather_when_coords_and_weather_present():
    pool = _FakePool(coords_row={"latitude": 13.7, "longitude": 100.5})
    out = await assemble_delay_context(pool, _FakeWeatherProvider(_FakeWeather()), "t", "p")
    assert "Weather: sunny" in out
    assert "2 of 3 active tasks are overdue" in out


@pytest.mark.asyncio
async def test_assemble_omits_weather_when_no_coords():
    pool = _FakePool(coords_row=None)
    out = await assemble_delay_context(pool, _FakeWeatherProvider(_FakeWeather()), "t", "p")
    assert "Weather" not in out


@pytest.mark.asyncio
async def test_signal_reads_set_the_tenant_scope():
    """RLS, not just the WHERE clause, is what isolates these reads.

    The gateway connects as `app_user`, which has no RLS bypass, and every table read here carries
    FORCE ROW LEVEL SECURITY with a policy keyed on `app.current_tenant_id`. Without that GUC each
    query matches NO rows — and the failure is silent: the report would describe a project months
    behind schedule as having no overdue tasks, no open issues and no late deliveries.
    """
    pool = _FakePool()
    await fetch_signals(pool, "tenant-42", "project-1")
    assert pool.tenant_guc == "tenant-42"


@pytest.mark.asyncio
async def test_coordinate_read_sets_the_tenant_scope_too():
    """The second connection needs it as much as the first — it reads site_ops.site_reports."""
    pool = _FakePool(coords_row=None)
    await fetch_coords(pool, "tenant-42", "project-1")
    assert pool.tenant_guc == "tenant-42"


# ── the schedule baseline (master:3984-3985, 3991) ────────────────────────────
def test_schedule_line_leads_the_context():
    """The thresholds are defined on projected delay, so the delay has to be IN the context.

    Before this line existed the model was asked to place a project in a day-count band while being
    shown only task and issue counts — no dates at all.
    """
    out = build_context(SIGNALS, None)
    assert out.splitlines()[0].startswith("Schedule:")
    assert "projected delay 5 days" in out


def test_pm_estimate_is_named_as_the_baseline_source():
    out = build_context(SIGNALS, None)
    assert "PM-entered estimated completion" in out


def test_absent_pm_estimate_falls_back_to_the_planned_end():
    """master:3985 — "if null, falls back to planned end_date", so the delay is 0, not unknown."""
    signals = {
        **SIGNALS,
        "baseline_end_date": "2026-09-30",
        "projected_delay_days": 0,
        "has_pm_estimate": False,
    }
    out = build_context(signals, None)
    assert "no PM estimate entered" in out
    assert "on plan, 0 days delay" in out


def test_ahead_of_plan_is_not_reported_as_a_delay():
    """A negative difference is early, not late. Rendering it as "projected delay -3 days" would
    invite the model to band a project that is AHEAD of schedule as being at risk."""
    signals = {**SIGNALS, "baseline_end_date": "2026-09-27", "projected_delay_days": -3}
    out = build_context(signals, None)
    assert "3 days AHEAD of plan" in out
    assert "projected delay" not in out


def test_project_with_no_dates_says_so_rather_than_implying_zero():
    signals = {
        **SIGNALS,
        "planned_end_date": None,
        "baseline_end_date": None,
        "projected_delay_days": None,
        "has_pm_estimate": False,
    }
    out = build_context(signals, None)
    assert "no planned end date recorded" in out
    assert "0 days delay" not in out


@pytest.mark.asyncio
async def test_fetch_signals_reads_the_schedule_baseline():
    signals = await fetch_signals(_FakePool(), "t", "p")
    assert signals["planned_end_date"] == "2026-09-30"
    assert signals["baseline_end_date"] == "2026-10-05"
    assert signals["projected_delay_days"] == 5
    assert signals["has_pm_estimate"] is True


@pytest.mark.asyncio
async def test_null_pm_estimate_yields_a_zero_day_delay():
    """The COALESCE in the query is what encodes the fallback — asserted end to end."""
    pool = _FakePool(
        schedule_row={
            "end_date": "2026-09-30",
            "estimated_completion_date": None,
            "baseline": "2026-09-30",
            "delay_days": 0,
        }
    )
    signals = await fetch_signals(pool, "t", "p")
    assert signals["has_pm_estimate"] is False
    assert signals["projected_delay_days"] == 0


@pytest.mark.asyncio
async def test_missing_project_row_does_not_crash_the_report():
    """A delay-risk request for an unknown project must degrade, not raise: the endpoint treats
    context assembly as best-effort and would otherwise lose the whole report."""
    signals = await fetch_signals(_FakePool(schedule_row=None), "t", "p")
    assert signals["planned_end_date"] is None
    assert "no planned end date recorded" in build_context(signals, None)


def test_pm_estimate_without_a_planned_end_reports_no_delay_number():
    """A project with no planned end but a PM estimate: there is nothing to measure the delay AGAINST.

    `COALESCE(estimated_completion_date, end_date) - end_date` is NULL when end_date is NULL, so the
    baseline is known while the delay is not. Printing "0 days delay" here would assert the project
    is on plan when no plan exists.
    """
    signals = {
        **SIGNALS,
        "planned_end_date": None,
        "baseline_end_date": "2026-10-05",
        "projected_delay_days": None,
        "has_pm_estimate": True,
    }
    out = build_context(signals, None)
    assert "baseline 2026-10-05" in out
    assert "days delay" not in out
    assert "AHEAD" not in out

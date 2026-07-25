"""risk.context — pure build_context + the fetch/assemble orchestration (fake pool, no real DB)."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest

from risk.context import assemble_delay_context, build_context, fetch_coords, fetch_signals

SIGNALS = {
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


# ── fetch/assemble (fake pool) ────────────────────────────────────────────────
class _AcquireCM:
    def __init__(self, conn):
        self._conn = conn

    async def __aenter__(self):
        return self._conn

    async def __aexit__(self, *a):
        return False


class _FakeConn:
    def __init__(self, coords_row=None):
        self._coords_row = coords_row

    async def fetchrow(self, query, *args):
        if "projects.tasks" in query:
            return {"active": 3, "overdue": 2}
        if "site_ops.issues" in query:
            return {"open_count": 4, "high_count": 1}
        if "site_reports" in query:
            return self._coords_row
        raise AssertionError("unexpected fetchrow")

    async def fetchval(self, query, *args):
        return 2 if "purchase_orders" in query else 37


class _FakePool:
    def __init__(self, conn):
        self._conn = conn

    def acquire(self):
        return _AcquireCM(self._conn)


@pytest.mark.asyncio
async def test_fetch_signals_maps_rows():
    signals = await fetch_signals(_FakePool(_FakeConn()), "t", "p")
    assert signals == SIGNALS


@pytest.mark.asyncio
async def test_fetch_coords_returns_tuple_when_present():
    pool = _FakePool(_FakeConn(coords_row={"latitude": 13.758, "longitude": 100.5654}))
    assert await fetch_coords(pool, "t", "p") == (13.758, 100.5654)


@pytest.mark.asyncio
async def test_fetch_coords_returns_none_when_absent():
    assert await fetch_coords(_FakePool(_FakeConn(coords_row=None)), "t", "p") is None


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
    pool = _FakePool(_FakeConn(coords_row={"latitude": 13.7, "longitude": 100.5}))
    out = await assemble_delay_context(pool, _FakeWeatherProvider(_FakeWeather()), "t", "p")
    assert "Weather: sunny" in out
    assert "2 of 3 active tasks are overdue" in out


@pytest.mark.asyncio
async def test_assemble_omits_weather_when_no_coords():
    pool = _FakePool(_FakeConn(coords_row=None))
    out = await assemble_delay_context(pool, _FakeWeatherProvider(_FakeWeather()), "t", "p")
    assert "Weather" not in out

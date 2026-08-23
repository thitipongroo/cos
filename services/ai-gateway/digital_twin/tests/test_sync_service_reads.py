"""Twin read path and confidence scoring — Phase 24.

§35.13 ESC-24: `get_current_state` (the Redis-first read) and the MANUAL arm of
`compute_confidence` were uncovered. The read path is where a stale cache would silently serve an
out-of-date site model, so both the hit and the miss are asserted, including that a cache miss
writes the row back with the documented TTL.
"""

import json
from datetime import datetime, timedelta, timezone

import pytest

from digital_twin.models import SeverityLevel, StateSource
from digital_twin.divergence import _risk_level_from_divergences
from digital_twin.sync_service import compute_confidence, get_current_state

ENTITY_ID = "33333333-3333-4333-8333-333333333333"
TENANT_ID = "11111111-1111-4111-8111-111111111111"


class _FakeRedis:
    def __init__(self, cached: str | None = None):
        self.cached = cached
        self.setex_calls: list[tuple[str, int, str]] = []
        self.get_keys: list[str] = []

    async def get(self, key):
        self.get_keys.append(key)
        return self.cached

    async def setex(self, key, ttl, value):
        self.setex_calls.append((key, ttl, value))


class _FakePool:
    def __init__(self, row=None):
        self._row = row
        self.calls: list[tuple] = []

    async def fetchrow(self, query, *args):
        self.calls.append((query, args))
        return self._row


class TestComputeConfidence:
    def test_a_live_iot_reading_is_fully_trusted(self):
        assert compute_confidence(StateSource.IOT, datetime.now(timezone.utc)) == 1.0

    def test_an_old_iot_reading_is_discounted(self):
        stale = datetime.now(timezone.utc) - timedelta(hours=2)
        assert compute_confidence(StateSource.IOT, stale) < 1.0

    def test_an_ai_inference_is_discounted_further(self):
        now = datetime.now(timezone.utc)
        ai = compute_confidence(StateSource.AI_INFERRED, now)
        stale_iot = compute_confidence(StateSource.IOT, now - timedelta(hours=2))
        assert ai < stale_iot

    def test_a_manual_entry_scores_like_a_recent_iot_reading(self):
        """The MANUAL arm — a human-entered state is trusted, but not as a live sensor is."""
        now = datetime.now(timezone.utc)
        assert compute_confidence(StateSource.MANUAL, now) == compute_confidence(
            StateSource.IOT, now - timedelta(hours=2)
        )
        assert compute_confidence(StateSource.MANUAL, now) < 1.0


class TestGetCurrentState:
    @pytest.mark.asyncio
    async def test_returns_the_cached_state_without_touching_the_database(self):
        cached = {"attributes": {"fuel_level": 0.5}, "confidence": 1.0, "recorded_at": "2026-06-08"}
        redis = _FakeRedis(cached=json.dumps(cached))
        pool = _FakePool()

        got = await get_current_state(ENTITY_ID, TENANT_ID, redis_client=redis, db_pool=pool)

        assert got == cached
        assert pool.calls == []  # a cache hit must not hit TimescaleDB
        assert redis.get_keys == [f"twin:state:{TENANT_ID}:{ENTITY_ID}"]

    @pytest.mark.asyncio
    async def test_falls_back_to_the_database_and_backfills_the_cache(self):
        recorded_at = datetime(2026, 6, 8, tzinfo=timezone.utc)
        row = {
            "attributes": json.dumps({"fuel_level": 0.75}),
            "confidence": 0.9,
            "recorded_at": recorded_at,
        }
        redis = _FakeRedis(cached=None)
        pool = _FakePool(row=row)

        got = await get_current_state(ENTITY_ID, TENANT_ID, redis_client=redis, db_pool=pool)

        assert got == {
            "attributes": {"fuel_level": 0.75},
            "confidence": 0.9,
            "recorded_at": recorded_at.isoformat(),
        }
        # the point-in-time query is tenant-scoped and takes the newest row
        query, args = pool.calls[0]
        assert "digital_twin.twin_states" in query  # QM-4
        assert "tenant_id = $2::uuid" in query
        assert "ORDER BY recorded_at DESC" in query
        assert args == (ENTITY_ID, TENANT_ID)
        # and the result is written back so the next read is a hit
        key, ttl, value = redis.setex_calls[0]
        assert key == f"twin:state:{TENANT_ID}:{ENTITY_ID}"
        assert ttl == 300
        assert json.loads(value) == got

    @pytest.mark.asyncio
    async def test_returns_none_when_the_entity_has_no_recorded_state(self):
        redis = _FakeRedis(cached=None)
        pool = _FakePool(row=None)

        got = await get_current_state(ENTITY_ID, TENANT_ID, redis_client=redis, db_pool=pool)

        assert got is None
        assert redis.setex_calls == []  # nothing to cache


class TestRiskLevelFromDivergences:
    def _div(self, severity):
        class _D:
            def __init__(self, s):
                self.severity = s

        return _D(severity)

    def test_no_divergences_is_low(self):
        assert _risk_level_from_divergences([]) == "LOW"

    def test_three_high_is_critical(self):
        assert _risk_level_from_divergences([self._div(SeverityLevel.HIGH)] * 3) == "CRITICAL"

    def test_one_high_is_high(self):
        assert _risk_level_from_divergences([self._div(SeverityLevel.HIGH)]) == "HIGH"

    def test_three_medium_is_medium(self):
        assert _risk_level_from_divergences([self._div(SeverityLevel.MEDIUM)] * 3) == "MEDIUM"

    def test_two_medium_is_still_low(self):
        """The MEDIUM threshold is 3 — two mediums must not escalate the whole project."""
        assert _risk_level_from_divergences([self._div(SeverityLevel.MEDIUM)] * 2) == "LOW"

    def test_low_severity_divergences_stay_low(self):
        assert _risk_level_from_divergences([self._div(SeverityLevel.LOW)] * 10) == "LOW"

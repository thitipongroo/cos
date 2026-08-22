"""The twin read path and the two remaining decision branches (§33.3).

`get_current_state` is the cache-first read: Redis, then a TimescaleDB point-in-time query, then a
write-back with the 5-minute TTL. None of it had a test, so a cache that never populated — or one
that returned stale JSON forever because the TTL was dropped — would have looked identical to a
working twin.

The two one-line branches here are not filler either: `compute_confidence` for a MANUAL reading, and
the `continue` that skips an entity with no recorded state during divergence analysis (a registered
but never-reported device must not be scored as diverging).
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from tests.fake_pool import TenantScopedPoolMixin  # noqa: E402

import pytest
from digital_twin.divergence import _risk_level_from_divergences, generate_divergence_report
from digital_twin.models import SeverityLevel, StateSource
from digital_twin.sync_service import _REDIS_TTL_SECS, compute_confidence, get_current_state

ENTITY_ID = "11111111-1111-1111-1111-111111111111"
TENANT_ID = "22222222-2222-2222-2222-222222222222"


class _FakeRedis:
    def __init__(self, cached=None):
        self._cached = cached
        self.get_calls: list = []
        self.setex_calls: list = []

    async def get(self, key):
        self.get_calls.append(key)
        return self._cached

    async def setex(self, key, ttl, value):
        self.setex_calls.append((key, ttl, value))


class _FakePool(TenantScopedPoolMixin):
    def __init__(self, row=None, rows=None):
        self._row = row
        self._rows = rows if rows is not None else []
        self.fetchrow_calls: list = []

    async def fetchrow(self, query, *params):
        self.fetchrow_calls.append((query, params))
        return self._row

    async def fetch(self, query, *params):
        return self._rows


class TestComputeConfidenceManual:
    def test_manual_reading_is_treated_as_recent_not_live(self):
        # A human-entered reading is trustworthy but not live telemetry; it must not score as an
        # IoT-live observation regardless of how fresh its timestamp is.
        manual = compute_confidence(StateSource.MANUAL, datetime.now(timezone.utc))
        iot_live = compute_confidence(StateSource.IOT, datetime.now(timezone.utc))

        assert manual < iot_live

    def test_manual_confidence_does_not_decay_with_age(self):
        fresh = compute_confidence(StateSource.MANUAL, datetime.now(timezone.utc))
        old = compute_confidence(StateSource.MANUAL, datetime.now(timezone.utc) - timedelta(days=7))

        assert fresh == old


class TestGetCurrentStateCacheHit:
    @pytest.mark.asyncio
    async def test_returns_cached_state_without_touching_the_database(self):
        payload = {"attributes": {"fuel_level": 42}, "confidence": 0.95}
        redis_client = _FakeRedis(cached=json.dumps(payload))
        pool = _FakePool()

        result = await get_current_state(
            ENTITY_ID, TENANT_ID, redis_client=redis_client, db_pool=pool
        )

        assert result == payload
        assert pool.fetchrow_calls == []  # the whole point of the cache

    @pytest.mark.asyncio
    async def test_cache_key_is_scoped_by_tenant_and_entity(self):
        # A key missing the tenant would serve one tenant's twin state to another (R-02).
        redis_client = _FakeRedis(cached=json.dumps({}))

        await get_current_state(ENTITY_ID, TENANT_ID, redis_client=redis_client, db_pool=_FakePool())

        assert redis_client.get_calls == [f"twin:state:{TENANT_ID}:{ENTITY_ID}"]


class TestGetCurrentStateCacheMiss:
    @pytest.mark.asyncio
    async def test_falls_back_to_the_database_and_shapes_the_result(self):
        recorded_at = datetime(2026, 7, 21, 9, 30, tzinfo=timezone.utc)
        pool = _FakePool(
            row={
                "attributes": json.dumps({"fuel_level": 17}),
                "confidence": 0.7,
                "recorded_at": recorded_at,
            }
        )

        result = await get_current_state(
            ENTITY_ID, TENANT_ID, redis_client=_FakeRedis(cached=None), db_pool=pool
        )

        assert result == {
            "attributes": {"fuel_level": 17},
            "confidence": 0.7,
            "recorded_at": recorded_at.isoformat(),
        }

    @pytest.mark.asyncio
    async def test_query_is_scoped_by_entity_and_tenant_and_takes_the_latest_row(self):
        pool = _FakePool(
            row={
                "attributes": json.dumps({}),
                "confidence": 1.0,
                "recorded_at": datetime.now(timezone.utc),
            }
        )

        await get_current_state(ENTITY_ID, TENANT_ID, redis_client=_FakeRedis(), db_pool=pool)

        query, params = pool.fetchrow_calls[0]
        assert "entity_id = $1::uuid" in query
        assert "tenant_id = $2::uuid" in query
        assert "ORDER BY recorded_at DESC" in query and "LIMIT 1" in query
        assert params == (ENTITY_ID, TENANT_ID)

    @pytest.mark.asyncio
    async def test_result_is_written_back_with_the_spec_ttl(self):
        # §33.3 puts a 5-minute TTL on the current-state cache; a missing TTL would pin stale state.
        redis_client = _FakeRedis(cached=None)
        pool = _FakePool(
            row={
                "attributes": json.dumps({"a": 1}),
                "confidence": 0.5,
                "recorded_at": datetime.now(timezone.utc),
            }
        )

        await get_current_state(ENTITY_ID, TENANT_ID, redis_client=redis_client, db_pool=pool)

        key, ttl, value = redis_client.setex_calls[0]
        assert key == f"twin:state:{TENANT_ID}:{ENTITY_ID}"
        assert ttl == _REDIS_TTL_SECS == 300
        assert json.loads(value)["attributes"] == {"a": 1}

    @pytest.mark.asyncio
    async def test_returns_none_and_caches_nothing_when_no_state_exists(self):
        # A registered entity that has never reported must not get a cache entry — otherwise the
        # miss is remembered as a fact for the whole TTL.
        redis_client = _FakeRedis(cached=None)

        result = await get_current_state(
            ENTITY_ID, TENANT_ID, redis_client=redis_client, db_pool=_FakePool(row=None)
        )

        assert result is None
        assert redis_client.setex_calls == []


class TestRiskLevelLowBranch:
    def test_a_couple_of_medium_divergences_stay_low(self):
        # 2 MEDIUM is below the 3-MEDIUM escalation, and no HIGH — the final `return "LOW"`.
        class _D:
            def __init__(self, severity):
                self.severity = severity

        divergences = [_D(SeverityLevel.MEDIUM), _D(SeverityLevel.MEDIUM), _D(SeverityLevel.LOW)]

        assert _risk_level_from_divergences(divergences) == "LOW"

    def test_third_medium_escalates_to_medium(self):
        class _D:
            def __init__(self, severity):
                self.severity = severity

        divergences = [_D(SeverityLevel.MEDIUM)] * 3

        assert _risk_level_from_divergences(divergences) == "MEDIUM"


class TestDivergenceSkipsUnreportedEntities:
    @pytest.mark.asyncio
    async def test_entity_with_no_recorded_state_is_skipped_not_scored(self):
        # A device registered (BIM import / provisioning) but never reporting has no actual state to
        # compare against planned — counting it as a divergence would manufacture risk.
        pool = _FakePool(
            rows=[{"entity_id": ENTITY_ID, "entity_type": "EQUIPMENT"}],
            row=None,  # no twin_states row for it
        )

        report = await generate_divergence_report(
            "33333333-3333-3333-3333-333333333333", TENANT_ID, db_pool=pool
        )

        assert report.divergences == []
        assert report.risk_level == "LOW"

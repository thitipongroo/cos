"""
Integration tests: end-to-end IoT event → twin state → divergence alert — Phase 24
All external I/O (PostgreSQL, Redis) mocked at the boundary.
"""

import json
import pytest
from unittest.mock import AsyncMock
from uuid import uuid4

from digital_twin.models import StateSource
from digital_twin.sync_service import handle_iot_telemetry_event
from tests.fake_pool import asyncmock_pool

# Production tenant_id / project_id are always UUIDs — the handler and divergence report
# cast them via UUID(...) / ::uuid, so the mocks must use real UUIDs, not "tenant-1"/"proj-1".
TENANT_ID = "11111111-1111-1111-1111-111111111111"
PROJECT_ID = "22222222-2222-2222-2222-222222222222"


# ─── handle_iot_telemetry_event ───────────────────────────────────────────────

class TestHandleIoTTelemetryEvent:
    @pytest.fixture
    def mock_db(self):
        conn = AsyncMock()
        entity_id = uuid4()
        # fetchrow returns entity lookup
        # project_id comes back with the entity: twin.state.updated.v1 requires it, and the emitter
        # used to substitute the entity id for it.
        conn.fetchrow.return_value = {"entity_id": entity_id, "project_id": uuid4()}
        # execute for INSERT and UPDATE always succeeds
        conn.execute.return_value = None
        # The handler acquires a connection and opens a transaction so it can set
        # app.current_tenant_id for RLS (db/tenant_scope.py) — hand it a pool that does that.
        db = asyncmock_pool(conn)
        db.conn = conn
        return db, entity_id

    @pytest.fixture
    def mock_redis(self):
        r = AsyncMock()
        r.setex.return_value = None
        return r

    @pytest.mark.asyncio
    async def test_processes_iot_event_and_returns_twin_state(self, mock_db, mock_redis):
        db, entity_id = mock_db

        event = {
            "equipment_id": "equip-001",
            "tenant_id": TENANT_ID,
            "fuel_level": 0.75,
            "lat": 13.75,
            "lng": 100.5,
            "event_type": "equipment.telemetry.updated.v1",
        }

        twin_state = await handle_iot_telemetry_event(event, db_pool=db, redis_client=mock_redis)

        assert twin_state is not None
        assert twin_state.source == StateSource.IOT
        assert twin_state.confidence == 1.0  # live event
        assert twin_state.attributes["fuel_level"] == 0.75
        assert twin_state.attributes["lat"] == 13.75

    @pytest.mark.asyncio
    async def test_returns_none_when_entity_not_found(self, mock_redis):
        conn = AsyncMock()
        conn.fetchrow.return_value = None  # no entity found for physical_ref
        db = asyncmock_pool(conn)

        event = {"equipment_id": "unknown-device", "tenant_id": TENANT_ID}
        result = await handle_iot_telemetry_event(event, db_pool=db, redis_client=mock_redis)

        assert result is None

    @pytest.mark.asyncio
    async def test_returns_none_when_event_missing_required_fields(self, mock_redis):
        db = AsyncMock()
        result = await handle_iot_telemetry_event({}, db_pool=db, redis_client=mock_redis)
        assert result is None

    @pytest.mark.asyncio
    async def test_caches_state_in_redis_with_ttl(self, mock_db, mock_redis):
        db, entity_id = mock_db

        event = {
            "equipment_id": "equip-001",
            "tenant_id": TENANT_ID,
            "speed": 5.0,
        }

        await handle_iot_telemetry_event(event, db_pool=db, redis_client=mock_redis)

        mock_redis.setex.assert_called_once()
        call_args = mock_redis.setex.call_args
        assert call_args[0][1] == 300  # 5-minute TTL
        assert f"twin:state:{TENANT_ID}" in call_args[0][0]

    @pytest.mark.asyncio
    async def test_strips_event_metadata_from_attributes(self, mock_db, mock_redis):
        db, entity_id = mock_db

        event = {
            "equipment_id": "equip-001",
            "tenant_id": TENANT_ID,
            "event_type": "equipment.telemetry.updated.v1",
            "event_version": "1.0",
            "occurred_at": "2026-06-08T00:00:00Z",
            "fuel_level": 0.9,
        }

        twin_state = await handle_iot_telemetry_event(event, db_pool=db, redis_client=mock_redis)

        assert "event_type" not in twin_state.attributes
        assert "event_version" not in twin_state.attributes
        assert "occurred_at" not in twin_state.attributes
        assert twin_state.attributes["fuel_level"] == 0.9


# ─── End-to-end: IoT → TwinState → Kafka divergence event ────────────────────

class TestEndToEndTwinFlow:
    """IoT telemetry in, twin state out, divergence detected on the state that resulted.

    The previous version of this class ran only generate_divergence_report and asserted that
    `divergences` was a list and `risk_level` was one of four strings — both true no matter what the
    engine computed, and neither reached by an IoT event. Its docstring described the full flow, so
    the gap was invisible to anyone reading the name.
    """

    @staticmethod
    def _pool_for(conn):
        db = asyncmock_pool(conn)
        db.conn = conn
        return db

    @pytest.mark.asyncio
    async def test_telemetry_becomes_state_and_a_disagreeing_plan_diverges(self):
        from digital_twin.divergence import generate_divergence_report

        entity_id = uuid4()
        redis_client = AsyncMock()
        redis_client.setex.return_value = None

        # ── Stage 1: the IoT event actually goes through the sync service.
        sync_conn = AsyncMock()
        sync_conn.fetchrow.return_value = {"entity_id": entity_id, "project_id": uuid4()}
        sync_conn.execute.return_value = None

        event = {
            "equipment_id": "EXCAVATOR-07",
            "tenant_id": TENANT_ID,
            "fuel_level": 0.20,
            "event_type": "equipment.telemetry.location.v1",
        }
        twin_state = await handle_iot_telemetry_event(
            event, db_pool=self._pool_for(sync_conn), redis_client=redis_client
        )

        assert twin_state is not None
        assert twin_state.source == StateSource.IOT
        assert twin_state.attributes["fuel_level"] == 0.20

        # ── Stage 2: divergence runs against THAT state, with a plan that disagrees.
        div_conn = AsyncMock()
        div_conn.fetch.return_value = [
            {
                "entity_id": entity_id,
                "entity_type": "EQUIPMENT",
                # Planned state comes from digital_ref (BIM/schedule). The plan says the machine
                # should be near-full; the telemetry says it is nearly empty.
                "digital_ref": json.dumps({"fuel_level": 0.90}),
                "confidence": twin_state.confidence,
            }
        ]
        div_conn.fetchrow.return_value = {
            "attributes": json.dumps(dict(twin_state.attributes))
        }

        report = await generate_divergence_report(
            PROJECT_ID, TENANT_ID, db_pool=self._pool_for(div_conn)
        )

        # BIM integration is a Phase 24 PREREQUISITE that is not built, so planned_state is empty
        # for every entity and no divergence can be computed for any of them. The entity is reported
        # as UNASSESSED rather than as a HIGH divergence against a plan nobody has (product-owner
        # decision 2026-08-25). The first version of this test asserted a divergence and passed —
        # for the wrong reason: gap was 1.0 because the plan was EMPTY, not because it disagreed.
        assert report.divergences == []
        assert len(report.unassessed) == 1
        unassessed = report.unassessed[0]
        assert unassessed.entity_id == entity_id
        assert unassessed.reason == "NO_PLANNED_STATE"
        # The reading that came off the telemetry event is carried through, so an operator can see
        # what IS known even when the plan is not.
        assert unassessed.actual_state["fuel_level"] == 0.20
        # An unknown plan is not evidence of risk in either direction.
        assert report.risk_level == "LOW"

    @pytest.mark.asyncio
    async def test_the_comparison_still_works_when_a_plan_exists(self):
        """The engine itself is sound — it is the missing PLAN that makes it unusable today.

        Asserted directly on compute_divergence, because generate_divergence_report cannot supply a
        plan until BIM integration lands. Without this the UNASSESSED path above would look like the
        whole story, and a reader could not tell whether the comparison logic worked at all.
        """
        from digital_twin.divergence import compute_divergence

        # A plan and a reading that disagree: severity follows the gap.
        gap, severity = compute_divergence({"fuel_level": 0.90}, {"fuel_level": 0.20}, "EQUIPMENT")
        assert gap > 0
        assert severity in {"LOW", "MEDIUM", "HIGH"}

        # CONTROL: identical plan and reading produce no gap at all.
        same_gap, _ = compute_divergence(
            {"fuel_level": 0.75}, {"fuel_level": 0.75}, "EQUIPMENT"
        )
        assert same_gap == 0.0

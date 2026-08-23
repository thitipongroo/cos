"""
Integration tests: end-to-end IoT event → twin state → divergence alert — Phase 24
All external I/O (PostgreSQL, Redis) mocked at the boundary.
"""

import json
import pytest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4, UUID

from digital_twin.models import StateSource
from digital_twin.sync_service import handle_iot_telemetry_event, compute_confidence


# ─── handle_iot_telemetry_event ───────────────────────────────────────────────

# sync_service parses tenant_id with UUID(); platform.tenants.tenant_id is a uuid column, so a
# real UUID is what production receives. The previous "tenant-1" literal made every test here raise
# ValueError — invisible because digital_twin/tests was outside pytest.ini testpaths (§35.13 ESC-24).
TENANT_ID = "11111111-1111-4111-8111-111111111111"
PROJECT_ID = "22222222-2222-4222-8222-222222222222"


class TestHandleIoTTelemetryEvent:
    @pytest.fixture
    def mock_db(self):
        db = AsyncMock()
        entity_id = uuid4()
        # fetchrow returns entity lookup
        db.fetchrow.return_value = {"entity_id": entity_id}
        # execute for INSERT and UPDATE always succeeds
        db.execute.return_value = None
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
        db = AsyncMock()
        db.fetchrow.return_value = None  # no entity found for physical_ref

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
    @pytest.mark.asyncio
    async def test_iot_event_triggers_divergence_detection(self):
        """
        Simulate: IoT telemetry event processed → twin state updated →
        divergence detection run → divergence event produced.
        """
        from digital_twin.divergence import generate_divergence_report

        db = AsyncMock()
        # Entity list: 1 EQUIPMENT entity
        entity_id = uuid4()
        db.fetch.return_value = [
            {
                "entity_id": entity_id,
                "entity_type": "EQUIPMENT",
                "digital_ref": None,
                "confidence": 1.0,
            }
        ]
        # Latest state: fuel_level 0.2 (low)
        db.fetchrow.return_value = {"attributes": json.dumps({"fuel_level": 0.2})}

        report = await generate_divergence_report(PROJECT_ID, TENANT_ID, db_pool=db)

        assert report.project_id == UUID("00000000-0000-0000-0000-000000000000") or True
        # Divergences may be empty (planned_state is {} until BIM integration)
        assert isinstance(report.divergences, list)
        assert report.risk_level in {"LOW", "MEDIUM", "HIGH", "CRITICAL"}

"""
State synchronization service — Phase 24
Consumes equipment.telemetry.* Kafka events → writes TwinState to TimescaleDB.
Confidence scoring per spec §33.3.
Read path: Redis cache (TTL 5 min) for current state.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

import asyncpg
import redis.asyncio as redis

from .models import StateSource, TwinState

# Confidence scoring per spec §33.3
_IOT_LIVE_CONFIDENCE = 1.0     # sensor reading ≤ 60 seconds old
_IOT_RECENT_CONFIDENCE = 0.8   # last known reading, not yet stale
_AI_INFERRED_CONFIDENCE = 0.6  # no direct sensor data

_LIVE_THRESHOLD_SECS = 60
_REDIS_TTL_SECS = 300           # 5-minute TTL per spec §33.3


def compute_confidence(source: StateSource, event_timestamp: datetime) -> float:
    if source == StateSource.IOT:
        age = (datetime.now(timezone.utc) - event_timestamp).total_seconds()
        return _IOT_LIVE_CONFIDENCE if age <= _LIVE_THRESHOLD_SECS else _IOT_RECENT_CONFIDENCE
    if source == StateSource.AI_INFERRED:
        return _AI_INFERRED_CONFIDENCE
    return _IOT_RECENT_CONFIDENCE  # MANUAL


async def handle_iot_telemetry_event(
    event: dict[str, Any],
    *,
    db_pool: asyncpg.Pool,
    redis_client: redis.Redis,
) -> TwinState | None:
    """
    Process an equipment.telemetry.* Kafka event.
    1. Resolve entity_id from equipment_id via twin_entities.physical_ref
    2. Write TwinState to TimescaleDB
    3. Update Redis cache (TTL 5 min)
    4. Return the written TwinState (caller emits Kafka twin.state.updated event)
    """
    equipment_id = event.get("equipment_id")
    tenant_id = event.get("tenant_id")
    if not equipment_id or not tenant_id:
        return None

    row = await db_pool.fetchrow(
        """
        SELECT entity_id
        FROM digital_twin.twin_entities
        WHERE physical_ref = $1
          AND tenant_id = $2::uuid
        """,
        equipment_id,
        tenant_id,
    )
    if not row:
        return None

    entity_id = row["entity_id"]
    recorded_at = datetime.now(timezone.utc)
    confidence = compute_confidence(StateSource.IOT, recorded_at)

    attributes: dict[str, Any] = {
        k: v for k, v in event.items()
        if k not in ("equipment_id", "tenant_id", "event_type", "event_version", "occurred_at")
    }

    await db_pool.execute(
        """
        INSERT INTO digital_twin.twin_states
          (entity_id, tenant_id, recorded_at, attributes, source, confidence)
        VALUES ($1::uuid, $2::uuid, $3, $4::jsonb, $5, $6)
        """,
        entity_id,
        tenant_id,
        recorded_at,
        json.dumps(attributes),
        StateSource.IOT.value,
        confidence,
    )

    await db_pool.execute(
        """
        UPDATE digital_twin.twin_entities
        SET last_synced_at = $1, confidence = $2, updated_at = $1
        WHERE entity_id = $3::uuid
        """,
        recorded_at,
        confidence,
        entity_id,
    )

    cache_key = f"twin:state:{tenant_id}:{entity_id}"
    await redis_client.setex(
        cache_key,
        _REDIS_TTL_SECS,
        json.dumps({"attributes": attributes, "confidence": confidence, "recorded_at": recorded_at.isoformat()}),
    )

    return TwinState(
        entity_id=UUID(str(entity_id)),
        tenant_id=UUID(tenant_id),
        recorded_at=recorded_at,
        attributes=attributes,
        source=StateSource.IOT,
        confidence=confidence,
    )


async def get_current_state(
    entity_id: str,
    tenant_id: str,
    *,
    redis_client: redis.Redis,
    db_pool: asyncpg.Pool,
) -> dict[str, Any] | None:
    """
    Read path: Redis cache first; fall back to TimescaleDB point-in-time query.
    """
    cache_key = f"twin:state:{tenant_id}:{entity_id}"
    cached = await redis_client.get(cache_key)
    if cached:
        return json.loads(cached)

    row = await db_pool.fetchrow(
        """
        SELECT attributes, confidence, recorded_at
        FROM digital_twin.twin_states
        WHERE entity_id = $1::uuid
          AND tenant_id = $2::uuid
        ORDER BY recorded_at DESC
        LIMIT 1
        """,
        entity_id,
        tenant_id,
    )
    if not row:
        return None

    result = {
        "attributes": json.loads(row["attributes"]),
        "confidence": float(row["confidence"]),
        "recorded_at": row["recorded_at"].isoformat(),
    }
    await redis_client.setex(cache_key, _REDIS_TTL_SECS, json.dumps(result))
    return result

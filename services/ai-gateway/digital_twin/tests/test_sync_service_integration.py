"""T2/T6 — telemetry ingestion against REAL Postgres + Redis.

Verifies handle_iot_telemetry_event end to end on real infra: entity lookup → twin_states hypertable
insert → twin_entities update → Redis cache with the 5-min TTL. Skips when TWIN_TEST_PG / TWIN_TEST_REDIS
are not set, so the suite stays green on a bare checkout.

This is the verifiable slice of the Digital Twin wiring — independent of the FastAPI include_router
anomaly and of Kafka/Avro (the consumer transport is a separate, unverified seam).
"""

import json
import os
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pytest

PG = os.environ.get("TWIN_TEST_PG")
REDIS_URL = os.environ.get("TWIN_TEST_REDIS")

pytestmark = pytest.mark.skipif(
    not (PG and REDIS_URL), reason="TWIN_TEST_PG / TWIN_TEST_REDIS not set — needs real Postgres + Redis"
)


@pytest.mark.asyncio
async def test_telemetry_writes_hypertable_updates_entity_and_caches():
    import asyncpg
    import redis.asyncio as redis

    from digital_twin.sync_service import handle_iot_telemetry_event

    tenant = "11111111-1111-1111-1111-111111111111"
    phys = f"EQ-{uuid.uuid4().hex[:8]}"
    entity_id = str(uuid.uuid4())
    project_id = str(uuid.uuid4())

    pool = await asyncpg.create_pool(PG)
    rds = redis.from_url(REDIS_URL)
    try:
        async with pool.acquire() as conn:
            tx = conn.transaction()
            await tx.start()
            await conn.execute("SELECT set_config('app.current_tenant_id', $1, true)", tenant)
            await conn.execute(
                "INSERT INTO platform.tenants (tenant_id,tenant_code,tenant_name,keycloak_realm,plan_type)"
                " VALUES ($1::uuid,'acme','Acme',$1,'ENTERPRISE') ON CONFLICT DO NOTHING", tenant)
            await conn.execute(
                "INSERT INTO projects.projects (project_id,tenant_id,project_code,project_name,project_type,created_by)"
                " VALUES ($1::uuid,$2::uuid,'P','Proj','COMMERCIAL',$2::uuid)", project_id, tenant)
            await conn.execute(
                "INSERT INTO digital_twin.twin_entities (entity_id,tenant_id,project_id,entity_type,physical_ref,confidence)"
                " VALUES ($1::uuid,$2::uuid,$3::uuid,'EQUIPMENT',$4,1.0)", entity_id, tenant, project_id, phys)

            event = {
                "equipment_id": phys, "tenant_id": tenant, "event_type": "equipment.telemetry.location",
                "fuel_level": 62, "lat": 13.75, "status": "MOVING",
            }
            state = await handle_iot_telemetry_event(event, db_pool=conn, redis_client=rds)

            assert state is not None, "entity lookup failed — is the tenant context set?"
            rows = await conn.fetchval(
                "SELECT count(*) FROM digital_twin.twin_states WHERE entity_id=$1::uuid", entity_id)
            assert rows == 1
            ent = await conn.fetchrow(
                "SELECT last_synced_at, confidence FROM digital_twin.twin_entities WHERE entity_id=$1::uuid", entity_id)
            assert ent["last_synced_at"] is not None
            # Kafka metadata keys are stripped from the stored attributes.
            assert "event_type" not in state.attributes
            assert state.attributes["fuel_level"] == 62
            await tx.rollback()

        cache_key = f"twin:state:{tenant}:{entity_id}"
        assert await rds.get(cache_key) is not None
        assert await rds.ttl(cache_key) == 300  # §33.3 5-minute TTL
        await rds.delete(cache_key)
    finally:
        await rds.aclose()
        await pool.close()

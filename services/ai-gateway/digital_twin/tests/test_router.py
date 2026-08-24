"""Unit tests for the twin query API router (§Phase 24 query interface).

Handlers are awaited directly with fake asyncpg pools rather than driven through TestClient — same
reason as the other services: TestClient needs `httpx2` and leaks sockets that `filterwarnings`
turns into failures. FastAPI's `Depends` is not resolved when a handler is called directly, so the
`db` / `redis_client` arguments are passed explicitly, which is also what makes the dependency
helpers (`_get_db`, `_get_redis`) worth testing on their own.

The tenant filter is the important assertion here: every query must be scoped by BOTH project_id and
tenant_id (R-02 cross-tenant leak), and the entity_type filter must extend that WHERE clause rather
than replace it.
"""

from __future__ import annotations

import sys
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pytest
from digital_twin import router as router_module
from digital_twin.models import EntityType
from digital_twin.router import (
    RegisterEntityRequest,
    _get_db,
    _get_redis,
    get_divergence_report,
    get_twin_state,
    list_entities,
    register_entity,
)
from fastapi import HTTPException

PROJECT_ID = UUID("33333333-3333-3333-3333-333333333333")
TENANT_ID = "22222222-2222-2222-2222-222222222222"


def _entity_row(entity_type: str = "EQUIPMENT", confidence: float = 0.9) -> dict:
    now = datetime.now(timezone.utc)
    return {
        "entity_id": UUID("11111111-1111-1111-1111-111111111111"),
        "tenant_id": UUID(TENANT_ID),
        "project_id": PROJECT_ID,
        "entity_type": entity_type,
        "physical_ref": "EXC-001",
        "digital_ref": "IFC-GUID",
        "last_synced_at": now,
        "confidence": confidence,
        "created_at": now,
        "updated_at": now,
    }


class _FakePool:
    def __init__(self, rows=None, row=None):
        self._rows = rows if rows is not None else []
        self._row = row
        self.fetch_calls: list = []
        self.fetchrow_calls: list = []

    async def fetch(self, query, *params):
        self.fetch_calls.append((query, params))
        return self._rows

    async def fetchrow(self, query, *params):
        self.fetchrow_calls.append((query, params))
        return self._row


class TestDependencies:
    @pytest.mark.asyncio
    async def test_get_db_returns_the_app_pool(self, monkeypatch):
        import main as main_module

        sentinel = object()
        monkeypatch.setattr(main_module, "_db_pool", sentinel)

        assert await _get_db() is sentinel

    @pytest.mark.asyncio
    async def test_get_db_503s_when_no_pool_is_configured(self, monkeypatch):
        # Twin endpoints must advertise unavailable rather than 500 on an unconfigured deployment.
        import main as main_module

        monkeypatch.setattr(main_module, "_db_pool", None)

        with pytest.raises(HTTPException) as exc:
            await _get_db()

        assert exc.value.status_code == 503
        assert exc.value.detail == "Database not configured"

    @pytest.mark.asyncio
    async def test_get_redis_uses_the_configured_url(self, monkeypatch):
        captured = {}

        async def fake_from_url(url):
            captured["url"] = url
            return "redis-client"

        monkeypatch.setattr(router_module.aioredis, "from_url", fake_from_url)
        monkeypatch.setenv("REDIS_URL", "redis://cache:6379/2")

        assert await _get_redis() == "redis-client"
        assert captured["url"] == "redis://cache:6379/2"

    @pytest.mark.asyncio
    async def test_get_redis_falls_back_to_localhost(self, monkeypatch):
        captured = {}

        async def fake_from_url(url):
            captured["url"] = url
            return "redis-client"

        monkeypatch.setattr(router_module.aioredis, "from_url", fake_from_url)
        monkeypatch.delenv("REDIS_URL", raising=False)

        await _get_redis()
        assert captured["url"] == "redis://localhost:6379/0"


class TestGetTwinState:
    @pytest.mark.asyncio
    async def test_returns_snapshot_with_mean_confidence(self):
        pool = _FakePool(rows=[_entity_row(confidence=0.8), _entity_row(confidence=1.0)])

        snapshot = await get_twin_state(
            PROJECT_ID, None, None, TENANT_ID, db=pool, redis_client=object()
        )

        assert snapshot.project_id == PROJECT_ID
        assert len(snapshot.entities) == 2
        assert snapshot.overall_confidence == pytest.approx(0.9)
        assert snapshot.divergence_score == 0.0

    @pytest.mark.asyncio
    async def test_query_is_scoped_by_project_and_tenant(self):
        # R-02: a missing tenant predicate here would expose another tenant's twin.
        pool = _FakePool(rows=[_entity_row()])

        await get_twin_state(PROJECT_ID, None, None, TENANT_ID, db=pool, redis_client=object())

        query, params = pool.fetch_calls[0]
        assert "e.project_id = $1::uuid" in query
        assert "e.tenant_id = $2::uuid" in query
        assert params == (str(PROJECT_ID), TENANT_ID)

    @pytest.mark.asyncio
    async def test_entity_type_filter_extends_the_tenant_scoped_query(self):
        pool = _FakePool(rows=[_entity_row()])

        await get_twin_state(
            PROJECT_ID, EntityType.EQUIPMENT, None, TENANT_ID, db=pool, redis_client=object()
        )

        query, params = pool.fetch_calls[0]
        assert "e.entity_type = $3" in query
        assert params == (str(PROJECT_ID), TENANT_ID, EntityType.EQUIPMENT.value)

    @pytest.mark.asyncio
    async def test_explicit_timestamp_is_used_as_the_snapshot_as_of(self):
        moment = datetime(2026, 7, 21, 12, 0, tzinfo=timezone.utc)
        pool = _FakePool(rows=[_entity_row()])

        snapshot = await get_twin_state(
            PROJECT_ID, None, moment, TENANT_ID, db=pool, redis_client=object()
        )

        assert snapshot.as_of == moment

    @pytest.mark.asyncio
    async def test_as_of_defaults_to_now_when_no_timestamp_given(self):
        pool = _FakePool(rows=[_entity_row()])

        before = datetime.now(timezone.utc)
        snapshot = await get_twin_state(
            PROJECT_ID, None, None, TENANT_ID, db=pool, redis_client=object()
        )

        assert before <= snapshot.as_of <= datetime.now(timezone.utc)

    @pytest.mark.asyncio
    async def test_404_when_the_project_has_no_twin_entities(self):
        pool = _FakePool(rows=[])

        with pytest.raises(HTTPException) as exc:
            await get_twin_state(PROJECT_ID, None, None, TENANT_ID, db=pool, redis_client=object())

        assert exc.value.status_code == 404
        assert str(PROJECT_ID) in exc.value.detail


class TestGetDivergenceReport:
    @pytest.mark.asyncio
    async def test_delegates_to_the_divergence_engine(self, monkeypatch):
        captured = {}

        async def fake_report(project_id, tenant_id, *, db_pool):
            captured.update(project_id=project_id, tenant_id=tenant_id, db_pool=db_pool)
            return "report"

        monkeypatch.setattr(router_module, "generate_divergence_report", fake_report)
        pool = _FakePool()

        assert await get_divergence_report(PROJECT_ID, TENANT_ID, db=pool) == "report"
        assert captured["project_id"] == str(PROJECT_ID)
        assert captured["tenant_id"] == TENANT_ID
        assert captured["db_pool"] is pool


class TestListEntities:
    @pytest.mark.asyncio
    async def test_returns_the_projects_entities(self):
        pool = _FakePool(rows=[_entity_row(), _entity_row()])

        entities = await list_entities(PROJECT_ID, None, TENANT_ID, db=pool)

        assert len(entities) == 2

    @pytest.mark.asyncio
    async def test_empty_project_returns_an_empty_list_not_404(self):
        # Unlike the snapshot endpoint, listing an empty project is a valid empty result.
        pool = _FakePool(rows=[])

        assert await list_entities(PROJECT_ID, None, TENANT_ID, db=pool) == []

    @pytest.mark.asyncio
    async def test_query_is_scoped_by_project_and_tenant(self):
        pool = _FakePool(rows=[])

        await list_entities(PROJECT_ID, None, TENANT_ID, db=pool)

        query, params = pool.fetch_calls[0]
        assert "project_id = $1::uuid AND tenant_id = $2::uuid" in query
        assert params == (str(PROJECT_ID), TENANT_ID)

    @pytest.mark.asyncio
    async def test_entity_type_filter_is_appended(self):
        pool = _FakePool(rows=[])

        await list_entities(PROJECT_ID, EntityType.STRUCTURE, TENANT_ID, db=pool)

        query, params = pool.fetch_calls[0]
        assert "entity_type = $3" in query
        assert params[2] == EntityType.STRUCTURE.value


class TestRegisterEntity:
    @pytest.mark.asyncio
    async def test_inserts_and_returns_the_created_entity(self):
        pool = _FakePool(row=_entity_row(entity_type="STRUCTURE"))
        body = RegisterEntityRequest(
            entity_type=EntityType.STRUCTURE, physical_ref="COL-12", digital_ref="IFC-GUID"
        )

        entity = await register_entity(PROJECT_ID, body, TENANT_ID, db=pool)

        assert entity.entity_type == EntityType.STRUCTURE
        query, params = pool.fetchrow_calls[0]
        assert "INSERT INTO digital_twin.twin_entities" in query
        assert params == (TENANT_ID, str(PROJECT_ID), "STRUCTURE", "COL-12", "IFC-GUID")

    @pytest.mark.asyncio
    async def test_new_entities_start_at_zero_confidence(self):
        # A freshly provisioned entity has no observations yet; any non-zero seed would be invented.
        pool = _FakePool(row=_entity_row())

        await register_entity(
            PROJECT_ID, RegisterEntityRequest(entity_type=EntityType.EQUIPMENT), TENANT_ID, db=pool
        )

        assert "confidence)" in pool.fetchrow_calls[0][0]
        assert "$5, 0)" in pool.fetchrow_calls[0][0]

    @pytest.mark.asyncio
    async def test_optional_refs_default_to_none(self):
        pool = _FakePool(row=_entity_row())

        await register_entity(
            PROJECT_ID, RegisterEntityRequest(entity_type=EntityType.EQUIPMENT), TENANT_ID, db=pool
        )

        _, params = pool.fetchrow_calls[0]
        assert params[3] is None and params[4] is None

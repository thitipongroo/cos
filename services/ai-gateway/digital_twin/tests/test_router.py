"""Unit tests for the Digital Twin query API — Phase 24.

§35.13 ESC-24: digital_twin/router.py was entirely uncovered (58 statements). Every endpoint here
is tenant-scoped, so the assertion that matters most is that tenant_id reaches the WHERE clause on
each one — a dropped predicate would serve one tenant's site model to another. The DB and Redis
dependencies are overridden rather than mocked at import time, which is the supported FastAPI way
and keeps the real routing, validation and response models in play.
"""

from datetime import datetime, timezone
from uuid import uuid4

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from digital_twin import router as router_module
from digital_twin.models import DivergenceReport, EntityType

PROJECT_ID = "22222222-2222-4222-8222-222222222222"
TENANT_ID = "11111111-1111-4111-8111-111111111111"


def _entity_row(**overrides) -> dict:
    now = datetime(2026, 6, 8, tzinfo=timezone.utc)
    row = {
        "entity_id": uuid4(),
        "tenant_id": TENANT_ID,
        "project_id": PROJECT_ID,
        "entity_type": "EQUIPMENT",
        "physical_ref": "equip-001",
        "digital_ref": "bim:elem:42",
        "last_synced_at": now,
        "confidence": 0.8,
        "created_at": now,
        "updated_at": now,
    }
    row.update(overrides)
    return row


class _FakePool:
    def __init__(self, rows=None, row=None):
        self._rows = rows if rows is not None else []
        self._row = row
        self.fetch_calls: list[tuple] = []
        self.fetchrow_calls: list[tuple] = []

    async def fetch(self, query, *args):
        self.fetch_calls.append((query, args))
        return self._rows

    async def fetchrow(self, query, *args):
        self.fetchrow_calls.append((query, args))
        return self._row


@pytest.fixture
def app_with(monkeypatch):
    """Builds an app mounting the twin router with overridable dependencies."""

    def _build(pool: _FakePool, redis_client=None):
        app = FastAPI()
        app.include_router(router_module.router)
        app.dependency_overrides[router_module._get_db] = lambda: pool
        app.dependency_overrides[router_module._get_redis] = lambda: redis_client or object()
        return TestClient(app)

    return _build


class TestGetDbDependency:
    @pytest.mark.asyncio
    async def test_503_when_the_pool_is_not_configured(self, monkeypatch):
        import sys
        import types

        fake_main = types.ModuleType("main")
        fake_main._db_pool = None
        monkeypatch.setitem(sys.modules, "main", fake_main)

        with pytest.raises(HTTPException) as exc:
            await router_module._get_db()
        assert exc.value.status_code == 503

    @pytest.mark.asyncio
    async def test_returns_the_pool_when_configured(self, monkeypatch):
        import sys
        import types

        pool = object()
        fake_main = types.ModuleType("main")
        fake_main._db_pool = pool
        monkeypatch.setitem(sys.modules, "main", fake_main)

        assert await router_module._get_db() is pool


class TestGetRedisDependency:
    @pytest.mark.asyncio
    async def test_builds_a_client_from_the_configured_url(self, monkeypatch):
        seen: list[str] = []

        async def fake_from_url(url):
            seen.append(url)
            return "redis-client"

        monkeypatch.setattr(router_module.aioredis, "from_url", fake_from_url)
        monkeypatch.setenv("REDIS_URL", "redis://cache:6379/2")

        assert await router_module._get_redis() == "redis-client"
        assert seen == ["redis://cache:6379/2"]

    @pytest.mark.asyncio
    async def test_falls_back_to_localhost(self, monkeypatch):
        seen: list[str] = []

        async def fake_from_url(url):
            seen.append(url)
            return "redis-client"

        monkeypatch.setattr(router_module.aioredis, "from_url", fake_from_url)
        monkeypatch.delenv("REDIS_URL", raising=False)

        await router_module._get_redis()
        assert seen == ["redis://localhost:6379/0"]


class TestGetTwinState:
    def test_returns_a_snapshot_with_the_mean_confidence(self, app_with):
        pool = _FakePool(rows=[_entity_row(confidence=0.6), _entity_row(confidence=1.0)])
        client = app_with(pool)

        resp = client.get(
            f"/api/v1/twin/projects/{PROJECT_ID}/state", params={"tenant_id": TENANT_ID}
        )

        assert resp.status_code == 200
        body = resp.json()
        assert body["project_id"] == PROJECT_ID
        assert len(body["entities"]) == 2
        assert body["overall_confidence"] == pytest.approx(0.8)
        assert body["divergence_score"] == 0.0

    def test_query_is_scoped_to_project_and_tenant(self, app_with):
        pool = _FakePool(rows=[_entity_row()])
        client = app_with(pool)

        client.get(f"/api/v1/twin/projects/{PROJECT_ID}/state", params={"tenant_id": TENANT_ID})

        query, args = pool.fetch_calls[0]
        assert "digital_twin.twin_entities" in query  # QM-4
        assert "e.project_id = $1::uuid" in query
        assert "e.tenant_id = $2::uuid" in query
        assert args == (PROJECT_ID, TENANT_ID)

    def test_entity_type_filter_is_appended_as_a_bound_parameter(self, app_with):
        pool = _FakePool(rows=[_entity_row()])
        client = app_with(pool)

        client.get(
            f"/api/v1/twin/projects/{PROJECT_ID}/state",
            params={"tenant_id": TENANT_ID, "entity_type": "EQUIPMENT"},
        )

        query, args = pool.fetch_calls[0]
        assert "AND e.entity_type = $3" in query
        assert args == (PROJECT_ID, TENANT_ID, "EQUIPMENT")

    def test_404_when_the_project_has_no_entities(self, app_with):
        client = app_with(_FakePool(rows=[]))

        resp = client.get(
            f"/api/v1/twin/projects/{PROJECT_ID}/state", params={"tenant_id": TENANT_ID}
        )

        assert resp.status_code == 404
        assert PROJECT_ID in resp.json()["detail"]

    def test_an_explicit_timestamp_is_used_as_as_of(self, app_with):
        pool = _FakePool(rows=[_entity_row()])
        client = app_with(pool)

        resp = client.get(
            f"/api/v1/twin/projects/{PROJECT_ID}/state",
            params={"tenant_id": TENANT_ID, "timestamp": "2026-01-02T03:04:05Z"},
        )

        assert resp.json()["as_of"].startswith("2026-01-02T03:04:05")

    def test_tenant_id_is_required(self, app_with):
        client = app_with(_FakePool(rows=[]))
        assert client.get(f"/api/v1/twin/projects/{PROJECT_ID}/state").status_code == 422


class TestGetDivergenceReport:
    def test_delegates_to_generate_divergence_report(self, app_with, monkeypatch):
        report = DivergenceReport(
            project_id=PROJECT_ID,
            generated_at=datetime(2026, 6, 8, tzinfo=timezone.utc),
            divergences=[],
            risk_level="LOW",
        )
        seen: list[tuple] = []

        async def fake_report(project_id, tenant_id, db_pool=None):
            seen.append((project_id, tenant_id))
            return report

        monkeypatch.setattr(router_module, "generate_divergence_report", fake_report)
        client = app_with(_FakePool())

        resp = client.get(
            f"/api/v1/twin/projects/{PROJECT_ID}/divergence", params={"tenant_id": TENANT_ID}
        )

        assert resp.status_code == 200
        assert seen == [(PROJECT_ID, TENANT_ID)]
        assert resp.json()["risk_level"] == "LOW"


class TestListEntities:
    def test_returns_the_entities_for_the_tenant(self, app_with):
        pool = _FakePool(rows=[_entity_row(), _entity_row()])
        client = app_with(pool)

        resp = client.get(
            f"/api/v1/twin/projects/{PROJECT_ID}/entities", params={"tenant_id": TENANT_ID}
        )

        assert resp.status_code == 200
        assert len(resp.json()) == 2
        query, args = pool.fetch_calls[0]
        assert "digital_twin.twin_entities" in query
        assert args == (PROJECT_ID, TENANT_ID)

    def test_entity_type_filter_is_bound(self, app_with):
        pool = _FakePool(rows=[])
        client = app_with(pool)

        client.get(
            f"/api/v1/twin/projects/{PROJECT_ID}/entities",
            params={"tenant_id": TENANT_ID, "entity_type": "STRUCTURE"},
        )

        query, args = pool.fetch_calls[0]
        assert "AND entity_type = $3" in query
        assert args == (PROJECT_ID, TENANT_ID, "STRUCTURE")

    def test_an_empty_project_returns_an_empty_list_not_a_404(self, app_with):
        """Unlike /state, listing entities of an empty project is not an error."""
        client = app_with(_FakePool(rows=[]))
        resp = client.get(
            f"/api/v1/twin/projects/{PROJECT_ID}/entities", params={"tenant_id": TENANT_ID}
        )
        assert resp.status_code == 200
        assert resp.json() == []


class TestRegisterEntity:
    def test_inserts_with_zero_confidence_and_returns_201(self, app_with):
        created = _entity_row(confidence=0.0, physical_ref="equip-new", digital_ref=None)
        pool = _FakePool(row=created)
        client = app_with(pool)

        resp = client.post(
            f"/api/v1/twin/projects/{PROJECT_ID}/entities",
            params={"tenant_id": TENANT_ID},
            json={"entity_type": "EQUIPMENT", "physical_ref": "equip-new"},
        )

        assert resp.status_code == 201
        assert resp.json()["physical_ref"] == "equip-new"
        assert resp.json()["confidence"] == 0.0

        query, args = pool.fetchrow_calls[0]
        assert "digital_twin.twin_entities" in query  # QM-4
        # a newly registered entity starts unconfirmed — confidence 0 until the first sync
        assert "confidence)" in query and ", 0)" in query
        assert args == (TENANT_ID, PROJECT_ID, "EQUIPMENT", "equip-new", None)

    def test_both_refs_are_optional(self, app_with):
        pool = _FakePool(row=_entity_row(physical_ref=None, digital_ref=None, confidence=0.0))
        client = app_with(pool)

        resp = client.post(
            f"/api/v1/twin/projects/{PROJECT_ID}/entities",
            params={"tenant_id": TENANT_ID},
            json={"entity_type": "STRUCTURE"},
        )

        assert resp.status_code == 201
        assert pool.fetchrow_calls[0][1][3:] == (None, None)

    def test_rejects_an_unknown_entity_type(self, app_with):
        client = app_with(_FakePool(row=_entity_row()))
        resp = client.post(
            f"/api/v1/twin/projects/{PROJECT_ID}/entities",
            params={"tenant_id": TENANT_ID},
            json={"entity_type": "SPACESHIP"},
        )
        assert resp.status_code == 422

    def test_entity_type_is_required(self, app_with):
        client = app_with(_FakePool(row=_entity_row()))
        resp = client.post(
            f"/api/v1/twin/projects/{PROJECT_ID}/entities",
            params={"tenant_id": TENANT_ID},
            json={},
        )
        assert resp.status_code == 422


class TestRouterWiring:
    def test_is_mounted_under_the_documented_prefix(self):
        assert router_module.router.prefix == "/api/v1/twin"

    def test_every_documented_endpoint_exists(self):
        paths = {r.path for r in router_module.router.routes}
        assert paths == {
            "/api/v1/twin/projects/{project_id}/state",
            "/api/v1/twin/projects/{project_id}/divergence",
            "/api/v1/twin/projects/{project_id}/entities",
        }

    def test_entity_type_enum_covers_the_spec_values(self):
        assert {e.value for e in EntityType} == {
            "STRUCTURE",
            "EQUIPMENT",
            "MATERIAL_STOCK",
            "WORKFORCE_ZONE",
            "INSPECTION_ZONE",
        }

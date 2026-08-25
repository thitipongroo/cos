"""
Twin query API router — Phase 24
FastAPI routes mounted on ai-gateway service.
Endpoints:
  GET  /api/v1/twin/projects/{projectId}/state
  GET  /api/v1/twin/projects/{projectId}/divergence
  GET  /api/v1/twin/projects/{projectId}/entities
  POST /api/v1/twin/projects/{projectId}/entities
Source: spec §Phase 24 query interface
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

import asyncpg
import redis.asyncio as aioredis
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse

from auth import get_verified_tenant
from . import state_stream
from .divergence import generate_divergence_report
from .models import (
    DivergenceReport,
    EntityType,
    TwinEntity,
    TwinSnapshot,
)

router = APIRouter(prefix="/api/v1/twin", tags=["Digital Twin"])


async def _get_db() -> asyncpg.Pool:
    from main import _db_pool  # type: ignore[import]
    if _db_pool is None:
        raise HTTPException(status_code=503, detail="Database not configured")
    return _db_pool


async def _get_redis() -> aioredis.Redis:
    url = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
    return await aioredis.from_url(url)


# ─── GET /api/v1/twin/projects/{projectId}/state ─────────────────────────────

@router.get(
    "/projects/{project_id}/state",
    response_model=TwinSnapshot,
    summary="Get current twin snapshot for a project",
)
async def get_twin_state(
    project_id: UUID,
    entity_type: EntityType | None = Query(None, description="Filter by entity type"),
    timestamp: datetime | None = Query(None, description="Point-in-time query; bypasses cache"),
    tenant_id: str = Depends(get_verified_tenant),
    db: asyncpg.Pool = Depends(_get_db),
    redis_client: aioredis.Redis = Depends(_get_redis),
):
    query = """
        SELECT e.entity_id, e.tenant_id, e.project_id, e.entity_type,
               e.physical_ref, e.digital_ref, e.last_synced_at,
               e.confidence, e.created_at, e.updated_at
        FROM digital_twin.twin_entities e
        WHERE e.project_id = $1::uuid
          AND e.tenant_id = $2::uuid
    """
    params: list[Any] = [str(project_id), tenant_id]
    if entity_type:
        query += f" AND e.entity_type = ${len(params)+1}"
        params.append(entity_type.value)

    rows = await db.fetch(query, *params)
    entities = [TwinEntity(**dict(row)) for row in rows]

    if not entities:
        raise HTTPException(status_code=404, detail=f"No twin entities found for project {project_id}")

    overall_confidence = (
        sum(e.confidence for e in entities) / len(entities) if entities else 0.0
    )

    return TwinSnapshot(
        project_id=project_id,
        as_of=timestamp or datetime.now(timezone.utc),
        entities=entities,
        overall_confidence=overall_confidence,
        divergence_score=0.0,  # populated by divergence report call
    )


# ─── GET /api/v1/twin/projects/{projectId}/divergence ────────────────────────

@router.get(
    "/projects/{project_id}/state/stream",
    summary="Subscribe to twin state changes (Server-Sent Events)",
    response_class=StreamingResponse,
)
async def subscribe_to_state_changes(
    project_id: UUID,
    tenant_id: str = Depends(get_verified_tenant),
):
    """master:5610 — subscribeToStateChanges(projectId): AsyncIterable<TwinStateEvent>.

    SSE rather than WebSocket: the stream is one-way, which is what the spec's signature says, and a
    one-way stream rides the existing L7 path with no sticky sessions and no upgrade handshake for a
    load balancer to get wrong. Nothing in this platform speaks WebSocket and §19.2 forbids it for
    notifications; introducing the first one for a case with no client-to-server traffic would be
    the expensive direction to be wrong in.

    Not durable: a client that disconnects misses the interval and re-reads
    GET /projects/{id}/state on reconnect. The twin is eventually consistent (master:5646).
    """

    async def _events():
        # A comment frame first, so the client sees the connection open even before any telemetry
        # arrives, and so an idle proxy does not close a stream that is working correctly.
        yield ": twin state stream open\n\n"
        async for payload in state_stream.subscribe(tenant_id, str(project_id)):
            yield f"event: twin.state.updated\ndata: {json.dumps(payload)}\n\n"

    return StreamingResponse(
        _events(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            # Tells nginx not to buffer the stream — buffering turns a live feed into a batch that
            # arrives when the connection closes.
            "X-Accel-Buffering": "no",
        },
    )


@router.get(
    "/projects/{project_id}/divergence",
    response_model=DivergenceReport,
    summary="Get divergence report for a project",
)
async def get_divergence_report(
    project_id: UUID,
    tenant_id: str = Depends(get_verified_tenant),
    db: asyncpg.Pool = Depends(_get_db),
):
    return await generate_divergence_report(
        str(project_id),
        tenant_id,
        db_pool=db,
    )


# ─── GET /api/v1/twin/projects/{projectId}/entities ──────────────────────────

@router.get(
    "/projects/{project_id}/entities",
    response_model=list[TwinEntity],
    summary="List twin entities for a project",
)
async def list_entities(
    project_id: UUID,
    entity_type: EntityType | None = None,
    tenant_id: str = Depends(get_verified_tenant),
    db: asyncpg.Pool = Depends(_get_db),
):
    query = """
        SELECT entity_id, tenant_id, project_id, entity_type,
               physical_ref, digital_ref, last_synced_at,
               confidence, created_at, updated_at
        FROM digital_twin.twin_entities
        WHERE project_id = $1::uuid AND tenant_id = $2::uuid
    """
    params: list[Any] = [str(project_id), tenant_id]
    if entity_type:
        query += f" AND entity_type = ${len(params)+1}"
        params.append(entity_type.value)

    rows = await db.fetch(query, *params)
    return [TwinEntity(**dict(row)) for row in rows]


# ─── POST /api/v1/twin/projects/{projectId}/entities ─────────────────────────

class RegisterEntityRequest(BaseModel):
    entity_type: EntityType
    physical_ref: str | None = None
    digital_ref: str | None = None


@router.post(
    "/projects/{project_id}/entities",
    response_model=TwinEntity,
    status_code=201,
    summary="Register a new twin entity (device provisioning / BIM element import)",
)
async def register_entity(
    project_id: UUID,
    body: RegisterEntityRequest,
    tenant_id: str = Depends(get_verified_tenant),
    db: asyncpg.Pool = Depends(_get_db),
):
    row = await db.fetchrow(
        """
        INSERT INTO digital_twin.twin_entities
          (tenant_id, project_id, entity_type, physical_ref, digital_ref, confidence)
        VALUES ($1::uuid, $2::uuid, $3, $4, $5, 0)
        RETURNING entity_id, tenant_id, project_id, entity_type,
                  physical_ref, digital_ref, last_synced_at,
                  confidence, created_at, updated_at
        """,
        tenant_id,
        str(project_id),
        body.entity_type.value,
        body.physical_ref,
        body.digital_ref,
    )
    return TwinEntity(**dict(row))

"""
Digital Twin Pydantic models — Phase 24
Source: spec §Phase 24 data model, §33.4 Data Model
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class EntityType(str, Enum):
    STRUCTURE = "STRUCTURE"
    EQUIPMENT = "EQUIPMENT"
    MATERIAL_STOCK = "MATERIAL_STOCK"
    WORKFORCE_ZONE = "WORKFORCE_ZONE"
    INSPECTION_ZONE = "INSPECTION_ZONE"


class StateSource(str, Enum):
    IOT = "IOT"
    MANUAL = "MANUAL"
    AI_INFERRED = "AI_INFERRED"


class SeverityLevel(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


class TwinEntity(BaseModel):
    entity_id: UUID
    tenant_id: UUID
    project_id: UUID
    entity_type: EntityType
    physical_ref: str | None = None
    digital_ref: str | None = None
    last_synced_at: datetime | None = None
    confidence: float = Field(ge=0.0, le=1.0)
    created_at: datetime
    updated_at: datetime


class TwinState(BaseModel):
    entity_id: UUID
    # The entity's project. Carried here because twin.state.updated.v1 requires project_id and the
    # emitter has nothing else to get it from: it previously sent the ENTITY id in that field, so
    # every consumer filtering by project — analytics, and now the SSE stream — matched nothing.
    project_id: UUID
    tenant_id: UUID
    recorded_at: datetime
    attributes: dict[str, Any]
    source: StateSource
    confidence: float = Field(ge=0.0, le=1.0)


class TwinSnapshot(BaseModel):
    project_id: UUID
    as_of: datetime
    entities: list[TwinEntity]
    overall_confidence: float = Field(ge=0.0, le=1.0)
    divergence_score: float = Field(ge=0.0)


class Divergence(BaseModel):
    entity_id: UUID
    planned_state: dict[str, Any]
    actual_state: dict[str, Any]
    gap: float
    severity: SeverityLevel


class UnassessedEntity(BaseModel):
    """An entity whose plan is unknown, so no divergence can be computed for it.

    §Phase 24 lists BIM Integration (IFC.js per spec §13.4) as a PREREQUISITE, and it is not built:
    planned_state is empty for every entity today. Comparing a real reading against an empty plan
    produced gap = 1.0 and severity HIGH for everything with any attribute at all, so the report
    flagged the entire site at every run — an alert that fires always is one people learn to close.

    "We do not know the plan" is a different statement from "the site has diverged from the plan",
    and it belongs in a different list. Product-owner decision 2026-08-25.
    """

    entity_id: UUID
    entity_type: EntityType
    actual_state: dict[str, Any]
    reason: str = "NO_PLANNED_STATE"


class DivergenceReport(BaseModel):
    project_id: UUID
    generated_at: datetime
    divergences: list[Divergence]
    # Entities that could not be assessed. Empty once BIM integration lands; until then this is
    # where every entity goes, which is the honest shape of what the system currently knows.
    unassessed: list[UnassessedEntity] = Field(default_factory=list)
    risk_level: str  # LOW / MEDIUM / HIGH / CRITICAL


class TwinStateEvent(BaseModel):
    """Twin state fields (event_type twin.state.updated.v1). The kafka_handler emits the CloudEvents
    envelope + avsc payload directly; `attributes` are persisted to twin_states, not on the wire."""
    event_type: str = "twin.state.updated.v1"
    entity_id: UUID
    project_id: UUID
    tenant_id: UUID
    recorded_at: datetime
    source: StateSource
    confidence: float
    attributes: dict[str, Any]


class TwinDivergenceEvent(BaseModel):
    """Emitted on Kafka event twin.divergence.detected.v1 (topic {tenant_id}.twin.divergence.detected.v1)."""
    event_type: str = "twin.divergence.detected.v1"
    project_id: UUID
    tenant_id: UUID
    generated_at: datetime
    divergence_count: int
    max_severity: SeverityLevel
    risk_level: str

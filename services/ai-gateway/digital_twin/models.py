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


class DivergenceReport(BaseModel):
    project_id: UUID
    generated_at: datetime
    divergences: list[Divergence]
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

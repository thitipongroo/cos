"""
Divergence detection engine — Phase 24
Compares planned (BIM/schedule) vs actual (IoT/inspections) state.
Alerts when gap > configured threshold per entity type.
Source: spec §Phase 24 Core Capabilities §2.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import UUID

import asyncpg

from db import tenant_scoped

from .models import (
    Divergence,
    DivergenceReport,
    SeverityLevel,
    UnassessedEntity,
)

# Configurable divergence thresholds per entity type
DEFAULT_THRESHOLDS: dict[str, float] = {
    "STRUCTURE": 0.10,       # 10% deviation triggers alert
    "EQUIPMENT": 0.05,       # 5% deviation
    "MATERIAL_STOCK": 0.15,  # 15% deviation
    "WORKFORCE_ZONE": 0.20,  # 20% deviation
    "INSPECTION_ZONE": 0.10, # 10% deviation
}


def _severity_from_gap(gap: float, threshold: float) -> SeverityLevel:
    ratio = gap / threshold if threshold else 0
    if ratio >= 3.0:
        return SeverityLevel.HIGH
    if ratio >= 1.5:
        return SeverityLevel.MEDIUM
    return SeverityLevel.LOW


def _risk_level_from_divergences(divergences: list[Divergence]) -> str:
    if not divergences:
        return "LOW"
    high_count = sum(1 for d in divergences if d.severity == SeverityLevel.HIGH)
    medium_count = sum(1 for d in divergences if d.severity == SeverityLevel.MEDIUM)
    if high_count >= 3:
        return "CRITICAL"
    if high_count >= 1:
        return "HIGH"
    if medium_count >= 3:
        return "MEDIUM"
    return "LOW"


def compute_divergence(
    planned_state: dict[str, Any],
    actual_state: dict[str, Any],
    entity_type: str,
    thresholds: dict[str, float] | None = None,
) -> tuple[float, SeverityLevel]:
    """
    Compute numerical gap between planned and actual state.
    Returns (gap, severity).

    Gap is computed as mean absolute deviation across matching numeric keys.
    Non-numeric attributes are compared for equality (gap = 1.0 if unequal, 0.0 if equal).
    """
    effective_thresholds = thresholds or DEFAULT_THRESHOLDS
    threshold = effective_thresholds.get(entity_type, 0.10)

    gaps: list[float] = []
    for key in set(planned_state) | set(actual_state):
        planned_val = planned_state.get(key)
        actual_val = actual_state.get(key)

        if isinstance(planned_val, (int, float)) and isinstance(actual_val, (int, float)):
            base = abs(planned_val) or 1.0
            gaps.append(abs(planned_val - actual_val) / base)
        else:
            gaps.append(0.0 if planned_val == actual_val else 1.0)

    gap = sum(gaps) / len(gaps) if gaps else 0.0
    severity = _severity_from_gap(gap, threshold)
    return gap, severity


async def generate_divergence_report(
    project_id: str,
    tenant_id: str,
    *,
    db_pool: asyncpg.Pool,
    thresholds: dict[str, float] | None = None,
) -> DivergenceReport:
    """
    Scheduled job entry point — compare latest actual twin state vs planned state.
    Planned state sourced from BIM/schedule data (digital_ref attributes).
    """
    # RLS (app_user): the entity list and every per-entity state lookup share one
    # tenant-scoped transaction — see db/tenant_scope.py.
    async with tenant_scoped(db_pool, tenant_id) as conn:
        entities = await conn.fetch(
            """
            SELECT entity_id, entity_type, digital_ref, confidence
            FROM digital_twin.twin_entities
            WHERE project_id = $1::uuid
              AND tenant_id = $2::uuid
            """,
            project_id,
            tenant_id,
        )
        state_rows: dict[str, Any] = {}
        for entity_row in entities:
            state_rows[str(entity_row["entity_id"])] = await conn.fetchrow(
                """
                SELECT attributes
                FROM digital_twin.twin_states
                WHERE entity_id = $1::uuid
                  AND tenant_id = $2::uuid
                ORDER BY recorded_at DESC
                LIMIT 1
                """,
                str(entity_row["entity_id"]),
                tenant_id,
            )

    divergences: list[Divergence] = []
    unassessed: list[UnassessedEntity] = []

    for entity_row in entities:
        entity_id = str(entity_row["entity_id"])
        entity_type = entity_row["entity_type"]

        latest_state_row = state_rows.get(entity_id)
        if not latest_state_row:
            continue

        import json
        actual_state: dict[str, Any] = json.loads(latest_state_row["attributes"])

        # Planned state from BIM/schedule — empty dict while BIM is not integrated.
        # BIM Integration (IFC.js parser per spec §13.4) is a PREREQUISITE for Phase 24 and is not
        # built, so this is empty for every entity today.
        planned_state: dict[str, Any] = {}

        # No plan means no comparison. Comparing against {} scored every attribute-bearing entity at
        # gap 1.0 / HIGH, so the report flagged the whole site on every run — an alert that always
        # fires is one operators learn to dismiss, and it asserted a divergence from a plan nobody
        # had. These entities are reported as UNASSESSED instead (product-owner decision
        # 2026-08-25); "we do not know the plan" is a different claim from "the site has diverged".
        if not planned_state:
            unassessed.append(
                UnassessedEntity(
                    entity_id=UUID(entity_id),
                    entity_type=entity_type,
                    actual_state=actual_state,
                )
            )
            continue

        gap, severity = compute_divergence(
            planned_state,
            actual_state,
            entity_type,
            thresholds,
        )

        if gap > (thresholds or DEFAULT_THRESHOLDS).get(entity_type, 0.10):
            divergences.append(Divergence(
                entity_id=UUID(entity_id),
                planned_state=planned_state,
                actual_state=actual_state,
                gap=gap,
                severity=severity,
            ))

    return DivergenceReport(
        project_id=UUID(project_id),
        generated_at=datetime.now(timezone.utc),
        divergences=divergences,
        unassessed=unassessed,
        # Risk is computed from real divergences only. An unassessed entity contributes nothing:
        # an unknown plan is not evidence of risk in either direction.
        risk_level=_risk_level_from_divergences(divergences),
    )

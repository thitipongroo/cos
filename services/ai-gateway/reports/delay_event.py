"""Emit ``construction.delay.detected.v1`` from a DelayForecastModel prediction.

WHY THIS EXISTS. The event had a schema, a topic, a catalogue entry and TWO documented consumers —
the Knowledge Graph ingestion worker, and the §Phase 6 completion gate that states as fact that the
event "auto-sets task.status = BLOCKED" — but nothing in the repository published it. An audit found
that on 2026-08-23 and the producer was deferred to Phase 23, where the AI_FORECAST source named in
the payload (``DelayForecastModel``) is built. Product-owner decision 2026-08-25: build the event and
both consumers now, with the producer wired to the model, rather than defer again — a declared
contract with no producer is the shape this estate keeps finding.

The model itself is still a stub (master §Phase 23 gates it on 90+ days of production data), so this
emits nothing until ``predict`` returns a real prediction. That is the point: the wiring is finished
and observable, and the day the model lands the event flows without anyone remembering to add it.

Mirrors ``risk_event`` exactly — same JSON envelope for the interim path, same injected-producer
seam so tests need no broker, same ``tenant_id`` isolation header.
"""

from __future__ import annotations

import json
import logging
import os
import uuid
from datetime import datetime, timezone

logger = logging.getLogger("ai-gateway.delay-event")

_KAFKA_BROKERS = os.environ.get("KAFKA_BROKERS", "localhost:9092")
EVENT_TYPE = "construction.delay.detected.v1"


def severity_for(delay_days: int) -> str:
    """Band a delay in days onto the DelaySeverity enum.

    The thresholds are stated outright in `32 §Event payloads` row 8 — LOW=1-2, MEDIUM=3-6,
    HIGH=7-13, CRITICAL=14+ — and are identical to the Phase 12 delay-risk bands, so they are copied
    rather than re-decided. A delay of zero days is not a delay and callers must not emit one; the
    function still answers LOW rather than raising, because a producer is the wrong place to discover
    a modelling bug.
    """
    if delay_days >= 14:
        return "CRITICAL"
    if delay_days >= 7:
        return "HIGH"
    if delay_days >= 3:
        return "MEDIUM"
    return "LOW"


def build_delay_payload(
    project_id: str,
    delay_days: int,
    *,
    task_id: str | None = None,
    cause: str = "OTHER",
) -> dict:
    """Map a DelayPrediction → the construction.delay.detected.v1 payload.

    `cause` defaults to OTHER on purpose. DelayFeatures (weather, workforce_count,
    procurement_delay_days, historical_velocity, days_to_deadline) tell the model how likely a delay
    is, not what to blame it on, and DelayPrediction carries no attribution. OTHER is the schema's
    symbol for exactly that; picking PROCUREMENT because one feature happened to be large would put a
    cause in the register that the model never asserted. A caller that DOES know the cause passes it.
    """
    return {
        "project_id": str(project_id),
        "task_id": str(task_id) if task_id else None,
        "delay_days": int(delay_days),
        "cause": cause,
        "detected_by": "AI_FORECAST",
        "severity": severity_for(int(delay_days)),
    }


def build_envelope(tenant_id: str, payload: dict) -> dict:
    """Standard CloudEvents envelope (matches avro/construction.delay.detected.v1.avsc)."""
    return {
        "event_id": str(uuid.uuid4()),
        "event_type": EVENT_TYPE,
        "event_version": "1.0",
        "tenant_id": str(tenant_id),
        "actor_id": "ai-gateway",
        "occurred_at": datetime.now(timezone.utc).isoformat(),
        "correlation_id": str(uuid.uuid4()),
        "trace_id": None,
        "span_id": None,
        "payload": payload,
    }


async def emit_delay_detected(
    project_id: str,
    tenant_id: str,
    delay_days: int,
    *,
    task_id: str | None = None,
    cause: str = "OTHER",
    producer=None,
) -> bool:
    """Publish to `{tenant_id}.construction.delay.detected.v1`. Returns whether anything was sent.

    Emits nothing for a non-positive delay: "no delay" is not an event, and a zero-day row would
    reach the Knowledge Graph as a `(:Delay)` node and BLOCK a task that is running fine.

    `producer` is injected exactly as in risk_event — when it is absent the emit is a no-op rather
    than opening a broker connection per request.
    """
    if int(delay_days) <= 0:
        logger.debug("delay of %s days for project %s is not a delay; skipping", delay_days, project_id)
        return False
    if producer is None:
        logger.debug("no delay producer configured; skipping emit for project %s", project_id)
        return False

    payload = build_delay_payload(project_id, delay_days, task_id=task_id, cause=cause)
    envelope = build_envelope(tenant_id, payload)
    topic = f"{tenant_id}.{EVENT_TYPE}"
    await producer.send_and_wait(
        topic,
        json.dumps(envelope).encode("utf-8"),
        headers=[("tenant_id", str(tenant_id).encode("utf-8"))],
    )
    logger.info(
        "emitted %s for project %s (%s days, severity %s)",
        EVENT_TYPE,
        project_id,
        payload["delay_days"],
        payload["severity"],
    )
    return True

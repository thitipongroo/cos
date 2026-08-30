"""Emit ``safety.violation.detected.v1`` from a SafetyVisionModel analysis.

WHY THIS EXISTS. 19-notification-architecture §19.6 names TWO events that "cannot be disabled":
SafetyIncidentReported and SafetyViolationDetected. Only the first had a canonical event type; the
second existed solely as a display name in 16-enterprise-event-flow §Safety and in that §19.6
sentence. Phase 20 found the asymmetry, and the product owner deferred the event to Phase 23
(2026-08-25) because SafetyVisionModel — built here — is the only thing in the specification that
detects a violation. A second decision on 2026-08-25 chose to mint the event and its consumers now
rather than defer again.

The model is still a stub (gated on 10,000+ labeled site photos), so nothing is emitted until
``analyze`` returns a real result. The contract is finished and observable in the meantime, which is
the whole point of the exercise: the notification service already routes the event, marks it as one
that cannot be switched off, and holds a template for it.

Mirrors ``risk_event`` and ``delay_event``: same JSON envelope for the interim path, same injected
producer seam, same tenant_id isolation header.
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone

logger = logging.getLogger("ai-gateway.safety-violation-event")

EVENT_TYPE = "safety.violation.detected.v1"

_SEVERITIES = ("LOW", "MEDIUM", "HIGH", "CRITICAL")


def build_violation_payload(
    project_id: str,
    file_id: str,
    analysis: dict,
) -> dict:
    """Map a SafetyAnalysisResult dict → the safety.violation.detected.v1 payload.

    `analysis` is ``{ violations: list[str], confidence: float, severity: str }`` — the interface
    master §Phase 23 gives SafetyVisionModel. Confidence is rendered as a DECIMAL STRING rather than a
    float, matching ai.risk_prediction.generated.v1 and the house rule that a number crossing a
    service boundary as a float is a number nobody can reason about (master:990).

    An unrecognised severity becomes CRITICAL, not LOW. This event cannot be switched off by design;
    if the model ever answers something outside the enum, the safe direction is the one that reaches
    a human.
    """
    severity = str(analysis.get("severity", "")).upper()
    if severity not in _SEVERITIES:
        logger.warning("unrecognised severity %r from SafetyVisionModel; treating as CRITICAL", severity)
        severity = "CRITICAL"

    return {
        "violation_id": str(uuid.uuid4()),
        "project_id": str(project_id),
        "file_id": str(file_id),
        "violations": [str(v) for v in analysis.get("violations", [])],
        "confidence": f"{float(analysis.get('confidence') or 0.0):.4f}",
        "severity": severity,
    }


def build_envelope(tenant_id: str, payload: dict) -> dict:
    """Standard CloudEvents envelope (matches avro/safety.violation.detected.v1.avsc)."""
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


async def emit_safety_violation(
    project_id: str,
    tenant_id: str,
    file_id: str,
    analysis: dict,
    *,
    producer=None,
) -> str | None:
    """Publish to `{tenant_id}.safety.violation.detected.v1`. Returns the violation_id, or None.

    An analysis that found nothing is not a violation and is not emitted — an empty-violations event
    would page the Safety Officer about a clean photo, and this is an event they cannot mute.
    """
    if not analysis.get("violations"):
        logger.debug("no violations in analysis for project %s; skipping emit", project_id)
        return None
    if producer is None:
        logger.debug("no safety-violation producer configured; skipping emit for project %s", project_id)
        return None

    payload = build_violation_payload(project_id, file_id, analysis)
    envelope = build_envelope(tenant_id, payload)
    topic = f"{tenant_id}.{EVENT_TYPE}"
    await producer.send_and_wait(
        topic,
        json.dumps(envelope).encode("utf-8"),
        headers=[("tenant_id", str(tenant_id).encode("utf-8"))],
    )
    logger.info(
        "emitted %s for project %s (severity %s, %d violation(s))",
        EVENT_TYPE,
        project_id,
        payload["severity"],
        len(payload["violations"]),
    )
    return payload["violation_id"]

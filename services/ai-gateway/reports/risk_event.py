"""F4b feed: emit ``ai.risk_prediction.generated.v1`` (DELAY_FORECAST) after a delay-risk report.

The delay-risk report (``report-delay-risk-v1``) produces a ``DelayRiskOutput`` (level + risk_factors +
confidence). This turns a *confident* assessment into the canonical risk-prediction event that the
backend consumes to create ``source = AI_SUGGESTED`` project risks (ADR-065). Low-confidence output is
not emitted — the register must not fill with noise.

JSON envelope for the interim path (production injects an Avro encoder), mirroring
``digital_twin/kafka_handler``. The Kafka producer is an injectable seam so tests need no broker.
"""

from __future__ import annotations

import json
import logging
import os
import uuid
from datetime import datetime, timezone

logger = logging.getLogger("ai-gateway.risk-event")

_KAFKA_BROKERS = os.environ.get("KAFKA_BROKERS", "localhost:9092")
EVENT_TYPE = "ai.risk_prediction.generated.v1"
_MODEL_VERSION = "report-delay-risk-v1"


def build_prediction_payload(project_id: str, content: dict, confidence: float | None) -> dict:
    """Map a DelayRiskOutput dict → the ai.risk_prediction.generated.v1 payload (model_type=DELAY_FORECAST)."""
    return {
        "prediction_id": str(uuid.uuid4()),
        "project_id": project_id,
        "model_type": "DELAY_FORECAST",
        "prediction": json.dumps(
            {
                "delay_risk_level": content.get("delay_risk_level"),
                "risk_factors": content.get("risk_factors", []),
            }
        ),
        "confidence": f"{(confidence or 0.0):.4f}",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "model_version": _MODEL_VERSION,
    }


def build_envelope(tenant_id: str, payload: dict) -> dict:
    """Standard CloudEvents envelope (matches avro/ai.risk_prediction.generated.v1.avsc)."""
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


async def emit_risk_prediction(
    project_id: str,
    tenant_id: str,
    content: dict,
    confidence: float | None,
    *,
    producer=None,
) -> str | None:
    """Publish the risk-prediction event to `{tenant_id}.ai.risk_prediction.generated.v1`.

    `producer` (an AIOKafkaProducer, or any object with ``send_and_wait``) is injected at startup —
    the same posture as the DB pool and LLM provider. When it is not configured the emit is a no-op
    (returns ``None``): the caller degrades rather than creating a broker connection per request. On a
    real send the ``tenant_id`` isolation header mirrors every other COS producer. Returns the
    prediction_id, or ``None`` when skipped.
    """
    if producer is None:
        logger.debug("no risk-prediction producer configured; skipping emit for project %s", project_id)
        return None

    payload = build_prediction_payload(project_id, content, confidence)
    envelope = build_envelope(tenant_id, payload)
    topic = f"{tenant_id}.{EVENT_TYPE}"
    await producer.send_and_wait(
        topic,
        json.dumps(envelope).encode("utf-8"),
        headers=[("tenant_id", str(tenant_id).encode("utf-8"))],
    )
    logger.info("emitted %s for project %s (prediction %s)", EVENT_TYPE, project_id, payload["prediction_id"])
    return payload["prediction_id"]

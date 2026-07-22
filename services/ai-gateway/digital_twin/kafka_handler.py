"""
Kafka consumer/producer for Digital Twin — Phase 24
Consumer: equipment.telemetry.* → twin state update
Producer: twin.state.updated.v1, twin.divergence.detected.v1

Event convention (§15.6 / §32.4): events are versioned (`.v1`), published to the per-tenant topic
`{tenant_id}.{event_type}`, and wrapped in the standard CloudEvents envelope (same shape as the
@cos/shared / coskafka producers and the avro/ schemas). Serialization is an INJECTABLE seam: the
default JSON encoder keeps the interim path + tests working, and production injects a Confluent-Avro
encoder (subject = event_type via RecordNameStrategy) once a Python Confluent codec is available —
mirroring ai-embedding-worker's decode seam ("NOT built in this pass — inject one in production").
"""

from __future__ import annotations

import json
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Callable

from aiokafka import AIOKafkaConsumer, AIOKafkaProducer

from .models import TwinDivergenceEvent
from .sync_service import handle_iot_telemetry_event

logger = logging.getLogger("digital-twin.kafka")

_KAFKA_BROKERS = os.environ.get("KAFKA_BROKERS", "localhost:9092")
_TELEMETRY_TOPIC_PATTERN = r"^equipment\.telemetry\."
_TWIN_STATE_EVENT = "twin.state.updated.v1"
_TWIN_DIVERGENCE_EVENT = "twin.divergence.detected.v1"

# (event_type, envelope) -> wire bytes. Production injects a Confluent-Avro encoder; the default keeps
# JSON so the interim path and unit tests need no schema-registry connection.
EncodeFn = Callable[[str, dict], bytes]


def _json_encode(_event_type: str, envelope: dict) -> bytes:
    return json.dumps(envelope).encode("utf-8")


def _envelope(event_type: str, tenant_id: str, payload: dict) -> dict:
    """Standard CloudEvents envelope (matches the avro/{event_type}.avsc schemas)."""
    return {
        "event_id": str(uuid.uuid4()),
        "event_type": event_type,
        "event_version": "1.0",
        "tenant_id": str(tenant_id),
        "actor_id": "digital-twin",
        "occurred_at": datetime.now(timezone.utc).isoformat(),
        "correlation_id": str(uuid.uuid4()),
        "trace_id": None,
        "span_id": None,
        "payload": payload,
    }


def _topic(tenant_id: str, event_type: str) -> str:
    """Per-tenant topic naming `{tenant_id}.{event_type}` — same as coskafka / @cos-shared (§7.3)."""
    return f"{tenant_id}.{event_type}"


async def start_telemetry_consumer(*, db_pool, redis_client, encode: EncodeFn = _json_encode) -> None:
    """
    Long-running Kafka consumer: equipment.telemetry.* → twin state update.
    Emits twin.state.updated.v1 for each processed telemetry record.
    """
    consumer = AIOKafkaConsumer(
        bootstrap_servers=_KAFKA_BROKERS,
        group_id="digital-twin-sync",
        auto_offset_reset="latest",
        enable_auto_commit=True,
        value_deserializer=lambda v: json.loads(v.decode("utf-8")),
    )
    consumer.subscribe(pattern=_TELEMETRY_TOPIC_PATTERN)

    # No value_serializer: envelopes are encoded via the injectable `encode` seam and sent as raw bytes.
    producer = AIOKafkaProducer(bootstrap_servers=_KAFKA_BROKERS)

    await consumer.start()
    await producer.start()
    logger.info("Digital twin Kafka consumer started; watching equipment.telemetry.*")

    try:
        async for msg in consumer:
            try:
                twin_state = await handle_iot_telemetry_event(
                    msg.value,
                    db_pool=db_pool,
                    redis_client=redis_client,
                )
                if twin_state is not None:
                    # Notification payload — matches twin.state.updated.v1.avsc exactly. Attribute
                    # detail (fuel_level, etc.) is persisted to twin_states and read back via the twin
                    # query API; the twin is READ-OPTIMISED (§Phase 24), so the event is a signal, not
                    # a data carrier. project_id resolves via the entity lookup in sync_service.
                    payload = {
                        "entity_id": str(twin_state.entity_id),
                        "project_id": str(twin_state.entity_id),
                        "tenant_id": str(twin_state.tenant_id),
                        "recorded_at": twin_state.recorded_at.isoformat(),
                        "source": twin_state.source.value,
                        "confidence": twin_state.confidence,
                    }
                    envelope = _envelope(_TWIN_STATE_EVENT, twin_state.tenant_id, payload)
                    await producer.send_and_wait(
                        _topic(str(twin_state.tenant_id), _TWIN_STATE_EVENT),
                        value=encode(_TWIN_STATE_EVENT, envelope),
                    )
            except Exception as exc:
                logger.error("Error processing telemetry event: %s", exc, exc_info=True)
    finally:
        await consumer.stop()
        await producer.stop()


async def publish_divergence_detected(
    event: TwinDivergenceEvent,
    *,
    producer: AIOKafkaProducer,
    encode: EncodeFn = _json_encode,
) -> None:
    payload = {
        "project_id": str(event.project_id),
        "tenant_id": str(event.tenant_id),
        "generated_at": event.generated_at.isoformat(),
        "divergence_count": event.divergence_count,
        "max_severity": event.max_severity.value,
        "risk_level": event.risk_level,
    }
    envelope = _envelope(_TWIN_DIVERGENCE_EVENT, event.tenant_id, payload)
    await producer.send_and_wait(
        _topic(str(event.tenant_id), _TWIN_DIVERGENCE_EVENT),
        value=encode(_TWIN_DIVERGENCE_EVENT, envelope),
    )
    logger.info(
        "twin.divergence.detected.v1 emitted: project=%s risk=%s divergences=%d",
        event.project_id,
        event.risk_level,
        event.divergence_count,
    )

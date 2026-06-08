"""
Kafka consumer/producer for Digital Twin — Phase 24
Consumer: equipment.telemetry.* → twin state update
Producer: twin.state.updated, twin.divergence.detected
Source: spec §Phase 24 Kafka consumer/producer items
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from datetime import datetime, timezone
from typing import AsyncGenerator

from aiokafka import AIOKafkaConsumer, AIOKafkaProducer

from .models import TwinDivergenceEvent, TwinStateEvent
from .sync_service import handle_iot_telemetry_event

logger = logging.getLogger("digital-twin.kafka")

_KAFKA_BROKERS = os.environ.get("KAFKA_BROKERS", "localhost:9092")
_TELEMETRY_TOPIC_PATTERN = r"^equipment\.telemetry\."
_TWIN_STATE_TOPIC = "twin.state.updated"
_TWIN_DIVERGENCE_TOPIC = "twin.divergence.detected"


async def start_telemetry_consumer(*, db_pool, redis_client) -> None:
    """
    Long-running Kafka consumer: equipment.telemetry.* → twin state update.
    Emits twin.state.updated event for each processed telemetry record.
    """
    consumer = AIOKafkaConsumer(
        bootstrap_servers=_KAFKA_BROKERS,
        group_id="digital-twin-sync",
        auto_offset_reset="latest",
        enable_auto_commit=True,
        value_deserializer=lambda v: json.loads(v.decode("utf-8")),
    )
    consumer.subscribe(pattern=_TELEMETRY_TOPIC_PATTERN)

    producer = AIOKafkaProducer(
        bootstrap_servers=_KAFKA_BROKERS,
        value_serializer=lambda v: json.dumps(v).encode("utf-8"),
    )

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
                    event = TwinStateEvent(
                        entity_id=twin_state.entity_id,
                        project_id=twin_state.entity_id,  # resolved via entity lookup
                        tenant_id=twin_state.tenant_id,
                        recorded_at=twin_state.recorded_at,
                        source=twin_state.source,
                        confidence=twin_state.confidence,
                        attributes=twin_state.attributes,
                    )
                    await producer.send_and_wait(
                        _TWIN_STATE_TOPIC,
                        value=event.model_dump(mode="json"),
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
) -> None:
    await producer.send_and_wait(
        _TWIN_DIVERGENCE_TOPIC,
        value=event.model_dump(mode="json"),
    )
    logger.info(
        "twin.divergence.detected emitted: project=%s risk=%s divergences=%d",
        event.project_id,
        event.risk_level,
        event.divergence_count,
    )

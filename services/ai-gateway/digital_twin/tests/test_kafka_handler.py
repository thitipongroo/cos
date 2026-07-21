"""Unit tests for the Digital Twin Kafka consumer/producer (§Phase 24).

`start_telemetry_consumer` is a long-running broker loop, so nothing here touches a real broker:
`AIOKafkaConsumer` / `AIOKafkaProducer` are patched on the module (they are imported at module scope
here, unlike ai-embedding-worker's lazy import, so patching the module attribute is the seam).

What is worth pinning down is not "it consumes" but the decisions that fail silently in production:
the `equipment.telemetry.*` pattern, `latest` offset reset (a twin backfilling months of stale
telemetry would publish a wrong current state), that a poison record does not wedge the partition,
that both clients are always stopped, and that no `twin.state.updated` is emitted when the sync
service declines the event.
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pytest
from digital_twin import kafka_handler
from digital_twin.models import SeverityLevel, StateSource, TwinDivergenceEvent, TwinState


class _FakeMessage:
    def __init__(self, value: dict):
        self.value = value


class _FakeConsumer:
    instances: list = []
    next_messages: list = []

    def __init__(self, **kwargs):
        self.kwargs = kwargs
        self.subscribed: dict = {}
        self.started = False
        self.stopped = False
        self.messages = list(_FakeConsumer.next_messages)
        _FakeConsumer.instances.append(self)

    def subscribe(self, pattern=None):
        self.subscribed = {"pattern": pattern}

    async def start(self):
        self.started = True

    async def stop(self):
        self.stopped = True

    def __aiter__(self):
        async def _gen():
            for msg in self.messages:
                yield msg

        return _gen()


class _FakeProducer:
    instances: list = []

    def __init__(self, **kwargs):
        self.kwargs = kwargs
        self.started = False
        self.stopped = False
        self.sent: list = []
        _FakeProducer.instances.append(self)

    async def start(self):
        self.started = True

    async def stop(self):
        self.stopped = True

    async def send_and_wait(self, topic, value=None):
        self.sent.append((topic, value))


@pytest.fixture
def fake_kafka(monkeypatch):
    _FakeConsumer.instances = []
    _FakeConsumer.next_messages = []
    _FakeProducer.instances = []
    monkeypatch.setattr(kafka_handler, "AIOKafkaConsumer", _FakeConsumer)
    monkeypatch.setattr(kafka_handler, "AIOKafkaProducer", _FakeProducer)
    return _FakeConsumer, _FakeProducer


def _twin_state() -> TwinState:
    return TwinState(
        entity_id="11111111-1111-1111-1111-111111111111",
        tenant_id="22222222-2222-2222-2222-222222222222",
        recorded_at=datetime.now(timezone.utc),
        source=StateSource.IOT,
        confidence=0.95,
        attributes={"fuel_level": 42},
    )


@pytest.fixture
def handled(monkeypatch):
    """Replaces handle_iot_telemetry_event; `result` controls what the sync service returns."""
    calls: list = []
    # `fail_when` lets a test fail only SOME records without reassigning the module attribute
    # (which would fight monkeypatch and leak the fake into later tests).
    box = {"result": _twin_state(), "raises": None, "fail_when": lambda _value: False}

    async def fake_handle(value, *, db_pool, redis_client):
        calls.append((value, db_pool, redis_client))
        if box["raises"] is not None:
            raise box["raises"]
        if box["fail_when"](value):
            raise RuntimeError("telemetry processing blew up")
        return box["result"]

    monkeypatch.setattr(kafka_handler, "handle_iot_telemetry_event", fake_handle)
    return calls, box


class TestConsumerConfiguration:
    @pytest.mark.asyncio
    async def test_subscribes_to_the_equipment_telemetry_pattern(self, fake_kafka, handled):
        consumer_cls, _ = fake_kafka

        await kafka_handler.start_telemetry_consumer(db_pool=object(), redis_client=object())

        assert consumer_cls.instances[0].subscribed == {
            "pattern": kafka_handler._TELEMETRY_TOPIC_PATTERN
        }

    @pytest.mark.asyncio
    async def test_reads_from_latest_not_earliest(self, fake_kafka, handled):
        # A twin describes the CURRENT world. Replaying months of history on restart would publish a
        # long tail of stale twin.state.updated events — the opposite of the ingestion workers,
        # which backfill deliberately.
        consumer_cls, _ = fake_kafka

        await kafka_handler.start_telemetry_consumer(db_pool=object(), redis_client=object())

        kwargs = consumer_cls.instances[0].kwargs
        assert kwargs["auto_offset_reset"] == "latest"
        assert kwargs["group_id"] == "digital-twin-sync"
        assert kwargs["enable_auto_commit"] is True

    @pytest.mark.asyncio
    async def test_value_deserializer_parses_json_utf8(self, fake_kafka, handled):
        consumer_cls, _ = fake_kafka

        await kafka_handler.start_telemetry_consumer(db_pool=object(), redis_client=object())

        deserialize = consumer_cls.instances[0].kwargs["value_deserializer"]
        assert deserialize(json.dumps({"เครื่องจักร": 1}).encode("utf-8")) == {"เครื่องจักร": 1}

    @pytest.mark.asyncio
    async def test_producer_serializer_emits_json_utf8(self, fake_kafka, handled):
        _, producer_cls = fake_kafka

        await kafka_handler.start_telemetry_consumer(db_pool=object(), redis_client=object())

        serialize = producer_cls.instances[0].kwargs["value_serializer"]
        assert json.loads(serialize({"a": 1}).decode("utf-8")) == {"a": 1}


class TestLifecycle:
    @pytest.mark.asyncio
    async def test_starts_and_always_stops_both_clients(self, fake_kafka, handled):
        consumer_cls, producer_cls = fake_kafka

        await kafka_handler.start_telemetry_consumer(db_pool=object(), redis_client=object())

        consumer, producer = consumer_cls.instances[0], producer_cls.instances[0]
        assert (consumer.started, consumer.stopped) == (True, True)
        assert (producer.started, producer.stopped) == (True, True)


class TestTelemetryProcessing:
    @pytest.mark.asyncio
    async def test_emits_twin_state_updated_for_each_processed_record(self, fake_kafka, handled):
        consumer_cls, producer_cls = fake_kafka
        consumer_cls.next_messages = [_FakeMessage({"a": 1}), _FakeMessage({"a": 2})]

        await kafka_handler.start_telemetry_consumer(db_pool=object(), redis_client=object())

        sent = producer_cls.instances[0].sent
        assert len(sent) == 2
        assert {topic for topic, _ in sent} == {kafka_handler._TWIN_STATE_TOPIC}

    @pytest.mark.asyncio
    async def test_event_payload_carries_the_twin_state_fields(self, fake_kafka, handled):
        consumer_cls, producer_cls = fake_kafka
        consumer_cls.next_messages = [_FakeMessage({"a": 1})]

        await kafka_handler.start_telemetry_consumer(db_pool=object(), redis_client=object())

        _, value = producer_cls.instances[0].sent[0]
        assert value["entity_id"] == "11111111-1111-1111-1111-111111111111"
        assert value["tenant_id"] == "22222222-2222-2222-2222-222222222222"
        assert value["confidence"] == 0.95
        assert value["attributes"] == {"fuel_level": 42}

    @pytest.mark.asyncio
    async def test_passes_db_pool_and_redis_through_to_the_sync_service(self, fake_kafka, handled):
        calls, _ = handled
        consumer_cls, _ = fake_kafka
        consumer_cls.next_messages = [_FakeMessage({"a": 1})]
        db, redis_client = object(), object()

        await kafka_handler.start_telemetry_consumer(db_pool=db, redis_client=redis_client)

        assert calls[0] == ({"a": 1}, db, redis_client)

    @pytest.mark.asyncio
    async def test_nothing_is_published_when_the_sync_service_declines(self, fake_kafka, handled):
        # handle_iot_telemetry_event returns None for an unknown entity or a malformed event —
        # publishing a twin.state.updated for it would invent state.
        _, box = handled
        box["result"] = None
        consumer_cls, producer_cls = fake_kafka
        consumer_cls.next_messages = [_FakeMessage({"a": 1})]

        await kafka_handler.start_telemetry_consumer(db_pool=object(), redis_client=object())

        assert producer_cls.instances[0].sent == []


class TestPoisonRecordHandling:
    @pytest.mark.asyncio
    async def test_a_failing_record_does_not_stop_the_loop(self, fake_kafka, handled, caplog):
        import logging

        calls, box = handled
        consumer_cls, producer_cls = fake_kafka
        consumer_cls.next_messages = [_FakeMessage({"bad": True}), _FakeMessage({"good": True})]
        box["fail_when"] = lambda value: value.get("bad", False)

        with caplog.at_level(logging.ERROR, logger="digital-twin.kafka"):
            await kafka_handler.start_telemetry_consumer(db_pool=object(), redis_client=object())

        assert len(calls) == 2  # the good record after the poison one was still processed
        assert len(producer_cls.instances[0].sent) == 1
        assert "Error processing telemetry event" in caplog.text

    @pytest.mark.asyncio
    async def test_clients_are_stopped_even_when_a_record_fails(self, fake_kafka, handled):
        _, box = handled
        box["raises"] = RuntimeError("boom")
        consumer_cls, producer_cls = fake_kafka
        consumer_cls.next_messages = [_FakeMessage({"a": 1})]

        await kafka_handler.start_telemetry_consumer(db_pool=object(), redis_client=object())

        assert consumer_cls.instances[0].stopped is True
        assert producer_cls.instances[0].stopped is True


class TestPublishDivergenceDetected:
    @pytest.mark.asyncio
    async def test_publishes_to_the_divergence_topic(self):
        producer = _FakeProducer()
        event = TwinDivergenceEvent(
            project_id="33333333-3333-3333-3333-333333333333",
            tenant_id="22222222-2222-2222-2222-222222222222",
            generated_at=datetime.now(timezone.utc),
            risk_level="HIGH",
            divergence_count=4,
            max_severity=SeverityLevel.HIGH,
        )

        await kafka_handler.publish_divergence_detected(event, producer=producer)

        topic, value = producer.sent[0]
        assert topic == kafka_handler._TWIN_DIVERGENCE_TOPIC
        assert value["risk_level"] == "HIGH"
        assert value["divergence_count"] == 4

    @pytest.mark.asyncio
    async def test_payload_is_json_serialisable(self):
        # model_dump(mode="json") must leave no datetime/UUID objects for the producer serializer.
        producer = _FakeProducer()
        event = TwinDivergenceEvent(
            project_id="33333333-3333-3333-3333-333333333333",
            tenant_id="22222222-2222-2222-2222-222222222222",
            generated_at=datetime.now(timezone.utc),
            risk_level="LOW",
            divergence_count=0,
            max_severity=SeverityLevel.LOW,
        )

        await kafka_handler.publish_divergence_detected(event, producer=producer)

        json.dumps(producer.sent[0][1])  # raises TypeError if a raw datetime survived

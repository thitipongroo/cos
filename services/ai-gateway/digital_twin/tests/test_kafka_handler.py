"""Unit tests for the Digital Twin Kafka wiring — Phase 24.

§35.13 ESC-24: digital_twin/kafka_handler.py was entirely uncovered (36 statements). aiokafka is
replaced with fakes, so the consumer loop runs for real without a broker. What matters here is the
error contract: a telemetry message that fails to process must be logged and the loop must KEEP
CONSUMING — one poison record cannot stop twin synchronisation for every tenant — and the consumer
and producer must both be stopped in the finally block (Rule 39 / ADR-034).
"""

import json
from datetime import datetime, timezone
from uuid import uuid4

import pytest

from digital_twin import kafka_handler
from digital_twin.models import SeverityLevel, StateSource, TwinDivergenceEvent, TwinState


class _Msg:
    def __init__(self, value):
        self.value = value


class _FakeConsumer:
    instances: list["_FakeConsumer"] = []

    def __init__(self, **kwargs):
        self.kwargs = kwargs
        self.subscribed_pattern = None
        self.started = False
        self.stopped = False
        self.messages: list[_Msg] = []
        type(self).instances.append(self)

    def subscribe(self, pattern=None):
        self.subscribed_pattern = pattern

    async def start(self):
        self.started = True

    async def stop(self):
        self.stopped = True

    def __aiter__(self):
        async def gen():
            for m in self.messages:
                yield m

        return gen()


class _FakeProducer:
    instances: list["_FakeProducer"] = []

    def __init__(self, **kwargs):
        self.kwargs = kwargs
        self.started = False
        self.stopped = False
        self.sent: list[tuple[str, dict]] = []
        type(self).instances.append(self)

    async def start(self):
        self.started = True

    async def stop(self):
        self.stopped = True

    async def send_and_wait(self, topic, value=None):
        self.sent.append((topic, value))


@pytest.fixture
def fake_kafka(monkeypatch):
    _FakeConsumer.instances = []
    _FakeProducer.instances = []
    monkeypatch.setattr(kafka_handler, "AIOKafkaConsumer", _FakeConsumer)
    monkeypatch.setattr(kafka_handler, "AIOKafkaProducer", _FakeProducer)
    return _FakeConsumer, _FakeProducer


def _twin_state(**overrides) -> TwinState:
    base = dict(
        entity_id=uuid4(),
        tenant_id=uuid4(),
        recorded_at=datetime(2026, 6, 8, tzinfo=timezone.utc),
        attributes={"fuel_level": 0.75},
        source=StateSource.IOT,
        confidence=1.0,
    )
    base.update(overrides)
    return TwinState(**base)


class TestStartTelemetryConsumer:
    @pytest.mark.asyncio
    async def test_subscribes_to_the_telemetry_pattern_and_starts_both_clients(
        self, fake_kafka, monkeypatch
    ):
        async def _handle(*_args, **_kwargs):
            return None

        monkeypatch.setattr(kafka_handler, "handle_iot_telemetry_event", _handle)

        await kafka_handler.start_telemetry_consumer(db_pool=object(), redis_client=object())

        consumer = _FakeConsumer.instances[0]
        producer = _FakeProducer.instances[0]
        assert consumer.subscribed_pattern == r"^equipment\.telemetry\."
        assert consumer.kwargs["group_id"] == "digital-twin-sync"
        assert consumer.kwargs["auto_offset_reset"] == "latest"
        assert consumer.started and producer.started

    @pytest.mark.asyncio
    async def test_stops_both_clients_even_when_the_loop_ends(self, fake_kafka, monkeypatch):
        async def _handle(*_args, **_kwargs):
            return None

        monkeypatch.setattr(kafka_handler, "handle_iot_telemetry_event", _handle)

        await kafka_handler.start_telemetry_consumer(db_pool=object(), redis_client=object())

        assert _FakeConsumer.instances[0].stopped
        assert _FakeProducer.instances[0].stopped

    @pytest.mark.asyncio
    async def test_emits_twin_state_updated_for_each_processed_record(
        self, fake_kafka, monkeypatch
    ):
        state = _twin_state()

        async def _handle(value, **_kwargs):
            return state

        monkeypatch.setattr(kafka_handler, "handle_iot_telemetry_event", _handle)
        _FakeConsumer.instances = []
        consumer_holder: list[_FakeConsumer] = []

        class _Seeded(_FakeConsumer):
            def __init__(self, **kwargs):
                super().__init__(**kwargs)
                self.messages = [_Msg({"equipment_id": "e1"}), _Msg({"equipment_id": "e2"})]
                consumer_holder.append(self)

        monkeypatch.setattr(kafka_handler, "AIOKafkaConsumer", _Seeded)

        await kafka_handler.start_telemetry_consumer(db_pool=object(), redis_client=object())

        producer = _FakeProducer.instances[0]
        assert len(producer.sent) == 2
        topic, payload = producer.sent[0]
        assert topic == "twin.state.updated"
        assert payload["event_type"] == "twin.state.updated"
        assert payload["confidence"] == 1.0
        assert payload["attributes"] == {"fuel_level": 0.75}

    @pytest.mark.asyncio
    async def test_emits_nothing_when_the_handler_returns_no_state(self, fake_kafka, monkeypatch):
        async def _handle(*_args, **_kwargs):
            return None

        monkeypatch.setattr(kafka_handler, "handle_iot_telemetry_event", _handle)

        class _Seeded(_FakeConsumer):
            def __init__(self, **kwargs):
                super().__init__(**kwargs)
                self.messages = [_Msg({"equipment_id": "unknown"})]

        monkeypatch.setattr(kafka_handler, "AIOKafkaConsumer", _Seeded)

        await kafka_handler.start_telemetry_consumer(db_pool=object(), redis_client=object())

        assert _FakeProducer.instances[0].sent == []

    @pytest.mark.asyncio
    async def test_a_failing_record_is_logged_and_the_loop_continues(
        self, fake_kafka, monkeypatch, caplog
    ):
        """One poison telemetry record must not stop twin sync for everyone else."""
        state = _twin_state()
        seen: list[dict] = []

        async def _handle(value, **_kwargs):
            seen.append(value)
            if value.get("equipment_id") == "bad":
                raise ValueError("malformed telemetry")
            return state

        monkeypatch.setattr(kafka_handler, "handle_iot_telemetry_event", _handle)

        class _Seeded(_FakeConsumer):
            def __init__(self, **kwargs):
                super().__init__(**kwargs)
                self.messages = [
                    _Msg({"equipment_id": "bad"}),
                    _Msg({"equipment_id": "good"}),
                ]

        monkeypatch.setattr(kafka_handler, "AIOKafkaConsumer", _Seeded)

        with caplog.at_level("ERROR", logger="digital-twin.kafka"):
            await kafka_handler.start_telemetry_consumer(db_pool=object(), redis_client=object())

        assert [m["equipment_id"] for m in seen] == ["bad", "good"]
        assert len(_FakeProducer.instances[0].sent) == 1  # only the good one published
        assert any("Error processing telemetry event" in r.message for r in caplog.records)

    @pytest.mark.asyncio
    async def test_json_serialisers_round_trip(self, fake_kafka, monkeypatch):
        """Consumer and producer are constructed with json (de)serialisers — assert both work."""

        async def _handle(*_a, **_k):
            return None

        monkeypatch.setattr(kafka_handler, 'handle_iot_telemetry_event', _handle)
        await kafka_handler.start_telemetry_consumer(db_pool=object(), redis_client=object())

        deserialise = _FakeConsumer.instances[0].kwargs['value_deserializer']
        assert deserialise(json.dumps({'a': 1}).encode()) == {'a': 1}

        serialise = _FakeProducer.instances[0].kwargs['value_serializer']
        assert json.loads(serialise({'b': 2}).decode()) == {'b': 2}


class TestPublishDivergenceDetected:
    @pytest.mark.asyncio
    async def test_sends_the_event_on_the_divergence_topic(self, caplog):
        producer = _FakeProducer()
        event = TwinDivergenceEvent(
            project_id=uuid4(),
            tenant_id=uuid4(),
            generated_at=datetime(2026, 6, 8, tzinfo=timezone.utc),
            divergence_count=3,
            max_severity=SeverityLevel.HIGH,
            risk_level="HIGH",
        )

        with caplog.at_level("INFO", logger="digital-twin.kafka"):
            await kafka_handler.publish_divergence_detected(event, producer=producer)

        topic, payload = producer.sent[0]
        assert topic == "twin.divergence.detected"
        assert payload["event_type"] == "twin.divergence.detected"
        assert payload["divergence_count"] == 3
        assert payload["risk_level"] == "HIGH"
        assert any("twin.divergence.detected emitted" in r.message for r in caplog.records)

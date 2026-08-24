"""Unit tests for the production Kafka consumer loop (`consumer.run`).

`run()` carries the module's docstring "Not exercised by unit tests — no broker in the test env",
and that is true of a *real* broker. But the loop holds decisions that matter and would fail
silently: the per-tenant topic RegExp, `earliest` offset reset (backfill parity with the Go
workers), and — most importantly — that one poison message is swallowed so the partition keeps
moving. aiokafka is imported lazily inside `run()`, so a fake module injected into `sys.modules`
substitutes the broker entirely; nothing here opens a socket.
"""
import sys
import types
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import consumer as consumer_module
import pytest
from providers.embedding_provider import EMBEDDING_DIMENSIONS


class _FakeMessage:
    def __init__(self, value: bytes, headers=None):
        self.value = value
        # Default to a tenant_id header matching _event()'s tenant so the §7.3 guard passes.
        self.headers = (
            headers
            if headers is not None
            else [("tenant_id", b"11111111-1111-1111-1111-111111111111")]
        )


class _FakeConsumer:
    """Records construction/lifecycle and yields a fixed list of messages."""

    instances: list = []

    def __init__(self, **kwargs):
        self.kwargs = kwargs
        self.subscribed: dict = {}
        self.started = False
        self.stopped = False
        self.messages: list = list(_FakeConsumer.next_messages)
        _FakeConsumer.instances.append(self)

    next_messages: list = []

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


@pytest.fixture
def fake_aiokafka(monkeypatch):
    _FakeConsumer.instances = []
    _FakeConsumer.next_messages = []
    module = types.ModuleType("aiokafka")
    module.AIOKafkaConsumer = _FakeConsumer
    monkeypatch.setitem(sys.modules, "aiokafka", module)
    return _FakeConsumer


class _FakeEmbedder:
    async def embed(self, texts):
        return [[0.0] * EMBEDDING_DIMENSIONS for _ in texts]

    @property
    def dimensions(self):
        return EMBEDDING_DIMENSIONS


class _FakePool:
    def __init__(self):
        self.rows = None

    async def executemany(self, sql, rows):
        self.rows = rows


def _decode(value: bytes) -> dict:
    import json

    return json.loads(value)


async def _fetch_text(_payload) -> str:
    return "extracted document text"


def _event(file_id="33333333-3333-3333-3333-333333333333") -> bytes:
    import json

    return json.dumps(
        {
            "tenant_id": "11111111-1111-1111-1111-111111111111",
            "payload": {
                "file_id": file_id,
                "tenant_id": "11111111-1111-1111-1111-111111111111",
                "source_type": "document",
            },
        }
    ).encode()


class TestRunConfiguration:
    @pytest.mark.asyncio
    async def test_subscribes_to_every_tenants_upload_topic(self, fake_aiokafka):
        await consumer_module.run(
            decode=_decode, fetch_text=_fetch_text, embedder=_FakeEmbedder(), db_pool=_FakePool()
        )

        created = fake_aiokafka.instances[0]
        assert created.subscribed == {"pattern": consumer_module.TOPIC_PATTERN}

    @pytest.mark.asyncio
    async def test_uses_the_shared_consumer_group_and_earliest_offsets(self, fake_aiokafka):
        await consumer_module.run(
            decode=_decode, fetch_text=_fetch_text, embedder=_FakeEmbedder(), db_pool=_FakePool()
        )

        kwargs = fake_aiokafka.instances[0].kwargs
        assert kwargs["group_id"] == consumer_module.CONSUMER_GROUP
        # earliest = backfill history, the same rationale as the Go workers.
        assert kwargs["auto_offset_reset"] == "earliest"
        assert kwargs["enable_auto_commit"] is True

    @pytest.mark.asyncio
    async def test_brokers_come_from_env_with_a_local_default(self, fake_aiokafka, monkeypatch):
        monkeypatch.setenv("KAFKA_BROKERS", "kafka-1:9092,kafka-2:9092")
        await consumer_module.run(
            decode=_decode, fetch_text=_fetch_text, embedder=_FakeEmbedder(), db_pool=_FakePool()
        )
        assert fake_aiokafka.instances[0].kwargs["bootstrap_servers"] == "kafka-1:9092,kafka-2:9092"

        monkeypatch.delenv("KAFKA_BROKERS", raising=False)
        await consumer_module.run(
            decode=_decode, fetch_text=_fetch_text, embedder=_FakeEmbedder(), db_pool=_FakePool()
        )
        assert fake_aiokafka.instances[1].kwargs["bootstrap_servers"] == "localhost:29092"


class TestRunLifecycle:
    @pytest.mark.asyncio
    async def test_starts_and_always_stops_the_consumer(self, fake_aiokafka):
        await consumer_module.run(
            decode=_decode, fetch_text=_fetch_text, embedder=_FakeEmbedder(), db_pool=_FakePool()
        )

        created = fake_aiokafka.instances[0]
        assert created.started is True
        assert created.stopped is True

    @pytest.mark.asyncio
    async def test_processes_each_message_through_the_ingestion_pipeline(self, fake_aiokafka):
        fake_aiokafka.next_messages = [_FakeMessage(_event()), _FakeMessage(_event("44444444-4444-4444-4444-444444444444"))]
        pool = _FakePool()

        await consumer_module.run(
            decode=_decode, fetch_text=_fetch_text, embedder=_FakeEmbedder(), db_pool=pool
        )

        # The last message's rows are what remain on the pool — proof the loop reached ingestion.
        assert pool.rows is not None


class TestPoisonMessageHandling:
    @pytest.mark.asyncio
    async def test_a_bad_message_does_not_stop_the_partition(self, fake_aiokafka):
        # The whole point of the broad except: one undecodable record must not wedge the consumer.
        fake_aiokafka.next_messages = [_FakeMessage(b"not-json"), _FakeMessage(_event())]
        pool = _FakePool()

        await consumer_module.run(
            decode=_decode, fetch_text=_fetch_text, embedder=_FakeEmbedder(), db_pool=pool
        )

        assert pool.rows is not None  # the good message after the poison one still landed

    @pytest.mark.asyncio
    async def test_failure_is_logged_rather_than_silently_dropped(self, fake_aiokafka, caplog):
        import logging

        fake_aiokafka.next_messages = [_FakeMessage(b"not-json")]

        with caplog.at_level(logging.ERROR, logger="ai-embedding-worker"):
            await consumer_module.run(
                decode=_decode,
                fetch_text=_fetch_text,
                embedder=_FakeEmbedder(),
                db_pool=_FakePool(),
            )

        assert "ingestion failed" in caplog.text

    @pytest.mark.asyncio
    async def test_consumer_is_stopped_even_when_a_message_fails(self, fake_aiokafka):
        fake_aiokafka.next_messages = [_FakeMessage(b"not-json")]

        await consumer_module.run(
            decode=_decode, fetch_text=_fetch_text, embedder=_FakeEmbedder(), db_pool=_FakePool()
        )

        assert fake_aiokafka.instances[0].stopped is True

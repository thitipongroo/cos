"""Kafka ingestion consumer (§22.7 — "Triggered by Kafka consumer on file.uploaded").

Subscribes to every tenant's ``{tenant_id}.file.document.uploaded.v1`` topic and drives the
ingestion pipeline: OCR (if the file is a PDF/image) → chunk → embed → store.

Two deliberate seams keep this testable and honest about what is NOT built:

  - ``decode`` is injected. Events on the bus are Confluent-framed Avro (the same wire format the Go
    workers decode via srclient+goavro). A Python Confluent Schema Registry decoder is NOT built in
    this pass — inject one in production; tests inject a trivial JSON decoder.
  - ``fetch_text`` is injected. In production it calls the OCR pipeline (PDF/image) or reads the
    file text directly; tests inject a stub.

aiokafka DOES support pattern subscription natively (``subscribe(pattern=...)``), unlike sarama, so
the per-tenant topic model needs no franz-go-style workaround on the Python side.
"""

from __future__ import annotations

import os
from collections.abc import Awaitable, Callable

from ingestion import UploadedDocument, ingest_document
from providers.embedding_provider import EmbeddingProvider

# Matches {tenant_id}.file.document.uploaded.v1 across all tenants (§7.3 per-tenant topics).
TOPIC_PATTERN = r"^[^.]+\.file\.document\.uploaded\.v1$"
CONSUMER_GROUP = "ai-embedding-worker.shared"

DecodeFn = Callable[[bytes], dict]
FetchTextFn = Callable[[dict], Awaitable[str]]


def header_value(headers, key: str) -> str | None:
    """First matching Kafka header value as str (aiokafka headers are (str, bytes) tuples)."""
    for k, v in headers or []:
        if k == key:
            return v.decode() if isinstance(v, (bytes, bytearray)) else v
    return None


async def handle_record(
    value: bytes,
    *,
    header_tenant_id: str | None,
    decode: DecodeFn,
    fetch_text: FetchTextFn,
    embedder: EmbeddingProvider,
    db_pool,
) -> int:
    """Decode one event, resolve its text, and ingest it. Returns chunks stored.

    An event whose file yields no text (empty OCR) stores nothing rather than erroring — a blank
    scan is a normal outcome, not a pipeline failure.
    """
    envelope = decode(value)
    payload = envelope.get("payload", envelope)
    event_tenant_id = envelope.get("tenant_id") or payload["tenant_id"]

    # §7.3 tenant isolation guard: the tenant_id message header is a secondary validation. A missing
    # or mismatched header means the message was misrouted or tampered with — reject it, never embed
    # it under the payload's claimed tenant (parity with the Go coskafka consumer's TENANT_ID_MISMATCH
    # → DLQ). Without this, a forged/misrouted event poisons another tenant's RAG index.
    if not header_tenant_id or header_tenant_id != event_tenant_id:
        raise ValueError(
            f"tenant_id header missing or does not match envelope "
            f"(header={header_tenant_id!r}, event={event_tenant_id!r})"
        )

    text = await fetch_text(payload)
    if not text:
        return 0

    doc = UploadedDocument(
        tenant_id=event_tenant_id,
        source_type=payload.get("source_type", "document"),
        source_id=payload["file_id"],
        text=text,
    )
    return await ingest_document(doc, embedder=embedder, db_pool=db_pool)


async def run(*, decode: DecodeFn, fetch_text: FetchTextFn, embedder: EmbeddingProvider, db_pool):
    """Production consumer loop. Not exercised by unit tests — no broker in the test env."""
    from aiokafka import AIOKafkaConsumer

    brokers = os.environ.get("KAFKA_BROKERS", "localhost:29092")
    consumer = AIOKafkaConsumer(
        group_id=CONSUMER_GROUP,
        bootstrap_servers=brokers,
        enable_auto_commit=True,
        auto_offset_reset="earliest",  # backfill history, same rationale as the Go workers
    )
    consumer.subscribe(pattern=TOPIC_PATTERN)
    await consumer.start()
    try:
        async for msg in consumer:
            try:
                await handle_record(
                    msg.value,
                    header_tenant_id=header_value(msg.headers, "tenant_id"),
                    decode=decode,
                    fetch_text=fetch_text,
                    embedder=embedder,
                    db_pool=db_pool,
                )
            except Exception:  # noqa: BLE001 — one bad message must not stop the partition
                # Production wiring should route to a DLQ (parity with the Go workers); logged here.
                import logging

                logging.getLogger("ai-embedding-worker").exception("ingestion failed")
    finally:
        await consumer.stop()

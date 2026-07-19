"""A6 — consumer handle_record, verified with fakes.

The real aiokafka loop and the Python Avro decoder are NOT unit-tested (no broker; the Confluent
decoder is an injected seam not built in this pass). handle_record's own logic — decode → fetch
text → ingest, and the empty-text short-circuit — is verified here.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import json

import pytest
from consumer import TOPIC_PATTERN, handle_record
from providers.embedding_provider import EMBEDDING_DIMENSIONS


def _json_decode(value: bytes) -> dict:
    return json.loads(value.decode("utf-8"))


class _FakeEmbedder:
    async def embed(self, texts):
        return [[0.1] * EMBEDDING_DIMENSIONS for _ in texts]

    @property
    def dimensions(self):
        return EMBEDDING_DIMENSIONS


class _FakePool:
    def __init__(self):
        self.rows = None

    async def executemany(self, sql, rows):
        self.rows = rows


def test_topic_pattern_matches_only_file_uploaded():
    import re

    rx = re.compile(TOPIC_PATTERN)
    assert rx.match("tenant-a.file.document.uploaded.v1")
    assert not rx.match("tenant-a.carbon.record.created.v1")
    assert not rx.match("file.document.uploaded.v1")  # needs a tenant prefix


@pytest.mark.asyncio
async def test_ingests_a_document_event():
    pool = _FakePool()
    value = json.dumps(
        {
            "tenant_id": "11111111-1111-1111-1111-111111111111",
            "payload": {"file_id": "22222222-2222-2222-2222-222222222222", "source_type": "document"},
        }
    ).encode()

    async def fetch_text(payload):
        return "extracted document text"

    stored = await handle_record(
        value, decode=_json_decode, fetch_text=fetch_text, embedder=_FakeEmbedder(), db_pool=pool
    )

    assert stored == 1
    assert pool.rows[0][0] == "11111111-1111-1111-1111-111111111111"


@pytest.mark.asyncio
async def test_blank_text_stores_nothing():
    pool = _FakePool()
    value = json.dumps(
        {"tenant_id": "11111111-1111-1111-1111-111111111111", "payload": {"file_id": "33333333-3333-3333-3333-333333333333"}}
    ).encode()

    async def fetch_text(payload):
        return ""  # e.g. a blank scan

    stored = await handle_record(
        value, decode=_json_decode, fetch_text=fetch_text, embedder=_FakeEmbedder(), db_pool=pool
    )

    assert stored == 0
    assert pool.rows is None

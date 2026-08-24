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
from consumer import TOPIC_PATTERN, handle_record, header_value
from providers.embedding_provider import EMBEDDING_DIMENSIONS

TENANT_A = "11111111-1111-1111-1111-111111111111"


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
        value,
        header_tenant_id=TENANT_A,
        decode=_json_decode,
        fetch_text=fetch_text,
        embedder=_FakeEmbedder(),
        db_pool=pool,
    )

    assert stored == 1
    assert pool.rows[0][0] == TENANT_A


@pytest.mark.asyncio
async def test_blank_text_stores_nothing():
    pool = _FakePool()
    value = json.dumps(
        {"tenant_id": "11111111-1111-1111-1111-111111111111", "payload": {"file_id": "33333333-3333-3333-3333-333333333333"}}
    ).encode()

    async def fetch_text(payload):
        return ""  # e.g. a blank scan

    stored = await handle_record(
        value,
        header_tenant_id=TENANT_A,
        decode=_json_decode,
        fetch_text=fetch_text,
        embedder=_FakeEmbedder(),
        db_pool=pool,
    )

    assert stored == 0
    assert pool.rows is None


# ── §7.3 tenant-header guard ─────────────────────────────────────────────────


async def _fail_fetch(payload):  # must never be reached when the guard rejects
    raise AssertionError("fetch_text should not be called when the tenant header is rejected")


@pytest.mark.parametrize("header", [None, "22222222-2222-2222-2222-222222222222", ""])
@pytest.mark.asyncio
async def test_rejects_missing_or_mismatched_tenant_header(header):
    pool = _FakePool()
    value = json.dumps({"tenant_id": TENANT_A, "payload": {"file_id": "f1"}}).encode()

    with pytest.raises(ValueError, match="tenant_id header"):
        await handle_record(
            value,
            header_tenant_id=header,
            decode=_json_decode,
            fetch_text=_fail_fetch,
            embedder=_FakeEmbedder(),
            db_pool=pool,
        )
    assert pool.rows is None  # nothing embedded/stored


def test_header_value_decodes_and_defaults():
    assert header_value([("tenant_id", b"t-1")], "tenant_id") == "t-1"
    assert header_value([("tenant_id", "t-2")], "tenant_id") == "t-2"  # already str
    assert header_value([("other", b"x")], "tenant_id") is None
    assert header_value(None, "tenant_id") is None

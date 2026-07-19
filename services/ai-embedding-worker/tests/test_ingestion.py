"""A6 — ingestion pipeline logic, verified with fakes.

The embed step is MOCK-only (no OPENAI_API_KEY). Chunking, dedup keying, vector-literal shaping, and
the insert contract are verified here; the real INSERT ... ON CONFLICT runs against the real table
in the integration check.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from ingestion import UploadedDocument, ingest_document, _content_hash, _to_vector_literal
from providers.embedding_provider import EMBEDDING_DIMENSIONS


class _FakeEmbedder:
    def __init__(self):
        self.calls = []

    async def embed(self, texts):
        self.calls.append(texts)
        return [[0.01 * (i + 1)] * EMBEDDING_DIMENSIONS for i in range(len(texts))]

    @property
    def dimensions(self):
        return EMBEDDING_DIMENSIONS


class _FakePool:
    def __init__(self):
        self.rows = None
        self.sql = None

    async def executemany(self, sql, rows):
        self.sql = sql
        self.rows = rows


@pytest.mark.asyncio
async def test_site_report_is_one_chunk_one_vector():
    embedder, pool = _FakeEmbedder(), _FakePool()
    doc = UploadedDocument("11111111-1111-1111-1111-111111111111", "site_report", "22222222-2222-2222-2222-222222222222", "short report text")

    stored = await ingest_document(doc, embedder=embedder, db_pool=pool)

    assert stored == 1
    assert len(pool.rows) == 1
    assert embedder.calls == [["short report text"]]


@pytest.mark.asyncio
async def test_long_document_is_chunked_and_each_chunk_embedded():
    embedder, pool = _FakeEmbedder(), _FakePool()
    long_text = "sentence. " * 400  # forces multiple 500-char chunks
    doc = UploadedDocument("11111111-1111-1111-1111-111111111111", "document", "33333333-3333-3333-3333-333333333333", long_text)

    stored = await ingest_document(doc, embedder=embedder, db_pool=pool)

    assert stored > 1
    # one embed call, batched, with one entry per chunk
    assert len(embedder.calls) == 1
    assert len(embedder.calls[0]) == stored
    # chunk_index is 0-based and contiguous
    indices = [row[5] for row in pool.rows]
    assert indices == list(range(stored))


@pytest.mark.asyncio
async def test_row_shape_matches_insert_columns():
    embedder, pool = _FakeEmbedder(), _FakePool()
    doc = UploadedDocument("11111111-1111-1111-1111-111111111111", "document", "44444444-4444-4444-4444-444444444444", "hello world")

    await ingest_document(doc, embedder=embedder, db_pool=pool)

    row = pool.rows[0]
    tenant, source_type, source_id, chunk_text, content_hash, chunk_index, vector_literal = row
    assert source_type == "document"
    assert content_hash == _content_hash(chunk_text)
    assert vector_literal.startswith("[") and vector_literal.endswith("]")
    assert "ON CONFLICT (tenant_id, source_id, chunk_index) DO NOTHING" in pool.sql


@pytest.mark.asyncio
async def test_empty_text_stores_nothing():
    embedder, pool = _FakeEmbedder(), _FakePool()
    doc = UploadedDocument("11111111-1111-1111-1111-111111111111", "document", "55555555-5555-5555-5555-555555555555", "")

    assert await ingest_document(doc, embedder=embedder, db_pool=pool) == 0


def test_vector_literal_format():
    assert _to_vector_literal([0.1, 0.2, 0.3]) == "[0.1,0.2,0.3]"


def test_content_hash_is_sha256_hex():
    h = _content_hash("abc")
    assert len(h) == 64 and all(c in "0123456789abcdef" for c in h)

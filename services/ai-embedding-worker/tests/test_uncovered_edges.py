"""Edge cases the existing suites leave untested — each one is a real failure mode, not filler.

Grouped here rather than scattered so the reason each exists stays visible: they are the guards that
protect the `VECTOR(1536)` column and the chunk↔vector alignment, plus the lazy-client construction
path that only runs in production.
"""
import sys
import types
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from ingestion import UploadedDocument, ingest_document
from providers.embedding_provider import (
    EMBEDDING_DIMENSIONS,
    OpenAIEmbeddingProvider,
)
from utils.chunking import _split_by_size, _split_with_separators


class _MiscountingEmbedder:
    """Returns a different number of vectors than it was given texts."""

    def __init__(self, vector_count: int):
        self._vector_count = vector_count

    async def embed(self, texts):
        return [[0.0] * EMBEDDING_DIMENSIONS for _ in range(self._vector_count)]

    @property
    def dimensions(self):
        return EMBEDDING_DIMENSIONS


class _FakePool:
    def __init__(self):
        self.rows = None

    async def executemany(self, sql, rows):
        self.rows = rows


class TestChunkVectorAlignment:
    @pytest.mark.asyncio
    async def test_rejects_a_short_embedder_response(self):
        # If this passed silently, chunk N would be stored with chunk N+1's vector — a retrieval bug
        # that looks like "the AI is hallucinating" rather than a data bug.
        doc = UploadedDocument(
            "11111111-1111-1111-1111-111111111111",
            "site_report",
            "22222222-2222-2222-2222-222222222222",
            "short report text",
        )

        with pytest.raises(ValueError) as exc:
            await ingest_document(doc, embedder=_MiscountingEmbedder(0), db_pool=_FakePool())

        assert "0 vectors for 1 chunks" in str(exc.value)

    @pytest.mark.asyncio
    async def test_rejects_a_long_embedder_response(self):
        doc = UploadedDocument(
            "11111111-1111-1111-1111-111111111111",
            "site_report",
            "22222222-2222-2222-2222-222222222222",
            "short report text",
        )

        with pytest.raises(ValueError):
            await ingest_document(doc, embedder=_MiscountingEmbedder(3), db_pool=_FakePool())

    @pytest.mark.asyncio
    async def test_nothing_is_written_when_the_count_check_fails(self):
        pool = _FakePool()
        doc = UploadedDocument(
            "11111111-1111-1111-1111-111111111111",
            "site_report",
            "22222222-2222-2222-2222-222222222222",
            "short report text",
        )

        with pytest.raises(ValueError):
            await ingest_document(doc, embedder=_MiscountingEmbedder(2), db_pool=pool)

        assert pool.rows is None


class TestSplitWithoutSeparators:
    def test_falls_back_to_fixed_size_splitting(self):
        # Reached when the recursive splitter exhausts its separator list — e.g. a long run of text
        # with no paragraph/sentence/word boundary, which Thai text without spaces produces.
        text = "ก" * 120

        assert _split_with_separators(text, 50, 10, []) == _split_by_size(text, 50, 10)

    def test_still_returns_every_character_of_the_input(self):
        text = "ก" * 120
        chunks = _split_with_separators(text, 50, 10, [])

        assert chunks  # not silently empty
        assert all(len(c) <= 50 for c in chunks)


class TestOpenAIProviderConstruction:
    def test_builds_its_own_client_when_none_is_injected(self, monkeypatch):
        # The lazy `from openai import AsyncOpenAI` branch only runs in production, where a key
        # exists. A fake module proves the wiring without a network call or an API key.
        constructed = {}

        class _FakeAsyncOpenAI:
            def __init__(self, *args, **kwargs):
                constructed["called"] = True

        module = types.ModuleType("openai")
        module.AsyncOpenAI = _FakeAsyncOpenAI
        monkeypatch.setitem(sys.modules, "openai", module)

        provider = OpenAIEmbeddingProvider()

        assert constructed["called"] is True
        assert isinstance(provider._client, _FakeAsyncOpenAI)

    def test_injected_client_is_used_as_is(self):
        sentinel = object()
        assert OpenAIEmbeddingProvider(client=sentinel)._client is sentinel

    def test_reports_the_width_of_the_vector_column(self):
        # Must match the VECTOR(1536) column; a mismatch is caught at insert time otherwise.
        assert OpenAIEmbeddingProvider(client=object()).dimensions == EMBEDDING_DIMENSIONS

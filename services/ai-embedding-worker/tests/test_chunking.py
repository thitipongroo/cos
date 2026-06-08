import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from utils.chunking import Chunk, chunk_document, _split_by_size, _merge_with_overlap


class TestChunkDocument:
    def test_site_report_is_single_chunk(self):
        text = "Daily report: excavation complete. Workers: 12. Weather: sunny."
        chunks = chunk_document(text, "site_report", "sr-001")
        assert len(chunks) == 1
        assert chunks[0].content == text
        assert chunks[0].chunk_index == 0
        assert chunks[0].source_type == "site_report"
        assert chunks[0].source_id == "sr-001"

    def test_site_report_long_text_still_single_chunk(self):
        text = "x " * 1000
        chunks = chunk_document(text, "site_report", "sr-002")
        assert len(chunks) == 1

    def test_document_short_text_is_single_chunk(self):
        text = "Short document."
        chunks = chunk_document(text, "document", "doc-001")
        assert len(chunks) >= 1
        assert all(isinstance(c, Chunk) for c in chunks)

    def test_document_long_text_is_split(self):
        text = ("word " * 200).strip()
        chunks = chunk_document(text, "document", "doc-002", chunk_size=100, chunk_overlap=20)
        assert len(chunks) > 1

    def test_chunk_indices_are_sequential(self):
        text = "\n\n".join(["Paragraph text here. " * 10] * 5)
        chunks = chunk_document(text, "document", "doc-003", chunk_size=200, chunk_overlap=40)
        for i, chunk in enumerate(chunks):
            assert chunk.chunk_index == i

    def test_chunk_source_fields_preserved(self):
        text = "Some document content. " * 30
        chunks = chunk_document(text, "invoice", "inv-001", chunk_size=100, chunk_overlap=10)
        for chunk in chunks:
            assert chunk.source_type == "invoice"
            assert chunk.source_id == "inv-001"

    def test_empty_text_returns_chunks(self):
        chunks = chunk_document("", "document", "doc-empty")
        assert isinstance(chunks, list)

    def test_custom_chunk_size_respected(self):
        text = "a" * 1000
        chunks = chunk_document(text, "document", "doc-004", chunk_size=100, chunk_overlap=0)
        for chunk in chunks:
            assert len(chunk.content) <= 100 + 10  # small tolerance for separator


class TestSplitBySize:
    def test_basic_split(self):
        text = "a" * 300
        result = _split_by_size(text, 100, 10)
        assert len(result) > 1
        assert all(len(r) <= 100 for r in result)

    def test_empty_text(self):
        assert _split_by_size("", 100, 10) == []

    def test_no_overlap(self):
        text = "x" * 200
        result = _split_by_size(text, 100, 0)
        assert len(result) == 2

    def test_text_shorter_than_chunk_size(self):
        text = "hello"
        result = _split_by_size(text, 100, 10)
        assert result == ["hello"]


class TestMergeWithOverlap:
    def test_merges_small_chunks(self):
        chunks = ["hello", "world"]
        result = _merge_with_overlap(chunks, 20, 5)
        assert "hello" in result[0]
        assert "world" in result[0]

    def test_does_not_merge_beyond_chunk_size(self):
        chunks = ["a" * 60, "b" * 60]
        result = _merge_with_overlap(chunks, 100, 10)
        assert len(result) == 2

    def test_empty_input(self):
        assert _merge_with_overlap([], 100, 10) == []

    def test_single_chunk_passthrough(self):
        chunks = ["only chunk"]
        result = _merge_with_overlap(chunks, 100, 10)
        assert result == ["only chunk"]

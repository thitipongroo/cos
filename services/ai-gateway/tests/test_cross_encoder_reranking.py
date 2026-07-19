"""A7 — cross-encoder reranker ranking logic, verified with a fake model.

The real CrossEncoder (torch) is NOT loaded in this env — these tests inject a fake predict() to
verify pairing, descending sort, and stability. The actual model inference has not run here.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from providers.cross_encoder_reranking import (
    Document,
    SentenceTransformerReranking,
    StubCrossEncoderReranking,
)


class _FakeModel:
    """Returns a preset score per passage, and records the pairs it was asked to score."""

    def __init__(self, scores):
        self._scores = scores
        self.seen_pairs = None

    def predict(self, pairs):
        self.seen_pairs = pairs
        return self._scores


def _doc(text, sid):
    return Document(content=text, source_id=sid, source_type="document")


def test_reranks_descending_by_score():
    model = _FakeModel([0.2, 0.9, 0.5])
    reranker = SentenceTransformerReranking(model=model)

    ranked = reranker.rerank("q", [_doc("a", "1"), _doc("b", "2"), _doc("c", "3")])

    assert [r.document.source_id for r in ranked] == ["2", "3", "1"]
    assert [round(r.score, 1) for r in ranked] == [0.9, 0.5, 0.2]


def test_pairs_query_with_each_passage():
    model = _FakeModel([0.1, 0.2])
    reranker = SentenceTransformerReranking(model=model)

    reranker.rerank("my query", [_doc("first", "1"), _doc("second", "2")])

    assert model.seen_pairs == [("my query", "first"), ("my query", "second")]


def test_empty_documents_returns_empty_without_loading_model():
    # No model injected and none loaded — must not touch torch for an empty candidate set.
    reranker = SentenceTransformerReranking(model=None)
    assert reranker.rerank("q", []) == []


def test_stub_still_raises_until_activated():
    with pytest.raises(NotImplementedError):
        StubCrossEncoderReranking().rerank("q", [_doc("a", "1")])

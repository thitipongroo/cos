"""Cross-encoder reranking of RAG results (§22.7 Cross-Encoder Reranking, RAG-001).

Model: sentence-transformers ``cross-encoder/ms-marco-MiniLM-L-6-v2``. Reranks the fused BM25+vector
candidate set by scoring each (query, passage) pair, then sorting descending.

This is a CONDITIONAL stage (§22.7 trigger: activate when RAG p95 relevance < 0.7 over a 7-day
window), so it is not on the default hot path — but the implementation must exist for the stage to
switch on.

VERIFICATION NOTE: the real model load pulls torch (~GBs) and is not exercised in the lightweight
test env. The ranking logic (pairing, sorting, order stability) is verified with an injected fake
model; the actual CrossEncoder.predict path has not run here.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass

CROSS_ENCODER_MODEL = "cross-encoder/ms-marco-MiniLM-L-6-v2"


@dataclass
class Document:
    content: str
    source_id: str
    source_type: str


@dataclass
class RankedDocument:
    document: Document
    score: float


class CrossEncoderReranking(ABC):
    @abstractmethod
    def rerank(self, query: str, documents: list[Document]) -> list[RankedDocument]: ...


class StubCrossEncoderReranking(CrossEncoderReranking):
    def rerank(self, query: str, documents: list[Document]) -> list[RankedDocument]:
        raise NotImplementedError(
            "StubCrossEncoderReranking: activate when RAG p95 relevance < 0.7"
        )


class SentenceTransformerReranking(CrossEncoderReranking):
    """Real reranker over a sentence-transformers CrossEncoder.

    ``model`` is injectable so the ranking logic is testable without loading torch. In production it
    defaults to lazily loading ``cross-encoder/ms-marco-MiniLM-L-6-v2``.
    """

    def __init__(self, model=None, model_name: str = CROSS_ENCODER_MODEL) -> None:
        self._model_name = model_name
        self._model = model  # loaded lazily on first use if not injected

    def _ensure_model(self):
        if self._model is None:
            from sentence_transformers import CrossEncoder

            self._model = CrossEncoder(self._model_name)
        return self._model

    def rerank(self, query: str, documents: list[Document]) -> list[RankedDocument]:
        if not documents:
            return []
        model = self._ensure_model()
        pairs = [(query, doc.content) for doc in documents]
        scores = model.predict(pairs)
        ranked = [RankedDocument(document=doc, score=float(s)) for doc, s in zip(documents, scores)]
        # Highest relevance first. Stable sort preserves the retriever's order among equal scores.
        ranked.sort(key=lambda r: r.score, reverse=True)
        return ranked

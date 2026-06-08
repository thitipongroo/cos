from abc import ABC, abstractmethod
from dataclasses import dataclass


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
    """Interface for cross-encoder reranking of RAG retrieval results.

    Model RESOLVED: sentence-transformers cross-encoder/ms-marco-MiniLM-L-6-v2
    Trigger: activate when RAG p95 relevance score < 0.7 over 7-day window
    NOT activated in Phase 12. Source: docs/specifications/22-ai-architecture.md §22.7
    """

    @abstractmethod
    def rerank(self, query: str, documents: list[Document]) -> list[RankedDocument]: ...


class StubCrossEncoderReranking(CrossEncoderReranking):
    def rerank(self, query: str, documents: list[Document]) -> list[RankedDocument]:
        raise NotImplementedError(
            "StubCrossEncoderReranking: activate when RAG p95 relevance < 0.7"
        )

"""RAG retrieval package — Phase 11 AI Foundation.

Provider-agnostic hybrid (keyword + vector) retrieval with Reciprocal Rank Fusion.
See rag/retrieval.py. Config source: ai/chains/rag.yaml.
"""

from .retrieval import (
    HybridRetriever,
    RetrievedChunk,
    SearchBackend,
    RRF_K,
    reciprocal_rank_fusion,
    load_rag_config,
    build_default_retriever,
)

__all__ = [
    "HybridRetriever",
    "RetrievedChunk",
    "SearchBackend",
    "RRF_K",
    "reciprocal_rank_fusion",
    "load_rag_config",
    "build_default_retriever",
]

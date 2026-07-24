"""Embedding provider for ai-embedding-worker — re-exports libs/python/cosembedding (§22.7; ADR-021).

Kept as a module so ``from providers.embedding_provider import ...`` keeps working for the ingestion
pipeline and the tests; the provider implementation lives once in cosembedding, shared with the AI
Gateway's query-side embedder, replacing the copies jscpd flagged.
"""

from cosembedding import (
    EMBEDDING_DIMENSIONS,
    EMBEDDING_MODEL,
    EmbeddingProvider,
    OpenAIEmbeddingProvider,
    StubEmbeddingProvider,
    build_embedding_provider,
)

__all__ = [
    "EMBEDDING_DIMENSIONS",
    "EMBEDDING_MODEL",
    "EmbeddingProvider",
    "OpenAIEmbeddingProvider",
    "StubEmbeddingProvider",
    "build_embedding_provider",
]

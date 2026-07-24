"""Query-side embedding provider for the AI Gateway — re-exports libs/python/cosembedding (§22.7).

The gateway embeds the RAG query at retrieval time (PgVectorBackend.search calls
``embedding_provider.embed([query])``). Same model and contract as the ingestion side in
ai-embedding-worker; the implementation now lives once in cosembedding (ADR-021) rather than being
copied here — the Go workers share code the same way under libs/go.

Kept as a module so ``from providers.embedding_provider import ...`` keeps working for rag/wiring.py
and the tests.
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

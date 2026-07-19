"""Startup wiring for the RAG retriever (§22.7 RAG-001).

Builds a HybridRetriever (OpenSearch keyword + pgvector) from environment config, or returns None
when the backends are not configured — in which case /rag/query keeps returning 503, unchanged.

Kept out of main.py so the "configured vs not" decision is unit-testable without a broker, a
database, or OpenSearch. The actual connections are only opened when every required piece is present.
"""

from __future__ import annotations

import os

from providers.embedding_provider import build_embedding_provider, StubEmbeddingProvider
from rag.backends import OpenSearchKeywordBackend, PgVectorBackend
from rag.retrieval import HybridRetriever


def rag_backends_configured() -> bool:
    """True only when everything the retriever needs is present: a Postgres DSN, an OpenSearch URL,
    and a real embedding provider (a stub cannot embed the query)."""
    has_db = bool(os.environ.get("RAG_DATABASE_URL") or os.environ.get("DATABASE_URL"))
    has_opensearch = bool(os.environ.get("OPENSEARCH_URL"))
    real_embedder = not isinstance(build_embedding_provider(), StubEmbeddingProvider)
    return has_db and has_opensearch and real_embedder


async def build_retriever():
    """Return a HybridRetriever, or None when unconfigured.

    NOT exercised end to end here: with OPENAI_API_KEY unset the embedding provider is the stub, so
    ``rag_backends_configured()`` is False and this returns None before opening any connection. The
    real connection path runs only in a fully-provisioned deployment.
    """
    if not rag_backends_configured():
        return None

    import asyncpg  # local imports so an unconfigured gateway never needs these installed at import
    from opensearchpy import AsyncOpenSearch

    dsn = os.environ.get("RAG_DATABASE_URL") or os.environ["DATABASE_URL"]
    pool = await asyncpg.create_pool(dsn)

    opensearch = AsyncOpenSearch(hosts=[os.environ["OPENSEARCH_URL"]])
    embedder = build_embedding_provider()

    keyword_backend = OpenSearchKeywordBackend(opensearch)
    vector_backend = PgVectorBackend(pool, embedder)
    return HybridRetriever(keyword_backend, vector_backend)

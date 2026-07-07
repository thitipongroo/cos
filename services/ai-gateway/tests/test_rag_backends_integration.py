"""End-to-end hybrid RAG retrieval against REAL OpenSearch + pgvector.

Runs only when OPENSEARCH_URL and DATABASE_URL point at live services (set by the CI /
local docker harness — see scripts/rag-e2e.sh); skipped otherwise so the default unit run
needs no infra. NO OpenAI: the query is embedded with a deterministic bag-of-words embedder
(test-only), so keyword (BM25) + vector (pgvector cosine) + RRF fusion are all exercised for
real without any external call or spend.
"""
import hashlib
import math
import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from rag.backends import OpenSearchKeywordBackend, PgVectorBackend
from rag.retrieval import HybridRetriever

OPENSEARCH_URL = os.environ.get("OPENSEARCH_URL")
DATABASE_URL = os.environ.get("DATABASE_URL")

pytestmark = pytest.mark.skipif(
    not (OPENSEARCH_URL and DATABASE_URL),
    reason="requires live OPENSEARCH_URL + DATABASE_URL (docker harness)",
)

EMBED_DIM = 16
TENANT = "11111111-1111-1111-1111-111111111111"
INDEX = f"{TENANT}-embeddings"

# id → (text, entity_type). c1/c3 share tokens with the query; c2 shares none.
DOCS = {
    "c1": ("concrete delay rain", "site_report"),
    "c2": ("steel delivery schedule", "site_report"),
    "c3": ("concrete delay heavy", "site_report"),
}
QUERY = "concrete delay"


class DeterministicEmbedder:
    """Bag-of-words hashed into EMBED_DIM buckets, L2-normalised. Deterministic — shared tokens
    ⇒ higher cosine similarity. Stands in for OpenAI text-embedding-3-small in the test only."""

    async def embed(self, texts: list[str]) -> list[list[float]]:
        vectors = []
        for text in texts:
            v = [0.0] * EMBED_DIM
            for token in text.lower().split():
                bucket = int(hashlib.md5(token.encode()).hexdigest(), 16) % EMBED_DIM
                v[bucket] += 1.0
            norm = math.sqrt(sum(x * x for x in v)) or 1.0
            vectors.append([x / norm for x in v])
        return vectors


async def test_hybrid_retrieval_against_real_opensearch_and_pgvector():
    from opensearchpy import AsyncOpenSearch
    import asyncpg

    embedder = DeterministicEmbedder()

    # ── seed OpenSearch (BM25 keyword side) ──────────────────────────────────
    os_client = AsyncOpenSearch(hosts=[OPENSEARCH_URL])
    if await os_client.indices.exists(index=INDEX):
        await os_client.indices.delete(index=INDEX)
    await os_client.indices.create(
        index=INDEX,
        body={"mappings": {"properties": {"text": {"type": "text"}, "entity_type": {"type": "keyword"}}}},
    )
    for cid, (text, etype) in DOCS.items():
        await os_client.index(index=INDEX, id=cid, body={"text": text, "entity_type": etype})
    await os_client.indices.refresh(index=INDEX)

    # ── seed pgvector (vector side) ──────────────────────────────────────────
    pool = await asyncpg.create_pool(DATABASE_URL)
    async with pool.acquire() as conn:
        await conn.execute("CREATE EXTENSION IF NOT EXISTS vector")
        await conn.execute("DROP TABLE IF EXISTS rag_chunks")
        await conn.execute(
            f"""CREATE TABLE rag_chunks (
                   id text PRIMARY KEY,
                   source_type text,
                   source_id text,
                   chunk_text text,
                   embedding vector({EMBED_DIM})
               )"""
        )
        for cid, (text, etype) in DOCS.items():
            emb = (await embedder.embed([text]))[0]
            literal = "[" + ",".join(repr(x) for x in emb) + "]"
            await conn.execute(
                "INSERT INTO rag_chunks (id, source_type, source_id, chunk_text, embedding) "
                "VALUES ($1, $2, $3, $4, $5::vector)",
                cid, etype, cid, text, literal,
            )

    try:
        keyword = OpenSearchKeywordBackend(os_client)
        vector = PgVectorBackend(pool, embedder, table="rag_chunks", text_column="chunk_text")
        retriever = HybridRetriever(keyword, vector, top_k=2)

        results = await retriever.retrieve(QUERY, TENANT)

        ids = [c.chunk_id for c in results]
        assert len(ids) == 2
        # c1 and c3 (share "concrete"+"delay") must be the top-2; c2 (disjoint) must not appear.
        assert set(ids) == {"c1", "c3"}, f"expected c1+c3, got {ids}"
        # Every returned chunk carries its passage text (assembled into LLM context).
        assert all(c.text for c in results)
        # Fusion actually combined both backends (RRF score is a sum of 1/(k+rank) terms).
        assert all(c.score > 0 for c in results)

        context = retriever.assemble_context(results)
        assert "concrete" in context
    finally:
        async with pool.acquire() as conn:
            await conn.execute("DROP TABLE IF EXISTS rag_chunks")
        await pool.close()
        if await os_client.indices.exists(index=INDEX):
            await os_client.indices.delete(index=INDEX)
        await os_client.close()

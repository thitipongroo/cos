"""Concrete retrieval backends for the hybrid RAG service (Phase 11).

  OpenSearchKeywordBackend — BM25 keyword search over the tenant's embeddings index
                             (self-hosted OpenSearch; no external SaaS).
  PgVectorBackend          — cosine-similarity vector search over pgvector, tenant-scoped
                             via the `app.current_tenant_id` RLS GUC.

Both satisfy rag.retrieval.SearchBackend and are injected into the HybridRetriever at the
gateway edge (main.py startup). The query embedding for the vector path is produced by an
injected EmbeddingProvider — OpenAI text-embedding-3-small in production; a deterministic
test embedder in the integration test (so retrieval is provable without any external call).

Text-source note: the pgvector table must expose the chunk text on a column (default
`chunk_text`). ai.document_embeddings (§22.3) stores only the vector + source refs, so a
deployment either adds a text column to the vector store or points this backend at a table
that carries it (`table=`/`text_column=` are configurable). This is the one retrieval detail
the spec leaves to implementation; it is surfaced here rather than guessed silently.
"""
from __future__ import annotations

from typing import Protocol

from .retrieval import RetrievedChunk


class EmbeddingProvider(Protocol):
    """Query embedding provider (OpenAI text-embedding-3-small in production)."""

    async def embed(self, texts: list[str]) -> list[list[float]]: ...


class OpenSearchKeywordBackend:
    """BM25 keyword retrieval. `index_template` is formatted with the tenant id (per Phase 11,
    embeddings are indexed to `{tenant_id}-embeddings`)."""

    def __init__(
        self,
        client,
        index_template: str = "{tenant_id}-embeddings",
        text_field: str = "text",
    ) -> None:
        self._client = client
        self._index_template = index_template
        self._text_field = text_field

    async def search(
        self,
        query: str,
        tenant_id: str,
        top_k: int,
        entity_types: list[str] | None = None,
    ) -> list[RetrievedChunk]:
        index = self._index_template.format(tenant_id=tenant_id)
        filters: list[dict] = []
        if entity_types:
            filters.append({"terms": {"entity_type": entity_types}})
        body = {
            "size": top_k,
            "query": {"bool": {"must": [{"match": {self._text_field: query}}], "filter": filters}},
        }
        resp = await self._client.search(index=index, body=body)
        hits = resp.get("hits", {}).get("hits", [])
        chunks: list[RetrievedChunk] = []
        for hit in hits:
            source = hit.get("_source", {})
            chunks.append(
                RetrievedChunk(
                    chunk_id=str(hit["_id"]),
                    text=source.get(self._text_field, ""),
                    score=float(hit.get("_score") or 0.0),
                    entity_type=source.get("entity_type"),
                    entity_id=source.get("entity_id"),
                    metadata={"backend": "opensearch"},
                )
            )
        return chunks


def _to_vector_literal(embedding: list[float]) -> str:
    """pgvector accepts a bracketed literal, e.g. '[0.1,0.2,...]', cast with ::vector."""
    return "[" + ",".join(repr(float(x)) for x in embedding) + "]"


class PgVectorBackend:
    """Cosine-similarity retrieval over a pgvector table. Runs inside a transaction that sets
    `app.current_tenant_id` so the RESTRICTIVE RLS policy (§22.3) scopes rows to the tenant."""

    def __init__(
        self,
        pool,
        embedding_provider: EmbeddingProvider,
        # Schema-qualified, and it must stay that way. ai-embedding-worker writes to
        # `ai.document_embeddings` (created by 20260720000001_document_embeddings) while this
        # reader used the bare name; nothing in the application, the DSN, or any ALTER ROLE sets
        # search_path, so the query resolved against the default path and would not find the table
        # at all. The unit tests mock the connection pool, so nothing caught it.
        # (QM-4 / spec §11.0 rule 2 — the same defect class as the outbox INSERT, ADR-011.)
        table: str = "ai.document_embeddings",
        id_column: str = "id",
        text_column: str = "chunk_text",
        embedding_column: str = "embedding",
        source_type_column: str = "source_type",
        source_id_column: str = "source_id",
    ) -> None:
        self._pool = pool
        self._embedding_provider = embedding_provider
        self._table = table
        self._id = id_column
        self._text = text_column
        self._embedding = embedding_column
        self._source_type = source_type_column
        self._source_id = source_id_column

    async def search(
        self,
        query: str,
        tenant_id: str,
        top_k: int,
        entity_types: list[str] | None = None,
    ) -> list[RetrievedChunk]:
        embeddings = await self._embedding_provider.embed([query])
        vector_literal = _to_vector_literal(embeddings[0])

        args: list = [vector_literal, top_k]
        entity_filter = ""
        if entity_types:
            args.append(entity_types)
            entity_filter = f"AND {self._source_type} = ANY($3)"

        # Cosine distance operator `<=>`; similarity = 1 - distance. Order by distance ASC.
        sql = (
            f"SELECT {self._id} AS id, {self._text} AS text, "
            f"{self._source_type} AS source_type, {self._source_id} AS source_id, "
            f"1 - ({self._embedding} <=> $1::vector) AS score "
            f"FROM {self._table} "
            f"WHERE TRUE {entity_filter} "
            f"ORDER BY {self._embedding} <=> $1::vector "
            f"LIMIT $2"
        )

        async with self._pool.acquire() as conn:
            async with conn.transaction():
                # is_local=true → scoped to this transaction; RLS reads it via current_setting().
                await conn.execute("SELECT set_config('app.current_tenant_id', $1, true)", tenant_id)
                rows = await conn.fetch(sql, *args)

        chunks: list[RetrievedChunk] = []
        for row in rows:
            chunks.append(
                RetrievedChunk(
                    chunk_id=str(row["id"]),
                    text=row["text"] or "",
                    score=float(row["score"]),
                    entity_type=row["source_type"],
                    entity_id=str(row["source_id"]) if row["source_id"] is not None else None,
                    metadata={"backend": "pgvector"},
                )
            )
        return chunks

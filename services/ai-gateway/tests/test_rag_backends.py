"""Unit tests for the concrete RAG backends (rag/backends.py) with mocked OpenSearch / asyncpg
clients. No real infra — the real-infra proof lives in test_rag_backends_integration.py."""
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from rag.backends import OpenSearchKeywordBackend, PgVectorBackend, _to_vector_literal


class _AsyncCtx:
    """Minimal async context manager yielding a fixed value (mocks asyncpg acquire/transaction)."""

    def __init__(self, value):
        self._value = value

    async def __aenter__(self):
        return self._value

    async def __aexit__(self, *exc):
        return False


# ── OpenSearchKeywordBackend ──────────────────────────────────────────────────

class TestOpenSearchKeywordBackend:
    def _client(self, hits):
        client = MagicMock()
        client.search = AsyncMock(return_value={"hits": {"hits": hits}})
        return client

    async def test_maps_hits_to_chunks(self):
        client = self._client(
            [
                {"_id": "c1", "_score": 3.2, "_source": {"text": "alpha", "entity_type": "site_report"}},
                {"_id": "c2", "_score": 1.1, "_source": {"text": "beta"}},
            ]
        )
        backend = OpenSearchKeywordBackend(client)
        out = await backend.search("q", "t1", top_k=5)
        assert [c.chunk_id for c in out] == ["c1", "c2"]
        assert out[0].text == "alpha"
        assert out[0].score == 3.2
        assert out[0].entity_type == "site_report"
        assert out[0].metadata["backend"] == "opensearch"

    async def test_index_is_tenant_scoped_and_size_is_top_k(self):
        client = self._client([])
        backend = OpenSearchKeywordBackend(client)
        await backend.search("q", "tenant-9", top_k=7)
        kwargs = client.search.call_args.kwargs
        assert kwargs["index"] == "tenant-9-embeddings"
        assert kwargs["body"]["size"] == 7

    async def test_entity_types_add_terms_filter(self):
        client = self._client([])
        backend = OpenSearchKeywordBackend(client)
        await backend.search("q", "t1", top_k=5, entity_types=["site_report"])
        body = client.search.call_args.kwargs["body"]
        assert body["query"]["bool"]["filter"] == [{"terms": {"entity_type": ["site_report"]}}]

    async def test_no_entity_types_no_filter(self):
        client = self._client([])
        backend = OpenSearchKeywordBackend(client)
        await backend.search("q", "t1", top_k=5)
        body = client.search.call_args.kwargs["body"]
        assert body["query"]["bool"]["filter"] == []


# ── PgVectorBackend ───────────────────────────────────────────────────────────

class TestPgVectorBackend:
    def _pool(self, rows, conn_holder):
        conn = AsyncMock()
        conn.execute = AsyncMock()
        conn.fetch = AsyncMock(return_value=rows)
        conn.transaction = MagicMock(return_value=_AsyncCtx(None))
        conn_holder["conn"] = conn
        pool = MagicMock()
        pool.acquire = MagicMock(return_value=_AsyncCtx(conn))
        return pool

    def _embedder(self, vec):
        emb = MagicMock()
        emb.embed = AsyncMock(return_value=[vec])
        return emb

    async def test_embeds_query_and_maps_rows(self):
        holder: dict = {}
        rows = [
            {"id": "v1", "text": "alpha", "source_type": "site_report", "source_id": "s1", "score": 0.91},
            {"id": "v2", "text": "beta", "source_type": "boq", "source_id": "s2", "score": 0.42},
        ]
        pool = self._pool(rows, holder)
        emb = self._embedder([0.1, 0.2, 0.3])
        backend = PgVectorBackend(pool, emb)
        out = await backend.search("delays", "t1", top_k=5)

        emb.embed.assert_awaited_once_with(["delays"])
        assert [c.chunk_id for c in out] == ["v1", "v2"]
        assert out[0].text == "alpha"
        assert out[0].score == 0.91
        assert out[0].entity_type == "site_report"
        assert out[0].metadata["backend"] == "pgvector"

    async def test_sets_tenant_guc_for_rls(self):
        holder: dict = {}
        pool = self._pool([], holder)
        backend = PgVectorBackend(pool, self._embedder([0.0] * 3))
        await backend.search("q", "tenant-42", top_k=5)
        holder["conn"].execute.assert_awaited_once()
        call = holder["conn"].execute.call_args
        assert "set_config('app.current_tenant_id'" in call.args[0]
        assert call.args[1] == "tenant-42"

    async def test_sql_orders_by_cosine_distance(self):
        holder: dict = {}
        pool = self._pool([], holder)
        backend = PgVectorBackend(pool, self._embedder([0.0] * 3))
        await backend.search("q", "t1", top_k=3)
        sql = holder["conn"].fetch.call_args.args[0]
        assert "<=>" in sql
        assert "ORDER BY" in sql
        assert "LIMIT $2" in sql

    async def test_entity_types_filter_passed_as_arg(self):
        holder: dict = {}
        pool = self._pool([], holder)
        backend = PgVectorBackend(pool, self._embedder([0.0] * 3))
        await backend.search("q", "t1", top_k=3, entity_types=["boq"])
        args = holder["conn"].fetch.call_args.args
        assert "= ANY($3)" in args[0]
        assert args[3] == ["boq"]


class TestVectorLiteral:
    def test_bracketed_pgvector_literal(self):
        assert _to_vector_literal([0.1, 0.2]) == "[0.1,0.2]"

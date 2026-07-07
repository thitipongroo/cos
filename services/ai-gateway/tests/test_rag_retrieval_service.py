"""Unit tests for the hybrid RAG retrieval service (rag/retrieval.py) — provider-agnostic,
no pgvector / OpenSearch / real LLM. Complements test_rag_retrieval.py (which checks the
ai/chains/rag.yaml config values)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from fastapi.testclient import TestClient

import main
from providers.llm_provider import LLMResponse
from rag.retrieval import (
    HybridRetriever,
    RetrievedChunk,
    RRF_K,
    reciprocal_rank_fusion,
    load_rag_config,
    build_default_retriever,
)


def _chunk(cid: str, text: str = "x") -> RetrievedChunk:
    return RetrievedChunk(chunk_id=cid, text=text)


class _MockBackend:
    """A SearchBackend that returns a fixed ranked list and records its calls."""

    def __init__(self, chunks: list[RetrievedChunk]):
        self.chunks = chunks
        self.calls: list[tuple] = []

    async def search(self, query, tenant_id, top_k, entity_types=None):
        self.calls.append((query, tenant_id, top_k, entity_types))
        return self.chunks[:top_k]


# ── Reciprocal Rank Fusion ────────────────────────────────────────────────────

class TestRRF:
    def test_doc_in_both_lists_outranks_doc_in_one(self):
        # 'b' is rank 2 in list A and rank 1 in list B; 'a' is rank 1 only in A.
        list_a = [_chunk("a"), _chunk("b")]
        list_b = [_chunk("b"), _chunk("c")]
        fused = reciprocal_rank_fusion([list_a, list_b])
        assert fused[0].chunk_id == "b"  # appears in both → highest fused score

    def test_scores_follow_rrf_formula(self):
        fused = reciprocal_rank_fusion([[_chunk("a"), _chunk("b")]])
        # single list: score = 1/(k+rank)
        assert fused[0].chunk_id == "a"
        assert fused[0].score == pytest.approx(1.0 / (RRF_K + 1))
        assert fused[1].score == pytest.approx(1.0 / (RRF_K + 2))

    def test_dedup_by_chunk_id_keeps_first_payload(self):
        fused = reciprocal_rank_fusion([[_chunk("a", "first")], [_chunk("a", "second")]])
        assert len(fused) == 1
        assert fused[0].text == "first"

    def test_deterministic_tie_break_on_chunk_id(self):
        # 'a' and 'b' each rank 1 in one list → equal fused score → sorted by id.
        fused = reciprocal_rank_fusion([[_chunk("b")], [_chunk("a")]])
        assert [c.chunk_id for c in fused] == ["a", "b"]

    def test_empty_input(self):
        assert reciprocal_rank_fusion([]) == []
        assert reciprocal_rank_fusion([[], []]) == []


# ── HybridRetriever ───────────────────────────────────────────────────────────

class TestHybridRetriever:
    async def test_retrieve_queries_both_backends_and_fuses(self):
        kw = _MockBackend([_chunk("a"), _chunk("b")])
        vec = _MockBackend([_chunk("b"), _chunk("c")])
        r = HybridRetriever(kw, vec, top_k=5)
        out = await r.retrieve("q", "t1")
        assert kw.calls and vec.calls  # both hit
        assert out[0].chunk_id == "b"  # fused winner
        assert {c.chunk_id for c in out} == {"a", "b", "c"}

    async def test_retrieve_respects_top_k(self):
        kw = _MockBackend([_chunk("a"), _chunk("b"), _chunk("c")])
        vec = _MockBackend([_chunk("d"), _chunk("e"), _chunk("f")])
        r = HybridRetriever(kw, vec, top_k=2)
        out = await r.retrieve("q", "t1")
        assert len(out) == 2

    async def test_retrieve_top_k_override(self):
        kw = _MockBackend([_chunk("a"), _chunk("b")])
        vec = _MockBackend([_chunk("c"), _chunk("d")])
        r = HybridRetriever(kw, vec, top_k=5)
        out = await r.retrieve("q", "t1", top_k=1)
        assert len(out) == 1

    async def test_retrieve_passes_entity_types_and_tenant(self):
        kw = _MockBackend([_chunk("a")])
        vec = _MockBackend([_chunk("a")])
        r = HybridRetriever(kw, vec, top_k=5)
        await r.retrieve("q", "tenant-9", entity_types=["site_report"])
        assert kw.calls[0][1] == "tenant-9"
        assert kw.calls[0][3] == ["site_report"]

    def test_assemble_context_joins_in_rank_order(self):
        r = HybridRetriever(_MockBackend([]), _MockBackend([]), max_context_tokens=4000)
        ctx = r.assemble_context([_chunk("a", "alpha"), _chunk("b", "beta")])
        assert ctx == "alpha\n\nbeta"

    def test_assemble_context_respects_token_budget(self):
        r = HybridRetriever(_MockBackend([]), _MockBackend([]))
        big = "w" * 40  # ~10 tokens (4 chars/token)
        # budget of 8 tokens must skip the 10-token chunk but keep a small one
        ctx = r.assemble_context([_chunk("a", big), _chunk("b", "hi")], max_context_tokens=8)
        assert big not in ctx
        assert "hi" in ctx

    def test_assemble_context_empty(self):
        r = HybridRetriever(_MockBackend([]), _MockBackend([]))
        assert r.assemble_context([]) == ""


# ── Config wiring ─────────────────────────────────────────────────────────────

class TestConfig:
    def test_load_rag_config_matches_yaml(self):
        cfg = load_rag_config()
        assert cfg["top_k"] == 5
        assert cfg["max_context_tokens"] == 4000

    def test_build_default_retriever_uses_config(self):
        r = build_default_retriever(_MockBackend([]), _MockBackend([]))
        assert r.top_k == 5
        assert r.max_context_tokens == 4000


# ── /api/v1/rag/query endpoint wiring ─────────────────────────────────────────

class _StubProvider:
    async def complete(self, messages, model_hint):
        return LLMResponse(
            content="answer from context",
            model_used="gpt-4o",
            prompt_tokens=10,
            completion_tokens=5,
            total_tokens=15,
        )


class TestRagQueryEndpoint:
    def test_503_when_retriever_unconfigured(self):
        # Stage-1 default: no backends injected.
        assert main._retriever is None
        client = TestClient(main.app)
        resp = client.post("/api/v1/rag/query", json={"query": "hi", "tenant_id": "t1"})
        assert resp.status_code == 503
        assert "not configured" in resp.json()["detail"]

    def test_returns_answer_and_sources_when_configured(self, monkeypatch):
        kw = _MockBackend([_chunk("a", "alpha"), _chunk("b", "beta")])
        vec = _MockBackend([_chunk("b", "beta"), _chunk("c", "gamma")])
        monkeypatch.setattr(main, "_retriever", HybridRetriever(kw, vec, top_k=5))
        monkeypatch.setattr(main, "_provider", _StubProvider())
        client = TestClient(main.app)
        resp = client.post("/api/v1/rag/query", json={"query": "q", "tenant_id": "t1"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["answer"] == "answer from context"
        assert {s["chunk_id"] for s in body["sources"]} == {"a", "b", "c"}

    def test_503_when_provider_stubbed(self, monkeypatch):
        # Backends configured but LLM provider still a stub → 503 (NotImplementedError path).
        kw = _MockBackend([_chunk("a", "alpha")])
        vec = _MockBackend([_chunk("a", "alpha")])
        monkeypatch.setattr(main, "_retriever", HybridRetriever(kw, vec, top_k=5))
        # main._provider defaults to StubLLMProvider which raises NotImplementedError.
        client = TestClient(main.app)
        resp = client.post("/api/v1/rag/query", json={"query": "q", "tenant_id": "t1"})
        assert resp.status_code == 503

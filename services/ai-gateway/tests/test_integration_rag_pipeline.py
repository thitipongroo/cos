"""Integration test: the FULL RAG query pipeline, with the LLM stubbed (master:3884).

WHY THIS FILE EXISTS ALONGSIDE test_integration_rag.py. That file asserts the endpoint's contract,
but three of its checks read `status_code in (200, 503)` — which passes whether the pipeline ran or
not — and in the test environment `_retriever` is always None, so the request returns 503 before any
retrieval happens. The spec asks for "full RAG query pipeline using StubLLMProvider (no real API
call)", and nothing was exercising retrieval → RRF fusion → context assembly → provider.

Here the backends are injected fakes, so the REAL HybridRetriever runs: the same fusion, the same
top-k, the same token budget that production uses. Only the two edges are replaced — the search
backends (which would need OpenSearch and pgvector) and the LLM (which would cost money).
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from fastapi.testclient import TestClient

from providers.llm_provider import LLMProvider, LLMResponse, Message, StubLLMProvider
from rag.retrieval import HybridRetriever, RetrievedChunk

# conftest.py overrides get_verified_tenant for the whole suite, so this is the tenant the
# dependency yields — the "verified" one, whatever a request body claims.
VERIFIED_TENANT = "tenant-abc"
BODY_TENANT = "99999999-9999-4000-8000-000000000999"


class _FakeBackend:
    """A search backend that returns a fixed ranking and records how it was called."""

    def __init__(self, chunks: list[RetrievedChunk]) -> None:
        self._chunks = chunks
        self.calls: list[dict] = []

    async def search(self, query, tenant_id, top_k, entity_types=None):
        self.calls.append(
            {
                "query": query,
                "tenant_id": tenant_id,
                "top_k": top_k,
                "entity_types": entity_types,
            }
        )
        return self._chunks[:top_k]


class _RecordingProvider(LLMProvider):
    """Stands in for the LLM and keeps what it was asked, so the assembled context is inspectable."""

    def __init__(self) -> None:
        self.messages: list[Message] = []
        self.model_hint: str | None = None

    async def complete(self, messages: list[Message], model_hint: str) -> LLMResponse:
        self.messages = messages
        self.model_hint = model_hint
        return LLMResponse(
            content="an answer grounded in the context",
            model_used="fake-model",
            prompt_tokens=10,
            completion_tokens=5,
            total_tokens=15,
        )


def _chunk(chunk_id: str, text: str, score: float) -> RetrievedChunk:
    return RetrievedChunk(
        chunk_id=chunk_id, text=text, score=score, entity_type="site_report"
    )


@pytest.fixture()
def client():
    from main import app

    return TestClient(app)


@pytest.fixture()
def wired(monkeypatch):
    """Install a real HybridRetriever over fake backends, and return the pieces for assertions."""
    import main

    keyword = _FakeBackend(
        [
            _chunk("kw-1", "Concrete pour on level 3 was delayed by rain.", 9.0),
            _chunk("kw-2", "Scaffolding inspection passed on Tuesday.", 4.0),
            _chunk("shared", "The tower crane was offline for maintenance.", 3.0),
        ]
    )
    vector = _FakeBackend(
        [
            _chunk("shared", "The tower crane was offline for maintenance.", 0.91),
            _chunk("vec-1", "Rebar delivery slipped to next week.", 0.88),
        ]
    )
    retriever = HybridRetriever(keyword, vector)
    provider = _RecordingProvider()

    monkeypatch.setattr(main, "_retriever", retriever, raising=False)
    monkeypatch.setattr(main, "_provider", provider, raising=False)
    monkeypatch.setattr(main, "_db_pool", None, raising=False)
    return {"keyword": keyword, "vector": vector, "provider": provider}


def _post(client: TestClient, **body):
    payload = {"query": "why is the project late?", "tenant_id": VERIFIED_TENANT}
    payload.update(body)
    return client.post("/api/v1/rag/query", json=payload)


class TestFullPipeline:
    def test_answers_from_the_retrieved_context(self, client, wired):
        resp = _post(client)
        assert resp.status_code == 200, resp.text
        assert resp.json()["answer"] == "an answer grounded in the context"

    def test_both_backends_are_searched(self, client, wired):
        """Hybrid means hybrid — a pipeline that queried one backend would still answer."""
        _post(client)
        assert len(wired["keyword"].calls) == 1
        assert len(wired["vector"].calls) == 1

    def test_every_backend_is_scoped_to_the_verified_tenant(self, client, wired):
        """The tenant reaching the backends comes from the verified dependency, never the body.

        The request below CLAIMS a different tenant. If that value reached the vector store it would
        be a cross-tenant IDOR — one request reading another tenant's documents — so the assertion is
        that the claim is ignored, not merely that some tenant was passed.
        """
        _post(client, tenant_id=BODY_TENANT)
        for backend in ("keyword", "vector"):
            assert wired[backend].calls[0]["tenant_id"] == VERIFIED_TENANT
            assert wired[backend].calls[0]["tenant_id"] != BODY_TENANT

    def test_context_carries_chunks_from_BOTH_backends(self, client, wired):
        """This is what fusion buys: a passage only the vector side found still reaches the model."""
        _post(client)
        context = wired["provider"].messages[-1].content
        assert "Concrete pour on level 3" in context  # keyword-only
        assert "Rebar delivery slipped" in context  # vector-only

    def test_a_chunk_ranked_by_both_backends_is_promoted(self, client, wired):
        """RRF's whole point: agreement between rankers outranks a single strong score.

        "shared" is 3rd on the keyword side and 1st on the vector side. Under score-based fusion the
        top BM25 hit would win; under rank fusion the agreed-upon chunk leads.
        """
        _post(client)
        context = wired["provider"].messages[-1].content
        assert context.index("tower crane") < context.index("Concrete pour on level 3")

    def test_top_k_is_honoured(self, client, wired):
        _post(client, top_k=2)
        assert wired["keyword"].calls[0]["top_k"] == 2
        # The user message is "Context:\n{context}\n\nQuestion: {query}" — count inside the context
        # section only, or the trailing question is mistaken for a third chunk.
        content = wired["provider"].messages[-1].content
        context = content.split("Context:\n", 1)[1].split("\n\nQuestion:", 1)[0]
        # Four distinct chunks exist across the two backends; only two may reach the model.
        assert len([part for part in context.split("\n\n") if part.strip()]) == 2

    def test_entity_types_are_passed_through_to_both_backends(self, client, wired):
        _post(client, entity_types=["site_report"])
        for backend in ("keyword", "vector"):
            assert wired[backend].calls[0]["entity_types"] == ["site_report"]

    def test_the_llm_is_told_to_answer_only_from_context(self, client, wired):
        """The grounding instruction is what separates RAG from a plain completion."""
        _post(client)
        system = wired["provider"].messages[0]
        assert system.role == "system"
        assert "strictly from the provided context" in system.content

    def test_the_answer_is_generated_on_the_powerful_tier(self, client, wired):
        """A RAG answer is report-generation work — master:3796 puts that in tier POWERFUL."""
        _post(client)
        assert wired["provider"].model_hint == "report-generation"


class TestStubProviderMakesNoCall:
    def test_stub_provider_yields_503_rather_than_a_fabricated_answer(
        self, client, wired, monkeypatch
    ):
        """With no real provider the endpoint must refuse, not invent.

        StubLLMProvider raises NotImplementedError; the endpoint turns that into 503. A stub that
        returned placeholder prose would be indistinguishable from a real answer downstream.
        """
        import main

        monkeypatch.setattr(main, "_provider", StubLLMProvider(), raising=False)
        resp = _post(client)
        assert resp.status_code == 503
        assert "not configured" in resp.text.lower() or "stub" in resp.text.lower()

    def test_retrieval_still_ran_before_the_provider_refused(
        self, client, wired, monkeypatch
    ):
        """The 503 must come from the LLM edge, not from an unconfigured retriever.

        Without this, the test above would pass on a pipeline that never retrieved anything — which
        is exactly the state the older integration test was silently asserting.
        """
        import main

        monkeypatch.setattr(main, "_provider", StubLLMProvider(), raising=False)
        _post(client)
        assert len(wired["keyword"].calls) == 1
        assert len(wired["vector"].calls) == 1


class TestUnconfiguredRetriever:
    def test_no_retriever_yields_503(self, client, monkeypatch):
        import main

        monkeypatch.setattr(main, "_retriever", None, raising=False)
        resp = _post(client)
        assert resp.status_code == 503

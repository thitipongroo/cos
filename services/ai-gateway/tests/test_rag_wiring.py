"""A9 — RAG retriever wiring (§22.7).

Verifies the "configured vs not" decision. The real connection path (asyncpg + OpenSearch + OpenAI)
is NOT exercised — with no API key the embedder is the stub, so the gateway stays in its 503 posture
and build_retriever returns None before opening a connection.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from rag.wiring import build_retriever, rag_backends_configured


def test_not_configured_without_key(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "REPLACE_ME")  # stub embedder
    monkeypatch.setenv("DATABASE_URL", "postgresql://x")
    monkeypatch.setenv("OPENSEARCH_URL", "http://os:9200")
    # Even with DB + OpenSearch set, a stub embedder means RAG cannot run.
    assert rag_backends_configured() is False


def test_not_configured_without_backends(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-real")  # real embedder branch
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("RAG_DATABASE_URL", raising=False)
    monkeypatch.delenv("OPENSEARCH_URL", raising=False)
    assert rag_backends_configured() is False


@pytest.mark.asyncio
async def test_build_retriever_returns_none_when_unconfigured(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "REPLACE_ME")
    monkeypatch.delenv("OPENSEARCH_URL", raising=False)
    # Returns None without importing asyncpg/opensearch or opening a connection.
    assert await build_retriever() is None

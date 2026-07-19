"""A8 — RAG chain config loading (§22.7).

Verifies the ai/chains/rag.yaml contract is present and well-formed. build_chain (which constructs a
real langchain Chain) is NOT tested — it needs the langchain SDK and a live LLM.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from providers.langchain_config import load_chain_config


def test_rag_config_loads_and_reflects_rag_001():
    cfg = load_chain_config("rag")

    assert cfg["chain_type"] == "rag"
    assert cfg["llm"]["model"] == "gpt-4o"  # §22.7 LLM Provider
    assert cfg["embedding"]["dimensions"] == 1536  # matches VECTOR(1536)
    # §22.7 RAG-001: BM25 + vector → RRF → top-k 5
    assert cfg["retrieval"]["vector"]["backend"] == "pgvector"
    assert cfg["retrieval"]["keyword"]["backend"] == "opensearch"
    assert cfg["retrieval"]["fusion"]["method"] == "rrf"
    assert cfg["retrieval"]["final_top_k"] == 5


def test_reranker_is_conditional_and_names_the_spec_model():
    cfg = load_chain_config("rag")
    rerank = cfg["rerank"]
    assert rerank["enabled"] is False  # §22.7 trigger: activate when p95 < 0.7
    assert rerank["model"] == "cross-encoder/ms-marco-MiniLM-L-6-v2"
    assert rerank["trigger"]["threshold"] == 0.7


def test_unknown_chain_type_raises():
    with pytest.raises(FileNotFoundError):
        load_chain_config("does-not-exist")

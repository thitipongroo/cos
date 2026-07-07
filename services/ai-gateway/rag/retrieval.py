"""Hybrid RAG retrieval service — Phase 11 AI Foundation.

Implements the "Hybrid RAG retrieval service (keyword + vector, provider-agnostic)"
deliverable: two ranked candidate lists (BM25 keyword via OpenSearch + cosine vector via
pgvector, per ai/chains/rag.yaml) are fused with Reciprocal Rank Fusion (RRF), then the
top-k chunks are assembled into a bounded context window.

Provider-agnostic by design: the retriever depends only on the `SearchBackend` protocol,
so the concrete OpenSearch / pgvector clients are injected at the edge (Stage-1 leaves them
unconfigured — StubLLMProvider posture). All fusion/assembly logic is unit-tested here with
mock backends, matching tests/test_rag_retrieval.py ("without hitting pgvector or OpenSearch").

Source: context/00_master_construction_os.md §Phase 11; docs/specifications/22-ai-architecture.md
§22.7 (RAG-001 — hybrid search fused via RRF).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Protocol, Sequence

import yaml

# Standard Reciprocal Rank Fusion constant (Cormack et al., 2009). Dampens the weight of
# top ranks so a document ranked well in BOTH lists outranks one ranked first in only one.
RRF_K = 60

# Defaults mirror ai/chains/rag.yaml; used when the config file is unavailable.
_DEFAULT_TOP_K = 5
_DEFAULT_MAX_CONTEXT_TOKENS = 4000

# Rough token estimate (OpenAI heuristic: ~4 chars/token). Used only to bound context size;
# the real tokenizer runs provider-side.
_CHARS_PER_TOKEN = 4


@dataclass
class RetrievedChunk:
    """A single retrieved passage. `score` is the backend's own relevance score (unused by RRF,
    which ranks by position); it is preserved for observability and reranking."""

    chunk_id: str
    text: str
    score: float = 0.0
    entity_type: str | None = None
    entity_id: str | None = None
    metadata: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "chunk_id": self.chunk_id,
            "text": self.text,
            "score": self.score,
            "entity_type": self.entity_type,
            "entity_id": self.entity_id,
            "metadata": self.metadata,
        }


class SearchBackend(Protocol):
    """A single retrieval backend (keyword or vector). Implementations own their own client
    (OpenSearch BM25 / pgvector cosine) and tenant-scope every query."""

    async def search(
        self,
        query: str,
        tenant_id: str,
        top_k: int,
        entity_types: list[str] | None = None,
    ) -> list[RetrievedChunk]: ...


def reciprocal_rank_fusion(
    result_lists: Sequence[Sequence[RetrievedChunk]], k: int = RRF_K
) -> list[RetrievedChunk]:
    """Fuse several ranked lists into one via RRF: score(d) = Σ_i 1/(k + rank_i(d)), rank 1-based.

    Chunks are de-duplicated by `chunk_id` (first occurrence keeps its payload). Ties break on
    `chunk_id` so ordering is deterministic.
    """
    fused_scores: dict[str, float] = {}
    payloads: dict[str, RetrievedChunk] = {}

    for result_list in result_lists:
        for rank, chunk in enumerate(result_list, start=1):
            fused_scores[chunk.chunk_id] = fused_scores.get(chunk.chunk_id, 0.0) + 1.0 / (k + rank)
            payloads.setdefault(chunk.chunk_id, chunk)

    ordered_ids = sorted(fused_scores, key=lambda cid: (-fused_scores[cid], cid))
    ranked: list[RetrievedChunk] = []
    for cid in ordered_ids:
        chunk = payloads[cid]
        # Surface the fused score so downstream consumers (reranker, UI) can use it.
        ranked.append(
            RetrievedChunk(
                chunk_id=chunk.chunk_id,
                text=chunk.text,
                score=fused_scores[cid],
                entity_type=chunk.entity_type,
                entity_id=chunk.entity_id,
                metadata=chunk.metadata,
            )
        )
    return ranked


def _estimate_tokens(text: str) -> int:
    return max(1, len(text) // _CHARS_PER_TOKEN)


class HybridRetriever:
    """Runs keyword + vector search concurrently-shaped (awaited in sequence here for determinism),
    fuses with RRF, and assembles a token-bounded context. Backends are injected — the retriever
    holds no OpenSearch/pgvector coupling itself."""

    def __init__(
        self,
        keyword_backend: SearchBackend,
        vector_backend: SearchBackend,
        top_k: int = _DEFAULT_TOP_K,
        max_context_tokens: int = _DEFAULT_MAX_CONTEXT_TOKENS,
    ) -> None:
        self.keyword_backend = keyword_backend
        self.vector_backend = vector_backend
        self.top_k = top_k
        self.max_context_tokens = max_context_tokens

    async def retrieve(
        self,
        query: str,
        tenant_id: str,
        entity_types: list[str] | None = None,
        top_k: int | None = None,
    ) -> list[RetrievedChunk]:
        """Return the top-`k` fused chunks. Each backend is queried for `k` candidates before fusion
        so that documents unique to one backend still have a chance to surface."""
        k = top_k if top_k is not None else self.top_k
        keyword_hits = await self.keyword_backend.search(query, tenant_id, k, entity_types)
        vector_hits = await self.vector_backend.search(query, tenant_id, k, entity_types)
        fused = reciprocal_rank_fusion([keyword_hits, vector_hits])
        return fused[:k]

    def assemble_context(
        self, chunks: Sequence[RetrievedChunk], max_context_tokens: int | None = None
    ) -> str:
        """Concatenate chunk texts (in rank order) up to the token budget. A chunk that would
        overflow the budget is skipped; earlier, higher-ranked chunks are always preferred."""
        budget = max_context_tokens if max_context_tokens is not None else self.max_context_tokens
        parts: list[str] = []
        used = 0
        for chunk in chunks:
            cost = _estimate_tokens(chunk.text)
            if used + cost > budget:
                continue
            parts.append(chunk.text)
            used += cost
        return "\n\n".join(parts)


def load_rag_config() -> dict:
    """Load ai/chains/rag.yaml (retrieval block). Falls back to defaults if the file is absent."""
    config_path = Path(__file__).resolve().parents[3] / "ai" / "chains" / "rag.yaml"
    if not config_path.exists():
        return {"top_k": _DEFAULT_TOP_K, "max_context_tokens": _DEFAULT_MAX_CONTEXT_TOKENS}
    config = yaml.safe_load(config_path.read_text())
    retrieval = config.get("retrieval", {})
    return {
        "top_k": retrieval.get("top_k", _DEFAULT_TOP_K),
        "max_context_tokens": retrieval.get("max_context_tokens", _DEFAULT_MAX_CONTEXT_TOKENS),
    }


def build_default_retriever(
    keyword_backend: SearchBackend, vector_backend: SearchBackend
) -> HybridRetriever:
    """Construct a retriever using ai/chains/rag.yaml (top_k, max_context_tokens)."""
    cfg = load_rag_config()
    return HybridRetriever(
        keyword_backend=keyword_backend,
        vector_backend=vector_backend,
        top_k=cfg["top_k"],
        max_context_tokens=cfg["max_context_tokens"],
    )

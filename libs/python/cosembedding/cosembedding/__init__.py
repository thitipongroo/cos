"""Shared OpenAI embedding provider for the Construction OS Python services (§22.7; ADR-021).

WHY THIS EXISTS: the ingestion side (ai-embedding-worker) embeds document chunks and the AI Gateway
embeds the RAG query at retrieval time, both against the same model and the same VECTOR(1536) column
contract. This is the one implementation of that provider, re-exported by each service's
``providers/embedding_provider.py``; the Go workers share code the same way under ``libs/go`` and the
sibling Python package is ``libs/python/cosmetrics``. It replaces the copies jscpd flagged.

Decision: OpenAI ``text-embedding-3-small`` (1536 dimensions) via the ``EmbeddingProvider`` interface.
The stub remains for environments with no API key — the factory returns it so callers degrade to a
503 rather than crash.

NOT verified end to end: this codebase has no provisioned OPENAI_API_KEY (``.env`` ships
``REPLACE_ME``), so every test that exercises the real provider injects a fake OpenAI client. The real
network path has never run.
"""

from __future__ import annotations

import os
from abc import ABC, abstractmethod

__all__ = [
    "EMBEDDING_DIMENSIONS",
    "EMBEDDING_MODEL",
    "EmbeddingProvider",
    "StubEmbeddingProvider",
    "OpenAIEmbeddingProvider",
    "build_embedding_provider",
]

# text-embedding-3-small output dimension (§22.7). The document_embeddings.embedding column is
# VECTOR(1536); a provider returning any other width would break the insert, so this is a contract.
EMBEDDING_DIMENSIONS = 1536
EMBEDDING_MODEL = "text-embedding-3-small"


class EmbeddingProvider(ABC):
    @abstractmethod
    async def embed(self, texts: list[str]) -> list[list[float]]: ...

    @property
    @abstractmethod
    def dimensions(self) -> int: ...


class StubEmbeddingProvider(EmbeddingProvider):
    async def embed(self, texts: list[str]) -> list[list[float]]:
        raise NotImplementedError("StubEmbeddingProvider: real embedding provider not configured")

    @property
    def dimensions(self) -> int:
        return EMBEDDING_DIMENSIONS


class OpenAIEmbeddingProvider(EmbeddingProvider):
    """OpenAI ``text-embedding-3-small`` (§22.7). Client injectable for tests; lazy OpenAI import."""

    def __init__(self, client=None, model: str = EMBEDDING_MODEL) -> None:
        self._model = model
        if client is not None:
            self._client = client
        else:
            # Imported lazily so the module loads (and the stub path works) even when the openai
            # package or an API key is absent.
            from openai import AsyncOpenAI

            self._client = AsyncOpenAI()

    async def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        response = await self._client.embeddings.create(model=self._model, input=texts)
        # OpenAI returns items in request order (documented), but sort by index defensively so a
        # future batching change cannot silently misalign a chunk with its vector.
        ordered = sorted(response.data, key=lambda item: item.index)
        vectors = [item.embedding for item in ordered]
        for vector in vectors:
            if len(vector) != EMBEDDING_DIMENSIONS:
                raise ValueError(
                    f"embedding width {len(vector)} != expected {EMBEDDING_DIMENSIONS} "
                    f"— model {self._model} does not match the VECTOR(1536) column"
                )
        return vectors

    @property
    def dimensions(self) -> int:
        return EMBEDDING_DIMENSIONS


def build_embedding_provider() -> EmbeddingProvider:
    """Return the real provider when an API key is configured, otherwise the stub.

    ``REPLACE_ME`` is treated as absent: it is the placeholder shipped in ``.env`` and must never be
    mistaken for a real credential.
    """
    key = os.environ.get("OPENAI_API_KEY", "").strip()
    if key and key != "REPLACE_ME":
        return OpenAIEmbeddingProvider()
    return StubEmbeddingProvider()

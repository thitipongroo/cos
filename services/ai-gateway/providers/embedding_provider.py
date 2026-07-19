"""Query-side embedding provider for the AI Gateway (§22.7 Embedding Provider).

The gateway embeds the RAG *query* at retrieval time (PgVectorBackend.search calls
``embedding_provider.embed([query])``). Same model and contract as the ingestion side in
ai-embedding-worker — duplicated here because the two services are separate Python packages with no
shared module, the same reason the Go workers each carry their own coskafka copy.

MOCK-VERIFIED ONLY: no provisioned OPENAI_API_KEY, so the real OpenAI path has never run.
"""

from __future__ import annotations

import os
from abc import ABC, abstractmethod

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
    """OpenAI text-embedding-3-small (§22.7). Client injectable for tests; lazy OpenAI import."""

    def __init__(self, client=None, model: str = EMBEDDING_MODEL) -> None:
        self._model = model
        if client is not None:
            self._client = client
        else:
            from openai import AsyncOpenAI

            self._client = AsyncOpenAI()

    async def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        response = await self._client.embeddings.create(model=self._model, input=texts)
        ordered = sorted(response.data, key=lambda item: item.index)
        vectors = [item.embedding for item in ordered]
        for vector in vectors:
            if len(vector) != EMBEDDING_DIMENSIONS:
                raise ValueError(
                    f"embedding width {len(vector)} != expected {EMBEDDING_DIMENSIONS}"
                )
        return vectors

    @property
    def dimensions(self) -> int:
        return EMBEDDING_DIMENSIONS


def build_embedding_provider() -> EmbeddingProvider:
    """Real provider when a key is configured, else the stub. REPLACE_ME counts as absent."""
    key = os.environ.get("OPENAI_API_KEY", "").strip()
    if key and key != "REPLACE_ME":
        return OpenAIEmbeddingProvider()
    return StubEmbeddingProvider()

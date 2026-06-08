from abc import ABC, abstractmethod


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
        return 1536  # text-embedding-3-small

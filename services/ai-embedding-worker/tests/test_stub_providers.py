import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from providers.embedding_provider import EmbeddingProvider, StubEmbeddingProvider


class TestStubEmbeddingProvider:
    def test_is_embedding_provider_subclass(self):
        provider = StubEmbeddingProvider()
        assert isinstance(provider, EmbeddingProvider)

    @pytest.mark.asyncio
    async def test_embed_raises_not_implemented(self):
        provider = StubEmbeddingProvider()
        with pytest.raises(NotImplementedError):
            await provider.embed(["some text"])

    @pytest.mark.asyncio
    async def test_embed_raises_for_multiple_texts(self):
        provider = StubEmbeddingProvider()
        with pytest.raises(NotImplementedError):
            await provider.embed(["text one", "text two", "text three"])

    def test_dimensions_is_1536(self):
        provider = StubEmbeddingProvider()
        assert provider.dimensions == 1536

    def test_dimensions_matches_text_embedding_3_small(self):
        provider = StubEmbeddingProvider()
        assert provider.dimensions == 1536

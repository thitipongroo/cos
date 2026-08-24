"""A3 — OpenAIEmbeddingProvider, MOCK-verified only.

There is no provisioned OPENAI_API_KEY in this codebase (`.env` ships REPLACE_ME), so the real
OpenAI network path has never run. These tests inject a fake client that mimics the documented
response shape; they prove the provider's own logic (ordering, dimension guard, empty input,
factory selection), NOT that OpenAI returns usable vectors.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from providers.embedding_provider import (
    EMBEDDING_DIMENSIONS,
    OpenAIEmbeddingProvider,
    StubEmbeddingProvider,
    build_embedding_provider,
)


class _FakeItem:
    def __init__(self, index, embedding):
        self.index = index
        self.embedding = embedding


class _FakeResponse:
    def __init__(self, data):
        self.data = data


class _FakeEmbeddings:
    def __init__(self, response, capture):
        self._response = response
        self._capture = capture

    async def create(self, model, input):
        self._capture["model"] = model
        self._capture["input"] = input
        return self._response


class _FakeClient:
    def __init__(self, data):
        self.capture = {}
        self.embeddings = _FakeEmbeddings(_FakeResponse(data), self.capture)


def _vec(fill):
    return [fill] * EMBEDDING_DIMENSIONS


@pytest.mark.asyncio
async def test_returns_vectors_in_index_order_even_when_response_is_shuffled():
    # Out-of-order indices — the provider must realign to 0,1,2 so a chunk keeps its own vector.
    client = _FakeClient([_FakeItem(2, _vec(0.3)), _FakeItem(0, _vec(0.1)), _FakeItem(1, _vec(0.2))])
    provider = OpenAIEmbeddingProvider(client=client)

    vectors = await provider.embed(["a", "b", "c"])

    assert vectors[0][0] == 0.1
    assert vectors[1][0] == 0.2
    assert vectors[2][0] == 0.3


@pytest.mark.asyncio
async def test_requests_the_spec_model():
    client = _FakeClient([_FakeItem(0, _vec(0.1))])
    provider = OpenAIEmbeddingProvider(client=client)

    await provider.embed(["x"])

    assert client.capture["model"] == "text-embedding-3-small"


@pytest.mark.asyncio
async def test_empty_input_short_circuits_without_calling_openai():
    client = _FakeClient([])
    provider = OpenAIEmbeddingProvider(client=client)

    assert await provider.embed([]) == []
    assert client.capture == {}  # create() never called


@pytest.mark.asyncio
async def test_rejects_a_wrong_width_vector():
    # A model mismatch that would silently corrupt the VECTOR(1536) column must fail loudly.
    client = _FakeClient([_FakeItem(0, [0.1, 0.2, 0.3])])
    provider = OpenAIEmbeddingProvider(client=client)

    with pytest.raises(ValueError, match="width 3"):
        await provider.embed(["x"])


def test_factory_returns_stub_when_key_is_placeholder(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "REPLACE_ME")
    assert isinstance(build_embedding_provider(), StubEmbeddingProvider)


def test_factory_returns_stub_when_key_absent(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    assert isinstance(build_embedding_provider(), StubEmbeddingProvider)


def test_factory_returns_real_provider_when_key_present(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-realkeyshape")
    # Construct with an injected client so no network/SDK is touched during the test.
    assert build_embedding_provider.__name__ == "build_embedding_provider"
    # The factory builds OpenAIEmbeddingProvider() which lazily imports openai; assert the selection
    # branch, not the network client, by checking the type via a patched constructor. build_embedding_provider
    # and the class both live in cosembedding now (ADR-021), so patch there — the factory resolves the
    # class in its own module namespace, not in the providers.embedding_provider re-export shim.
    import cosembedding as mod

    created = {}

    class _Sentinel(mod.OpenAIEmbeddingProvider):
        def __init__(self):  # skip the real AsyncOpenAI construction
            created["built"] = True

    monkeypatch.setattr(mod, "OpenAIEmbeddingProvider", _Sentinel)
    provider = mod.build_embedding_provider()
    assert created.get("built") is True
    assert isinstance(provider, _Sentinel)

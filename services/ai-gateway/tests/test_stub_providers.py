import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from providers.llm_provider import LLMProvider, StubLLMProvider, Message
from providers.alternative_llm_provider import ClaudeLLMProvider, OllamaLLMProvider


class TestStubLLMProvider:
    def test_is_llm_provider_subclass(self):
        provider = StubLLMProvider()
        assert isinstance(provider, LLMProvider)

    @pytest.mark.asyncio
    async def test_complete_raises_not_implemented(self):
        provider = StubLLMProvider()
        with pytest.raises(NotImplementedError):
            await provider.complete([Message(role="user", content="hello")], "summarization")

    @pytest.mark.asyncio
    async def test_complete_raises_for_any_model_hint(self):
        provider = StubLLMProvider()
        for hint in ["report-generation", "risk-analysis", "autocomplete"]:
            with pytest.raises(NotImplementedError):
                await provider.complete([], hint)


class TestAlternativeProvidersAreDropInReplaceable:
    # Both concrete alternatives satisfy the same interface as the primary, so the gateway can swap
    # them by config without touching call sites (§22.7). Constructed with injected clients so no
    # SDK or network is touched.
    def test_claude_is_llm_provider(self):
        assert isinstance(ClaudeLLMProvider(client=object()), LLMProvider)

    def test_ollama_is_llm_provider(self):
        assert isinstance(OllamaLLMProvider(client=object()), LLMProvider)

    def test_drop_in_replaceable(self):
        def accept_provider(p: LLMProvider) -> bool:
            return isinstance(p, LLMProvider)

        assert accept_provider(StubLLMProvider())
        assert accept_provider(ClaudeLLMProvider(client=object()))
        assert accept_provider(OllamaLLMProvider(client=object()))

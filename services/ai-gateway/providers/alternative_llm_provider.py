from .llm_provider import LLMProvider, Message, LLMResponse


class AlternativeLLMProvider(LLMProvider):
    """Drop-in replacement for the primary LLMProvider.

    Candidates: Anthropic Claude (claude-sonnet-4-6), Azure OpenAI, Ollama.
    Switch via tenant config — no application code change required.
    Trigger: OpenAI down, cost threshold exceeded, or data sovereignty requirement.
    Source: docs/specifications/22-ai-architecture.md §22.7 Alternative LLM Provider.
    """

    async def complete(self, messages: list[Message], model_hint: str) -> LLMResponse:
        raise NotImplementedError("AlternativeLLMProvider: configure a concrete provider before use")

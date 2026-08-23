"""LLM providers (§22.7 LLM Provider).

Primary: OpenAI GPT-4o via the ``LLMProvider`` interface — all LLM calls route through it, never a
direct SDK call. The stub remains for environments with no API key so callers degrade to 503.

MOCK-VERIFIED ONLY: there is no provisioned OPENAI_API_KEY (`.env` ships REPLACE_ME), so the real
OpenAI network path has never run. Tests inject a fake client.
"""

from __future__ import annotations

import os
from abc import ABC, abstractmethod
from dataclasses import dataclass

from .model_routing import load_routing_table

# model_hint → concrete model comes from config/routing.yaml (master:3794-3798), NOT from this
# module. It used to: `DEFAULT_MODEL = "gpt-4o"` with an empty MODEL_BY_HINT sent every hint to the
# POWERFUL tier, including the FAST-tier hints the table has always listed, while the YAML table sat
# unread. See providers/model_routing.py.


@dataclass
class Message:
    role: str  # "system" | "user" | "assistant"
    content: str


@dataclass
class LLMResponse:
    content: str
    model_used: str
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int


class LLMProvider(ABC):
    @abstractmethod
    async def complete(self, messages: list[Message], model_hint: str) -> LLMResponse: ...


class StubLLMProvider(LLMProvider):
    async def complete(self, messages: list[Message], model_hint: str) -> LLMResponse:
        raise NotImplementedError("StubLLMProvider: real LLM provider not configured")


def model_for_hint(model_hint: str) -> str:
    """The model this hint routes to, per the configured routing table."""
    return load_routing_table().model_for_hint(model_hint)


class OpenAILLMProvider(LLMProvider):
    """OpenAI GPT-4o (§22.7 LLM Provider)."""

    def __init__(self, client=None) -> None:
        if client is not None:
            self._client = client
        else:
            from openai import AsyncOpenAI

            self._client = AsyncOpenAI()

    async def complete(self, messages: list[Message], model_hint: str) -> LLMResponse:
        model = model_for_hint(model_hint)
        response = await self._client.chat.completions.create(
            model=model,
            messages=[{"role": m.role, "content": m.content} for m in messages],
        )
        choice = response.choices[0]
        usage = response.usage
        return LLMResponse(
            content=choice.message.content or "",
            model_used=response.model,
            prompt_tokens=usage.prompt_tokens,
            completion_tokens=usage.completion_tokens,
            total_tokens=usage.total_tokens,
        )


def build_llm_provider() -> LLMProvider:
    """Real provider when an API key is configured, otherwise the stub. REPLACE_ME counts as absent."""
    key = os.environ.get("OPENAI_API_KEY", "").strip()
    if key and key != "REPLACE_ME":
        return OpenAILLMProvider()
    return StubLLMProvider()

"""Alternative LLM providers (§22.7 Alternative LLM Provider).

Two concrete alternatives behind the same ``LLMProvider`` interface, switched by tenant config /
gateway failover (§22.7 GW-001):

  - ClaudeLLMProvider  — Anthropic Claude, cloud fallback when OpenAI is down or over budget.
  - OllamaLLMProvider  — self-hosted open model for on-premise / data-sovereignty deployments,
    reached over Ollama's OpenAI-compatible /v1 API.

MOCK-VERIFIED ONLY: no ANTHROPIC_API_KEY and no running Ollama in this environment, so neither real
network path has run. Tests inject fake clients.
"""

from __future__ import annotations

import os

from .llm_provider import LLMProvider, LLMResponse, Message

CLAUDE_DEFAULT_MODEL = "claude-sonnet-4-6"
OLLAMA_DEFAULT_MODEL = "llama3"


class ClaudeLLMProvider(LLMProvider):
    """Anthropic Claude (§22.7 — cloud fallback). Same interface as the primary."""

    def __init__(self, client=None, model: str = CLAUDE_DEFAULT_MODEL) -> None:
        self._model = model
        if client is not None:
            self._client = client
        else:
            from anthropic import AsyncAnthropic

            self._client = AsyncAnthropic()

    async def complete(self, messages: list[Message], model_hint: str) -> LLMResponse:
        # Anthropic separates the system prompt from the message list, unlike OpenAI.
        system = "\n".join(m.content for m in messages if m.role == "system")
        turns = [{"role": m.role, "content": m.content} for m in messages if m.role != "system"]
        response = await self._client.messages.create(
            model=self._model,
            system=system or None,
            messages=turns,
            max_tokens=4096,
        )
        text = "".join(block.text for block in response.content if block.type == "text")
        usage = response.usage
        return LLMResponse(
            content=text,
            model_used=response.model,
            prompt_tokens=usage.input_tokens,
            completion_tokens=usage.output_tokens,
            total_tokens=usage.input_tokens + usage.output_tokens,
        )


class OllamaLLMProvider(LLMProvider):
    """Self-hosted Ollama (§22.7 — on-premise / data sovereignty).

    Ollama exposes an OpenAI-compatible API, so the same AsyncOpenAI client works with base_url
    pointed at the Ollama server and a throwaway key.
    """

    def __init__(self, client=None, model: str = OLLAMA_DEFAULT_MODEL) -> None:
        self._model = model
        if client is not None:
            self._client = client
        else:
            from openai import AsyncOpenAI

            base_url = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434/v1")
            self._client = AsyncOpenAI(base_url=base_url, api_key="ollama")

    async def complete(self, messages: list[Message], model_hint: str) -> LLMResponse:
        response = await self._client.chat.completions.create(
            model=self._model,
            messages=[{"role": m.role, "content": m.content} for m in messages],
        )
        choice = response.choices[0]
        usage = response.usage
        return LLMResponse(
            content=choice.message.content or "",
            model_used=response.model,
            # Ollama may omit usage; treat missing as zero rather than crashing the meter.
            prompt_tokens=getattr(usage, "prompt_tokens", 0) if usage else 0,
            completion_tokens=getattr(usage, "completion_tokens", 0) if usage else 0,
            total_tokens=getattr(usage, "total_tokens", 0) if usage else 0,
        )

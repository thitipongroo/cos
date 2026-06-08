from abc import ABC, abstractmethod
from dataclasses import dataclass


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

"""A4 — LLM providers, MOCK-verified only.

No provisioned OPENAI_API_KEY / ANTHROPIC_API_KEY and no running Ollama in this environment, so none
of the real network paths have run. These tests inject fake clients to prove each provider's own
translation logic (message shaping, usage mapping, factory selection) — not that any model responds.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from providers.llm_provider import (
    LLMResponse,
    Message,
    OpenAILLMProvider,
    StubLLMProvider,
    build_llm_provider,
    model_for_hint,
)
from providers.alternative_llm_provider import ClaudeLLMProvider, OllamaLLMProvider


# ── Fakes ─────────────────────────────────────────────────────────────────────
class _Msg:
    def __init__(self, content):
        self.content = content


class _Choice:
    def __init__(self, content):
        self.message = _Msg(content)


class _Usage:
    def __init__(self, p, c, t):
        self.prompt_tokens, self.completion_tokens, self.total_tokens = p, c, t


class _ChatResponse:
    def __init__(self, content, model, usage):
        self.choices = [_Choice(content)]
        self.model = model
        self.usage = usage


class _FakeChatCompletions:
    def __init__(self, response, capture):
        self._response, self._capture = response, capture

    async def create(self, model, messages):
        self._capture["model"], self._capture["messages"] = model, messages
        return self._response


class _FakeOpenAIClient:
    def __init__(self, content="hi", model="gpt-4o", usage=None):
        self.capture = {}
        self.chat = type("C", (), {"completions": _FakeChatCompletions(
            _ChatResponse(content, model, usage or _Usage(3, 5, 8)), self.capture)})()


# ── OpenAI primary ────────────────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_openai_maps_content_and_usage():
    client = _FakeOpenAIClient(content="an answer", model="gpt-4o", usage=_Usage(10, 20, 30))
    provider = OpenAILLMProvider(client=client)

    resp = await provider.complete([Message("user", "q")], "summarization")

    assert isinstance(resp, LLMResponse)
    assert resp.content == "an answer"
    assert (resp.prompt_tokens, resp.completion_tokens, resp.total_tokens) == (10, 20, 30)


@pytest.mark.asyncio
async def test_openai_sends_the_model_the_hint_routes_to_and_shapes_messages():
    """The provider passes the ROUTED model to the client, not a fixed one.

    Renamed and corrected 2026-08-23: this asserted gpt-4o for "any-hint", which passed only because
    every hint resolved to gpt-4o. An unrecognised hint takes defaults.fallback_tier, which is FAST.
    A POWERFUL-tier hint is asserted alongside it, so the test would fail if routing were bypassed
    in either direction rather than only in one.
    """
    client = _FakeOpenAIClient()
    provider = OpenAILLMProvider(client=client)

    await provider.complete([Message("system", "sys"), Message("user", "hi")], "any-hint")
    assert client.capture["model"] == "gpt-4o-mini"

    await provider.complete([Message("system", "sys"), Message("user", "hi")], "report-generation")
    assert client.capture["model"] == "gpt-4o"
    assert client.capture["messages"] == [
        {"role": "system", "content": "sys"},
        {"role": "user", "content": "hi"},
    ]


def test_model_for_hint_routes_by_tier():
    # Corrected 2026-08-23. This test used to assert that "summarization" resolves to gpt-4o, which
    # is what the code did and the opposite of what master:3761 and 3797 require: summarization is a
    # FAST-tier hint. The table in config/routing.yaml has always said so; nothing read it.
    assert model_for_hint("summarization") == "gpt-4o-mini"
    assert model_for_hint("classification") == "gpt-4o-mini"
    assert model_for_hint("autocomplete") == "gpt-4o-mini"
    assert model_for_hint("report-generation") == "gpt-4o"
    assert model_for_hint("risk-analysis") == "gpt-4o"
    assert model_for_hint("document-extraction") == "gpt-4o"


# ── Claude fallback ─────────────────────────────────────────────────────────────
class _Block:
    def __init__(self, text, type_="text"):
        self.text, self.type = text, type_


class _AnthropicUsage:
    def __init__(self, i, o):
        self.input_tokens, self.output_tokens = i, o


class _AnthropicResponse:
    def __init__(self, blocks, model, usage):
        self.content, self.model, self.usage = blocks, model, usage


class _FakeMessages:
    def __init__(self, response, capture):
        self._response, self._capture = response, capture

    async def create(self, model, system, messages, max_tokens):
        self._capture.update(model=model, system=system, messages=messages)
        return self._response


class _FakeAnthropicClient:
    def __init__(self):
        self.capture = {}
        self.messages = _FakeMessages(
            _AnthropicResponse([_Block("claude answer")], "claude-sonnet-4-6", _AnthropicUsage(7, 11)),
            self.capture,
        )


@pytest.mark.asyncio
async def test_claude_splits_system_prompt_and_maps_usage():
    client = _FakeAnthropicClient()
    provider = ClaudeLLMProvider(client=client)

    resp = await provider.complete(
        [Message("system", "you are helpful"), Message("user", "hi")], "summarization"
    )

    # Anthropic takes the system prompt separately, not in the messages list.
    assert client.capture["system"] == "you are helpful"
    assert client.capture["messages"] == [{"role": "user", "content": "hi"}]
    assert resp.content == "claude answer"
    assert (resp.prompt_tokens, resp.completion_tokens, resp.total_tokens) == (7, 11, 18)


# ── Ollama on-prem ──────────────────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_ollama_tolerates_missing_usage():
    client = _FakeOpenAIClient(content="local answer", model="llama3", usage=None)
    # Force usage to None to exercise the "Ollama may omit usage" branch.
    client.chat.completions._response.usage = None
    provider = OllamaLLMProvider(client=client)

    resp = await provider.complete([Message("user", "hi")], "summarization")

    assert resp.content == "local answer"
    assert (resp.prompt_tokens, resp.completion_tokens, resp.total_tokens) == (0, 0, 0)


# ── Factory ─────────────────────────────────────────────────────────────────────
def test_factory_stub_when_placeholder(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "REPLACE_ME")
    assert isinstance(build_llm_provider(), StubLLMProvider)


def test_factory_real_when_key_present(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-real")
    import providers.llm_provider as mod

    built = {}

    class _Sentinel(mod.OpenAILLMProvider):
        def __init__(self):
            built["ok"] = True

    monkeypatch.setattr(mod, "OpenAILLMProvider", _Sentinel)
    provider = mod.build_llm_provider()
    assert built.get("ok") is True
    assert isinstance(provider, _Sentinel)


def test_unknown_hint_falls_back_to_the_cheap_tier():
    # defaults.fallback_tier is FAST. An unrecognised hint should cost the cheap model — being wrong
    # in the expensive direction is the failure that shows up on a bill rather than in a test.
    assert model_for_hint("no-such-hint") == "gpt-4o-mini"


def test_routing_table_is_what_decides(monkeypatch):
    """The table is authoritative: change the environment, change the model."""
    from providers.model_routing import load_routing_table

    load_routing_table.cache_clear()
    monkeypatch.setenv("OPENAI_FAST_MODEL", "some-other-cheap-model")
    try:
        assert model_for_hint("summarization") == "some-other-cheap-model"
    finally:
        load_routing_table.cache_clear()


def test_no_model_name_is_hardcoded_in_the_provider_module():
    """master:3795 — "never hardcode model names" applies to source, not only to the YAML."""
    import re
    from pathlib import Path

    src = Path(__file__).resolve().parents[1] / "providers" / "llm_provider.py"
    code = re.sub(r'"""[\s\S]*?"""', " ", src.read_text(encoding="utf-8"))
    code = re.sub(r"#[^\n]*", " ", code)
    assert not re.search(r"[\"']gpt-[\w.-]+[\"']", code)


def test_routing_table_exposes_every_configured_hint():
    """`hints()` is what an operator or a diagnostic reads to see the table as loaded."""
    from providers.model_routing import load_routing_table

    hints = load_routing_table().hints()
    assert hints["summarization"] == "gpt-4o-mini"
    assert hints["report-generation"] == "gpt-4o"
    # Every hint the YAML lists is present — six across the two tiers (master:3796-3797).
    assert len(hints) == 6


def test_blank_env_var_is_treated_as_unset(monkeypatch):
    """`OPENAI_FAST_MODEL=` in a compose file must not resolve to an empty model name."""
    from providers.model_routing import load_routing_table

    load_routing_table.cache_clear()
    monkeypatch.setenv("OPENAI_FAST_MODEL", "")
    try:
        assert model_for_hint("summarization") == "gpt-4o-mini"
    finally:
        load_routing_table.cache_clear()

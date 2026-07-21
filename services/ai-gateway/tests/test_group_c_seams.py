"""The remaining provider/infra seams — mostly lazy-import branches and stub contracts.

Every `__init__(client=None)` here does a lazy `from <sdk> import ...` that only executes in a
provisioned deployment; this repo ships no OPENAI_API_KEY, so those lines had never run. They are
covered by injecting a fake SDK module into `sys.modules`, which proves the wiring (base_url, key,
model) without a network call — the wiring is exactly what a swap to Claude/Ollama depends on
(§22.6 AlternativeLLMProvider: "drop-in, zero refactor").

The abstract stubs are asserted to FAIL LOUDLY: §32.9 makes these Type A integration stubs, which
must raise rather than return a plausible empty result.
"""

import sys
import types
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest


def _fake_module(name: str, **attrs):
    module = types.ModuleType(name)
    for key, value in attrs.items():
        setattr(module, key, value)
    return module


class _Recorder:
    """Records constructor kwargs so the wiring can be asserted."""

    last_kwargs: dict = {}

    def __init__(self, *args, **kwargs):
        type(self).last_kwargs = kwargs
        self.args = args


class TestMlopsInterfaces:
    """Phase 23 seams — the interfaces exist so Phase 11 code can depend on them today."""

    def test_feature_store_cannot_be_instantiated(self):
        from interfaces.feature_store import FeatureStore

        with pytest.raises(TypeError):
            FeatureStore()

    def test_feature_store_declares_the_online_lookup(self):
        from interfaces.feature_store import FeatureStore

        assert "get_online_features" in FeatureStore.__abstractmethods__

    def test_model_registry_cannot_be_instantiated(self):
        from interfaces.model_registry import ModelRegistry

        with pytest.raises(TypeError):
            ModelRegistry()

    def test_model_registry_declares_registration(self):
        from interfaces.model_registry import ModelRegistry

        assert "register_model" in ModelRegistry.__abstractmethods__


class TestOtelTraceIds:
    def test_trace_id_is_32_hex_chars_when_no_span_is_active(self):
        # Log correlation expects a fixed-width id; an empty string would break structured logs.
        from otel import get_trace_id

        assert get_trace_id() == "0" * 32

    def test_span_id_is_16_hex_chars_when_no_span_is_active(self):
        from otel import get_span_id

        assert get_span_id() == "0" * 16

    def test_ids_come_from_the_active_span(self, monkeypatch):
        import otel

        class _Ctx:
            is_valid = True
            trace_id = 0x0123456789ABCDEF0123456789ABCDEF
            span_id = 0x0123456789ABCDEF

        class _Span:
            def get_span_context(self):
                return _Ctx()

        monkeypatch.setattr(otel.trace, "get_current_span", lambda: _Span())

        assert otel.get_trace_id() == "0123456789abcdef0123456789abcdef"
        assert otel.get_span_id() == "0123456789abcdef"

    def test_get_tracer_defaults_to_the_service_name(self):
        from otel import get_tracer

        assert get_tracer() is not None


class TestEmbeddingProviderStub:
    @pytest.mark.asyncio
    async def test_stub_fails_fast_rather_than_returning_empty_vectors(self):
        # A stub returning [] would be stored as a real embedding and poison retrieval silently.
        from providers.embedding_provider import StubEmbeddingProvider

        with pytest.raises(NotImplementedError):
            await StubEmbeddingProvider().embed(["text"])

    def test_stub_still_reports_the_column_width(self):
        from providers.embedding_provider import EMBEDDING_DIMENSIONS, StubEmbeddingProvider

        assert StubEmbeddingProvider().dimensions == EMBEDDING_DIMENSIONS


class TestOpenAIEmbeddingProvider:
    def test_constructs_its_own_client_when_none_is_injected(self, monkeypatch):
        monkeypatch.setitem(sys.modules, "openai", _fake_module("openai", AsyncOpenAI=_Recorder))
        from providers.embedding_provider import OpenAIEmbeddingProvider

        provider = OpenAIEmbeddingProvider()

        assert isinstance(provider._client, _Recorder)

    @pytest.mark.asyncio
    async def test_empty_input_short_circuits_without_calling_the_api(self):
        from providers.embedding_provider import OpenAIEmbeddingProvider

        class _Client:
            def __init__(self):
                self.called = False

            class embeddings:  # noqa: N801
                @staticmethod
                async def create(**kwargs):
                    raise AssertionError("must not call the API for an empty batch")

        assert await OpenAIEmbeddingProvider(client=_Client()).embed([]) == []

    @pytest.mark.asyncio
    async def test_vectors_are_reordered_by_index(self):
        from providers.embedding_provider import EMBEDDING_DIMENSIONS, OpenAIEmbeddingProvider

        class _Item:
            def __init__(self, index, value):
                self.index = index
                self.embedding = [value] * EMBEDDING_DIMENSIONS

        class _Client:
            class embeddings:  # noqa: N801
                @staticmethod
                async def create(**kwargs):
                    return types.SimpleNamespace(data=[_Item(1, 0.2), _Item(0, 0.1)])

        vectors = await OpenAIEmbeddingProvider(client=_Client()).embed(["a", "b"])

        # Out-of-order items must be realigned, or chunk A gets chunk B's vector.
        assert vectors[0][0] == 0.1
        assert vectors[1][0] == 0.2

    @pytest.mark.asyncio
    async def test_wrong_width_is_rejected(self):
        from providers.embedding_provider import OpenAIEmbeddingProvider

        class _Client:
            class embeddings:  # noqa: N801
                @staticmethod
                async def create(**kwargs):
                    return types.SimpleNamespace(
                        data=[types.SimpleNamespace(index=0, embedding=[0.1] * 10)]
                    )

        with pytest.raises(ValueError, match="embedding width"):
            await OpenAIEmbeddingProvider(client=_Client()).embed(["a"])


class TestLlmProviderLazyClient:
    def test_openai_provider_builds_its_own_client(self, monkeypatch):
        monkeypatch.setitem(sys.modules, "openai", _fake_module("openai", AsyncOpenAI=_Recorder))
        from providers.llm_provider import OpenAILLMProvider

        assert isinstance(OpenAILLMProvider()._client, _Recorder)


class TestAlternativeProviders:
    def test_claude_provider_builds_an_anthropic_client(self, monkeypatch):
        monkeypatch.setitem(
            sys.modules, "anthropic", _fake_module("anthropic", AsyncAnthropic=_Recorder)
        )
        from providers.alternative_llm_provider import ClaudeLLMProvider

        assert isinstance(ClaudeLLMProvider()._client, _Recorder)

    def test_ollama_points_the_openai_client_at_the_local_server(self, monkeypatch):
        # §22.6: Ollama is reached through the OpenAI-compatible API — the base_url and throwaway
        # key ARE the integration. A wrong default would silently call api.openai.com instead.
        monkeypatch.setitem(sys.modules, "openai", _fake_module("openai", AsyncOpenAI=_Recorder))
        monkeypatch.delenv("OLLAMA_BASE_URL", raising=False)
        from providers.alternative_llm_provider import OllamaLLMProvider

        OllamaLLMProvider()

        assert _Recorder.last_kwargs["base_url"] == "http://localhost:11434/v1"
        assert _Recorder.last_kwargs["api_key"] == "ollama"

    def test_ollama_base_url_is_configurable(self, monkeypatch):
        monkeypatch.setitem(sys.modules, "openai", _fake_module("openai", AsyncOpenAI=_Recorder))
        monkeypatch.setenv("OLLAMA_BASE_URL", "http://gpu-box:11434/v1")
        from providers.alternative_llm_provider import OllamaLLMProvider

        OllamaLLMProvider()

        assert _Recorder.last_kwargs["base_url"] == "http://gpu-box:11434/v1"


class TestCrossEncoderLazyLoad:
    def test_loads_the_model_only_on_first_use(self, monkeypatch):
        # sentence-transformers is deliberately NOT installed (it pulls a CUDA torch build), so the
        # lazy import is what keeps this module importable at all.
        constructed: list = []

        class _FakeCrossEncoder:
            def __init__(self, name):
                constructed.append(name)

            def predict(self, pairs):
                return [0.5 for _ in pairs]

        monkeypatch.setitem(
            sys.modules,
            "sentence_transformers",
            _fake_module("sentence_transformers", CrossEncoder=_FakeCrossEncoder),
        )
        from providers.cross_encoder_reranking import (
            CROSS_ENCODER_MODEL,
            Document,
            SentenceTransformerReranking,
        )

        reranker = SentenceTransformerReranking()
        assert constructed == []  # nothing loaded at construction

        reranker.rerank("q", [Document("text", "s1", "site_report")])

        assert constructed == [CROSS_ENCODER_MODEL]


class TestGatewayResilienceFailover:
    @pytest.mark.asyncio
    async def test_primary_failure_falls_over_and_logs(self):
        from providers.gateway_resilience import ResilientLLMProvider
        from providers.llm_provider import LLMResponse

        class _Failing:
            async def complete(self, messages, model_hint):
                raise RuntimeError("openai 500")

        class _Fallback:
            async def complete(self, messages, model_hint):
                return LLMResponse(
                    content="from fallback",
                    model_used="claude",
                    prompt_tokens=1,
                    completion_tokens=1,
                    total_tokens=2,
                )

        class _Logger:
            def __init__(self):
                self.warnings: list = []

            def warning(self, *args):
                self.warnings.append(args)

        logger = _Logger()
        provider = ResilientLLMProvider(_Failing(), _Fallback(), logger=logger)

        result = await provider.complete([], "report-generation")

        assert result.content == "from fallback"
        assert logger.warnings  # the failover must be visible in logs, not silent


class TestChainConfigValidation:
    def test_unknown_chain_type_raises_file_not_found(self):
        from providers.langchain_config import load_chain_config

        with pytest.raises(FileNotFoundError, match="no chain config"):
            load_chain_config("does-not-exist")

    def test_missing_required_key_is_rejected(self, tmp_path, monkeypatch):
        import providers.langchain_config as lc

        (tmp_path / "broken.yaml").write_text("chain_type: broken\n", encoding="utf-8")
        monkeypatch.setattr(lc, "CHAINS_DIR", tmp_path)

        with pytest.raises(ValueError, match="missing required key"):
            lc.load_chain_config("broken")

    def test_missing_final_top_k_is_rejected(self, tmp_path, monkeypatch):
        # Without it the retriever silently falls back to a default k — a quiet quality regression.
        import providers.langchain_config as lc

        (tmp_path / "c.yaml").write_text(
            "chain_type: c\nllm: {model: gpt-4o}\nretrieval: {vector: {top_k: 20}}\n",
            encoding="utf-8",
        )
        monkeypatch.setattr(lc, "CHAINS_DIR", tmp_path)

        with pytest.raises(ValueError, match="final_top_k"):
            lc.load_chain_config("c")

    def test_the_shipped_rag_config_is_valid(self):
        from providers.langchain_config import load_chain_config

        config = load_chain_config("rag")

        assert config["chain_type"] == "rag"
        assert config["retrieval"]["final_top_k"] == 5


class TestStubLangChainConfig:
    @pytest.mark.parametrize(
        "method", ["get_provider_package", "get_model_class"]
    )
    def test_stub_accessors_fail_fast(self, method):
        from providers.langchain_config import StubLangChainProviderConfig

        with pytest.raises(NotImplementedError):
            getattr(StubLangChainProviderConfig(), method)()

    def test_stub_build_chain_fails_fast(self):
        from providers.langchain_config import StubLangChainProviderConfig

        with pytest.raises(NotImplementedError):
            StubLangChainProviderConfig().build_chain("rag", "tenant-1")


class TestRagConfigFallback:
    def test_defaults_are_used_when_the_config_file_is_absent(self, tmp_path, monkeypatch):
        # A deployment shipped without ai/chains/rag.yaml must still retrieve, not crash.
        import providers.langchain_config as lc
        from rag.retrieval import _DEFAULT_MAX_CONTEXT_TOKENS, _DEFAULT_TOP_K, load_rag_config

        monkeypatch.setattr(lc, "CHAINS_DIR", tmp_path)  # empty dir → no rag.yaml

        assert load_rag_config() == {
            "top_k": _DEFAULT_TOP_K,
            "max_context_tokens": _DEFAULT_MAX_CONTEXT_TOKENS,
        }


class TestRagWiring:
    @pytest.mark.asyncio
    async def test_returns_none_when_backends_are_not_configured(self, monkeypatch):
        # The default posture: no OPENAI_API_KEY → no retriever, and /rag/query keeps its 503.
        import rag.wiring as wiring

        monkeypatch.setattr(wiring, "rag_backends_configured", lambda: False)

        assert await wiring.build_retriever() is None

    @pytest.mark.asyncio
    async def test_builds_a_hybrid_retriever_when_configured(self, monkeypatch):
        import rag.wiring as wiring
        from rag.retrieval import HybridRetriever

        created: dict = {}

        async def fake_create_pool(dsn):
            created["dsn"] = dsn
            return "pool"

        class _FakeOpenSearch:
            def __init__(self, hosts=None):
                created["hosts"] = hosts

        monkeypatch.setattr(wiring, "rag_backends_configured", lambda: True)
        monkeypatch.setitem(
            sys.modules, "asyncpg", _fake_module("asyncpg", create_pool=fake_create_pool)
        )
        monkeypatch.setitem(
            sys.modules,
            "opensearchpy",
            _fake_module("opensearchpy", AsyncOpenSearch=_FakeOpenSearch),
        )
        monkeypatch.setenv("RAG_DATABASE_URL", "postgres://rag-host/db")
        monkeypatch.setenv("OPENSEARCH_URL", "http://opensearch:9200")

        retriever = await wiring.build_retriever()

        assert isinstance(retriever, HybridRetriever)
        assert created["dsn"] == "postgres://rag-host/db"
        assert created["hosts"] == ["http://opensearch:9200"]

    @pytest.mark.asyncio
    async def test_falls_back_to_the_main_database_url(self, monkeypatch):
        # RAG_DATABASE_URL is an optional override; without it the gateway uses its own DSN.
        import rag.wiring as wiring

        async def fake_create_pool(dsn):
            fake_create_pool.dsn = dsn
            return "pool"

        monkeypatch.setattr(wiring, "rag_backends_configured", lambda: True)
        monkeypatch.setitem(
            sys.modules, "asyncpg", _fake_module("asyncpg", create_pool=fake_create_pool)
        )
        monkeypatch.setitem(
            sys.modules,
            "opensearchpy",
            _fake_module("opensearchpy", AsyncOpenSearch=lambda hosts=None: None),
        )
        monkeypatch.delenv("RAG_DATABASE_URL", raising=False)
        monkeypatch.setenv("DATABASE_URL", "postgres://main-host/db")
        monkeypatch.setenv("OPENSEARCH_URL", "http://opensearch:9200")

        await wiring.build_retriever()

        assert fake_create_pool.dsn == "postgres://main-host/db"


class TestPromptsDirResolution:
    def test_env_var_wins(self, monkeypatch, tmp_path):
        import templates.loader as loader

        monkeypatch.setenv("PROMPTS_DIR", str(tmp_path))

        assert loader._resolve_prompts_dir() == tmp_path

    def test_walks_up_to_find_ai_prompts_when_env_is_unset(self, monkeypatch):
        # The container bakes prompts at /app/ai/prompts precisely so this walk succeeds with no env.
        import templates.loader as loader

        monkeypatch.delenv("PROMPTS_DIR", raising=False)

        resolved = loader._resolve_prompts_dir()

        assert resolved.is_dir()
        assert resolved.name == "prompts"

    def test_raises_a_clear_error_when_prompts_cannot_be_found(self, monkeypatch, tmp_path):
        import templates.loader as loader

        monkeypatch.delenv("PROMPTS_DIR", raising=False)
        # Point __file__ at an isolated tree with no ai/prompts anywhere above it.
        orphan = tmp_path / "a" / "b" / "loader.py"
        orphan.parent.mkdir(parents=True)
        orphan.write_text("", encoding="utf-8")
        monkeypatch.setattr(loader, "__file__", str(orphan))

        with pytest.raises(FileNotFoundError, match="set PROMPTS_DIR"):
            loader._resolve_prompts_dir()

    def test_an_empty_ai_prompts_dir_does_not_shadow_the_real_one(self, monkeypatch, tmp_path):
        """Regression: the walk used to stop at the first `ai/prompts` *directory*, so an empty one
        nearer the file won over the populated one above it. Every render then 404'd at request
        time instead of failing loudly at startup — which is exactly how a stray empty
        services/ai-gateway/ai/prompts, left behind by a container build, broke eight tests."""
        import templates.loader as loader

        monkeypatch.delenv("PROMPTS_DIR", raising=False)
        real = tmp_path / "ai" / "prompts"
        real.mkdir(parents=True)
        (real / "some-template-v1.j2").write_text("hi", encoding="utf-8")
        decoy = tmp_path / "svc" / "ai" / "prompts"
        decoy.mkdir(parents=True)
        stub = tmp_path / "svc" / "templates" / "loader.py"
        stub.parent.mkdir(parents=True)
        stub.write_text("", encoding="utf-8")
        monkeypatch.setattr(loader, "__file__", str(stub))

        assert loader._resolve_prompts_dir() == real


class TestOpenAIEmbeddingDimensions:
    def test_reports_the_vector_column_width(self):
        # ai-gateway ships its own copy of this provider; the width must match VECTOR(1536) or the
        # insert fails at the database rather than here.
        from providers.embedding_provider import EMBEDDING_DIMENSIONS, OpenAIEmbeddingProvider

        assert OpenAIEmbeddingProvider(client=object()).dimensions == EMBEDDING_DIMENSIONS

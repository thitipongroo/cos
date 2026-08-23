"""Contract tests for the not-yet-activated AI interfaces — spec 22 §22.7.

§35.13 ESC-24: interfaces/, providers/langchain_config.py and providers/cross_encoder_reranking.py
were entirely uncovered. Every one of these modules is a deliberate placeholder whose implementation
is deferred to a later phase, and each ships a Stub that must REFUSE rather than return an
empty-but-plausible result — a stub that silently returned [] would look like "reranking found
nothing" instead of "reranking is not wired". These tests pin exactly that.
"""

import pytest

from interfaces.feature_store import FeatureStore
from interfaces.model_registry import ModelRegistry
from providers.cross_encoder_reranking import (
    CrossEncoderReranking,
    Document,
    RankedDocument,
    StubCrossEncoderReranking,
)
from providers.langchain_config import LangChainProviderConfig, StubLangChainProviderConfig


class TestFeatureStore:
    def test_is_abstract(self):
        with pytest.raises(TypeError):
            FeatureStore()  # type: ignore[abstract]

    def test_a_subclass_must_implement_get_online_features(self):
        class Incomplete(FeatureStore):
            pass

        with pytest.raises(TypeError):
            Incomplete()  # type: ignore[abstract]

    def test_a_complete_subclass_is_usable(self):
        class InMemory(FeatureStore):
            def get_online_features(self, entity_keys, feature_refs):
                return {"equipment_id": entity_keys["equipment_id"], "features": feature_refs}

        store = InMemory()
        assert store.get_online_features({"equipment_id": "e1"}, ["fuel:avg_7d"]) == {
            "equipment_id": "e1",
            "features": ["fuel:avg_7d"],
        }


class TestModelRegistry:
    def test_is_abstract(self):
        with pytest.raises(TypeError):
            ModelRegistry()  # type: ignore[abstract]

    def test_a_subclass_must_implement_register_model(self):
        class Incomplete(ModelRegistry):
            pass

        with pytest.raises(TypeError):
            Incomplete()  # type: ignore[abstract]

    def test_a_complete_subclass_is_usable(self):
        registered: list[tuple[str, str, str]] = []

        class Recording(ModelRegistry):
            def register_model(self, name, version, artifact_path):
                registered.append((name, version, artifact_path))

        Recording().register_model("SafetyVisionModel", "3", "s3://models/sv/3")
        assert registered == [("SafetyVisionModel", "3", "s3://models/sv/3")]


class TestLangChainProviderConfig:
    def test_is_abstract(self):
        with pytest.raises(TypeError):
            LangChainProviderConfig()  # type: ignore[abstract]

    def test_the_stub_is_a_valid_implementation(self):
        assert isinstance(StubLangChainProviderConfig(), LangChainProviderConfig)

    @pytest.mark.parametrize(
        "call",
        [
            lambda s: s.get_provider_package(),
            lambda s: s.get_model_class(),
            lambda s: s.build_chain("rag", "tenant-1"),
        ],
        ids=["get_provider_package", "get_model_class", "build_chain"],
    )
    def test_every_stub_method_refuses(self, call):
        stub = StubLangChainProviderConfig()
        with pytest.raises(NotImplementedError, match="configure langchain-openai"):
            call(stub)


class TestCrossEncoderReranking:
    def test_document_is_a_value_object(self):
        a = Document(content="c", source_id="s1", source_type="site_report")
        b = Document(content="c", source_id="s1", source_type="site_report")
        assert a == b

    def test_ranked_document_pairs_a_document_with_a_score(self):
        doc = Document(content="c", source_id="s1", source_type="site_report")
        ranked = RankedDocument(document=doc, score=0.82)
        assert ranked.document is doc
        assert ranked.score == 0.82

    def test_is_abstract(self):
        with pytest.raises(TypeError):
            CrossEncoderReranking()  # type: ignore[abstract]

    def test_the_stub_refuses_rather_than_returning_an_empty_ranking(self):
        """An empty list would read as "nothing was relevant"; the activation trigger is
        RAG p95 relevance < 0.7 (spec 22 §22.7), so silence here would hide a real signal."""
        stub = StubCrossEncoderReranking()
        docs = [Document(content="concrete pour", source_id="r1", source_type="site_report")]
        with pytest.raises(NotImplementedError, match="p95 relevance"):
            stub.rerank("when was level 3 poured", docs)

    def test_a_real_implementation_can_satisfy_the_interface(self):
        class ByLength(CrossEncoderReranking):
            def rerank(self, query, documents):
                return sorted(
                    (RankedDocument(document=d, score=float(len(d.content))) for d in documents),
                    key=lambda r: r.score,
                    reverse=True,
                )

        docs = [
            Document(content="short", source_id="a", source_type="t"),
            Document(content="a much longer document", source_id="b", source_type="t"),
        ]
        ranked = ByLength().rerank("q", docs)
        assert [r.document.source_id for r in ranked] == ["b", "a"]

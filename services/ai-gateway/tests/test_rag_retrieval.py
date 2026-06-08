"""Unit tests for RAG retrieval logic — provider-agnostic, no real API call."""
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from providers.llm_provider import StubLLMProvider, Message


class TestRAGRetrievalLogic:
    """Tests the routing + assembly logic without hitting pgvector or OpenSearch."""

    def test_top_k_default_is_five(self):
        import yaml
        chain_config_path = Path(__file__).resolve().parents[4] / "ai" / "chains" / "rag.yaml"
        config = yaml.safe_load(chain_config_path.read_text())
        assert config["retrieval"]["top_k"] == 5

    def test_max_context_tokens_is_4000(self):
        import yaml
        chain_config_path = Path(__file__).resolve().parents[4] / "ai" / "chains" / "rag.yaml"
        config = yaml.safe_load(chain_config_path.read_text())
        assert config["retrieval"]["max_context_tokens"] == 4000

    def test_hybrid_search_backends_specified(self):
        import yaml
        chain_config_path = Path(__file__).resolve().parents[4] / "ai" / "chains" / "rag.yaml"
        config = yaml.safe_load(chain_config_path.read_text())
        hs = config["retrieval"]["hybrid_search"]
        assert hs["keyword_backend"] == "opensearch"
        assert hs["vector_backend"] == "pgvector"

    def test_reranker_activates_below_threshold(self):
        import yaml
        chain_config_path = Path(__file__).resolve().parents[4] / "ai" / "chains" / "rag.yaml"
        config = yaml.safe_load(chain_config_path.read_text())
        assert config["reranking"]["activate_when_p95_relevance_below"] == 0.7

    def test_document_chunk_size_is_500(self):
        import yaml
        chain_config_path = Path(__file__).resolve().parents[4] / "ai" / "chains" / "rag.yaml"
        config = yaml.safe_load(chain_config_path.read_text())
        assert config["chunking"]["documents"]["chunk_size"] == 500
        assert config["chunking"]["documents"]["chunk_overlap"] == 100

    def test_site_report_uses_single_chunk_strategy(self):
        import yaml
        chain_config_path = Path(__file__).resolve().parents[4] / "ai" / "chains" / "rag.yaml"
        config = yaml.safe_load(chain_config_path.read_text())
        assert config["chunking"]["site_reports"]["strategy"] == "single_chunk"

    def test_routing_table_has_two_tiers(self):
        import yaml
        routing_path = Path(__file__).resolve().parents[1] / "config" / "routing.yaml"
        config = yaml.safe_load(routing_path.read_text())
        assert "POWERFUL" in config["tiers"]
        assert "FAST" in config["tiers"]

    def test_routing_table_no_hardcoded_model_names(self):
        import yaml
        routing_path = Path(__file__).resolve().parents[1] / "config" / "routing.yaml"
        config = yaml.safe_load(routing_path.read_text())
        for tier in config["tiers"].values():
            model_value = tier["model"]
            assert model_value.startswith("${"), (
                f"Model name must be env-var reference, not hardcoded: {model_value}"
            )

"""Unit tests for RAG retrieval logic — provider-agnostic, no real API call."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))



def _load_chain_config() -> dict:
    """Read the canonical chain config.

    Resolved via providers.langchain_config.CHAINS_DIR (service-local `ai/chains/`, overridable with
    AI_CHAINS_DIR) rather than a `parents[3]` walk to the repo root. The repo-root copy was a second,
    divergent rag.yaml on a different schema; the product owner made the service-local file canonical
    and it has been removed. A fixed-depth walk also breaks in the container, where the service is
    flattened to /app and `parents[3]` raises IndexError.
    """
    import yaml
    from providers.langchain_config import CHAINS_DIR

    return yaml.safe_load((CHAINS_DIR / "rag.yaml").read_text())


class TestRAGRetrievalLogic:
    """Tests the routing + assembly logic without hitting pgvector or OpenSearch."""

    def test_top_k_default_is_five(self):
        config = _load_chain_config()
        # final_top_k = the answer count after fusion (§22.7 RAG-001). The per-backend `top_k: 20`
        # under retrieval.vector / retrieval.keyword are candidate counts feeding fusion.
        assert config["retrieval"]["final_top_k"] == 5

    def test_max_context_tokens_is_4000(self):
        config = _load_chain_config()
        assert config["retrieval"]["max_context_tokens"] == 4000

    def test_hybrid_search_backends_specified(self):
        config = _load_chain_config()
        assert config["retrieval"]["keyword"]["backend"] == "opensearch"
        assert config["retrieval"]["vector"]["backend"] == "pgvector"

    def test_reranker_activates_below_threshold(self):
        config = _load_chain_config()
        assert config["rerank"]["trigger"]["threshold"] == 0.7

    def test_document_chunk_size_is_500(self):
        config = _load_chain_config()
        assert config["chunking"]["documents"]["chunk_size"] == 500
        assert config["chunking"]["documents"]["chunk_overlap"] == 100

    def test_site_report_uses_single_chunk_strategy(self):
        config = _load_chain_config()
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

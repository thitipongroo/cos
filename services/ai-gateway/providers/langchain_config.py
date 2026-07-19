from __future__ import annotations

import os
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any

# §22.7: chain config lives in ai/chains/ as YAML per chain type.
CHAINS_DIR = Path(os.environ.get("AI_CHAINS_DIR", str(Path(__file__).resolve().parents[1] / "ai" / "chains")))


def load_chain_config(chain_type: str) -> dict:
    """Load and validate ai/chains/<chain_type>.yaml.

    Kept independent of langchain so the config contract is testable without the heavy SDK. Raises
    FileNotFoundError for an unknown chain type and ValueError if a required key is missing.
    """
    import yaml

    path = CHAINS_DIR / f"{chain_type}.yaml"
    if not path.exists():
        raise FileNotFoundError(f"no chain config for {chain_type!r} at {path}")
    config = yaml.safe_load(path.read_text(encoding="utf-8"))

    for key in ("chain_type", "llm", "retrieval"):
        if key not in config:
            raise ValueError(f"chain config {path.name} missing required key {key!r}")
    if config["retrieval"].get("final_top_k") is None:
        raise ValueError(f"chain config {path.name} missing retrieval.final_top_k")
    return config


class LangChainProviderConfig(ABC):
    @abstractmethod
    def get_provider_package(self) -> str: ...

    @abstractmethod
    def get_model_class(self) -> type: ...

    @abstractmethod
    def build_chain(self, chain_type: str, tenant_id: str) -> Any: ...


class StubLangChainProviderConfig(LangChainProviderConfig):
    def get_provider_package(self) -> str:
        raise NotImplementedError("StubLangChainProviderConfig: configure langchain-openai before use")

    def get_model_class(self) -> type:
        raise NotImplementedError("StubLangChainProviderConfig: configure langchain-openai before use")

    def build_chain(self, chain_type: str, tenant_id: str) -> Any:
        raise NotImplementedError("StubLangChainProviderConfig: configure langchain-openai before use")

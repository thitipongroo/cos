"""
ModelRegistry interface stub — Phase 23
Integrated with: MLflow tracking server (deployed in this phase)
Concrete class: implement after MLflow server is running and models are registered.
"""

from __future__ import annotations
from dataclasses import dataclass
from typing import Protocol, runtime_checkable


@dataclass
class ModelRef:
    name: str
    version: str
    artifact_path: str
    run_id: str


@runtime_checkable
class ModelRegistryPort(Protocol):
    def register_model(
        self,
        name: str,
        version: str,
        artifact_path: str,
    ) -> ModelRef: ...


class ModelRegistryStub:
    """Stub — replace with MLflowModelRegistry when server is running."""

    def register_model(self, name: str, version: str, artifact_path: str) -> ModelRef:
        raise NotImplementedError(
            "ModelRegistry.register_model — not yet implemented; "
            "requires MLflow tracking server running and accessible"
        )

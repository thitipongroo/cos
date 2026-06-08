from abc import ABC, abstractmethod


class ModelRegistry(ABC):
    """Interface for MLflow model registration post-training.

    Full implementation: Phase 23 MLOps pipeline.
    Backend store: PostgreSQL (existing RDS).
    Artifact store: MinIO (existing S3-compatible).
    Source: docs/specifications/22-ai-architecture.md §22.7 Model Registry.
    """

    @abstractmethod
    def register_model(self, name: str, version: str, artifact_path: str) -> None: ...

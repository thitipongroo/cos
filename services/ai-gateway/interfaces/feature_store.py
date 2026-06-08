from abc import ABC, abstractmethod
from typing import Any


class FeatureStore(ABC):
    """Interface for Feast feature retrieval in inference.

    Full implementation: Phase 23 MLOps pipeline.
    Online store: Redis (existing). Offline store: PostgreSQL (existing RDS).
    Source: docs/specifications/22-ai-architecture.md §22.7 Feature Store.
    """

    @abstractmethod
    def get_online_features(
        self, entity_keys: dict[str, Any], feature_refs: list[str]
    ) -> dict[str, Any]: ...

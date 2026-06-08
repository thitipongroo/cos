"""
FeatureStore interface stub — Phase 23
Integrated with: Feast (deployed in this phase)
Concrete class: implement after Feast feature store is configured and materialized.
"""

from __future__ import annotations
from typing import Protocol, runtime_checkable


FeatureVector = dict[str, float | int | str]


@runtime_checkable
class FeatureStorePort(Protocol):
    def get_online_features(
        self,
        entity_rows: list[dict],
    ) -> list[FeatureVector]: ...


class FeatureStoreStub:
    """Stub — replace with FeastFeatureStore when Feast is materialized."""

    def get_online_features(self, entity_rows: list[dict]) -> list[FeatureVector]:
        raise NotImplementedError(
            "FeatureStore.get_online_features — not yet implemented; "
            "requires Feast configured and Redis online store materialized"
        )

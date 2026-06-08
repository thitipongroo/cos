"""
GraphMLModel stub — Phase 23
Algorithm: XGBoost on Neo4j graph-derived features (PageRank, centrality);
           source: spec §22-ai-architecture §22.7 ML Models
Activation trigger: after Neo4j graph has 6+ months of relationship data.
DO NOT activate before data threshold is met.
"""

from __future__ import annotations
from dataclasses import dataclass
from typing import Optional


@dataclass
class RelationshipScore:
    score: float
    relationship_type: str


class GraphMLModel:
    """
    Stub. Concrete implementation requires:
    - 6+ months of Neo4j graph relationship data
    - Graph feature extraction pipeline (PageRank, centrality scores)
    - MLflow model artifact registered at model 'graph-ml-model' stage=Production
    """

    def __init__(self, model_uri: Optional[str] = None) -> None:
        # TODO: load mlflow.xgboost.load_model(model_uri) when data threshold met
        self._model = None

    def infer_relationship(
        self,
        node_a: str,
        node_b: str,
        node_type: str,
    ) -> RelationshipScore:
        # TODO: implement when Neo4j has 6+ months of relationship data
        raise NotImplementedError(
            "GraphMLModel.infer_relationship — not yet active; "
            "requires 6+ months Neo4j relationship data and completed training DAG"
        )

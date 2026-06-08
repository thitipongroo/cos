"""
RiskClassifier stub — Phase 23
Algorithm: XGBoost multi-class (LOW/MEDIUM/HIGH/CRITICAL);
           source: spec §22-ai-architecture §22.7 ML Models
Activation trigger: after 50+ projects with full lifecycle data in production.
DO NOT activate before data threshold is met.
"""

from __future__ import annotations
from dataclasses import dataclass
from enum import Enum
from typing import Optional


class RiskLevel(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


@dataclass
class ProjectFeatures:
    budget_variance: float
    schedule_delay_pct: float
    overdue_invoice_count: int
    safety_incident_count: int
    open_issue_count: int


class RiskClassifier:
    """
    Stub. Concrete implementation requires:
    - 50+ projects with full lifecycle data in production
    - MLflow model artifact registered at model 'risk-classifier' stage=Production
    """

    def __init__(self, model_uri: Optional[str] = None) -> None:
        # TODO: load mlflow.xgboost.load_model(model_uri) when data threshold met
        self._model = None

    def classify(self, project_features: ProjectFeatures) -> RiskLevel:
        # TODO: implement when 50+ projects with full lifecycle are available
        raise NotImplementedError(
            "RiskClassifier.classify — not yet active; "
            "requires 50+ projects with full lifecycle data and completed training DAG"
        )

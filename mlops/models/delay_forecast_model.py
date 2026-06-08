"""
DelayForecastModel stub — Phase 23
Algorithm: XGBoost regressor; source: spec §22-ai-architecture §22.7 ML Models
Activation trigger: after dag-train-delay-model has run with 90+ days production data.
DO NOT activate before data threshold is met.
"""

from __future__ import annotations
from dataclasses import dataclass
from typing import Optional


@dataclass
class DelayFeatures:
    weather: str
    workforce_count: int
    procurement_delay_days: float
    historical_velocity: float
    days_to_deadline: int


@dataclass
class DelayPrediction:
    delay_probability: float
    estimated_delay_days: int
    confidence_interval: tuple[int, int]


class DelayForecastModel:
    """
    Stub. Concrete implementation requires:
    - 90+ days of production data in cos-datalake
    - dag-train-delay-model DAG run completed
    - MLflow model artifact registered at model 'delay-forecast-model' stage=Production
    """

    def __init__(self, model_uri: Optional[str] = None) -> None:
        # TODO: load mlflow.xgboost.load_model(model_uri) when data threshold met
        self._model = None

    def predict(self, features: DelayFeatures) -> DelayPrediction:
        # TODO: implement when MLflow model artifact is available
        raise NotImplementedError(
            "DelayForecastModel.predict — not yet active; "
            "requires 90+ days production data and completed training DAG"
        )

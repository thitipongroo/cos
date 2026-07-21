"""
Model serving integration — update AI Gateway model endpoint post-deployment.
Called from promote step in Kubeflow pipeline and Airflow training DAGs.
"""

from __future__ import annotations

import os
import httpx
from mlflow.tracking import MlflowClient


def get_production_model_uri(model_name: str) -> str:
    """Retrieve the artifact URI of the current Production model version from MLflow."""
    client = MlflowClient(tracking_uri=os.environ["MLFLOW_TRACKING_URI"])
    versions = client.get_latest_versions(model_name, stages=["Production"])
    if not versions:
        raise RuntimeError(f"No Production version found for model '{model_name}'")
    return versions[0].source


def update_ai_gateway_endpoint(model_name: str, model_uri: str) -> None:
    """
    Notify the AI Gateway of the new model artifact location so it can
    reload the serving endpoint.
    POST /internal/models/{model_name}/reload
    """
    gateway_url = os.environ.get("AI_GATEWAY_URL", "http://cos-ai-gateway.cos.svc.cluster.local:8000")
    url = f"{gateway_url}/internal/models/{model_name}/reload"
    resp = httpx.post(
        url,
        json={"model_uri": model_uri},
        headers={"X-Internal-Token": os.environ["AI_GATEWAY_INTERNAL_TOKEN"]},
        timeout=30,
    )
    resp.raise_for_status()


def promote_and_update(model_name: str) -> None:
    """
    Main entry point: retrieve production model URI from MLflow and
    push update to AI Gateway.
    """
    model_uri = get_production_model_uri(model_name)
    update_ai_gateway_endpoint(model_name, model_uri)

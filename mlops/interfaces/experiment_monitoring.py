"""
ExperimentMonitoring interface stub — Phase 23
Integrated with: MLflow Tracking (runs/metrics) + Evidently AI (evaluation + drift)
  — self-hosted, in-cluster; no external SaaS / API key. Replaced W&B per ADR-038.
Source: spec §22-ai-architecture §22.6 Experiment Monitoring & Evaluation
"""

from __future__ import annotations
from dataclasses import dataclass
from typing import Protocol, runtime_checkable


@dataclass
class RunRef:
    run_id: str
    experiment_name: str
    url: str


@runtime_checkable
class ExperimentMonitoringPort(Protocol):
    def log_run(
        self,
        experiment_name: str,
        metrics: dict,
        params: dict,
    ) -> RunRef: ...


class ExperimentMonitoringStub:
    """Stub — replace with the MLflow-backed implementation (MLflow Tracking + Evidently AI) when Phase 23 is activated."""

    def log_run(
        self,
        experiment_name: str,
        metrics: dict,
        params: dict,
    ) -> RunRef:
        raise NotImplementedError(
            "ExperimentMonitoring.log_run — not yet implemented; "
            "requires the self-hosted MLflow Tracking server (Phase 23)"
        )

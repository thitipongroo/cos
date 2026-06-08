"""
ExperimentMonitoring interface stub — Phase 23
Integrated with: W&B Cloud (wandb.ai) — RESOLVED: cloud, not self-hosted
Auth: W&B API key stored in AWS Secrets Manager
Source: spec §22-ai-architecture §22.7 Experiment Monitoring
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
    """Stub — replace with WandBExperimentMonitoring when W&B API key is configured."""

    def log_run(
        self,
        experiment_name: str,
        metrics: dict,
        params: dict,
    ) -> RunRef:
        raise NotImplementedError(
            "ExperimentMonitoring.log_run — not yet implemented; "
            "requires W&B API key in AWS Secrets Manager and network access to wandb.ai"
        )

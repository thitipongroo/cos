# ADR-038: Replace Weights & Biases with MLflow + Evidently AI

**Date:** 2026-06-30
**Status:** Accepted
**Deciders:** Product owner
**Tags:** ai

---

## Context

The spec selected **Weights & Biases (W&B) Cloud** for experiment monitoring and model evaluation
(`04-tech-stack` §4.6, `22-ai-architecture` §22.6 "Experiment Monitoring", `24-ai-training-pipeline`
§24.4 stack + the Path-A "Evaluation" stage).

W&B Cloud is a **proprietary SaaS** that requires a paid license for commercial/team use — it is the
only non-open-source component in the otherwise OSS MLOps stack (MLflow, Kubeflow, Feast, Airflow are
all open source). It also sends training metrics to an external cloud (`wandb.ai`).

## Decision

Remove Weights & Biases. Cover its two roles with tools already present / already referenced:

- **MLflow** (already self-hosted — see §22.6 Model Registry) handles **experiment tracking**: runs,
  params, metrics, and run comparison, in addition to its existing model-registry role.
- **Evidently AI** (open source, Apache-2.0, self-hosted) handles **model / output evaluation and
  drift monitoring** — the Path-A "Evaluation" stage in §24.4 and the monitoring role previously
  assigned to W&B. (Evidently AI is already named in `context/00_master_construction_os.md` for AI
  output evaluation.)

The `ExperimentMonitoring.logRun(config, metrics)` interface is retained, now backed by MLflow
tracking instead of W&B.

## Rationale

- **MLflow already does experiment tracking + registry**, so it absorbs W&B's run/metric logging and
  version comparison with no new dependency.
- **Evidently AI is already contemplated** in the master doc for AI output evaluation; formalizing it
  covers W&B's evaluation/monitoring role.
- Both are **OSS, self-hosted** → removes the only proprietary license cost in the MLOps stack and
  keeps training metrics in-cluster (no external egress).
- **Alternatives rejected:** keep W&B Cloud (paid; only proprietary tool in the stack); W&B
  self-hosted/Local (still a paid license for team use).

## Consequences

### Positive

- MLOps stack becomes 100% open-source / self-hosted.
- No W&B license cost; training metrics stay inside the cluster.

### Negative

- Lose W&B's hosted dashboards and built-in hyperparameter **Sweeps**; MLflow tracking UI +
  Evidently service must be self-hosted and operated.
- No 1:1 replacement for W&B Sweeps. If hyperparameter search is needed later, a sweep tool
  (e.g. Optuna or Katib) must be evaluated separately — **not decided here**.

### Neutral

- `ExperimentMonitoring.logRun()` interface unchanged (now MLflow-backed).
- Evidently AI deployment detail (library vs self-hosted monitoring service) to be specified during
  Phase 23 implementation — this decision fixes the tool choice, not the deployment topology.

## References

- spec `04-tech-stack` §4.6 (AI / MLOps)
- spec `22-ai-architecture` §22.6 (Experiment Monitoring)
- spec `24-ai-training-pipeline` §24.4 (MLOps Stack) + Path-A pipeline
- `context/phases/phase-23-mlops-pipeline.md` (MLOps)

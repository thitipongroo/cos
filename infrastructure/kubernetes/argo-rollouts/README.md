---
title: Construction OS — Argo Rollouts
last_updated: 2026-08-07
---

# Argo Rollouts — progressive delivery and the automated rollback gate

QM-16 requires two things this directory provides:

- **Automated rollback** — error rate above 1% within 10 minutes of a deployment rolls it back
  without a human.
- **Canary** — required for API endpoint changes, new background job types and AI model version
  upgrades; minimum 30 minutes at 5% traffic before full rollout.

| File                                                                   | What it is                                                       |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------- |
| [analysis-template-error-rate.yaml](analysis-template-error-rate.yaml) | `AnalysisTemplate/error-rate` and `AnalysisTemplate/p99-latency` |

## Status — not yet active

**The Argo Rollouts controller is not installed.** These templates are inert until it is, and the
target workloads are still plain `Deployment`s, not `Rollout`s. Nothing evaluates them today.

To activate:

1. Install the Argo Rollouts controller into the cluster.
2. Convert the workloads that QM-16 names for canary to `Rollout` resources.
3. Apply these templates: `kubectl apply -f analysis-template-error-rate.yaml -n cos`.
4. Reference them from each `Rollout`'s canary steps (sketch below).
5. Update QM-16 in [`context.md`](../../../context.md) — it currently says **NOT IMPLEMENTED**.

## How a Rollout consumes them

```yaml
strategy:
  canary:
    steps:
      - setWeight: 5
      - pause: { duration: 30m } # QM-16 minimum canary duration at 5%
      - analysis:
          templates:
            - templateName: error-rate
            - templateName: p99-latency
          args:
            - name: service
              value: cos-backend
      - setWeight: 50
      - pause: { duration: 10m }
      - setWeight: 100
```

A failed analysis aborts the rollout and Argo Rollouts shifts traffic back to the stable ReplicaSet —
that is the automated rollback, and it is faster than `argocd app rollback` because no sync is
involved.

## Why the thresholds are what they are

The PromQL is lifted from `infrastructure/monitoring/prometheus/rules/cos-alerts.yml` on purpose:

| Template      | Mirrors alert      | Threshold      |
| ------------- | ------------------ | -------------- |
| `error-rate`  | `APIHighErrorRate` | 5xx ratio ≥ 1% |
| `p99-latency` | `APIHighLatency`   | p99 ≥ 5 s      |

Same metric names, same selectors, same numbers — so "the alert fired" and "the rollout aborted"
describe one event rather than two thresholds that drift apart.

Both templates fail on an **empty** Prometheus result. A deployment whose targets are down returns
no series, and reading that as 0% error would promote exactly the rollout that should be aborted.

> 📎 QM-16 (deployment safety) and QM-8 (alerting) in [`context.md`](../../../context.md) ·
> [`runbooks/rollback.md`](../../../docs/runbooks/rollback.md) ·
> [ADR-012](../../../docs/architecture/adr/012-argocd.md) (CI does not deploy).

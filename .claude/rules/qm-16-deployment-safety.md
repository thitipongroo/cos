---
paths:
  - "infrastructure/helm/**"
  - "infrastructure/kubernetes/**"
  - ".github/workflows/**"
  - "docs/runbooks/releases/**"
---

# QM-16 — Deployment Safety

Indexed in: `context.md` §QUALITY MANDATES

Every production deployment must follow this protocol:

- **Zero-downtime** — required for all production changes; use Kubernetes rolling update by default
- **Blue-green deployment** — required for: major version releases, authentication system changes, any database migration that cannot be made backward-compatible in a single step
- **Canary deployment** — required for: API endpoint changes, new background job types, AI model version upgrades; minimum canary duration 30 minutes at 5% traffic before full rollout
- **Automated rollback** — if error rate exceeds 1% within 10 minutes of deployment → the rollout is aborted and traffic shifts back to the stable ReplicaSet automatically. Health gate: `infrastructure/kubernetes/argo-rollouts/analysis-template-error-rate.yaml` (`AnalysisTemplate/error-rate` + `AnalysisTemplate/p99-latency`, PromQL mirroring the `APIHighErrorRate` / `APIHighLatency` rules). **PARTIALLY IMPLEMENTED as of 2026-08-07: the templates exist; the Argo Rollouts controller is not installed and the workloads are still `Deployment`s, so nothing evaluates them yet** — see `infrastructure/kubernetes/argo-rollouts/README.md` for the activation steps. This line previously named `.github/workflows/deploy.yml`, which has never existed and could not host the gate: ADR-012 forbids CI from deploying and Phase 19 greps the workflows for `kubectl apply`/`helm upgrade` expecting zero hits
- **Deployment windows** — production deployments only during defined low-traffic windows; windows in `docs/runbooks/deployment-windows.md`; emergency hotfixes exempt with product owner approval on record
- Deployment runbook required for every major release in `docs/runbooks/releases/`

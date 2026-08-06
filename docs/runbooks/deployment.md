# Deployment Runbook

**STUB** — detailed procedures to be defined before Stage 1→2 transition (production launch).

> **Why this is still a STUB.** QM-11 closes a runbook by **executing it end-to-end in staging**
> within 30 days before the Stage transition — not by making the prose longer. Everything below is
> verified against the repository (ArgoCD manifests, Helm charts, alert rules, health endpoints);
> what is missing is a real staging run and the environment-specific values it would confirm.

## Scope

Service deployment and rolling rollout for the Construction OS monolith and supporting services.

## What is actually deployed

GitOps via ArgoCD. **GitHub Actions never runs `kubectl apply` or `helm upgrade`** — a Phase 19
readiness check greps `.github/workflows/` for exactly that and expects zero hits (ADR-012).

| Layer               | Where                                                              |
| ------------------- | -------------------------------------------------------------------- |
| ArgoCD `AppProject` | `construction-os` (namespace `argocd`)                             |
| ArgoCD Applications | 10, all in namespace `argocd`, all targeting namespace `cos`       |
| Helm charts         | `infrastructure/helm/cos-*` — one per deployable                   |
| Manifest            | `infrastructure/kubernetes/argocd/argocd-apps.yaml`                |

Applications: `cos-backend`, `cos-web`, `cos-file-service`, `cos-credential-service`,
`cos-ai-gateway`, `cos-ai-embedding-worker`, `cos-ai-ocr-pipeline`, `cos-analytics-worker`,
`cos-kg-ingestion-worker`, `cos-otel-collector`.

```bash
kubectl apply -f infrastructure/kubernetes/argocd/argocd-apps.yaml -n argocd   # (re)register the apps
argocd app list --output=wide                                                  # expect Synced / Healthy
argocd app get cos-backend
```

## ⚠️ Known gap — production auto-syncs today

QM-16 and the Phase 19 checklist require **production promotion to be a manual sync gate in the
ArgoCD UI**, with auto-sync limited to staging. As committed, every Application in
`argocd-apps.yaml` has `syncPolicy.automated` with `prune: true` and `selfHeal: true`, and every one
points at `values-prod.yaml` on `targetRevision: main`. There is **no separate staging Application**
(the Phase 19 check looks for `cos-staging`, which does not exist).

**A push to `main` therefore syncs production automatically.** Close this before Stage 1→2 — either
by splitting staging/production Applications or by removing `automated` from the production set.
Until then, treat every merge to `main` as a production deploy.

## Pre-deployment checklist

- [ ] CI pipeline passing (all test gates green — see [`../manual/ci-cd.md`](../manual/ci-cd.md))
- [ ] Database migrations reviewed and tested in staging; rollback script committed in
      `prisma/rollbacks/` (QM-9 — **not** inside `prisma/migrations/`, which fails `P3015`)
- [ ] Migration is backward-compatible: old code still runs while it applies
- [ ] Feature flags configured, and each is togglable to OFF in < 60 s (QM-15)
- [ ] Release runbook written in [`releases/`](releases/) for a major release (QM-11)
- [ ] Deployment window confirmed ([`deployment-windows.md`](deployment-windows.md))
- [ ] Rollback plan confirmed ([`rollback.md`](rollback.md))
- [ ] On-call engineer notified

## Deployment steps

1. Merge to `main` → GitHub Actions CI: lint → type-check → build → unit → integration → isolation →
   contract → dependency-audit → secret-scan → security-scan.
2. `build-docker` builds each image; Trivy scans it; `push-ecr` pushes it.
3. `update-gitops` commits the new image tag, which is what ArgoCD watches.
4. ArgoCD syncs. Rolling update: `maxSurge: 1`, `maxUnavailable: 0` (zero-downtime).
5. Readiness gates the rollout — new pods must pass `/api/v1/health/ready` before old pods terminate
   (`backend/src/health.controller.ts`).
6. Post-deploy smoke tests (ArgoCD PostSync wave 1), then Playwright critical journeys (wave 2) —
   staging only.

Strategy per QM-16: rolling by default; **blue-green** for major versions, auth changes, and any
migration that cannot be made backward-compatible in one step; **canary** (Argo Rollouts) for API
endpoint changes, new background job types and AI model upgrades — ≥ 30 min at 5% traffic.

## Post-deployment verification

```bash
kubectl -n cos get pods                       # all Running, no restarts
curl -fsS https://<ingress>/api/v1/health/live
curl -fsS https://<ingress>/api/v1/health/ready
argocd app get cos-backend                    # Synced + Healthy
```

Watch these alerts (`infrastructure/monitoring/prometheus/rules/cos-alerts.yml`) for 30 minutes:
`APIHighErrorRate`, `APIHighLatency`, `ServiceDown`, `DBConnectionExhausted`, `KafkaConsumerLagCritical`,
`DBHighQueryTime`, `MemoryPressure`.

Also confirm Kafka consumer lag is recovering and Temporal workflows are processing.

## Rollback trigger

Error rate > 1% within 10 minutes of deploy → the pipeline rolls back automatically (QM-16). Manually:
p95 latency > 500 ms (write) or > 300 ms (read) sustained 5 minutes, or error rate > 1% → roll back
now, investigate after. See [`rollback.md`](rollback.md).

## To close this STUB

1. Execute a full deploy in staging and record the result.
2. Fill in the real ingress host and ArgoCD server URL.
3. Resolve the production auto-sync gap above.
4. Confirm the smoke/E2E PostSync waves actually run.

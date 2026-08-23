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

| Layer               | Where                                                        |
| ------------------- | ------------------------------------------------------------ |
| ArgoCD `AppProject` | `construction-os` (namespace `argocd`)                       |
| ArgoCD Applications | **21** objects, all in namespace `argocd`: 11 production → `cos` (+ `monitoring`), 10 staging → `cos-staging` |
| Helm charts         | `infrastructure/helm/cos-*` — one per deployable             |
| Manifest            | `infrastructure/kubernetes/argocd/argocd-apps.yaml`          |

Production Applications (11): `cos-backend`, `cos-web`, `cos-file-service`,
`cos-credential-service`, `cos-ai-gateway`, `cos-ai-embedding-worker`, `cos-ai-ocr-pipeline`,
`cos-analytics-worker`, `cos-kg-ingestion-worker`, `cos-temporal-worker`, `cos-otel-collector`.
Each has a `-staging` twin except `cos-temporal-worker`, which has none.

Two committed charts have **no Application at all** — `cos-iot-ingestion-worker` and
`cos-ai-transcription-pipeline`. Nothing deploys them; confirm that is intended (Phase 24 / future)
before a release note claims they ship.

```bash
kubectl apply -f infrastructure/kubernetes/argocd/argocd-apps.yaml -n argocd   # (re)register the apps
argocd app list --output=wide                                                  # expect Synced / Healthy
argocd app get cos-backend
```

## Sync policy — production is a manual gate

**Corrected 2026-08-23.** This section previously carried a ⚠️ warning that "every Application in
`argocd-apps.yaml` has `syncPolicy.automated` … there is **no separate staging Application** (the
Phase 19 check looks for `cos-staging`, which does not exist)" and concluded "a push to `main`
therefore syncs production automatically". **That gap has been closed and the warning was stale.**
Measured against the committed manifests:

| Set                          | Sync                                          | Values                 | Destination   |
| ---------------------------- | --------------------------------------------- | ---------------------- | ------------- |
| 11 production Applications   | **manual** — no `automated` block at all      | `values-prod.yaml`     | `cos`         |
| 10 `-staging` Applications   | `automated`, `prune: true`, `selfHeal: true`  | `values-staging.yaml`  | `cos-staging` |

Both sets track `targetRevision: main`, which is the intended shape: staging follows `main`
continuously, and production is promoted by a human clicking Sync. That satisfies QM-16 and the
Phase 19 checklist.

> `scripts/readiness/run-all-checks.sh` still describes this as "verify `cos-production` app does NOT
> have syncPolicy.automated". No Application is named `cos-production` — the production set is the 11
> unsuffixed names above. The check is manual prose, not an executed assertion, so it does not fail;
> it just points at a name that does not exist.

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
6. Post-deploy smoke tests (ArgoCD PostSync wave 1). **See the warning below — they do not run
   today**, and there is no wave 2.

> ### ⚠️ The PostSync smoke test does not run, and would fail if it did
>
> Three findings, measured 2026-08-23:
>
> 1. **It is in no Application's source path.** `postsync-smoke-test.yaml` lives in
>    `infrastructure/kubernetes/argocd/`, and every Application points at
>    `infrastructure/helm/cos-*` or the otel overlays. An ArgoCD hook only fires for manifests inside
>    the synced path, so this Job never fires. Applied by hand it is a plain Job, not a hook.
> 2. **It calls two endpoints that do not exist.** `GET ${BASE_URL}/health` — the backend sets a
>    global prefix `api/v1` and exposes only `health/live` and `health/ready`, so there is no
>    `/health`. And `POST /api/v1/auth/login` with `{email, password}` — `@Controller('auth')` has
>    `otp/request`, `otp/verify`, `otp/attest`, `devices`, `step-up/*`, `refresh`, `logout`,
>    `mfa/enroll`, and **no `login`**. Path B authenticates against Keycloak directly, never through
>    the backend, so that route has never existed.
> 3. **Its namespace contradicts its own comment.** The file says "runs against staging after every
>    ArgoCD sync" and sets `namespace: cos`, which is production. Staging is `cos-staging`.
>
> There is **no wave 2**: `sync-wave` appears once in `infrastructure/kubernetes/`, on this Job.
> Fixing 2 is a code change; 1 and 3 are placement decisions that belong with the staging run that
> closes this runbook.

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
3. ~~Resolve the production auto-sync gap~~ — **done**: production is manual-sync, staging is
   automated (see § Sync policy).
4. Fix the smoke test's two dead endpoints, put it inside an Application path so the hook fires, and
   point it at `cos-staging`. Then confirm it actually runs.
5. Decide whether `cos-temporal-worker` needs a staging twin, and whether the two chartless services
   (`cos-iot-ingestion-worker`, `cos-ai-transcription-pipeline`) are deliberately undeployed.

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

| Layer               | Where                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------- |
| ArgoCD `AppProject` | `construction-os` (namespace `argocd`)                                                                        |
| ArgoCD Applications | **21** objects, all in namespace `argocd`: 11 production → `cos` (+ `monitoring`), 10 staging → `cos-staging` |
| Helm charts         | `infrastructure/helm/cos-*` — one per deployable                                                              |
| Manifest            | `infrastructure/kubernetes/argocd/argocd-apps.yaml`                                                           |

Production Applications (11): `cos-backend`, `cos-web`, `cos-file-service`,
`cos-credential-service`, `cos-ai-gateway`, `cos-ai-embedding-worker`, `cos-ai-ocr-pipeline`,
`cos-analytics-worker`, `cos-kg-ingestion-worker`, `cos-temporal-worker`, `cos-otel-collector`.
Each has a `-staging` twin, `cos-temporal-worker` included since 2026-08-23.

Two committed charts have **no Application at all** — `cos-iot-ingestion-worker` and
`cos-ai-transcription-pipeline`. That is intended (PO, 2026-08-23): both belong to phases that have
not landed. Nothing deploys them, so no release note should claim they ship.

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

| Set                        | Sync                                         | Values                | Destination   |
| -------------------------- | -------------------------------------------- | --------------------- | ------------- |
| 11 production Applications | **manual** — no `automated` block at all     | `values-prod.yaml`    | `cos`         |
| 10 `-staging` Applications | `automated`, `prune: true`, `selfHeal: true` | `values-staging.yaml` | `cos-staging` |

Both sets track `targetRevision: main`, which is the intended shape: staging follows `main`
continuously, and production is promoted by a human clicking Sync. That satisfies QM-16 and the
Phase 19 checklist.

> **This is asserted in CI since 2026-08-23** — `scripts/ci/check-argocd-sync-policy.mjs` fails if any
> production Application gains `syncPolicy.automated`, and also if a staging one loses it. It exists
> because this property was prose in two places and drifted in both: the warning above said production
> auto-synced long after the split fixed it, and `run-all-checks.sh` MANUAL-11 told an operator to
> inspect an Application named `cos-production` that has never existed. Both are corrected; the gate
> is what keeps them corrected.

## Cluster bootstrap — what ArgoCD does NOT deploy

**Added 2026-08-23.** Until then no Application pointed anywhere inside
`infrastructure/kubernetes/`: the Applications covered `infrastructure/helm/cos-*` and the otel
overlays only, and everything else in that tree was applied by hand. Of its 15 manifests, 3 carried a
`# Deploy:` comment and 12 carried nothing — and nothing anywhere recorded whether any had been
applied. Five of them are now Applications, because other things in the repository already depend on
them existing:

| Application           | Path                                        | Depended on by                                           |
| --------------------- | ------------------------------------------- | -------------------------------------------------------- |
| `cos-pgbouncer`       | `infrastructure/kubernetes/pgbouncer`       | QM-18; `db-failover.md` restarts it after a failover     |
| `cos-isolation-probe` | `infrastructure/monitoring/isolation-probe` | `TenantIsolationBreach` (P0); readiness AUTO-29          |
| `cos-keycloak-backup` | `infrastructure/kubernetes/keycloak`        | `keycloak-realm-recovery.md` Scenario A reads its output |
| `cos-kafka`           | `infrastructure/kubernetes/kafka`           | every domain event                                       |
| `cos-mlflow`          | `infrastructure/kubernetes/mlflow`          | Phase 23                                                 |

All five are **manual-sync**, like the rest of production, and
`scripts/ci/check-argocd-sync-policy.mjs` fails the build if one grows an `automated` block.

### Applied by hand, in this order

ArgoCD cannot sync these — several must exist before ArgoCD can sync anything at all.

1. `infrastructure/kubernetes/namespaces/` — namespaces, quotas and limit ranges everything lands in.
2. `infrastructure/kubernetes/sealed-secrets/` — the controller, then the SealedSecrets. A workload
   scheduled before it can decrypt its secret will crash-loop on a missing value.
3. `infrastructure/kubernetes/cert-manager/` — `ClusterIssuer`; needs the cert-manager CRDs first.
4. `infrastructure/kubernetes/external-secrets/` — its own namespace and ServiceAccount.
5. `infrastructure/kubernetes/autoscaler/` — `kube-system` Deployment plus cluster-scoped RBAC.
6. ArgoCD itself, then `kubectl apply -f infrastructure/kubernetes/argocd/argocd-apps.yaml -n argocd`.

Not Kubernetes manifests, and applied by their own tooling: `infrastructure/kubernetes/kong/`
(a Kong declarative config). Two small `cos`-namespace manifests are still hand-applied and each
carries its own `# Deploy:` line — `security/cloudflare-origin-protection.yaml` and
`argo-rollouts/analysis-template-error-rate.yaml`.

> **Nothing verifies that the hand-applied set was applied.** That is the residual risk this split
> narrows rather than removes: the five Applications above are now visible in `argocd app list`,
> the rest are not visible anywhere.

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
6. Post-deploy smoke tests (ArgoCD PostSync wave 1) — **staging only**, as a template of the
   cos-backend chart. See below; there is no wave 2.

> ### The PostSync smoke test — fixed 2026-08-23
>
> It had three defects and now has none:
>
> 1. **It never fired.** It lived in `infrastructure/kubernetes/argocd/`, and an ArgoCD hook only
>    runs for manifests inside the SYNCED Application's source path — no Application syncs that
>    directory. Moving it to its own Application would not have helped: the hook would then follow
>    the smoke test's own sync, not the backend's. It is now a template of the **cos-backend chart**
>    (`templates/postsync-smoke-test.yaml`), which is what a PostSync hook has to be.
> 2. **It called two endpoints that do not exist** — `/health` (the backend has `health/live` and
>    `health/ready` under the `api/v1` prefix) and `POST /api/v1/auth/login` (there is no such route;
>    Path B authenticates against Keycloak directly). The auth probe now goes to Keycloak's token
>    endpoint with a **non-privileged** smoke user: `cos-web` is a public client with the password
>    grant disabled, and `cos-backend` allows it but the realm refuses TENANT_ADMIN and FINANCE on
>    Direct Grant — and `E2E_EMAIL` is a TENANT_ADMIN.
> 3. **Its namespace was `cos`** — production — while its own comment said it ran against staging.
>    It is now gated by `smokeTest.enabled`, true only in `values-staging.yaml`, and takes its
>    namespace from the Application's destination (`cos-staging`).
>
> Staging auto-syncs on every merge to `main`, so the check runs on every change; production is
> promoted by hand afterwards, by someone who can see whether staging went green.
>
> There is still **no wave 2**: `sync-wave` appears once in the repository, on this hook. §30.12
> describes the smoke test as blocking "E2E wave 2", and that wave has never existed.
>
> It needs a `cos-smoke-test-config` Secret in `cos-staging` (`BASE_URL`, `KEYCLOAK_URL`,
> `KEYCLOAK_REALM`, `KEYCLOAK_CLIENT_ID`, `KEYCLOAK_CLIENT_SECRET`, `SMOKE_USER`, `SMOKE_PASSWORD`)
> — ops, and unverified until the staging run.

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
4. ~~Fix the smoke test~~ — **done 2026-08-23** (see above). Still to confirm in staging: that the
   hook actually fires, and that the smoke user authenticates.
5. ~~Decide whether `cos-temporal-worker` needs a staging twin~~ — **done**: `cos-temporal-worker-staging`
   added 2026-08-23. Temporal runs PO approval, enterprise provisioning and data export, which are
   the workflows least safe to meet for the first time in production.
6. `cos-iot-ingestion-worker` and `cos-ai-transcription-pipeline` have charts and no Application, and
   that is deliberate — both belong to phases that have not landed. Add Applications when they do.

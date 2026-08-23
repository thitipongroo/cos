# Rollback Runbook

**STUB** — detailed procedures to be defined before Stage 1→2 transition (production launch).

> **Why this is still a STUB.** QM-11 closes a runbook by **executing it end-to-end in staging**.
> The commands below are derived from the committed ArgoCD manifests and Prisma layout; none has been
> proven against a real production rollback.

## When to roll back

Roll back **first, investigate after**. Triggers (QM-16, QM-14):

| Signal                                            | Action                                                              |
| ------------------------------------------------- | ------------------------------------------------------------------- |
| Error rate > 1% within 10 min of deploy           | Automatic — the pipeline rolls back                                 |
| p95 read > 300 ms or p95 write > 500 ms for 5 min | Manual rollback                                                     |
| `ServiceDown` / `DBConnectionExhausted` firing    | Manual rollback                                                     |
| `TenantIsolationBreach` firing                    | **Roll back immediately** and page the security lead — this is a P0 |
| Data written incorrectly by the new version       | Roll back, then assess whether the migration also needs reverting   |

## Application rollback — ArgoCD

ArgoCD keeps deployment history, so a rollback is a revision selection, not a pipeline re-run:

```bash
argocd app history cos-backend                 # list revisions
argocd app rollback cos-backend <REVISION>     # instant
argocd app get cos-backend                     # expect Synced + Healthy
```

Applications that may need the same treatment: `cos-web`, `cos-file-service`,
`cos-credential-service`, `cos-ai-gateway`, `cos-ai-embedding-worker`, `cos-ai-ocr-pipeline`,
`cos-analytics-worker`, `cos-kg-ingestion-worker`, `cos-otel-collector`.

> **`selfHeal: true` is set on the 10 `-staging` Applications, and on none of the 11 production
> ones** — corrected 2026-08-23, this previously read "every Application". Production has no
> `syncPolicy.automated` block at all, which is what makes promotion a manual gate (QM-16).
>
> The practical difference is the opposite of what the old wording implied: in **staging** a hand-made
> `kubectl` edit is reverted within the sync interval, so roll back through ArgoCD. In **production**
> a `kubectl rollout undo` will NOT be reverted — it survives until the next manual Sync, which then
> silently restores the broken revision. Use it as emergency mitigation, then immediately fix the
> revision ArgoCD would sync, or the next Sync undoes your rollback.

Kubernetes-level equivalent, if ArgoCD itself is unavailable:

```bash
kubectl -n cos rollout undo deployment/<name>
kubectl -n cos rollout status deployment/<name>
```

## Feature flag first, if the change is flagged

A flagged change does not need a deploy rollback — kill the flag. QM-15 requires every flag to be
togglable to OFF in **under 60 seconds without a deployment** (Unleash, server-evaluated). This is the
fastest mitigation available; reach for it before `argocd app rollback`.

## Database rollback

**Application rollback does not undo a migration.** QM-9 requires every migration to be
backward-compatible — old code keeps working while the new schema is in place — so the normal path is:
**roll back the application and leave the schema alone.**

Only revert the schema when the migration itself is the fault:

```bash
# Every migration has a committed rollback script — OUTSIDE prisma/migrations/
ls backend/prisma/rollbacks/
```

Apply the matching rollback script, then remove the row from `_prisma_migrations` so a later
`migrate deploy` does not consider it applied. Do this with a DBA present; take a snapshot first.

## Verify the rollback

```bash
kubectl -n cos get pods
curl -fsS https://<ingress>/api/v1/health/ready
argocd app list --output=wide
```

Confirm the alerts that triggered the rollback have cleared, and that Kafka consumer lag and the DLQ
(`{tenant_id}.dlq`) are not growing.

## After

P0/P1 requires a blameless post-mortem within 5 business days
([`postmortem-template.md`](postmortem-template.md)) and tenant communication within 30 minutes of
declaration (QM-17).

## To close this STUB

1. Perform a real rollback in staging and record revision numbers and timings.
2. Prove the automatic error-rate rollback fires. The gate now exists as
   `infrastructure/kubernetes/argo-rollouts/analysis-template-error-rate.yaml`, but **the Argo
   Rollouts controller is not installed and the workloads are still `Deployment`s, so nothing
   evaluates it yet** — see
   [`argo-rollouts/README.md`](../../infrastructure/kubernetes/argo-rollouts/README.md) for the
   activation steps. Until then, automatic rollback does not happen: watch the deploy yourself.
3. Rehearse one migration rollback from `prisma/rollbacks/` end to end.

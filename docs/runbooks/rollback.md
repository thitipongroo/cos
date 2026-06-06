# Rollback Runbook

**STUB** — detailed procedures to be defined before Stage 1→2 transition (production launch).

## Scope

Service rollback for Construction OS deployments that introduce regressions in production.

## Rollback Triggers

- p95 API latency exceeds SLO (read > 300ms, write > 500ms) sustained for 5 minutes
- Error rate (5xx) exceeds 1% for 2 consecutive minutes
- Critical Temporal workflow failure rate > 0.1%
- Data integrity issue detected in production

## Rollback Steps

1. Identify the previous stable image tag from ECR or `git log`
2. Update Helm chart `image.tag` to the previous stable version
3. Apply: Argo CD sync or `helm upgrade` with previous values
4. Rolling update restores previous image (zero-downtime)
5. Verify health checks pass and Grafana metrics return to baseline
6. File incident report — see [incident-response.md](incident-response.md)

## Database Migration Rollback

If the deployment included a database migration that must be reversed:

1. Temporal workflow `MigrationRollbackWorkflow` — run only if a down-migration script exists
2. Never run a destructive migration rollback without written SYSTEM_ADMIN approval
3. If data was written under the new schema, manual data reconciliation may be required

## Post-rollback

- Root-cause analysis required within 24 hours
- Regression test must be added before re-deploying the failing change

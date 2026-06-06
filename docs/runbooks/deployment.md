# Deployment Runbook

**STUB** — detailed procedures to be defined before Stage 1→2 transition (production launch).

## Scope

Service deployment and rolling rollout for the Construction OS monolith and supporting services.

## Pre-deployment Checklist

- [ ] CI pipeline passing (all test gates green)
- [ ] Database migrations reviewed and tested in staging
- [ ] Feature flags configured for new features (if applicable)
- [ ] Rollback plan confirmed (see [rollback.md](rollback.md))
- [ ] On-call engineer notified

## Deployment Steps

1. Merge to `main` triggers GitHub Actions CI/CD pipeline
2. Pipeline runs: lint → unit tests → integration tests → build Docker image → push to ECR
3. Argo CD / Helm chart updated with new image tag
4. Rolling update deployed to EKS (zero-downtime — `maxUnavailable: 0`)
5. Health checks pass on new pods before old pods terminate
6. Smoke tests run against production endpoint

## Post-deployment Verification

- Check Grafana dashboard for error rate spike (p95 latency, 5xx rate)
- Verify Kafka consumer lag is recovering
- Confirm Temporal workflows are processing normally

## Rollback Trigger

If p95 latency > 500ms (write) or > 300ms (read) sustained for 5 minutes, or error rate > 1%,
initiate rollback immediately — see [rollback.md](rollback.md).

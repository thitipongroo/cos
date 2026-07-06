# scripts/deploy — Deployment helper scripts

## Purpose

Operational helper scripts used during and after a deployment. These are thin
wrappers around Helm / `kubectl` and HTTP probes — they contain no application
business logic. Day-to-day application deployment is driven by ArgoCD
(GitOps); the scripts here cover manual operator actions (rollback) and the
post-deploy verification that ArgoCD mirrors as a PostSync hook (smoke test).

## Scripts

- `rollback.sh` — Roll a Helm release back to its previous (or a specific) revision.
- `smoke-test.sh` — Post-deploy smoke check: health + auth + one core read, must pass in < 30s.

## Usage

```bash
# Roll cos-backend back to the previous Helm revision
./scripts/deploy/rollback.sh cos-backend

# Roll cos-backend back to a specific revision
./scripts/deploy/rollback.sh cos-backend 3

# Run the smoke test against a target environment
BASE_URL=https://staging.example \
E2E_EMAIL=... E2E_PASSWORD=... \
  ./scripts/deploy/smoke-test.sh
```

## Configuration

- `NAMESPACE` (`rollback.sh`) — Kubernetes namespace of the release (default: `cos`).
- `BASE_URL` (`smoke-test.sh`) — Base URL of the target environment (required).
- `E2E_EMAIL` (`smoke-test.sh`) — Login email for the auth probe (required).
- `E2E_PASSWORD` (`smoke-test.sh`) — Login password for the auth probe (required).

## Dependencies

- `helm`, `kubectl` — cluster access to the target namespace (`rollback.sh`)
- `curl` — reachable target endpoint (`smoke-test.sh`)

## Related

- `infrastructure/kubernetes/argocd/postsync-smoke-test.yaml` — ArgoCD PostSync
  hook (wave 1) that mirrors `smoke-test.sh` inline and blocks E2E wave 2 on failure.
- `docs/runbooks/rollback.md` — the rollback runbook.
- `docs/runbooks/production-readiness.md` — cites `./scripts/deploy/rollback.sh`
  in the rollback readiness check.

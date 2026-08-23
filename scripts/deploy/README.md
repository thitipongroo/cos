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

# Run the smoke test against a target environment.
# SMOKE_USER must be NON-PRIVILEGED — the realm denies TENANT_ADMIN and FINANCE on Direct Grant.
BASE_URL=https://staging.example \
KEYCLOAK_URL=https://keycloak.example KEYCLOAK_REALM=construction-os \
KEYCLOAK_CLIENT_SECRET=... \
SMOKE_USER=... SMOKE_PASSWORD=... \
  ./scripts/deploy/smoke-test.sh
```

## Configuration

- `NAMESPACE` (`rollback.sh`) — Kubernetes namespace of the release (default: `cos`).
- `BASE_URL` (`smoke-test.sh`) — Base URL of the target environment (required).
- `KEYCLOAK_URL`, `KEYCLOAK_REALM`, `KEYCLOAK_CLIENT_SECRET` (`smoke-test.sh`) — required.
  `KEYCLOAK_CLIENT_ID` defaults to `cos-backend`, the only client with the password grant enabled.
- `SMOKE_USER`, `SMOKE_PASSWORD` (`smoke-test.sh`) — required, and the account **must not be
  `TENANT_ADMIN` or `FINANCE`**: those are Path B only and the realm refuses them on Direct Grant
  (measured against Keycloak 26.6.4). Keep it non-privileged for a second reason too — this
  credential sits in a Secret a PostSync hook reads on every deploy.

> **Corrected 2026-08-23.** This section said `E2E_EMAIL` / `E2E_PASSWORD`, matching a smoke test that
> POSTed `/api/v1/auth/login`. That endpoint has never existed, and `E2E_EMAIL` is a TENANT_ADMIN that
> Keycloak would refuse anyway. The auth probe now goes to Keycloak's token endpoint.

## Dependencies

- `helm`, `kubectl` — cluster access to the target namespace (`rollback.sh`)
- `curl` — reachable target endpoint (`smoke-test.sh`)

## Related

- `infrastructure/kubernetes/argocd/postsync-smoke-test.yaml` — the Job that mirrors this script
  inline. **It does not currently run**: an ArgoCD hook only fires for manifests inside the synced
  Application's path, and no Application syncs `infrastructure/kubernetes/argocd/`. There is also no
  wave 2 — `sync-wave` appears once in the whole tree. See `docs/runbooks/deployment.md` § ⚠️.
- `docs/runbooks/rollback.md` — the rollback runbook.
- `docs/runbooks/production-readiness.md` — cites `./scripts/deploy/rollback.sh`
  in the rollback readiness check.

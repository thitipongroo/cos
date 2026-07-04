# ADR-048: Staging branch as the E2E gate before production

**Date:** 2026-07-04
**Status:** Accepted
**Deciders:** Product owner
**Tags:** infra

---

## Context

The 2026-07-04 project audit found that the CI `e2e-tests` job was gated on
`refs/heads/staging` while no `staging` branch existed (only `develop` and `main`), so the
Playwright E2E gate had never executed. Spec §30 at the time said "E2E tests run on merge to
`main`", which conflicted with the workflow condition. The product owner was asked to resolve
the branch model.

## Decision

Product-owner decision (2026-07-04): **introduce a long-lived `staging` branch and run E2E on
merge to `staging`.**

Branch flow:

```text
feature/* → develop (integration; every-PR gates)
          → staging (deploys to the staging environment via update-gitops → ArgoCD auto-sync;
                     Playwright E2E runs post-deploy and gates production promotion)
          → main    (production; manual ArgoCD promotion gate)
```

- `build-docker`, Trivy image scan, `push-ecr`, `update-gitops` run on `main`/`staging` pushes
  (unchanged — the conditions already included `staging`).
- `e2e-tests` runs on `staging` only; its result gates the `staging → main` merge.
- Every-PR gates (lint, type-check, build, unit/integration/isolation/contract tests,
  dependency audit, secret scan) are branch-independent and unchanged.

## Rationale

- E2E needs a deployed environment; running it on the branch that deploys to staging ties the
  gate to the artifact it validates.
- Keeping `main` = production-promotion only gives a manual, auditable release point
  (matches the ArgoCD "auto-sync staging / manual gate production" model in the master doc).
- Alternative considered — E2E on merge to `main` (the previous spec wording): rejected by
  product owner because a failed E2E would then be discovered after the production-intent
  merge, not before it.

## Consequences

### Positive

- The E2E and Trivy/deploy gates actually execute; a red E2E blocks production promotion.
- Clear, documented promotion path with one manual gate.

### Negative

- One more long-lived branch to keep in sync (`develop → staging` merges must be routine).
- `staging` pushes consume deploy-pipeline minutes; requires `STAGING_URL`, `E2E_EMAIL`,
  `E2E_PASSWORD`, and ECR/GitOps secrets to be configured before the first merge.

## Updated artifacts

- `docs/specifications/30-testing-strategy.md` §30.5 Environment + §30.12 gate table
- `context/00_master_construction_os.md` Phase 18 (Playwright/Detox trigger lines)
- `.github/workflows/ci.yml` `e2e-tests.if`
- `staging` branch created from `develop`

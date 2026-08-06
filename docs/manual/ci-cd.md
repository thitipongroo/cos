---
title: Construction OS — CI/CD Pipeline
last_updated: 2026-08-07
---

# CI/CD Pipeline

**GitHub Actions runs CI only. ArgoCD runs CD.** There is no `kubectl apply` or `helm upgrade`
anywhere in `.github/workflows/` — a Phase 19 readiness check greps for exactly that and expects zero
hits (ADR-012).

## Workflows — `.github/workflows/`

| File                   | Runs                                                                 |
| ---------------------- | ---------------------------------------------------------------------- |
| `ci.yml`               | The main pipeline (jobs below)                                       |
| `codeql.yml`           | CodeQL semantic/taint SAST over JS-TS, Python, Go                    |
| `semgrep.yml`          | Semgrep CE — project policy rules (blocking) + registry rulesets     |
| `dast.yml`             | OWASP ZAP against staging                                            |
| `lighthouse.yml`       | Frontend gate — Core Web Vitals, bundle budget, accessibility = 1.0  |
| `load-tests.yml`       | k6 — **weekly on staging**, advisory, never a per-PR gate            |
| `mutation-tests.yml`   | Stryker / mutmut — financial, approval and permission logic (≥ 70%)  |

## `ci.yml` jobs

`lint` · `mlops-tests` · `type-check` · `build` · `unit-tests` · `mobile-tests` · `go-tests` ·
`python-tests` · `integration-tests` · `isolation-tests` · `contract-tests` · `build-docker` ·
`dependency-audit` · `secret-scan` · `security-scan` · `push-ecr` · `update-gitops` · `e2e-tests`

The ones that most often block a merge:

- **`build`** — `turbo run build` on **every** PR. `tsc --noEmit` is *not* a build: only this gate
  catches `nest build` / `next build` emit failures, including the Next.js
  `missing-suspense-with-csr-bailout` error (ADR-033).
- **`unit-tests`** — 100% lines **and** 100% branches (QM-1). Temporal `*.workflow.spec.ts` run as a
  **separate serial step** (`pnpm test:workflows`, `maxWorkers:1`) because parallel
  `TestWorkflowEnvironment` time-skipping servers starve each other.
- **`isolation-tests`** — a cross-tenant query must return zero rows. This is the RLS gate.
- **`lint`** — ESLint + Prettier, plus `ruff` (Python), `yamllint`, `sqlfluff`, `jscpd` (duplication
  ratchet at 1.3% against a 1.12% baseline) and **markdownlint on changed Markdown only**.

### markdownlint gates the docs you touch

A repo-wide Markdown gate is not feasible (~101k pre-existing violations), so the job lints only
files changed in the push/PR, excluding `context.md`, `context/**`, `docs/specifications/**` and
`mockup/**`. **Everything else must be clean**, and markdownlint lints the *whole* changed file — so
touching one line of a messy non-excluded doc means tidying that doc. Run it before pushing:

```bash
pnpm exec markdownlint-cli2 <the files you changed>
```

## Deployment

Rolling update by default, max surge 1, **max unavailable 0** (zero-downtime). Blue-green for major
releases, auth changes, and any migration that cannot be made backward-compatible in one step. Canary
(Argo Rollouts) for API endpoint changes, new background job types and AI model upgrades — minimum 30
minutes at 5% traffic.

**Automated rollback**: error rate above 1% within 10 minutes of a deploy rolls back automatically.

ArgoCD auto-syncs staging; production requires a **manual sync gate** in the ArgoCD UI, inside an
approved window from
[`runbooks/deployment-windows.md`](../runbooks/deployment-windows.md). ArgoCD self-heals — a manual
`kubectl` change is reverted within the sync interval (~3 min).

## Non-negotiables before a user-facing change ships

- **Feature flag** (QM-15, Unleash, server-evaluated). Mandatory for any new UI screen or workflow
  step, any new AI/LLM endpoint, any migration that modifies existing data, any change to
  authn/authz, and any Kafka schema change. Rollout 1% → 10% → 50% → 100%, ≥ 24 h per step. Every
  flag must be killable to OFF in under 60 seconds without a deployment.
- **Backward-compatible migration** (QM-9): add columns nullable first; never rename or retype a
  column in one migration; never drop a column any deployed code uses. Commit the rollback script to
  `prisma/rollbacks/` — **not** inside `prisma/migrations/`, where `prisma migrate deploy` would
  treat it as a migration and fail `P3015`. Name migrations `<timestamp>_<action>_<subject>` and
  **never** prefix with `phaseN_`.
- **Lockfile**: any `package.json` change means `pnpm install` and a committed `pnpm-lock.yaml` in
  the same PR — CI runs `--frozen-lockfile` (Rule 28). A new script means a matching `turbo.json`
  task (Rule 27).

## Local pre-flight

```bash
make ci-check    # lint + type-check + build + tests, the same gates CI runs
```

Two checks that are **not** CI gates but catch review comments early:

```bash
pnpm exec markdownlint-cli2 <changed .md>          # this one IS a gate — see above
pnpm exec mmdc -i <file.md> -o /tmp/check.md       # renders every ```mermaid block; fails on bad syntax
```

`mmdc` (`@mermaid-js/mermaid-cli`) is deliberately a local authoring tool only — it pulls puppeteer's
Chromium, which would cost every CI run for a check that only matters when a diagram changes.

> 📎 `context/00_master_construction_os.md` § Phase 17 (CI/CD + deployment) and § Phase 18 (testing) ·
> [`specifications/30-testing-strategy.md`](../specifications/30-testing-strategy.md) §30.9/§30.12 ·
> QM-15 / QM-16 in [`context.md`](../../context.md) · [Runbooks](../runbooks/README.md).

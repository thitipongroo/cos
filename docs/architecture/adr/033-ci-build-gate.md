# ADR-033: CI Build Gate — `turbo run build` on Every PR

**Date:** 2026-06-26
**Status:** Accepted
**Deciders:** Product Owner / Engineering Lead
**Tags:** infra

---

## Context

Phase 1 verification found a gap in the CI pipeline (`.github/workflows/ci.yml`):

- The `type-check` job runs `pnpm run type-check` → `turbo run type-check`, which resolves
  to `tsc --noEmit` per package. This is a **type checker, not a build** — it does not emit
  artifacts and does not exercise the real build toolchain (`nest build`, `next build`,
  `tsc --project tsconfig.build.json`, declaration emit, the `copy:avro` step in
  `@cos/shared`).
- The `build-docker` job _does_ compile via each service's Dockerfile, but it is gated
  `if: github.ref == 'refs/heads/main' || 'refs/heads/staging'` — so it **never runs on a
  pull request**.
- `unit-tests` runs `turbo run test:cov`; the `test` task only `dependsOn: ["^build"]`
  (dependencies build, not the package's own build), and `test:unit` declares no build
  dependency at all. Leaf-package builds and the `nest build` / `next build` outputs are
  therefore not exercised on a PR.

Net effect: **a pull request can pass all CI gates while `turbo run build` is broken**, and
the failure only surfaces after merge to `main` (in `build-docker`). This violates the
intent recorded in `context/00_master_construction_os.md` ("CI pipeline: lint → build →
test → docker build") and `04-tech-stack.md` §4.9 ("PR opened → … Docker build").

Vercel/Turborepo best practice is to define `build` and `typecheck` as **separate tasks**
and run both as parallelizable CI gates; `tsc --noEmit` is explicitly not a substitute for
a build.

## Decision

**Add a dedicated `build` job to the CI workflow that runs `pnpm run build`
(`turbo run build`) on every pull request and on pushes to `main`/`staging`.**

- The job installs with `--frozen-lockfile`, generates the Prisma client (required before
  the backend build), then runs `turbo run build`.
- It uses Turborepo caching (and GitHub Actions remote cache, `type=gha`) so repeat runs
  restore artifacts instead of rebuilding — same cache mechanism `build-docker` already uses.
- The `build` job is added to the `needs:` list of `build-docker` so image builds only start
  after the source build is green.
- The build gate is recorded in `docs/specifications/30-testing-strategy.md` §30.12 as a
  PR-blocking gate.

This complements, and does not replace, `type-check`: type-check stays as the fast
type-only gate; `build` verifies the emit/bundle toolchain.

## Rationale

- **Catches a class of errors type-check cannot:** emit-only failures, declaration-emit
  errors, `tsconfig.build.json` path/output misconfig, `nest build` / `next build`
  failures, and the `@cos/shared` `copy:avro` post-build step.
- **Shifts failure left:** broken builds fail on the PR, not after merge.
- **Cheap with caching:** Turborepo + `type=gha` remote cache make a no-change build
  restore in seconds; only changed packages rebuild.
- **Matches existing tooling:** `build` task, per-package `build` scripts, and `outputs`
  (`dist/**`, `.next/**`) already exist in `turbo.json` — only the CI job was missing.
- **Alternatives rejected:**
  - _Rely on `build-docker` for build validation_ — rejected: gated to `main`/`staging`,
    so it does not protect PRs.
  - _Run `build-docker` on PRs instead_ — rejected: building all service images on every PR
    is far slower and heavier than `turbo run build`; image build belongs at merge time.
  - _Treat `type-check` as sufficient_ — rejected: `tsc --noEmit` is not a build (see Context).

## Consequences

### Positive

- PRs cannot merge with a broken `turbo run build`.
- Build is parallelizable and cached; minimal added wall-clock on cache hits.
- Spec, master, and context now match the real pipeline.

### Negative

- Adds one CI job (added minutes on cold cache; seconds on warm cache).
- Prisma client generation must run before build in the job (already true for type-check).

### Neutral

- No change to application code or to `turbo.json` (the `build` task already exists).
- Mobile (`apps/mobile`) is excluded from the workspace and is not part of `turbo run build`;
  its build is validated separately (Expo/EAS), unchanged by this ADR.

## References

- `.github/workflows/ci.yml` (`build`, `type-check`, `build-docker` jobs)
- `docs/specifications/30-testing-strategy.md` §30.12 (CI/CD Test Gates)
- `docs/specifications/04-tech-stack.md` §4.9 (CI/CD pipeline)
- `turbo.json` (`build` task: inputs `src/**`, outputs `dist/**`, `.next/**`)
- Vercel Turborepo best practices — separate `build` and `typecheck` tasks

---
title: Construction OS — Per-release Deployment Runbooks
last_updated: 2026-08-07
---

# Per-release Deployment Runbooks

**QM-11:** _"Deployment runbook required for every major release in `docs/runbooks/releases/`."_

This directory holds one file per major release. It is referenced from `context.md` § FILE REFERENCE
MAP; the directory itself was missing until 2026-08-07, so that reference resolved to nothing.

**There are no release runbooks yet** — the platform has not shipped a major release. The first one
is written here, not invented from this page.

## Naming

`vMAJOR.MINOR.PATCH.md` — e.g. `v1.0.0.md`. One file per major release; patch releases that carry a
migration or a flag change get their own file too.

## What a release runbook must contain

A release runbook is the _specific_ plan for _this_ release. It does not restate the generic
procedure — that is [`../deployment.md`](../deployment.md) — it records what is different this time.

- **Scope** — what ships: PRs/commits, feature flags being turned on, migrations included.
- **Migrations** — every migration in the release, its backward-compatibility argument (QM-9), and
  the committed rollback script in `prisma/rollbacks/`.
- **Deployment strategy** — rolling (default), or blue-green / canary where QM-16 requires it:
  blue-green for major versions, auth changes, and any migration that cannot be made
  backward-compatible in one step; canary for API endpoint changes, new background job types, and AI
  model upgrades (≥ 30 min at 5% traffic).
- **Feature flags** — which flags gate this release, their rollout schedule (1% → 10% → 50% → 100%,
  ≥ 24 h per step), and confirmation each is killable to OFF in < 60 s.
- **Deployment window** — the approved window from [`../deployment-windows.md`](../deployment-windows.md).
- **Verification** — the specific dashboards, SLOs and queries that prove _this_ release is healthy,
  beyond the generic post-deploy checks.
- **Rollback** — the trigger conditions and the exact steps for this release, including whether a
  migration rollback is needed. Generic procedure: [`../rollback.md`](../rollback.md).
- **Sign-off** — who approved the production sync gate in ArgoCD, and when.

## Related

| Document                                                   | Role                                   |
| ---------------------------------------------------------- | -------------------------------------- |
| [`../deployment.md`](../deployment.md)                     | The generic deployment procedure       |
| [`../rollback.md`](../rollback.md)                         | The generic rollback procedure         |
| [`../deployment-windows.md`](../deployment-windows.md)     | Approved production windows            |
| [`../production-readiness.md`](../production-readiness.md) | The readiness checklist gating go-live |
| `CHANGELOG.md` (repo root)                                 | `BREAKING CHANGE:` entries — QM-11     |

---
name: devops-ci-cd
description: Design and maintain the pipeline that builds, tests and delivers every change - stages, gates, caching and speed. Use when setting up CI, or when a pipeline is slow, flaky, or being routinely bypassed.
allowed-tools:
  - "Read"
  - "Glob"
  - "Grep"
  - "Write"
  - "Edit"
  - "Bash"
---

# CI/CD

The pipeline is the only thing standing between a mistake and production. It has
to be fast enough that nobody wants to go around it.

## Stage order

Cheapest and most likely to fail, first: lint and typecheck, then unit tests,
then build, then integration, then anything requiring an environment. A pipeline
that runs a twenty-minute integration suite before a lint failure wastes twenty
minutes on every typo.

## Rules

- **The pipeline is the source of truth.** If it passes locally and fails in CI,
  the pipeline is right and the local environment is lying
- **Reproducible builds** - pinned versions, committed lockfile, no network
  dependency that can change under you
- **No secret in a log, ever.** Mask them at the runner, and check the output of
  a failing job, which is where they surface
- **Fail fast, report clearly.** A red build must say which stage, which test,
  and which line - not "job failed"
- **Never make the pipeline green by disabling the check.** That converts a known
  problem into an unknown one

## Speed

Cache dependencies, parallelise independent stages, and measure the total time
every week. When it crosses the threshold where people start pushing without
waiting, it has stopped being a gate.

## Deployment

Keep build and deploy separate: build an artefact once, promote the same artefact
through environments. Rebuilding per environment means you never shipped what you
tested.

---
description: Dispatch pipeline, deployment, infrastructure, monitoring, logging and operational security work to devops-agent
argument-hint: [the pipeline, environment, service or configuration to change]
allowed-tools:
  - Read
  - Glob
  - Grep
  - Bash
  - Agent
---

# DevOps

Target: `$ARGUMENTS`

Route this to `devops-agent`. This is the area where habit breaks a mandate
fastest, because the commands are familiar and the constraints are not in the
files being edited.

## The constraints that decide the answer here

Name the ones that apply in the prompt, so the agent works from them rather than
from convention:

- **QM-16** deployment strategy · **QM-12** recovery targets
- **QM-4** where secrets live · **QM-18** PgBouncer in transaction mode is mandatory
- **ADR-012** CI does not deploy — Phase 19 greps the workflows expecting zero
  `kubectl apply` hits
- **Rule 28** a dependency change without its lockfile fails CI on `--frozen-lockfile`

## Dispatch

Use the Agent tool:

- subagent_type: `devops-agent`
- prompt: the change, the environment it lands in, the mandates above that bind
  it, and how the result will be proved

If the change touches production behaviour and is more than a single edit, run
`/plan-gate` first. Rule 38 does not exempt infrastructure.

## On the way back

Prefer the reversible action, and say what the rollback is before the change
lands, not after. Before any push, run `bash scripts/ci/verify-before-push.sh`
and report what it printed — including the jobs it says it did not cover.

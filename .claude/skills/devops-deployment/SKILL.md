---
name: devops-deployment
description: Get a built artefact into an environment safely - strategy, health checks, rollback and verification. Use when shipping to production, or when a deployment process has caused an outage.
allowed-tools:
  - "Read"
  - "Glob"
  - "Grep"
  - "Write"
  - "Edit"
  - "Bash"
---

# Deployment

Two things matter: users do not notice, and you can undo it quickly.

## Before

- **Deploy the artefact you tested**, byte for byte. A rebuild is a different
  artefact
- **Know the rollback** and how long it takes. If the answer is unknown, do not
  deploy
- **Check the migration is backward compatible.** The old code runs during the
  rollout, against the new schema
- **Announce it** if anyone is on call

## Strategy by risk

| Strategy | When |
|---|---|
| Rolling | routine change, backward-compatible |
| Blue-green | needs instant rollback, or a schema change that cannot be made compatible in one step |
| Canary | behaviour change where the blast radius is unknown |

## During

Watch error rate, latency and saturation - not the deployment tool's progress
bar. The tool reports that pods started, which is not the same as the system
working.

## After

Verify with a real request through the real path, not a health endpoint that only
proves the process is running. Watch for the duration it takes the slowest cache
or queue to turn over before calling it done.

## Rules

- **Never deploy without a way back**, including for the database
- **Roll back first, diagnose second.** Debugging in front of users costs more
  than a revert
- **One change per deployment** where possible. Two changes and an incident means
  you do not know which one to revert

## This project decides it

The method above is general. Where this repository has already fixed a number, a tool or a procedure, that decision wins
— read it before applying anything here.

- `context.md` QM-16 — Deployment Safety
- QM-9 — Backward Compatibility
- QM-12 — Disaster Recovery

QM-16 decides the strategy: rolling by default, blue-green for auth changes and migrations that cannot be made
backward-compatible in one step, canary for endpoint changes. It also records that the Argo Rollouts controller is not
installed yet, so the automated health gate does not evaluate anything. QM-9 governs the migration half.

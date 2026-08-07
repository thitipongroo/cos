---
title: Construction OS — Operational Runbooks
last_updated: 2026-08-07
---

# Construction OS — Operational Runbooks

Step-by-step operational procedures. On-call starts here.

> **Five of these are still marked `**STUB** — detailed procedures to be defined before Stage 1→2
transition`**: `deployment.md`, `rollback.md`, `incident-response.md`, `db-failover.md`,
> `keycloak-realm-recovery.md`, plus `disaster-recovery/README.md`. They are flagged in the tables
> below. Do not page someone into a stub expecting a procedure. QM-11 requires every runbook to be
> **executed end-to-end in staging within 30 days before its Stage transition** — a stub cannot pass
> that gate.

## Incident response

| Runbook                                          | Covers                                                                     | State |
| ------------------------------------------------ | -------------------------------------------------------------------------- | ----- |
| [incident-response.md](incident-response.md)     | Incident Response Runbook — declare, assign IC, mitigate, comms            | STUB  |
| [on-call-rotation.md](on-call-rotation.md)       | On-Call Rotation Runbook — schedule and escalation path                    | —     |
| [postmortem-template.md](postmortem-template.md) | Blameless Post-Mortem Template — required within 5 business days for P0/P1 | —     |

Severity definitions and response times (P0 15 min · P1 30 min · P2 2 h · P3 next business day) are
in QM-17, not repeated here.

## Deploy and rollback

| Runbook                                                  | Covers                                                                         | State |
| -------------------------------------------------------- | ------------------------------------------------------------------------------ | ----- |
| [deployment.md](deployment.md)                           | Deployment Runbook                                                             | STUB  |
| [rollback.md](rollback.md)                               | Rollback Runbook                                                               | STUB  |
| [deployment-windows.md](deployment-windows.md)           | Construction OS — Production Deployment Windows (approved low-traffic windows) | —     |
| [production-readiness.md](production-readiness.md)       | Production Readiness Checklist                                                 | —     |
| [dependency-upgrade-plan.md](dependency-upgrade-plan.md) | Dependency Upgrade Plan — Risk-Ordered                                         | —     |

## Infrastructure recovery

| Runbook                                                      | Covers                                                 | State |
| ------------------------------------------------------------ | ------------------------------------------------------ | ----- |
| [db-failover.md](db-failover.md)                             | DB Failover Runbook (PostgreSQL RDS Multi-AZ)          | STUB  |
| [kafka-partition-rebalance.md](kafka-partition-rebalance.md) | Kafka Consumer Lag and Partition Rebalance Runbook     | —     |
| [temporal-worker-restart.md](temporal-worker-restart.md)     | Temporal Worker Restart and Stuck Workflow Recovery    | —     |
| [keycloak-realm-backup.md](keycloak-realm-backup.md)         | Keycloak Realm Daily Backup Runbook                    | —     |
| [keycloak-realm-recovery.md](keycloak-realm-recovery.md)     | Keycloak Realm Recovery Runbook                        | STUB  |
| [dedicated-db-provisioning.md](dedicated-db-provisioning.md) | Dedicated DB Provisioning Runbook (ENTERPRISE tenants) | —     |

## Disaster recovery — [`disaster-recovery/`](disaster-recovery/)

The primary procedure is [disaster-recovery.md](disaster-recovery.md) (Disaster Recovery Runbook);
per-scenario procedures live in the subdirectory.

| File                                                                                   | Covers                                                       | State |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ----- |
| [disaster-recovery.md](disaster-recovery.md)                                           | Disaster Recovery Runbook — the primary DR procedure         | —     |
| [disaster-recovery/README.md](disaster-recovery/README.md)                             | Disaster Recovery Runbooks — scope index                     | STUB  |
| [disaster-recovery/region-failure.md](disaster-recovery/region-failure.md)             | DR Runbook: Complete Region Failure (primary ap-southeast-7) | —     |
| [disaster-recovery/kafka-broker-failure.md](disaster-recovery/kafka-broker-failure.md) | DR Runbook: Kafka Broker Failure                             | —     |
| [disaster-recovery/kms-key-compromise.md](disaster-recovery/kms-key-compromise.md)     | DR Runbook: KMS Key Compromise                               | —     |
| [disaster-recovery/drill-log.md](disaster-recovery/drill-log.md)                       | Disaster Recovery Drill Log — results and RTO measurements   | —     |

RTO/RPO targets per environment are in QM-12 (production RTO 30 min, RPO 15 min). QM-12 also requires
a **DR drill before every Stage transition**, recorded in the drill log above.

## Security and compliance

| Runbook                                          | Covers                                                   | State |
| ------------------------------------------------ | -------------------------------------------------------- | ----- |
| [mfa-enforcement.md](mfa-enforcement.md)         | MFA Enforcement for TENANT_ADMIN / FINANCE (spec §5.4.1) | —     |
| [mobile-cert-pinning.md](mobile-cert-pinning.md) | Mobile Certificate Pinning (security review L18)         | —     |

## AI

| Runbook                                                | Covers                          | State |
| ------------------------------------------------------ | ------------------------------- | ----- |
| [ai-readiness-checklist.md](ai-readiness-checklist.md) | AI Feature Activation Checklist | —     |

## Per-release runbooks — [`releases/`](releases/)

QM-11 requires a deployment runbook for every major release in `docs/runbooks/releases/`. The
directory exists with its [conventions](releases/README.md); **no release runbook has been written
yet**, because no major release has shipped.

> 📎 QM-11 (documentation), QM-12 (disaster recovery), QM-16 (deployment safety) and QM-17 (incident
> management) in [`context.md`](../../context.md) define what these runbooks must satisfy.

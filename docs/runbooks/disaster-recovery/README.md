# Disaster Recovery Runbooks

This directory contains step-by-step disaster recovery procedures for Construction OS.

**STUB** — detailed procedures to be defined before Stage 1→2 transition (production launch).

## Scope

| Scenario | File |
| --- | --- |
| Full platform recovery (region failure) | `platform-region-failover.md` (TBD) |
| RDS instance recovery | See [../db-failover.md](../db-failover.md) |
| Keycloak realm recovery | See [../keycloak-realm-recovery.md](../keycloak-realm-recovery.md) |
| Data backup restore | `backup-restore.md` (TBD) |

## Recovery Time Objectives

| Tier | RTO | RPO |
| --- | --- | --- |
| SMB / Mid-market | 4 hours | 1 hour |
| Enterprise | 1 hour | 15 minutes |

See `31-monitoring-observability` §31.6 for SLO targets and `05-security-compliance` §5.3 for
compliance requirements governing backup and recovery.

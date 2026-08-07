# Disaster Recovery Runbooks

Per-scenario disaster recovery procedures. The primary procedure is
[`../disaster-recovery.md`](../disaster-recovery.md); this directory holds the scenario detail.

**STUB** — detailed procedures to be defined before Stage 1→2 transition (production launch).

> **Why this is still a STUB.** QM-12 requires a **DR drill before every Stage transition**, recorded
> in [`drill-log.md`](drill-log.md), and QM-11 requires every runbook to be executed end-to-end in
> staging within 30 days of that transition. Neither has happened. The scenarios below are written;
> none is rehearsed.

## Scenarios

QM-12 names four DR runbooks that must exist: database failure, Kafka broker failure, complete region
failure, and KMS key compromise.

| Scenario                | File                                                             | State |
| ----------------------- | ---------------------------------------------------------------- | ----- |
| Complete region failure | [region-failure.md](region-failure.md)                           | ✅    |
| Kafka broker failure    | [kafka-broker-failure.md](kafka-broker-failure.md)               | ✅    |
| KMS key compromise      | [kms-key-compromise.md](kms-key-compromise.md)                   | ✅    |
| Database failure        | [`../db-failover.md`](../db-failover.md) — RDS Multi-AZ failover | STUB  |
| Keycloak realm recovery | [`../keycloak-realm-recovery.md`](../keycloak-realm-recovery.md) | STUB  |
| Drill results           | [drill-log.md](drill-log.md)                                     | —     |

> **Corrected 2026-08-07.** This table previously listed `platform-region-failover.md (TBD)` and
> `backup-restore.md (TBD)` — neither name exists — while omitting the three scenario runbooks that
> do. A reader following it found nothing and concluded DR was unwritten.

## Recovery objectives

Two sets of numbers apply and both must be met. They measure different things, so they do not
conflict.

**Internal recovery target, per environment — QM-12.** What the platform team engineers for, and what
a drill is signed off against:

| Target | Staging  | Production     |
| ------ | -------- | -------------- |
| RTO    | 4 hours  | **30 minutes** |
| RPO    | 24 hours | **15 minutes** |

**Contractual SLA, per customer tier —
[`08-enterprise-deployment.md` §8.2](../../specifications/08-enterprise-deployment.md).** What a
customer is owed:

| Tier                     | RTO     | RPO      |
| ------------------------ | ------- | -------- |
| Shared SaaS — SMB        | 4 hours | 24 hours |
| Shared SaaS — Mid-market | 2 hours | 4 hours  |
| Dedicated Tenant         | 1 hour  | 1 hour   |
| Enterprise / On-premise  | 1 hour  | 1 hour   |

The internal target is deliberately stricter than the tightest contractual tier.

> **Corrected 2026-08-07.** This page carried a single table labelled by tier reading "SMB /
> Mid-market 4 h / 1 h" and "Enterprise 1 h / 15 min". Neither row matched §8.2 (Mid-market RTO is
> 2 h, SMB RPO is 24 h, Enterprise RPO is 1 h) and it silently omitted the internal QM-12 targets, so
> a drill run against this page would have been measured against numbers from neither source.

## What is derived and what is not

Recovery order matters because some stores rebuild themselves and some do not:

| Store      | Recovery                                                                               |
| ---------- | -------------------------------------------------------------------------------------- |
| PostgreSQL | **Authoritative.** PITR from continuous WAL archiving; nothing rebuilds it             |
| Keycloak   | **Authoritative** for identity. Realm export restore — see the recovery runbook        |
| MinIO / S3 | **Authoritative** for file content                                                     |
| Kafka      | Replay from retained topics; DLQ per tenant (`{tenant_id}.dlq`)                        |
| Neo4j      | **Derived** — rebuildable from the Kafka event stream (KG full-rebuild admin endpoint) |
| ClickHouse | **Derived** — re-ingestible from Kafka                                                 |
| Redis      | Cache + idempotency keys; AOF persistence, sub-second RPO, no rebuild need             |
| OpenSearch | **Derived** — re-indexable from PostgreSQL                                             |

Restore the authoritative stores first; let the derived ones rebuild.

## After any recovery — check isolation before declaring success

A restored database whose `app_user` role or RLS policies did not come across is a **cross-tenant
leak** (risk `R-02`), not a successful recovery. The isolation probe CronJob
(`infrastructure/monitoring/isolation-probe/`) and the `TenantIsolationBreach` alert must both be
green before service is declared restored.

## To close this STUB

1. Run a DR drill per scenario and record RTO/RPO achieved in [drill-log.md](drill-log.md), measured
   against QM-12's production row.
2. Close the two dependent STUBs (`../db-failover.md`, `../keycloak-realm-recovery.md`).

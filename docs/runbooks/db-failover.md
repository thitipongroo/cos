# DB Failover Runbook (PostgreSQL RDS Multi-AZ)

**STUB** — detailed procedures to be defined before Stage 1→2 transition (production launch).

> **Why this is still a STUB.** QM-11 closes a runbook by **executing it end-to-end in staging**. A
> failover drill has not been run, and QM-12 additionally requires a **DR drill before every Stage
> transition**, recorded in [`disaster-recovery/drill-log.md`](disaster-recovery/drill-log.md).

## Scope

Automated and manual failover for RDS Multi-AZ — the shared database and the dedicated ENTERPRISE
tenant databases.

## Targets

Two sets of numbers apply, and they are **not** in conflict — they measure different things. Meet
both.

**Internal recovery target, per environment — QM-12.** What the platform team engineers for:

| Target | Staging  | Production     |
| ------ | -------- | ---------------- |
| RTO    | 4 hours  | **30 minutes** |
| RPO    | 24 hours | **15 minutes** |

**Contractual SLA, per customer tier —
[`08-enterprise-deployment.md` §8.2](../specifications/08-enterprise-deployment.md).** What a
customer is owed:

| Tier                     | RTO     | RPO      |
| ------------------------ | ------- | -------- |
| Shared SaaS — SMB        | 4 hours | 24 hours |
| Shared SaaS — Mid-market | 2 hours | 4 hours  |
| Dedicated Tenant         | 1 hour  | 1 hour   |
| Enterprise / On-premise  | 1 hour  | 1 hour   |

The internal target (30 min) is stricter than the tightest contractual tier (1 h), which is the
intended relationship: engineer to the internal number, report against the contractual one. A drill
is signed off against **QM-12's production row**, because that is the one the platform controls.

30 minutes is only achievable with automated failover plus health-check-driven recovery — not with a
human in the loop for every step.

## What is actually provisioned

From `infrastructure/terraform/aws/modules/rds/main.tf`:

| Setting                     | Value                                                              |
| --------------------------- | -------------------------------------------------------------------- |
| Instance identifier         | `cos-postgres-${var.environment}` → e.g. `cos-postgres-production` |
| `multi_az`                  | `var.environment == "production"` — **true in production only**    |
| `backup_retention_period`   | 30 days (production) / 7 days (other)                              |
| `final_snapshot_identifier` | `cos-postgres-final-${var.environment}`                            |
| `skip_final_snapshot`       | true when environment ≠ production                                 |

Dedicated ENTERPRISE instances come from `infrastructure/terraform/modules/rds-tenant/`
(`aws_db_instance.tenant`); the tenant's URL is in `platform.tenants.dedicated_db_url`.

> **Confirm the engine version actually running.** Terraform now specifies `engine_version = "18"`
> (raised from 16.2 on 2026-08-07), matching `00_master_construction_os.md` and the
> `timescale/timescaledb:latest-pg18` image used in development. An instance provisioned before that
> change is still on 16 until a major-version upgrade is performed — check the instance, not the
> module, before assuming version-specific failover behaviour.
>
> **Staging cannot rehearse production failover.** `multi_az` is false outside production, so there
> is no standby to fail over to in staging. Rehearsing the drill needs a temporary Multi-AZ staging
> instance or a production maintenance window.

## Automated failover

RDS Multi-AZ fails over automatically in roughly 60–120 seconds when the primary becomes
unavailable, fails its health check, or its AZ goes down. **No manual action is required.**

Watch: `DBConnectionExhausted`, `DBHighQueryTime`, `ServiceDown`
(`infrastructure/monitoring/prometheus/rules/cos-alerts.yml`), plus the RDS events for the instance.

## Manual failover

```bash
aws rds describe-db-instances \
  --db-instance-identifier cos-postgres-production \
  --query 'DBInstances[0].[MultiAZ,DBInstanceStatus,SecondaryAvailabilityZone]'

aws rds reboot-db-instance \
  --db-instance-identifier cos-postgres-production --force-failover
```

1. Verify the standby is in sync (CloudWatch `ReplicaLag`) **before** forcing the failover.
2. Force the failover with the command above.
3. If the endpoint changed, update `DATABASE_URL` in AWS Secrets Manager — the External Secrets
   Operator syncs it into the `cos` namespace.
4. **Restart PgBouncer, then the application pods.** QM-18 puts PgBouncer between every service and
   PostgreSQL (`infrastructure/kubernetes/pgbouncer/`), so it holds the stale server connections; the
   app pods alone are not enough.

   ```bash
   kubectl -n cos rollout restart deployment/pgbouncer
   kubectl -n cos rollout restart deployment/cos-backend
   ```

5. Confirm Temporal activities resume and Kafka consumers reconnect.

## Dedicated tenant databases

Same procedure against that tenant's instance. The RDS identifier is derivable from
`platform.tenants.dedicated_db_url`; Multi-AZ is enabled by default for ENTERPRISE instances.
Provisioning: [`dedicated-db-provisioning.md`](dedicated-db-provisioning.md).

## Post-failover verification

```bash
kubectl -n cos get pods
curl -fsS https://<ingress>/api/v1/health/ready
```

- p95 query latency back to baseline; `DBHighQueryTime` cleared.
- **RLS still enforcing** — the isolation probe CronJob
  (`infrastructure/monitoring/isolation-probe/`) must stay green. A restored or re-pointed database
  whose `app_user` role or policies did not come across is a cross-tenant leak, risk `R-02`.
- PgBouncer pool metrics healthy: `pgbouncer_pools_client_waiting` not climbing.
- Temporal queues draining; Kafka consumer lag recovering.

File an incident report if the failover was unplanned — [`incident-response.md`](incident-response.md).

## To close this STUB

1. Run a failover drill and record RTO/RPO achieved in
   [`disaster-recovery/drill-log.md`](disaster-recovery/drill-log.md).
2. Verify AWS RDS offers PostgreSQL 18 in `ap-southeast-7` and that TimescaleDB is available for it,
   then plan the major-version upgrade for any instance still on 16.
3. Decide how staging rehearses this given `multi_az` is production-only.
4. Confirm the PgBouncer restart step is actually required (or not) by observing a real failover.

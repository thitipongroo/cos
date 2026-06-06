# DB Failover Runbook (PostgreSQL RDS Multi-AZ)

**STUB** — detailed procedures to be defined before Stage 1→2 transition (production launch).

## Scope

Automated and manual failover procedures for RDS Multi-AZ (shared DB and dedicated tenant DBs).

## Automated Failover (RDS Multi-AZ)

AWS RDS Multi-AZ performs automatic failover within 60–120 seconds when:

- Primary instance becomes unavailable
- Primary instance fails a health check
- Availability Zone outage

**No manual action required** for automated failover. Monitor:

- Grafana: DB connection pool errors, query latency spike
- CloudWatch: `RDS/FailoverDuration`, `DBInstanceIdentifier` events

## Manual Failover Steps

If automated failover fails or a planned maintenance failover is needed:

1. Verify the standby instance is in-sync (check CloudWatch `ReplicaLag`)
2. Initiate manual reboot with failover:
   `aws rds reboot-db-instance --db-instance-identifier <id> --force-failover`
3. Update `DATABASE_URL` in AWS Secrets Manager if the endpoint changes
4. Restart affected services (NestJS pods) to pick up the new connection
5. Verify all Temporal activities resume and Kafka consumers reconnect

## Dedicated Tenant DB Failover

Each enterprise tenant has a dedicated RDS instance with Multi-AZ enabled by default.
Failover follows the same procedure above. Tenant-specific RDS identifier is stored in
`platform.tenants.dedicated_db_url`.

## Post-failover Verification

- Confirm p95 query latency returns to baseline (< 50ms for indexed reads)
- Confirm Temporal workflow queues are draining normally
- File incident report if failover was unplanned — see [incident-response.md](incident-response.md)

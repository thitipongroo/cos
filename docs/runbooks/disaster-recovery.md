# Disaster Recovery Runbook

**Source:** QM-12 — Disaster Recovery  
**RTO target (production):** 30 minutes  
**RPO target (production):** 15 minutes

---

## Recovery Targets

| Target              | Staging  | Production                   |
| ------------------- | -------- | ---------------------------- |
| RTO                 | 4 hours  | **30 minutes**               |
| RPO                 | 24 hours | **15 minutes**               |
| DB backup frequency | Daily    | Every 15 min (WAL streaming) |
| Multi-AZ failover   | Optional | Required                     |

---

## Scenario Runbooks

| Scenario                                      | Runbook                                                   |
| --------------------------------------------- | --------------------------------------------------------- |
| PostgreSQL failure (RDS Multi-AZ failover)    | `docs/runbooks/db-failover.md`                            |
| Kafka broker failure                          | `docs/runbooks/disaster-recovery/kafka-broker-failure.md` |
| Complete region failure (ap-southeast-1 down) | `docs/runbooks/disaster-recovery/region-failure.md`       |
| KMS key compromise                            | `docs/runbooks/disaster-recovery/kms-key-compromise.md`   |

---

## General Recovery Sequence

For any DR event, follow this sequence regardless of scenario:

1. **Declare P0 incident** — open `#incident-<date>-dr` channel; assign IC
2. **Assess scope** — identify which services and data are affected
3. **Select scenario runbook** — use table above; open runbook in second window
4. **Execute runbook** — IC calls steps; scribe logs actions with timestamps
5. **Verify recovery** — run `./scripts/readiness/check-health.sh` before declaring resolved
6. **Notify tenants** — update status page within 30 minutes of incident declaration
7. **Post-mortem** — complete `docs/runbooks/postmortem-template.md` within 5 business days

---

## Service Recovery Priority

Restore in this order (highest business impact first):

| Priority | Service          | Recovery method                                           |
| -------- | ---------------- | --------------------------------------------------------- |
| 1        | PostgreSQL (RDS) | Automated Multi-AZ failover (~60s)                        |
| 2        | Kong Gateway     | Kubernetes self-healing (pod restart)                     |
| 3        | NestJS backend   | Kubernetes self-healing (pod restart)                     |
| 4        | Keycloak         | Kubernetes self-healing + realm restore from backup       |
| 5        | Kafka            | Broker recovery (see kafka-broker-failure.md)             |
| 6        | AI Gateway       | Kubernetes self-healing                                   |
| 7        | ClickHouse       | Restore from daily backup + Kafka re-ingest               |
| 8        | Neo4j            | Restore from daily backup (KG is rebuildable from events) |

---

## Communication Templates

### Tenant notification (within 30 min of P0/P1 declaration)

```
[Construction OS Status] Service disruption — [DATE TIME ICT]

We are currently experiencing [brief description].
Impact: [affected features]
Status: Investigating / Mitigating / Resolved
ETA to resolution: [time] or "under investigation"

Updates every 30 minutes at: https://status.<domain>
```

### All-clear notification

```
[Construction OS Status] Service restored — [DATE TIME ICT]

All services have been restored as of [TIME] ICT.
Duration: [X] hours [Y] minutes
Impact: [brief summary]
Post-mortem: will be published within 5 business days.
```

---

## Drill Log

DR drills must be executed before every Stage transition.
Results recorded in: `docs/runbooks/disaster-recovery/drill-log.md`

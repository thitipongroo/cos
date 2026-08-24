# Incident Response Runbook

**STUB** — detailed procedures to be defined before Stage 1→2 transition (production launch).

> **Why this is still a STUB.** QM-11 closes a runbook by **executing it end-to-end in staging** —
> here, a paging drill. PagerDuty and the status page are both required _before_ Stage 2 go-live
> (QM-17) and neither is configured yet, so the escalation path below has never been exercised.

## Severity — QM-17

> **Corrected 2026-08-07.** This table read `P1`–`P4` while QM-17 defines `P0`–`P3` with the same
> SLAs. The labels were shifted by one, so an alert called "P1" meant _complete outage_ to QM-17 and
> _partial outage_ to this runbook. QM-17 wins; the labels below are its labels.

| Severity | Definition                                                                   | First response    |
| -------- | ---------------------------------------------------------------------------- | ----------------- |
| **P0**   | Complete service outage **or** data loss **or** security breach              | 15 minutes        |
| **P1**   | Partial outage affecting > 10% of tenants **or** SLO error-budget burn > 10× | 30 minutes        |
| **P2**   | Degraded performance, non-critical feature failure, SLO burn > 2×            | 2 hours           |
| **P3**   | Minor bug, cosmetic issue                                                    | Next business day |

## Response procedure — QM-17

1. **Declare** the incident (open the incident channel).
2. **Assign an Incident Commander.** The first responder owns coordination until it is reassigned.
3. **Mitigate before diagnosing** — stop the bleeding. If it is deployment-related, roll back
   ([`rollback.md`](rollback.md)); if it is flagged, kill the flag (< 60 s, QM-15). Root cause can
   wait; the outage cannot.
4. **Communicate to affected tenants within 30 minutes** of a P0/P1 declaration, via the status page.
5. **Resolve**, then write a blameless post-mortem within **5 business days** for P0/P1
   ([`postmortem-template.md`](postmortem-template.md)).

## Which alert means what

Alert rules: `infrastructure/monitoring/prometheus/rules/cos-alerts.yml`.

| Alert                      | Meaning                                 | Typical severity                               |
| -------------------------- | --------------------------------------- | ---------------------------------------------- |
| `TenantIsolationBreach`    | The isolation probe read across tenants | **P0** — page the security lead now            |
| `SafetyNotificationFailed` | A safety notification did not deliver   | **P0** — safety alerts cannot be quiet or lost |
| `ServiceDown`              | A pod has been not-ready > 2 min        | P0 / P1 by blast radius                        |
| `DBConnectionExhausted`    | PostgreSQL pool > 95%                   | P0 / P1                                        |
| `KafkaConsumerLagCritical` | Lag > 50,000 on a topic                 | P1                                             |
| `APIHighErrorRate`         | 5xx > 1% for 5 min                      | P1                                             |
| `APIHighLatency`           | p99 > 5 s for 5 min                     | P1 / P2                                        |
| `KafkaDLQNonEmpty`         | DLQ depth > 0 for 5 min                 | P2                                             |
| `DBHighQueryTime`          | p95 query > 1 s for 5 min               | P2                                             |
| `AnalyticsSLABreach`       | Analytics p95 > 3 s                     | P2                                             |
| `AIHighTokenUsage`         | Tenant above 80% of monthly AI quota    | P3 — notify FINANCE + TENANT_ADMIN             |
| `DiskUsageHigh`            | Any PV > 80% full                       | P2 / P3                                        |
| `MemoryPressure`           | Pod > 85% of memory limit for 10 min    | P2 / P3                                        |

## Triage commands

```bash
kubectl -n cos get pods                                   # what is not Running
kubectl -n cos logs deployment/cos-backend --tail=200
curl -fsS https://<ingress>/api/v1/health/ready           # which dependency is down
argocd app list --output=wide                             # did something just sync?
```

## Security incidents

A suspected breach is **P0** regardless of user-visible impact.

1. Notify the product owner and legal immediately.
2. **Preserve all logs — do not rotate or delete.** Audit logs are append-only by design (QM-4); keep
   it that way.
3. Revoke suspected credentials — JWT signing keys rotate via the JWKS endpoint (zero-downtime);
   secrets rotate through AWS Secrets Manager or Vault (spec §5.2, QM-4).
4. Conduct forensic review **before** restoring service.
5. PDPA: a personal-data breach carries a **72-hour** notification obligation (risk `R-03`) — the
   clock starts at awareness, not at resolution.

## Escalation

| Condition                     | Escalate to                                   |
| ----------------------------- | --------------------------------------------- |
| Data loss confirmed           | Product owner + legal                         |
| Tenant data breach suspected  | Product owner + legal + affected TENANT_ADMIN |
| Platform unavailable > 1 hour | Product owner                                 |

On-call rotation and the paging path: [`on-call-rotation.md`](on-call-rotation.md). QM-17 requires
the on-call engineer to have live access to Grafana, Alertmanager/Prometheus, the Temporal console
and Kubernetes **before** going on-call.

## To close this STUB

1. Configure PagerDuty and the status page (both are QM-17 prerequisites for Stage 2 go-live).
2. Run a paging drill end to end and record it.
3. Fill in the real incident channel, status-page URL and escalation contacts.

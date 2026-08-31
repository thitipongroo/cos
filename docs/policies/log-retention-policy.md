# Construction OS — Log Retention Policy

> **Purpose:** Define the retention schedule for all log types across Construction OS environments.
> Source: QM-8; spec §31.2; master Phase 15. Authoritative log store: **Loki** (CloudWatch Logs
> removed — see master Phase 15 resolution M-11).

---

## Log store architecture

```text
Application → @cos/logger (JSON) → Promtail (agent) → Loki
                                                         ├── Hot tier:  S3 object storage (30 days)
                                                         ├── Cold tier: S3 Glacier (12 months)
                                                         └── Archive:   S3 Glacier Deep Archive (7 years — compliance logs only)
```

---

## Retention schedule

### Application logs (all services)

| Tier   | Storage               | Retention                             | Trigger                              |
| ------ | --------------------- | ------------------------------------- | ------------------------------------ |
| Hot    | Loki on S3 (standard) | **30 days**                           | Default Loki retention config        |
| Cold   | S3 Glacier            | **1 year** (12 months from ingestion) | S3 lifecycle rule: move on day 31    |
| Delete | —                     | After 1 year                          | S3 lifecycle rule: expire on day 365 |

Scope: NestJS backend, Fastify file-service, FastAPI ai-gateway, FastAPI ai-embedding-worker,
FastAPI ai-ocr-pipeline, Go analytics-worker, Go kg-ingestion-worker, Next.js web (server-side).

### Compliance / audit logs

| Tier               | Storage                 | Retention                  | Trigger                                  |
| ------------------ | ----------------------- | -------------------------- | ---------------------------------------- |
| Hot                | Loki on S3 (standard)   | 30 days                    | Default                                  |
| Cold               | S3 Glacier              | 1 year                     | S3 lifecycle                             |
| Compliance archive | S3 Glacier Deep Archive | **7 years** from ingestion | S3 lifecycle rule: transition on day 366 |
| Delete             | —                       | After 7 years              | S3 lifecycle rule: expire on day 2557    |

**The compliance archive is WORM** (S3 Object Lock in compliance mode): while a record is retained
nothing — no operator, no automation, no root credential — may alter or remove it. That is what
`31 §31.4` and `05 §5.2` mean by "immutable append-only store", and what `09 §9` means by "WORM for
immutable compliance records". Stated here explicitly as of 2026-08-23, because this file is the
authoritative schedule and an S3 lifecycle rule configured from it without Object Lock would satisfy
the retention period while losing the immutability the controls depend on.

Immutability is not the same as permanence: the day-2557 expiry above is the ONE way a record
leaves, and it applies by age alone.

Scope: `audit_logs` table events shipped to Loki; authentication events; authorization failures;
data export events; admin actions; all PDPA-relevant data subject events.

Log level routing: all `INFO` and above from `audit` module are tagged with `log_class=compliance`
in Promtail pipeline and routed to the compliance retention bucket (`cos-logs-compliance-{env}`).

### Distributed traces (Tempo)

| Tier   | Storage              | Retention                |
| ------ | -------------------- | ------------------------ |
| Hot    | Tempo object storage | **14 days**              |
| Delete | —                    | Auto-purge after 14 days |

### Metrics (Prometheus TSDB)

| Tier       | Storage                    | Retention                               |
| ---------- | -------------------------- | --------------------------------------- |
| Local TSDB | Prometheus                 | **15 days**                             |
| Long-term  | Thanos object storage (S3) | **1 year**                              |
| Delete     | —                          | Auto-purge per Thanos compaction policy |

### Kafka event logs (topic retention)

| Topic pattern                    | Retention   | Rationale                       |
| -------------------------------- | ----------- | ------------------------------- |
| `cos.*.created`, `cos.*.updated` | **7 days**  | Operational replay window       |
| `cos.finance.*`                  | **30 days** | Financial reconciliation window |
| `cos.audit.*`                    | **90 days** | Compliance event replay         |
| `cos.dlq.*` (dead-letter)        | **30 days** | Investigation window            |

Topic retention is set via Kafka broker config (`retention.ms`) in
`infrastructure/kubernetes/kafka/kafka-topic-configs.yaml`.

### Infrastructure / system logs

| Source                                     | Retention      |
| ------------------------------------------ | -------------- |
| Kubernetes node logs (kubelet, containerd) | 7 days         |
| Kubernetes API server audit logs           | 90 days        |
| Kong Gateway access logs                   | 30 days (Loki) |
| PgBouncer logs                             | 14 days (Loki) |
| PostgreSQL slow query logs                 | 30 days (Loki) |
| ClickHouse query logs                      | 14 days (Loki) |

---

## PII in logs

**PII must never appear in any log field** (QM-5, QM-8).

| Forbidden           | Required alternative   |
| ------------------- | ---------------------- |
| Full name           | `user_id` (UUID)       |
| Phone number        | `[REDACTED]`           |
| Email address       | `user_id` (UUID)       |
| National ID         | `[REDACTED]`           |
| GPS coordinates     | Project / zone ID only |
| JWT payload content | `token_id` claim only  |

Violations detected by log scanning job in CI (`scripts/ci/scan-log-pii.sh`) — build fails if
raw PII pattern detected in log output during integration tests.

---

## Implementation

### Loki retention configuration

`infrastructure/monitoring/loki/loki-config.yml`:

```yaml
limits_config:
  retention_period: 720h # 30 days hot tier

compactor:
  retention_enabled: true
  retention_delete_delay: 2h
```

### S3 lifecycle rules

Defined in `infrastructure/terraform/aws/s3.tf` — bucket `cos-logs-{env}`:

```hcl
lifecycle_rule {
  id      = "log-cold-tier"
  enabled = true
  transition {
    days          = 31
    storage_class = "GLACIER"
  }
  expiration {
    days = 365
  }
}
```

Bucket `cos-logs-compliance-{env}`:

```hcl
lifecycle_rule {
  id      = "compliance-archive"
  enabled = true
  transition {
    days          = 31
    storage_class = "GLACIER"
  }
  transition {
    days          = 366
    storage_class = "DEEP_ARCHIVE"
  }
  expiration {
    days = 2557  # 7 years
  }
}
```

---

## Verification

Before Stage 1 → Stage 2 gate:

- [ ] Loki retention config deployed and tested (verify old logs are purged after 30 days in staging)
- [ ] S3 lifecycle rules applied to `cos-logs-{env}` and `cos-logs-compliance-{env}`
- [ ] Compliance log routing pipeline (Promtail labels) verified end-to-end
- [ ] PII scan CI job (`scan-log-pii.sh`) passing

---

## Review schedule

| Trigger            | Action                                                                 |
| ------------------ | ---------------------------------------------------------------------- |
| Annually (January) | Verify all retention periods comply with current PDPA / accounting law |
| New service added  | Add log source entry to this document                                  |
| Regulatory change  | Update affected periods within 30 days                                 |

---
paths:
  - "docs/runbooks/disaster-recovery/**"
  - "infrastructure/terraform/**"
---

# QM-12 — Disaster Recovery

Indexed in: `context.md` §QUALITY MANDATES

These targets are defined per environment:

| Target                         | Staging      | Production                                          |
| ------------------------------ | ------------ | --------------------------------------------------- |
| RTO (Recovery Time Objective)  | 4 hours      | **30 minutes**                                      |
| RPO (Recovery Point Objective) | 24 hours     | 15 minutes                                          |
| Database backup frequency      | Daily        | Every 15 minutes (WAL streaming)                    |
| Multi-AZ failover              | Optional     | Required                                            |
| Multi-region failover          | Not required | Required at Stage 4 (multi-region Terraform module) |

DR runbooks must exist for: database failure, Kafka broker failure, complete region failure, KMS key compromise.
DR runbooks live in `docs/runbooks/disaster-recovery/`.
DR drills must be executed before every Stage transition; drill results recorded in `docs/runbooks/disaster-recovery/drill-log.md`.

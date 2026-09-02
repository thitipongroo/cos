---
paths:
  - "infrastructure/monitoring/**"
  - "docs/evidence/slo-monthly-reviews/**"
  - "docs/registers/dashboard-registry.md"
---

# QM-14 — SLI / SLO / Error Budget

Indexed in: `context.md` §QUALITY MANDATES

SLOs are non-negotiable production targets. Error budget is consumed when an SLO is violated.
Source: spec §31.6

**API Availability SLO (three tiers — source: spec §31.6):**

| Tier                     | Target | 30-day Error Budget |
| ------------------------ | ------ | ------------------- |
| Shared SaaS — SMB        | 99.5%  | 3.6 hours/month     |
| Shared SaaS — Mid-market | 99.9%  | 43.8 min/month      |
| Dedicated / Enterprise   | 99.95% | 21.9 min/month      |

**Latency and Other SLOs:**

| SLO                                    | Target                                                                                | Window          | 30-day Error Budget |
| -------------------------------------- | ------------------------------------------------------------------------------------- | --------------- | ------------------- |
| 5xx error rate                         | < 0.1% of requests                                                                    | Rolling 30 days | 0.1% of requests    |
| p95 read latency (GET)                 | **< 300ms**                                                                           | Rolling 30 days | < 0.1% may exceed   |
| p95 write latency (POST/PUT)           | **< 500ms**                                                                           | Rolling 30 days | < 0.1% may exceed   |
| p95 dashboard/analytics (ClickHouse)   | < 1s                                                                                  | Rolling 30 days | < 0.1% may exceed   |
| p95 AI report generation               | < 5s                                                                                  | Rolling 30 days | < 1% may exceed     |
| p95 notification delivery (in-app SSE) | < 500ms                                                                               | Rolling 30 days | < 0.1% may exceed   |
| Mobile offline sync                    | < 30s for 5MB                                                                         | Monthly sample  | < 1% failures       |
| Kafka consumer lag                     | < 1,000 messages per partition (normal); alert > 5,000 for > 2 min; critical > 50,000 | Continuous      | —                   |

**Error budget policy:**

- Budget remaining < 50% → freeze non-critical feature work; prioritize reliability
- Budget remaining < 10% → freeze ALL feature work; mandatory incident review with product owner
- SLO dashboards tracked in Grafana; dashboard IDs registered in `docs/registers/dashboard-registry.md`
- SLO burn rate alerts wired via QM-8 metrics
- Monthly SLO review required; notes in `docs/evidence/slo-monthly-reviews/YYYY-MM.md`

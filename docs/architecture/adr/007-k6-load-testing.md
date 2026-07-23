---
title: 'ADR-007 — k6 for Load Testing'
status: Accepted
last_updated: '2026-05-29'
authors:
  - thitipongroo
---

# ADR-007 — k6 for Load Testing

**Status:** Accepted
**Date:** 2026-02-10
**Deciders:** Engineering team

## Context

Construction OS has explicit P95 SLA targets from the master spec (Phase 14, Phase 18):

- Executive dashboard: P95 < 3s at 100 VUs
- API gateway throughput: P95 < 1s at 200 VUs
- File upload: P95 < 10s at 20 VUs (5 MB files)
- AI report generation: P95 < 15s at 10 VUs

A load testing tool is needed that can be embedded in the staging CI/CD pipeline.

Options considered:

1. **k6** (Grafana k6 — open-source, JavaScript)
2. Apache JMeter (XML config, Java)
3. Locust (Python)
4. Artillery (Node.js)

## Decision

**k6 (Grafana k6)** — open-source, runs in CI as GitHub Actions.

## Rationale

- JavaScript test scripts — same language as frontend, easy to write and maintain
- First-class Grafana integration — results feed directly into Grafana Cloud or local Prometheus
- `k6-action` GitHub Action for CI integration (used in `deploy.yml`)
- `thresholds` block declaratively defines SLA pass/fail criteria — CI fails if SLA breached
- Lightweight binary — fast startup, no JVM overhead

## Load test inventory

| File                    | Scenario             | VUs     | Duration | P95 target |
| ----------------------- | -------------------- | ------- | -------- | ---------- |
| `analytics-sla.js`      | Dashboard SLA        | 100     | 5 min    | < 3000ms   |
| `file-upload-sla.js`    | File uploads         | 20      | 5 min    | < 10000ms  |
| `api-throughput-sla.js` | API throughput       | 200     | 10 min   | < 1000ms   |
| `ai-report-sla.js`      | AI reports           | 10      | 5 min    | < 15000ms  |
| `smoke-test.js`         | Pre-load health      | 1       | 1 iter   | N/A        |
| `morning-peak.js`       | Peak load simulation | 50 ramp | 7 min    | < 2000ms   |

## Consequences

- Load tests run on staging after every deploy (via `deploy.yml` workflow)
- Results uploaded as GitHub Actions artifacts (`k6-results*.json`)
- SLA failures block the staging → production promotion gate

---

## Implementation notes

Consolidated from a former standalone k6 load-testing/SLA-validation ADR
(2026-06-09) when the duplicate was merged on 2026-07-23 (its original number has since been reused):

- **Output:** k6 → InfluxDB → Grafana dashboard for SLA trend analysis
  (`infrastructure/monitoring/grafana/dashboards/adoption-gates.json`)
- **Scope:** k6 validates API-level SLAs only; frontend/browser performance is measured
  separately (Lighthouse CI) — k6 does not simulate browser behavior
- **Scenarios** live under `k6/`; CI runs them against staging and blocks the promotion
  gate on any `thresholds` breach

---

## Alternatives Considered

| Option              | Reason Rejected                                                                                                |
| ------------------- | -------------------------------------------------------------------------------------------------------------- |
| Apache JMeter       | XML-based configuration; JVM startup overhead; weaker Grafana/Prometheus native integration                    |
| Locust (Python)     | GIL limits single-process concurrency under sustained load; no declarative `thresholds` block for CI pass/fail |
| Artillery (Node.js) | Less mature Grafana integration; smaller ecosystem; no first-class GitHub Actions native action                |

---

## References

- `docs/00-specifications/30-testing-strategy.md` §30.6 — load testing strategy and k6 as the mandated tool
- `docs/00-specifications/14-api-architecture.md` §14.2 — rate limiting defaults (P95 < 1s at 200 VUs)
- `docs/01-architecture/adr/005-clickhouse-analytics.md` — analytics dashboard SLA target (P95 < 3s) that k6 validates

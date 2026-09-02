---
paths:
  - "tests/load/**"
  - "**/lighthouserc*"
  - "**/*.k6.js"
---

# QM-6 — Performance Budgets

Indexed in: `context.md` §QUALITY MANDATES

These are enforced targets. If an implementation does not meet them, do not ship — optimize or escalate.
Source: spec §31.6 (targets corrected to match spec SLO definitions; Web Vitals per §31.6 Frontend Web Vitals SLO +
§30.9 Lighthouse CI gate)

| Metric                                       | Target                                         | Measurement                                                                                                                                                                                                                                                                   |
| -------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API p95 latency (read endpoints — GET)       | **< 300ms**                                    | Grafana / k6 load test                                                                                                                                                                                                                                                        |
| API p99 latency (read endpoints — GET)       | < 500ms                                        | Grafana / k6 load test                                                                                                                                                                                                                                                        |
| API p95 latency (write endpoints — POST/PUT) | **< 500ms**                                    | Grafana / k6 load test                                                                                                                                                                                                                                                        |
| API p99 latency (write endpoints — POST/PUT) | < 1s                                           | Grafana / k6 load test                                                                                                                                                                                                                                                        |
| Dashboard / analytics (ClickHouse)           | p95 < 1s                                       | Grafana / k6 load test                                                                                                                                                                                                                                                        |
| AI report generation                         | p95 < 5s                                       | Grafana / k6 load test                                                                                                                                                                                                                                                        |
| Web LCP — Largest Contentful Paint (p75)     | field ≤ 2.5s · lab ≤ 3.2s                      | web-vitals RUM p75 (spec §31.6) for the field number. The Lighthouse lab gate (§30.9) is a separate 3.2s: one throttled profile on a `ubuntu-latest` runner, calibrated to the highest median of five measured CI runs (2,913ms) + ~10%. It is a regression gate, not the SLO |
| Web INP — Interaction to Next Paint (p75)    | ≤ 200ms                                        | web-vitals RUM (§31.6); TBT lab proxy in Lighthouse CI (§30.9)                                                                                                                                                                                                                |
| Web CLS — Cumulative Layout Shift (p75)      | ≤ 0.1                                          | web-vitals RUM (§31.6); Lighthouse CI lab gate (§30.9)                                                                                                                                                                                                                        |
| Mobile app cold start (React Native)         | < 3s on mid-range Android                      | Manual test + Flipper                                                                                                                                                                                                                                                         |
| Offline sync completion (3G, 5MB data)       | < 30s                                          | Manual test on throttled network                                                                                                                                                                                                                                              |
| Background job (Temporal workflow)           | SLA defined per workflow type in workflow spec | Temporal dashboard                                                                                                                                                                                                                                                            |
| k6 sustained load (100 VU × 5 min)           | 0 errors, p95 within budget                    | Weekly scheduled — `tests/load/qm6-baseline.js` (staging); Phase 19 one-time gate. `tests/load/api-baseline.js` is the separate Phase 18 scenario — 200 VU over 10 min, reads only, p95 < 1 s                                                                                                                                                                                       |

The k6 load test runs on a **weekly schedule against staging** — not per-PR (source: spec §30.9). Results are advisory:
alert Engineering Lead if p95 latency increases > 20% vs. previous week. Load tests do not block PR merge. Note: Phase
19 automated check #7 runs a one-time load test gate before production go-live.

# k6 as Load Testing and SLA Validation Tool

**Date:** 2026-06-09
**Status:** Accepted
**Deciders:** Product Owner, Engineering Lead
**Tags:** infra, architecture

---

## Context

Construction OS has contractual and product SLA requirements that must be validated before Stage 1 → 2 transition:

- API endpoints: p99 latency < 500ms under 100 concurrent users
- AI completion endpoints: p99 < 2s under 50 concurrent users
- File upload: p99 < 3s for files up to 50MB
- Dashboard queries: p99 < 1s

Manual testing cannot cover concurrent user simulation at required scale. A dedicated load-testing tool is required that can run in CI/CD pipelines and produce machine-readable SLA pass/fail results.

---

## Decision

Use **k6** (Grafana Labs) as the load testing and SLA validation tool.

- **Test scripts:** TypeScript/JS in `k6/` directory at repo root
- **Execution:** `k6 run k6/scenarios/<scenario>.js --vus=100 --duration=5m`
- **SLA checks:** k6 `check()` + `thresholds` in test config; non-zero exit code on breach
- **CI integration:** GitHub Actions step runs k6 against staging environment; blocks merge on SLA failure
- **Grafana integration:** k6 outputs to InfluxDB → Grafana dashboard for trend analysis

---

## Rationale

**Why k6 over alternatives?**

| Option    | Rejected reason                                                         |
| --------- | ----------------------------------------------------------------------- |
| JMeter    | XML config; JVM; poor CI integration; no native TypeScript              |
| Locust    | Python; heavier runtime; less idiomatic for JS-first team               |
| Artillery | Less Grafana-native; smaller community; fewer built-in protocol support |
| Gatling   | Scala/Java; steep learning curve; not JS ecosystem                      |

k6 provides: JavaScript/TypeScript scripts, Grafana-native, open-source, minimal Docker footprint, `check()`/`threshold` API for programmatic SLA assertions, and official Grafana integration.

---

## Consequences

### Positive

- SLA validation is automated and CI-gated — regressions caught before merge
- k6 scripts are code-reviewed alongside feature code (same repo)
- Grafana k6 dashboard aligns with existing Grafana monitoring stack

### Negative

- k6 does not simulate browser behavior — API-level only; frontend perf requires separate tooling (Lighthouse CI)

### Neutral

- k6 tests run against staging, not production; staging must be representative

---

## References

- `context/00_master_construction_os.md` §Phase 13 — Performance & SLA
- `k6/`
- `infrastructure/monitoring/grafana/dashboards/adoption-gates.json`

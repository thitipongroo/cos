---
title: "ADR-011 — SonarQube for SAST and Code Quality"
status: Accepted
last_updated: "2026-05-29"
authors:
  - thitipongroo
---

# ADR-011: SonarQube for SAST and Code Quality

> **Status:** Accepted
>
> **Date:** 2026-05-27
>
> **Supersedes:** —

---

## Context

`docs/00-specifications/30-testing-strategy.md` sections 30.10 and 30.12 mandate
**SonarQube** for static application security testing (SAST) and code quality scanning
on every pull request.

The previous CI pipeline used **semgrep** (open-source SAST) as an interim tool,
flagged as AWAITING_DECISION C-04. semgrep provides security-focused scanning but
does not cover:

- Code quality metrics (cognitive complexity, code smells, duplication)
- Quality gates that block PRs when quality falls below a threshold
- Coverage trend tracking across sprints
- PR decoration showing inline issues in GitHub

---

## Decision

We will use **SonarQube** for all SAST and code quality scanning per spec §30.10
and §30.12.

Deployment: SonarQube Community Edition (self-hosted on EKS — single pod, PostgreSQL
backend using the existing RDS instance with a dedicated `sonarqube` database).

CI integration: GitHub Actions calls `sonar-scanner` on every PR and push to main.
Quality gate blocks merge when any of the following thresholds are violated:

| Metric | Gate threshold |
| ------ | -------------- |
| New code coverage | ≥ 80% lines, ≥ 70% branches (spec §30.3) |
| New code reliability rating | A (0 bugs) |
| New code security rating | A (0 vulnerabilities) |
| New code maintainability | A (≤ 5% technical debt ratio) |
| New code duplication | ≤ 3% |

semgrep is removed from the CI pipeline once SonarQube is operational.

---

## Rationale

- **Spec authority:** spec §30.10 and §30.12 explicitly name SonarQube — not a
  generic SAST tool.
- **Quality gates:** SonarQube quality gates block PRs with measurable thresholds;
  semgrep only reports findings without blocking on quality metrics.
- **Coverage integration:** SonarQube ingests Jest coverage reports (lcov) and
  enforces the 80%/70% threshold from QM-1 in a single gate — eliminating separate
  coverage threshold configuration.
- **Stage 1→2 gate:** production-grade code quality visibility is required before
  taking on enterprise customers at Stage 2.

---

## Consequences

### Positive

- Single gate for security + quality + coverage — no separate jest threshold config
- PR decoration shows inline issues directly in GitHub
- Technical debt tracked over time — visible to product owner
- Security vulnerabilities reported with CVE references and remediation guidance

### Negative / Trade-offs

- SonarQube server requires ~2GB RAM (pod) + PostgreSQL `sonarqube` database (~500MB)
- First scan is slow (full project analysis); incremental PR scans are fast (~2–3 min)
- Community Edition does not support branch analysis (only main + PR analysis)
  — Developer Edition required for full branch support (cost: ~$150/year for this
  project size); acceptable for Stage 1–2

### Risks

- **Quality gate too strict at adoption** — mitigation: run SonarQube in report-only
  mode for the first sprint, baseline the existing codebase, then enable the gate
- **Community Edition branch limitation** — only PRs and main branch are scanned;
  feature branches are not blocked; mitigation: enforce PR-based workflow (no direct
  pushes to main)

---

## Alternatives Considered

| Option | Reason Rejected |
| ------ | --------------- |
| semgrep | Security-only; no code quality metrics; no quality gate blocking; not mandated by spec |
| CodeClimate | Not mentioned in spec; commercial only; higher cost |
| ESLint + TypeScript strict only | No security scanning; no cross-language support (Python AI services) |

---

## References

- `docs/00-specifications/30-testing-strategy.md` §30.10, §30.12 — SAST and code quality mandate
- `docs/00-specifications/30-testing-strategy.md` §30.3 — coverage thresholds (80% lines, 70% branches)

---

*Template source: `docs/01-architecture/adr/000-template.md`*
*Format: Based on Michael Nygard's ADR format*

---
title: 'Construction OS — Documentation Index'
version: '1.5.0'
status: Active
last_updated: '2026-05-29'
authors:
  - thitipongroo
related_docs:
  - specifications/README.md
  - architecture/README.md
---

# Construction OS — Documentation

> AI-native Construction Operating System — Multi-tenant SaaS for the Thai construction and real estate industry.

This folder contains the complete technical documentation for the Construction OS platform.
New team members should start with the **Quick Start** table below; on-call engineers go directly to `runbooks/`.

---

## Documentation Tree

All 14 sub-trees are listed. Nine of them were missing until 2026-08-24 — including `a11y/`,
`compliance/` and `security/` — so a reader who opened this index to find out what documentation
exists was told about five folders and not the other nine.

| Sub-tree                           | Contents                                                                                                                                                         | Entry point                                                   |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| [specifications/](specifications/) | Master architecture specification suite — documents covering business architecture, system design, API, security, AI, data, and go-to-market strategy            | [README](specifications/README.md)                            |
| [architecture/](architecture/)     | Architecture overview diagram, service interaction map, tenant isolation model, Architecture Decision Records (ADRs), and the per-phase technical design         | [README](architecture/README.md)                              |
| [manual/](manual/)                 | Developer manual — covering environment setup, tech stack, API reference, Kafka events, mobile app, CI/CD pipeline, and extension points                         | [README](manual/README.md)                                    |
| [runbooks/](runbooks/)             | Operational runbooks — covering deployment (ArgoCD), rollback, incident response, disaster recovery, Kafka rebalance, Keycloak backup/recovery, and AI readiness | [README](runbooks/README.md)                                  |
| [api/](api/)                       | OpenAPI 3.1 specifications — domain API contracts (auth, projects, procurement, finance, site operations, workforce, AI, and more)                               | [README](api/README.md)                                       |
| [screens/](screens/)               | Full-flow screenshots of the apps, one folder per platform (android, ios, web), each with its own screen index                                                   | [README](screens/README.md)                                   |
| [compliance/](compliance/)         | Control trackers and policies — PDPA (§5.3.1), ISO 27001, SOC 2, data residency, data and log retention, the data-flow map, and the Thai ETA signature briefing  | [pdpa-controls.md](compliance/pdpa-controls.md)               |
| [security/](security/)             | Applied security policies — CSP and CORS headers, secrets rotation, web token handling, the restricted SMS-OTP authenticator, and pentest findings               | [csp-policy.md](security/csp-policy.md)                       |
| [a11y/](a11y/)                     | Accessibility evidence — the WCAG 2.2 AA contrast audit of the §32.7 tokens, and the manual screen-reader checklist §20.8 makes a shipping gate                  | [contrast-report.md](a11y/contrast-report.md)                 |
| [i18n/](i18n/)                     | Thai-specific business rules and locale behaviour with no international equivalent, tracked against the `// i18n: TH-SPECIFIC` markers in source                 | [localization-gaps.md](i18n/localization-gaps.md)             |
| [feature-flags/](feature-flags/)   | The Unleash flag registry (QM-15, ADR-049) — naming, fallback defaults, server-side evaluation — and the backlog of flags due for removal                        | [registry.md](feature-flags/registry.md)                      |
| [slo/](slo/)                       | Grafana dashboard registry by UID per SLO (QM-14), which the QM-8 burn-rate alerts reference for annotations, plus the monthly SLO reviews                       | [dashboard-registry.md](slo/dashboard-registry.md)            |
| [ai-governance/](ai-governance/)   | Model cards — what a model is for, what it may not decide, and how it is evaluated. Written before the model exists, not after                                   | [model-cards/](ai-governance/model-cards/)                    |
| [research/](research/)             | Market and competitor research. **Not architecture** — nothing here overrides `specifications/`, and each document says so at the top                            | [competitive-landscape.md](research/competitive-landscape.md) |

---

## Quick Start by Role

| Role                       | Start here                                                                                                  |
| -------------------------- | ----------------------------------------------------------------------------------------------------------- |
| New engineer (first day)   | [specifications/README.md → Quick Start](specifications/README.md#-quick-start-for-new-team-members)        |
| Backend / API developer    | [manual/getting-started.md](manual/getting-started.md) → [manual/api-reference.md](manual/api-reference.md) |
| Architecture decisions     | [architecture/README.md](architecture/README.md)                                                            |
| Per-phase technical design | [architecture/technical-design/README.md](architecture/technical-design/README.md)                          |
| API consumer / integration | [api/README.md](api/README.md)                                                                              |
| On-call / operations       | [runbooks/README.md](runbooks/README.md)                                                                    |
| Product / strategy         | [specifications/README.md → Reading Order by Role](specifications/README.md#reading-order-by-role)          |

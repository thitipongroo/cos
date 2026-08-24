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

Every sub-tree is listed. Nine were missing from this table until 2026-08-24, so a reader who
opened the index to find out what documentation exists was told about five folders and not the
other nine.

**The folders below the first five are named after the KIND of document they hold, not the subject
it is about.** That changed on 2026-08-24 too. `compliance/` and `security/` each held two kinds at
once — binding policies next to status trackers — so "where is the retention rule" and "where is the
PDPA control status" both answered `compliance/`, and neither told you which of the two you were
about to open. Subject now lives in the filename, where it reads better anyway:
`policies/data-retention-policy.md`, `registers/pdpa-controls.md`.

The four kinds differ in what you may do with them. A **policy** binds — code that disagrees with
one is a defect. A **register** records what is true right now and goes stale, which is the point.
**Evidence** is a measurement that was taken, or the procedure that takes it. An **assessment** is
an analysis; some carry a decision, and the ones that do say so at the top.

| Sub-tree                           | Contents                                                                                                                                                                                                                                                         | Entry point                                                   |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| [specifications/](specifications/) | Master architecture specification suite — documents covering business architecture, system design, API, security, AI, data, and go-to-market strategy                                                                                                            | [README](specifications/README.md)                            |
| [architecture/](architecture/)     | Architecture overview diagram, service interaction map, tenant isolation model, Architecture Decision Records (ADRs), and the per-phase technical design                                                                                                         | [README](architecture/README.md)                              |
| [manual/](manual/)                 | Developer manual — covering environment setup, tech stack, API reference, Kafka events, mobile app, CI/CD pipeline, and extension points                                                                                                                         | [README](manual/README.md)                                    |
| [runbooks/](runbooks/)             | Operational runbooks — covering deployment (ArgoCD), rollback, incident response, disaster recovery, Kafka rebalance, Keycloak backup/recovery, and AI readiness                                                                                                 | [README](runbooks/README.md)                                  |
| [api/](api/)                       | OpenAPI 3.1 specifications — domain API contracts (auth, projects, procurement, finance, site operations, workforce, AI, and more)                                                                                                                               | [README](api/README.md)                                       |
| [policies/](policies/)             | What the system MUST satisfy — CSP and CORS headers, secrets rotation, data residency, data and log retention. A policy here is normative: code that disagrees with one is a defect                                                                              | [csp-policy.md](policies/csp-policy.md)                       |
| [registers/](registers/)           | The current state of something being tracked — PDPA / ISO 27001 / SOC 2 control status, the PDPA data-flow map and its processor DPA statuses, pentest findings, the feature-flag registry and its cleanup backlog, Grafana dashboards per SLO, Thai-locale gaps | [pdpa-controls.md](registers/pdpa-controls.md)                |
| [evidence/](evidence/)             | What was measured, and the procedures that produce it — the WCAG 2.2 AA contrast audit, the manual screen-reader pass §20.8 makes a shipping gate, model cards, SLO monthly reviews                                                                              | [contrast-report.md](evidence/contrast-report.md)             |
| [assessments/](assessments/)       | Written analysis — the Thai ETA signature briefing that hands counsel a narrow question, the restricted SMS-OTP risk assessment NIST SP 800-63B requires, and the accepted web token-handling design. Each answers "why we accept this, and who acts next"       | [data-flow-map.md](registers/data-flow-map.md)                |
| [screens/](screens/)               | Full-flow screenshots of the apps, one folder per platform (android, ios, web), each with its own screen index                                                                                                                                                   | [README](screens/README.md)                                   |
| [research/](research/)             | Market and competitor research. **Not architecture** — nothing here overrides `specifications/`, and each document says so at the top                                                                                                                            | [competitive-landscape.md](research/competitive-landscape.md) |

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

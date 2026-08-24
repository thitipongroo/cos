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

| Sub-tree                           | Contents                                                                                                                                                         | Entry point                        |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| [specifications/](specifications/) | Master architecture specification suite — documents covering business architecture, system design, API, security, AI, data, and go-to-market strategy            | [README](specifications/README.md) |
| [architecture/](architecture/)     | Architecture overview diagram, service interaction map, tenant isolation model, Architecture Decision Records (ADRs), and the per-phase technical design         | [README](architecture/README.md)   |
| [manual/](manual/)                 | Developer manual — covering environment setup, tech stack, API reference, Kafka events, mobile app, CI/CD pipeline, and extension points                         | [README](manual/README.md)         |
| [runbooks/](runbooks/)             | Operational runbooks — covering deployment (ArgoCD), rollback, incident response, disaster recovery, Kafka rebalance, Keycloak backup/recovery, and AI readiness | [README](runbooks/README.md)       |
| [api/](api/)                       | OpenAPI 3.1 specifications — domain API contracts (auth, projects, procurement, finance, site operations, workforce, AI, and more)                               | [README](api/README.md)            |

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

---
title: "Construction OS — Documentation Index"
version: "1.5.0"
status: Active
last_updated: "2026-05-29"
authors:
  - thitipongroo
related_docs:
  - 00-specifications/README.md
  - 01-architecture/README.md
---

# Construction OS — Documentation

> AI-native Construction Operating System — Multi-tenant SaaS for the Thai construction and real estate industry.

This folder contains the complete technical documentation for the Construction OS platform.
New team members should start with the **Quick Start** table below; on-call engineers go directly to `03-runbooks/`.

---

## Documentation Tree

| Sub-tree | Contents | Entry point |
| --- | --- | --- |
| [00-specifications/](00-specifications/) | Master architecture specification suite — documents covering business architecture, system design, API, security, AI, data, and go-to-market strategy | [README](00-specifications/README.md) |
| [01-architecture/](01-architecture/) | Architecture overview diagram, service interaction map, tenant isolation model, and Architecture Decision Records (ADRs) | [README](01-architecture/README.md) |
| [02-manual/](02-manual/) | Developer manual — covering environment setup, tech stack, API reference, Kafka events, mobile app, CI/CD pipeline, and extension points | [README](02-manual/README.md) |
| [03-runbooks/](03-runbooks/) | Operational runbooks —  covering deployment (ArgoCD), rollback, incident response, disaster recovery, Kafka rebalance, Keycloak backup/recovery, and AI readiness | [README](03-runbooks/README.md) |
| [api/](api/) | OpenAPI 3.1 specifications — domain API contracts (auth, projects, procurement, finance, site operations, workforce, AI, and more) | [README](api/README.md) |

---

## Quick Start by Role

| Role | Start here |
| --- | --- |
| New engineer (first day) | [00-specifications/README.md → Quick Start](00-specifications/README.md#-quick-start-for-new-team-members) |
| Backend / API developer | [02-manual/getting-started.md](02-manual/getting-started.md) → [02-manual/api-reference.md](02-manual/api-reference.md) |
| Architecture decisions | [01-architecture/README.md](01-architecture/README.md) |
| API consumer / integration | [api/README.md](api/README.md) |
| On-call / operations | [03-runbooks/README.md](03-runbooks/README.md) |
| Product / strategy | [00-specifications/README.md → Reading Order by Role](00-specifications/README.md#reading-order-by-role) |

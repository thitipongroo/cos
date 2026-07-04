---
title: 'Construction OS — Master Architecture Specification'
version: '1.32.0'
status: Active
last_updated: '2026-05-29'
authors:
  - thitipongroo
related_docs:
  - context.md
  - context/00_master_construction_os.md
---

# Construction And Real Estate Platform — END TO END Master Architecture

> **Status:** Active  
> **Scope:** Full platform architecture — All domains, All layers  
> **Audience:** Engineering, Product, Executive  
> **Last Updated:** 2026-05-29

---

## What Is This?

This is the master architecture specification suite for the **Construction Operating System (Construction OS)** — an
 AI-native, multi-tenant SaaS platform for the construction and real estate industry, built first for the Thai and
 Southeast Asian market.

These 35 documents cover everything from business architecture and data models to API contracts, security, AI layers,
 and go-to-market strategy. New team members should start with the [Reading Order](#reading-and-development-order) for
 their role. Developers building the MVP should read [03-system-design](03-system-design.md) and
 [21-mvp-scope](21-mvp-scope.md) first.

---

## 🚀 Quick Start for New Team Members

**Read in this order — takes approximately 2 hours:**

1. **[00-executive-overview](00-executive-overview.md)** (5 min) — What we're building and why
2. **[00-glossary](00-glossary.md)** (15 min) — Learn the terminology before reading anything else
3. **[03-system-design](03-system-design.md)** (10 min) — System topology at a glance
4. **[21-mvp-scope](21-mvp-scope.md)** (10 min) — What ships first; what is deferred
5. **Then read for your role** (see [Reading Order by Role](#reading-order-by-role) below)

> 💡 If you only have 30 minutes: read 00-executive-overview → 03-system-design → 21-mvp-scope.

---

## This document is the Construction OS master architecture specification

---

## Section Map

> **Naming note:** The Glossary and Executive Overview both use the `00-` filename prefix.
> The Glossary is a pre-numbered reference companion (read first); the Executive Overview is the
> first numbered document in the reading sequence. Both are listed in the 00-series below.
>
> **Versioning convention:** The `version` field in this README tracks the **specification suite** version.
> Individual spec files maintain their own `version` field tracking that file's content history.
> All files were initialised at `1.0.0`. Bump a file's individual version (→ `1.1.0`, `1.2.0`, etc.)
> when making substantive edits to that file — this enables engineers to track which spec version
> their implementation was written against. Record the change in the Changelog below.

| #   | Section                       | File                                                                    | Domain                                                                                                                                   | Status |
| --- | ----------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 00  | Glossary                      | [00-glossary](00-glossary.md)                                           | Terms, acronyms                                                                                                                          | Active |
| 00  | Executive Overview            | [00-executive-overview](00-executive-overview.md)                       | Vision & scope                                                                                                                           | Active |
| 01  | Business Architecture         | [01-business-architecture](01-business-architecture.md)                 | Business problems, domains, operating model                                                                                              | Active |
| 02  | System-wide Integration       | [02-system-wide-integration](02-system-wide-integration.md)             | End-to-end lifecycle, unified architecture                                                                                               | Active |
| 03  | System Design                 | [03-system-design](03-system-design.md)                                 | High-level architecture, service decomposition                                                                                           | Active |
| 04  | Tech Stack                    | [04-tech-stack](04-tech-stack.md)                                       | Frontend, backend, infra, observability, CI/CD                                                                                           | Active |
| 05  | Security & Compliance         | [05-security-compliance](05-security-compliance.md)                     | Security controls, compliance, STRIDE threat model (5.9), supply-chain SBOM/SLSA (5.10)                                                  | Active |
| 06  | RBAC Permission Matrix        | [06-rbac-permission-matrix](06-rbac-permission-matrix.md)               | Role definitions, module permissions, ABAC rules                                                                                         | Active |
| 07  | Multi-tenant Architecture     | [07-multi-tenant-architecture](07-multi-tenant-architecture.md)         | Isolation models, isolation layers                                                                                                       | Active |
| 08  | Enterprise Deployment         | [08-enterprise-deployment](08-enterprise-deployment.md)                 | Deployment options, enterprise requirements                                                                                              | Active |
| 09  | Data Architecture             | [09-data-architecture](09-data-architecture.md)                         | Data domains, storage, flow, reporting                                                                                                   | Active |
| 10  | Construction Ontology         | [10-construction-ontology](10-construction-ontology.md)                 | Object model, relationships, cardinality                                                                                                 | Active |
| 11  | Database Schema               | [11-database-schema](11-database-schema.md)                             | Core entities, schema principles                                                                                                         | Active |
| 12  | Construction Knowledge Graph  | [12-construction-knowledge-graph](12-construction-knowledge-graph.md)   | Graph nodes, relationships, use cases                                                                                                    | Active |
| 13  | Product Architecture          | [13-product-architecture](13-product-architecture.md)                   | Product layers, packaging                                                                                                                | Active |
| 14  | API Architecture              | [14-api-architecture](14-api-architecture.md)                           | API philosophy, gateway, versioning, endpoint patterns                                                                                   | Active |
| 15  | Event-driven Workflow         | [15-event-driven-workflow](15-event-driven-workflow.md)                 | Event model, workflows, approvals, infrastructure                                                                                        | Active |
| 16  | Enterprise Event Flow         | [16-enterprise-event-flow](16-enterprise-event-flow.md)                 | Enterprise event topology, cross-functional flows                                                                                        | Active |
| 17  | Offline-first Mobile Sync     | [17-offline-mobile-sync](17-offline-mobile-sync.md)                     | Offline architecture, sync engine, conflict resolution                                                                                   | Active |
| 18  | Enterprise SaaS Scaling       | [18-enterprise-saas-scaling](18-enterprise-saas-scaling.md)             | Scaling layers, maturity model                                                                                                           | Active |
| 19  | Notification Architecture     | [19-notification-architecture](19-notification-architecture.md)         | Channels, routing, escalation, preferences                                                                                               | Active |
| 20  | UX Flow                       | [20-ux-flow](20-ux-flow.md)                                             | UX philosophy, role-based flows, accessibility WCAG 2.2 AA (20.8)                                                                        | Active |
| 21  | MVP Scope                     | [21-mvp-scope](21-mvp-scope.md)                                         | MVP modules, KPIs, exclusions, CRM schema status                                                                                         | Active |
| 22  | AI Architecture               | [22-ai-architecture](22-ai-architecture.md)                             | AI layers, components, LLM strategy, AI security OWASP LLM Top 10 + model governance (22.8-22.9)                                         | Active |
| 23  | AI-native Operating Model     | [23-ai-native-operating-model](23-ai-native-operating-model.md)         | Human+AI collaboration, operational modes                                                                                                | Active |
| 24  | AI Training Pipeline          | [24-ai-training-pipeline](24-ai-training-pipeline.md)                   | Data sources, pipeline, RAG, MLOps                                                                                                       | Active |
| 25  | Go-to-market                  | [25-go-to-market](25-go-to-market.md)                                   | Entry strategy, wedge, expansion                                                                                                         | Active |
| 26  | Pricing Model                 | [26-pricing-model](26-pricing-model.md)                                 | SaaS tiers, revenue streams                                                                                                              | Active |
| 27  | Long-term Moat Strategy       | [27-long-term-moat](27-long-term-moat.md)                               | Data moat, workflow lock-in, ecosystem                                                                                                   | Active |
| 28  | Ecosystem Expansion           | [28-ecosystem-expansion](28-ecosystem-expansion.md)                     | Expansion phases, platform flywheel                                                                                                      | Active |
| 29  | Final Strategic Positioning   | [29-final-strategic-positioning](29-final-strategic-positioning.md)     | Competitive positioning, end-state vision                                                                                                | Active |
| 30  | Testing Strategy              | [30-testing-strategy](30-testing-strategy.md)                           | Test pyramid, CI/CD gates, quality gates                                                                                                 | Active |
| 31  | Monitoring & Observability    | [31-monitoring-observability](31-monitoring-observability.md)           | Metrics, logging, tracing, SLOs, alerting                                                                                                | Active |
| 32  | Implementation Specifications | [32-implementation-specifications](32-implementation-specifications.md) | Phase Dependency Graph, Deployable Units, Extension Points, Event Contracts, Financial Precision, Workflow State Machines, Design Tokens | Active |
| 33  | Digital Twin and IoT Layer    | [33-digital-twin-iot](33-digital-twin-iot.md)                           | Phase 24 spec — IoT integration, digital twins, carbon analytics, smart city                                                             | Active |

---

## Reading and Development Order

Files are numbered to match the recommended reading sequence for understanding the full architecture.
Reading 00 → 33 in order is the intended path for new team members.

Note : This is a **documentation reading order**, not a build sequence. Engineers building MVP
should read file [21](21-mvp-scope.md) (MVP Scope) immediately after [03](03-system-design.md)
(System Design) to understand which capabilities are in scope before reading platform details
in files 14–19.

**Phase 1 — Foundation** (00–08) : system topology, infrastructure decisions, security, permissions

[00](00-executive-overview.md) → [01](01-business-architecture.md) → [02](02-system-wide-integration.md) →
 [03](03-system-design.md) → [04](04-tech-stack.md) → [05](05-security-compliance.md) → [06](06-rbac-permission-matrix.md)
 → [07](07-multi-tenant-architecture.md) → [08](08-enterprise-deployment.md)

**Phase 2 — Data & Domain Model** (09–12) : what data exists, how it's stored, how it relates

[09](09-data-architecture.md) → [10](10-construction-ontology.md) → [11](11-database-schema.md) → [12](12-construction-knowledge-graph.md)

**Phase 3 — Platform Capabilities** (13–19) : APIs, events, offline, scaling, notifications

[13](13-product-architecture.md) → [14](14-api-architecture.md) → [15](15-event-driven-workflow.md)
 → [16](16-enterprise-event-flow.md) → [17](17-offline-mobile-sync.md) → [18](18-enterprise-saas-scaling.md) → [19](19-notification-architecture.md)

**Phase 4 — UX & Product Scope** (20–21) : who uses it, what ships in MVP

[20](20-ux-flow.md) → [21](21-mvp-scope.md)

**Phase 5 — AI** (22–24) : AI architecture, human collaboration model, training pipeline

[22](22-ai-architecture.md) → [23](23-ai-native-operating-model.md) → [24](24-ai-training-pipeline.md)

**Phase 6 — Business & GTM** (25–29) : go-to-market, pricing, long-term strategy

[25](25-go-to-market.md) → [26](26-pricing-model.md) → [27](27-long-term-moat.md) → [28](28-ecosystem-expansion.md) → [29](29-final-strategic-positioning.md)

---

## Reading Order by Role

**First-Time Readers:** [00](00-executive-overview.md) → [01](01-business-architecture.md) → [02](02-system-wide-integration.md)
 → [03](03-system-design.md) → [20](20-ux-flow.md)

> Vision and business context → full end-to-end lifecycle → system topology → who uses it.

**Engineering:** [03](03-system-design.md) → [21](21-mvp-scope.md) → [04](04-tech-stack.md) → [09](09-data-architecture.md)
 → [10](10-construction-ontology.md) → [11](11-database-schema.md) → [12](12-construction-knowledge-graph.md) → [07](07-multi-tenant-architecture.md)
 → [14](14-api-architecture.md) → [08](08-enterprise-deployment.md) → [05](05-security-compliance.md) → [06](06-rbac-permission-matrix.md)
 → [15](15-event-driven-workflow.md) → [16](16-enterprise-event-flow.md) → [17](17-offline-mobile-sync.md) → [19](19-notification-architecture.md)
 → [18](18-enterprise-saas-scaling.md)

**AI/ML:** [09](09-data-architecture.md) → [10](10-construction-ontology.md) → [22](22-ai-architecture.md) → [23](23-ai-native-operating-model.md)
 → [24](24-ai-training-pipeline.md) → [12](12-construction-knowledge-graph.md)

**Product/Strategy:** [01](01-business-architecture.md) → [13](13-product-architecture.md) → [20](20-ux-flow.md) → [21](21-mvp-scope.md)
 → [25](25-go-to-market.md) → [26](26-pricing-model.md) → [08](08-enterprise-deployment.md) → [27](27-long-term-moat.md)
 → [28](28-ecosystem-expansion.md) → [29](29-final-strategic-positioning.md)

---

## 📊 Document Status Dashboard

| Category                           | Files  | Active | Draft |
| ---------------------------------- | ------ | ------ | ----- |
| Pre-numbered (00-series)           | 2      | 2      | 0     |
| Foundation (01–08)                 | 8      | 8      | 0     |
| Data & Domain (09–12)              | 4      | 4      | 0     |
| Platform Capabilities (13–19)      | 7      | 7      | 0     |
| UX & Product Scope (20–21)         | 2      | 2      | 0     |
| AI (22–24)                         | 3      | 3      | 0     |
| Business & GTM (25–29)             | 5      | 5      | 0     |
| Operations (30–31)                 | 2      | 2      | 0     |
| Implementation Specifications (32) | 1      | 1      | 0     |
| Platform Expansion (33)            | 1      | 1      | 0     |
| **Total**                          | **35** | **35** | **0** |

Status Legend: **Active** = approved for implementation reference · **Review** = complete, pending
 team sign-off · **Draft** = in progress, not final

---

## Related Documents

| Document                     | Location                                                                           |
| ---------------------------- | ---------------------------------------------------------------------------------- |
| Docs Index                   | [docs/README.md](../README.md)                                                     |
| Agent Entry Point            | [context.md](../../context.md)                                                     |
| Agent Master Spec            | [context/00_master_construction_os.md](../../context/00_master_construction_os.md) |
| Architecture Overview & ADRs | [docs/architecture/README.md](../architecture/README.md)                           |

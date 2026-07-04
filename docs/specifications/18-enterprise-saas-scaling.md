---
title: 'Enterprise SaaS Scaling Model'
version: '1.3.0'
status: Active
last_updated: '2026-07-03'
authors:
  - thitipongroo
related_docs:
  - 07-multi-tenant-architecture.md
  - 08-enterprise-deployment.md
  - 28-ecosystem-expansion.md
---

# 18. Enterprise SaaS Scaling Model

## Table of Contents

- [18.1 Scaling Philosophy](#181-scaling-philosophy)
- [18.2 Scaling Layers](#182-scaling-layers)
- [18.3 Enterprise SaaS Maturity Model](#183-enterprise-saas-maturity-model)
- [18.4 Capacity Planning](#184-capacity-planning)

---

## 18.1 Scaling Philosophy

The system must scale across :

- users
- projects
- companies
- countries
- regulations
- workloads
- AI workloads

without architectural rewrite.

---

## 18.2 Scaling Layers

Layer 1 — Application Scaling :

- Stateless APIs
- Kubernetes autoscaling
- CDN edge caching
- Read replicas

Layer 2 — Data Scaling :

- Sharding
- Partitioning
- Multi-region replication
- Hot/cold storage

Layer 3 — Event Scaling :

- Kafka partitioning
- Consumer groups
- Stream replay
- Async processing

Layer 4 — AI Scaling :

- GPU inference pools
- Model routing
- Embedding pipelines
- Distributed vector search

---

## 18.3 Enterprise SaaS Maturity Model

| Stage   | Capability                                         |
| ------- | -------------------------------------------------- |
| Stage 1 | Multi-tenant MVP (shared DB + tenant_id isolation) |
| Stage 2 | Multi-project SaaS                                 |
| Stage 3 | Multi-company enterprise                           |
| Stage 4 | Cross-region deployment                            |
| Stage 5 | AI-native ecosystem platform                       |

Note : The Stage progression above corresponds to the Ecosystem Expansion phases defined
in 28-ecosystem-expansion section 28.2 — Stage 1 aligns with Phase 1 (Internal Operations),
Stage 2 with Phase 2 (External Collaboration), Stage 3 with Phase 3 (Marketplace Economy),
Stage 4 with Phase 4 (Financial Infrastructure), Stage 5 with Phase 5 (Smart Infrastructure
Layer). Both documents describe the same platform evolution from different viewpoints:
this file from a technical scaling lens; 28-ecosystem-expansion from a product and
business ecosystem lens.

---

## 18.4 Capacity Planning

Autoscaling (§18.2 Layer 1) absorbs short-term bursts; **capacity planning** governs the medium-term
trend so headroom exists before demand arrives. Reviewed in the quarterly FinOps review
([08-enterprise-deployment §8.10](08-enterprise-deployment.md)).

- **Demand model** — track leading indicators per tier: DAU, active projects, API req/s, Kafka
  events/s, AI tokens/day, storage GB/tenant; project the 3–6-month trend from actuals.
- **Headroom target** — provision so that steady-state peak stays ≤ 70% of capacity per layer, leaving
  autoscaling room before saturation; the SLO (latency/availability, [31-monitoring §31.6](31-monitoring-observability.md))
  is the pass/fail signal.
- **Scaling triggers** — each §18.2 layer has an explicit trigger metric (e.g. Kafka consumer lag
  > SLO → add partitions/consumers; DB CPU sustained > 70% → read replica / shard).
- **Load testing** — a representative load test must pass at target concurrency before promoting to
  the next Maturity Stage (§18.3); results recorded per stage.
- **Constraint (avoid premature scaling)** — no hyperscale optimization before **10k DAU**; capacity
  work is evidence-driven, not speculative.

Acceptance: [ ] demand dashboard with leading indicators exists · [ ] per-layer scaling triggers
documented · [ ] load test passes at target concurrency before each Stage promotion.

---

## References

| ID           | Title                                                              | Source                                                                                       |
| ------------ | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| [IEEE 830]   | IEEE Recommended Practice for Software Requirements Specifications | IEEE Std 830-1998                                                                            |
| [Kubernetes] | Kubernetes Documentation                                           | [kubernetes.io/docs/home](https://kubernetes.io/docs/home/)                                  |
| [Kong]       | Kong Gateway Documentation                                         | [docs.konghq.com](https://docs.konghq.com/)                                                  |
| [Redis]      | Redis Documentation                                                | [redis.io/docs](https://redis.io/docs/)                                                      |
| [AWS-EKS]    | Amazon Elastic Kubernetes Service Documentation                    | [docs.aws.amazon.com/eks](https://docs.aws.amazon.com/eks/latest/userguide/what-is-eks.html) |
| [SRE-Book]   | Site Reliability Engineering: How Google Runs Production Systems   | Beyer et al., O'Reilly 2016                                                                  |

> 📎 See also: [07-multi-tenant-architecture](07-multi-tenant-architecture.md) · [08-enterprise-deployment](08-enterprise-deployment.md) · [28-ecosystem-expansion](28-ecosystem-expansion.md)

---
title: 'Tech Stack Detail'
version: '1.2.0'
status: Active
last_updated: '2026-06-21'
authors:
  - thitipongroo
related_docs:
  - 03-system-design.md
  - 05-security-compliance.md
  - 07-multi-tenant-architecture.md
  - 08-enterprise-deployment.md
  - 09-data-architecture.md
---

# 4. Tech Stack Detail

## Table of Contents

- [4.1 Frontend](#41-frontend)
- [4.2 Backend](#42-backend)
- [4.3 Databases](#43-databases)
- [4.4 Infrastructure](#44-infrastructure)
- [4.5 Observability](#45-observability)
- [4.6 AI / MLOps](#46-ai--mlops)
- [4.7 Cloud](#47-cloud)
- [4.8 API Gateway](#48-api-gateway)
- [4.9 CI/CD](#49-cicd)

---

## 4.1 Frontend

Web :

- Next.js
- TypeScript
- Tailwind
- React Query
- Zustand

Mobile :

- React Native
- Expo
- WatermelonDB (SQLite-backed, offline-first)

---

## 4.2 Backend

Languages :

- Node.js (NestJS)
- Go (high-performance services)
- Python (AI/ML)

---

## 4.3 Databases

Storage:

- PostgreSQL
- TimescaleDB (time-series telemetry, PostgreSQL extension)
- Redis
- ClickHouse
- Neo4j
- OpenSearch
- S3-compatible storage
- Apache Iceberg (data lake format on S3)
- pgvector (vector embeddings — MVP)
- Weaviate (vector embeddings — at scale)

---

## 4.4 Infrastructure

Tools:

- Kubernetes
- Docker
- Terraform
- Apache Kafka
- Confluent Schema Registry (Kafka schema management — see `15-event-driven-workflow.md` §15.6)
- EMQX (self-hosted MQTT 5.0 broker for IoT telemetry; bridges to Kafka/MSK — RESOLVED, Phase 21
  Equipment Service onward; see `13-product-architecture.md` §13.5 and `33-digital-twin-iot.md` §33.8)
- NGINX
- Istio (service mesh — mTLS, traffic management)
- Temporal.io (workflow orchestration)
- Debezium (CDC — change data capture)
- Keycloak (identity provider — OAuth2/OIDC/SAML)
- HashiCorp Vault (secrets management — on-premise and hybrid deployments only)

> AWS Secrets Manager is used for AWS cloud deployments — see `05-security-compliance.md` section 5.2

---

## 4.5 Observability

Tools :

- Prometheus
- Grafana
- OpenTelemetry
- Loki
- Jaeger

---

## 4.6 AI / MLOps

Stack :

- MLflow
- Kubeflow
- Feast
- Airflow
- Weights & Biases

See 24-ai-training-pipeline section 24.4 for the full MLOps configuration and how each
tool is used in the training pipeline.

---

## 4.7 Cloud

Provider :

- AWS (primary cloud)
- Primary region: **ap-southeast-7 (Bangkok, Thailand)** — GLOB-001 (PDPA data; see `08-enterprise-deployment` §8.8)
- DR / secondary region: ap-southeast-1 (Singapore); EU tenants: eu-west-1 (Ireland) — see `05-security-compliance` §5.6

AWS Services :

- EKS — Kubernetes cluster
- RDS PostgreSQL — managed relational DB
- MSK — Managed Kafka (replaces self-hosted Kafka)
- S3 — object and data lake storage
- CloudFront — CDN
- ACM — SSL certificate management
- Secrets Manager — secrets and credentials (replaces self-hosted Vault for AWS deployments)
- ECR — container image registry

---

## 4.8 API Gateway

Tool :

- Kong Gateway (open-source, Kubernetes-native)

Responsibilities :

- JWT validation and tenant claim extraction
- Rate limiting per tenant and per API key
- Tenant-based routing to upstream services
- Request/response transformation
- API usage analytics
- Plugin ecosystem for extensibility (OAuth, caching, logging)

---

## 4.9 CI/CD

Tools :

- GitHub Actions — CI (lint, test, build, push image to ECR)
- ArgoCD — CD (GitOps-based deployment to EKS)

Pipeline :

- PR opened → GitHub Actions → unit tests + lint + type check + Docker build
- Merge to main → image tagged and pushed to ECR → ArgoCD detects and syncs to staging
- Promotion to production → manual approval gate in ArgoCD UI
- Rollback → ArgoCD GitOps revert (previous image tag)

---

## References

| ID              | Title                                                              | Source                                                                        |
| --------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| [IEEE 830]      | IEEE Recommended Practice for Software Requirements Specifications | IEEE Std 830-1998                                                             |
| [React Native]  | React Native / Expo Documentation                                  | [docs.expo.dev](https://docs.expo.dev/)                                       |
| [Next.js]       | Next.js Documentation                                              | [nextjs.org/docs](https://nextjs.org/docs/)                                   |
| [NestJS]        | NestJS — A progressive Node.js framework                           | [docs.nestjs.com](https://docs.nestjs.com/)                                   |
| [PostgreSQL]    | PostgreSQL Documentation                                           | [postgresql.org/docs](https://www.postgresql.org/docs/)                       |
| [TimescaleDB]   | TimescaleDB Documentation                                          | [docs.timescale.com](https://docs.timescale.com/)                             |
| [Redis]         | Redis Documentation                                                | [redis.io/docs](https://redis.io/docs/)                                       |
| [Kafka]         | Apache Kafka Documentation                                         | [kafka.apache.org/documentation](https://kafka.apache.org/documentation/)     |
| [Neo4j]         | Neo4j Graph Database Documentation                                 | [neo4j.com/docs](https://neo4j.com/docs/)                                     |
| [Keycloak]      | Keycloak Server Documentation                                      | [keycloak.org/documentation](https://www.keycloak.org/documentation)          |
| [Kong]          | Kong Gateway Documentation                                         | [docs.konghq.com](https://docs.konghq.com/)                                   |
| [Kubernetes]    | Kubernetes Documentation                                           | [kubernetes.io/docs/home](https://kubernetes.io/docs/home/)                   |
| [Helm]          | Helm Package Manager Documentation                                 | [helm.sh/docs](https://helm.sh/docs/)                                         |
| [ArgoCD]        | Argo CD Documentation                                              | [argo-cd.readthedocs.io](https://argo-cd.readthedocs.io/)                     |
| [OpenTelemetry] | OpenTelemetry Specification                                        | [opentelemetry.io/docs/specs/otel](https://opentelemetry.io/docs/specs/otel/) |
| [Prometheus]    | Prometheus Monitoring Documentation                                | [prometheus.io/docs](https://prometheus.io/docs/introduction/overview/)       |
| [Grafana]       | Grafana Observability Platform Documentation                       | [grafana.com/docs/grafana/latest](https://grafana.com/docs/grafana/latest/)   |

> 📎 See also: [03-system-design](03-system-design.md) · [05-security-compliance](05-security-compliance.md)
> · [07-multi-tenant-architecture](07-multi-tenant-architecture.md)
> · [08-enterprise-deployment](08-enterprise-deployment.md) · [09-data-architecture](09-data-architecture.md)

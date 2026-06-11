---
title: 'Enterprise Deployment Strategy'
version: '1.2.0'
status: Active
last_updated: '2026-05-25'
authors:
  - thitipongroo
related_docs:
  - 04-tech-stack.md
  - 05-security-compliance.md
  - 07-multi-tenant-architecture.md
  - 18-enterprise-saas-scaling.md
---

# 8. Enterprise Deployment Strategy

## Table of Contents

- [8.1 Deployment Options](#81-deployment-options)
- [8.2 Service Level Agreements (SLA)](#82-service-level-agreements-sla)
- [8.3 Enterprise Requirements](#83-enterprise-requirements)
- [8.4 Backup and Disaster Recovery](#84-backup-and-disaster-recovery)
- [8.5 On-premise Minimum Hardware Requirements](#85-on-premise-minimum-hardware-requirements)
- [8.6 Deployment Packaging](#86-deployment-packaging)

---

## 8.1 Deployment Options

### Shared SaaS — SMB

Multi-tenant cloud, shared database.

- Isolation: Shared DB + tenant_id (see 07-multi-tenant-architecture section 7.1)
- Infrastructure: AWS EKS (ap-southeast-1) managed by the platform operator
- Keycloak: shared realm, per-tenant isolation by tenant_id claim in JWT
- Suitable for: contractors with 1–5 concurrent projects, up to 50 users

### Shared SaaS — Mid-market

Multi-tenant cloud, shared database.

- Isolation: Shared DB + tenant_id (see 07-multi-tenant-architecture section 7.1)
- Infrastructure: AWS EKS (ap-southeast-1) managed by the platform operator
- Keycloak: shared realm, per-tenant isolation by tenant_id claim in JWT
- Suitable for: contractors with 5–20 concurrent projects, 50–500 users

### Dedicated Tenant

Isolated cloud infrastructure, single tenant per cluster.

- Isolation: Dedicated DB, dedicated Kafka namespace, dedicated Keycloak realm
- Infrastructure: dedicated AWS EKS namespace or separate cluster per tenant
- Suitable for: large contractors or developers requiring strict data isolation

### Hybrid

Core platform on cloud, sensitive data on-premise.

- Sensitive data (financial records, drawings, PII) hosted on-premise
- Operational services run on AWS
- Connectivity: site-to-site VPN or AWS Direct Connect
- Suitable for: government contractors with partial data residency requirements

### Fully On-premise

Entire platform deployed on customer infrastructure.

- No cloud dependency
- Customer manages all infrastructure
- Platform packaged as Helm charts for Kubernetes deployment
- Secrets management via HashiCorp Vault (see 04-tech-stack section 4.4)
- Suitable for: government agencies, large SOEs, clients with strict data sovereignty

---

## 8.2 Service Level Agreements (SLA)

Default SLA targets by deployment tier :

| Tier                     | Monthly Uptime                          | Planned Maintenance Window          | RTO     | RPO      |
| ------------------------ | --------------------------------------- | ----------------------------------- | ------- | -------- |
| Shared SaaS — SMB        | 99.5%                                   | Up to 4 hours/month, 48-hour notice | 4 hours | 24 hours |
| Shared SaaS — Mid-market | 99.9%                                   | Up to 2 hours/month, 72-hour notice | 2 hours | 4 hours  |
| Dedicated Tenant         | 99.95%                                  | Up to 1 hour/month, 7-day notice    | 1 hour  | 1 hour   |
| Enterprise / On-premise  | Negotiated per contract (target 99.95%) | Negotiated                          | 1 hour  | 1 hour   |

RTO = Recovery Time Objective (maximum time to restore service after an incident)
RPO = Recovery Point Objective (maximum acceptable data loss window)

SLA credits are applied per standard SaaS terms when targets are missed due to platform
operator fault. Critical safety notification delivery (see 19-notification-architecture
section 19.3) is excluded from planned maintenance windows — safety alerts must remain
deliverable at all times.

---

## 8.3 Enterprise Requirements

| Requirement       | Implementation                                                                                           |
| ----------------- | -------------------------------------------------------------------------------------------------------- |
| SSO / SAML        | Keycloak SAML broker — Azure AD, Google Workspace, Okta (see 05-security-compliance section 5.4)         |
| RBAC + ABAC       | Full permission matrix (see 06-rbac-permission-matrix)                                                   |
| Audit logs        | Immutable audit trail per tenant (see 05-security-compliance section 5.2)                                |
| Custom workflows  | Temporal.io durable workflows, configurable per tenant (see 15-event-driven-workflow)                    |
| Data residency    | ap-southeast-7 (Thailand) or ap-southeast-1 (Singapore); on-premise for full sovereignty                 |
| Compliance        | ISO 27001, SOC 2, PDPA, GDPR (see 05-security-compliance section 5.3)                                    |
| Encryption        | AES-256 at rest, TLS 1.3 in transit, per-tenant encryption keys (see 05-security-compliance section 5.2) |
| Dedicated support | Named Customer Success Manager + SLA-backed support ticket response times                                |

---

## 8.4 Backup and Disaster Recovery

### Cloud Deployment (AWS)

| Data Store               | Backup Method                                              | Frequency                       | Retention                                          |
| ------------------------ | ---------------------------------------------------------- | ------------------------------- | -------------------------------------------------- |
| PostgreSQL (RDS)         | Automated RDS snapshots + continuous WAL archival to S3    | Daily snapshot + continuous WAL | 30 days snapshots, 7 days WAL                      |
| S3 (files and data lake) | S3 versioning + cross-region replication (Enterprise tier) | Continuous versioning           | 10 years (Iceberg archive), 90 days (active files) |
| TimescaleDB              | Continuous archival to S3 Iceberg after 90-day hot window  | Continuous                      | 90 days hot, then cold archive                     |
| Redis                    | AOF persistence; cache rebuilt from DB on failure          | —                               | Cache-only                                         |
| ClickHouse               | Weekly full snapshot to S3                                 | Weekly                          | 30 days                                            |
| Neo4j                    | Weekly backup to S3                                        | Weekly                          | 30 days                                            |

Multi-region disaster recovery :

- Primary region: ap-southeast-1 (Singapore)
- Failover region: ap-southeast-7 (Thailand) or ap-east-1 (Hong Kong) — see 04-tech-stack section 4.7
- RDS Multi-AZ is enabled for all production PostgreSQL instances
- S3 cross-region replication is enabled for Enterprise and Dedicated Tenant tiers
- Failover is triggered manually by the platform operator after declaring an incident

### On-premise Deployment

- Customer is responsible for backup infrastructure
- Platform provides backup runbooks and scripts as part of the deployment package
- Recommended: daily PostgreSQL `pg_dump` + continuous WAL archival to off-site storage
- Recommended: S3-compatible backup target (MinIO or equivalent) mirrored to a secondary site
- DR testing: customer must conduct annual DR drills; platform provides DR test checklist

---

## 8.5 On-premise Minimum Hardware Requirements

For a production-grade single-site on-premise deployment supporting up to 200 concurrent
users and 20 active projects :

| Component.              | Minimum Specification                     | Notes                                 |
| ----------------------- | ----------------------------------------- | ------------------------------------- |
| Kubernetes worker nodes | 3 × 16 vCPU / 64 GB RAM / 500 GB NVMe SSD | HA cluster; 3-node minimum for quorum |
| PostgreSQL primary      | 8 vCPU / 32 GB RAM / 1 TB NVMe SSD        | Primary relational DB                 |
| PostgreSQL replica      | 8 vCPU / 32 GB RAM / 1 TB NVMe SSD        | Read replica for analytics queries    |
| Kafka brokers           | 3 × 8 vCPU / 16 GB RAM / 500 GB SSD       | 3-broker cluster required for HA      |
| Redis                   | 4 vCPU / 16 GB RAM / 100 GB SSD           | Cache and session store               |
| ClickHouse              | 8 vCPU / 32 GB RAM / 2 TB SSD             | OLAP analytics warehouse              |
| Neo4j                   | 8 vCPU / 16 GB RAM / 500 GB SSD           | Knowledge graph database              |
| Object storage          | 10 TB usable, expandable                  | S3-compatible: MinIO recommended      |
| Load balancer / ingress | 2 × 4 vCPU / 8 GB RAM (HA pair)           | NGINX                                 |

Network requirements :

- Internal cluster network: 10 Gbps (1 Gbps minimum)
- Internet uplink: 100 Mbps minimum (for LLM API calls and mobile app connectivity)
- Static IP address for NGINX ingress
- DNS entry pointing to the platform domain
- TLS certificate: enterprise CA or self-signed acceptable for on-premise

---

## 8.6 Deployment Packaging

On-premise and Dedicated Tenant deployments are packaged as Helm charts :

- One Helm chart per deployable unit (see 32-implementation-specifications section 32.2 for the full list of deployable units)
- Umbrella Helm chart for full-stack deployment
- `values.yaml` configures: deployment tier, resource limits, external service endpoints,
  tenant isolation model
- Secrets injected via HashiCorp Vault (see 04-tech-stack section 4.4)
- GitOps-compatible: ArgoCD can manage on-premise deployments (see 04-tech-stack section 4.9)

Upgrade procedure :

1. New version tagged in ECR (cloud) or delivered as container image package (on-premise)
2. Helm chart updated with new image tags in the GitOps repository
3. Database migrations run as Kubernetes Jobs before service rollout (pre-upgrade hook)
4. Rolling update applied by ArgoCD or manual `helm upgrade --atomic`
5. Rollback: `helm rollback <release> <revision>` or ArgoCD GitOps revert to previous image tag
6. Post-upgrade smoke tests run automatically as Kubernetes Jobs; alert on failure

---

## 8.7 WAF Requirements by Deployment Type

Web Application Firewall (WAF) requirements differ per deployment type. Kong Gateway
provides rate limiting for all deployments; WAF provides additional L7 protection.

| Deployment Type          | WAF Solution                                                                    | Rate Limiting                   | Notes                                     |
| ------------------------ | ------------------------------------------------------------------------------- | ------------------------------- | ----------------------------------------- |
| Shared SaaS — SMB        | **Cloudflare WAF** (mandatory)                                                  | Cloudflare + Kong               | See `05-security-compliance` §5.5         |
| Shared SaaS — Mid-market | **Cloudflare WAF** (mandatory)                                                  | Cloudflare + Kong               | See `05-security-compliance` §5.5         |
| Dedicated Tenant         | **Cloudflare WAF** (mandatory)                                                  | Cloudflare + Kong               | See `05-security-compliance` §5.5         |
| Hybrid                   | **Cloudflare WAF** for cloud components; customer WAF for on-premise components | Cloudflare (cloud) + Kong (all) | Both must meet minimum requirements below |
| Fully On-premise         | **Customer-provided WAF** (mandatory)                                           | Kong Gateway                    | Minimum requirements below                |

### On-premise WAF Minimum Requirements

For Fully On-premise and Hybrid (on-premise component) deployments, the customer-provided
WAF MUST meet the following minimum requirements:

| Requirement     | Minimum Standard                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------ |
| Rule coverage   | OWASP Core Rule Set (CRS) paranoia level 2 or equivalent                                               |
| Rate limiting   | Auth endpoints: 10 req/min per IP; General API: 100 req/min per user; File upload: 20 req/min per user |
| TLS termination | TLS 1.3 minimum (TLS 1.0, 1.1, 1.2 must be disabled)                                                   |
| OWASP Top 10    | Protection against injection, XSS, SSRF, security misconfiguration                                     |
| Logging         | WAF block/allow decisions must be logged and retained per `05-security-compliance` §5.3                |

Kong Gateway (deployed as part of the platform Helm chart) enforces rate limiting at the
API layer for all deployment types. On-premise WAF provides additional perimeter protection
at the network ingress level before traffic reaches Kong.

---

## 8.8 Cloud Deployment and Resilience Decisions

### Global Deployment Regions (GLOB-001)

**Decision:** AWS ap-southeast-7 (Bangkok) primary; ap-southeast-1 secondary; eu-west-1 for EU.
**Resolved:** 2026-06-10

| Region                         | Role              | Rationale                                                               |
| ------------------------------ | ----------------- | ----------------------------------------------------------------------- |
| AWS ap-southeast-7 (Bangkok)   | Primary           | PDPA-compliant; launched Jan 10, 2025; ~10% cheaper than ap-southeast-1 |
| AWS ap-southeast-1 (Singapore) | Secondary / DR    | Established; PDPA SG; cross-region replication target                   |
| AWS eu-west-1 (Ireland)        | EU data residency | GDPR compliance for European tenants                                    |

**Thailand residency benefit (2026):** AWS ap-southeast-7 provides PDPA data residency
within Thailand — required for government and regulated-industry tenants.
Cross-region replication: ap-southeast-7 ↔ ap-southeast-1 active-passive failover.

---

### Geopolitical Risk Handling (GLOB-005)

**Decision:** Active-passive multi-region with data egress controls and regional kill switch.
**Resolved:** 2026-06-10

- **Active-passive failover:** Primary region active; secondary receives continuous replication;
  failover is manually triggered by platform operator after declaring an incident
- **Data egress controls:** Per-region data export controls configurable per tenant; Enterprise
  tenants can restrict data to a single region via DPA configuration
- **Regional kill switch:** Platform operator can isolate a region (block egress, stop
  replication) within 4 hours of incident declaration
- **Geopolitical risk registry:** Maintained in `docs/security/geopolitical-risk-registry.md`;
  reviewed quarterly; triggers deployment change if risk level rises to HIGH

---

### Planetary Resilience Scope (STEW-004)

**Decision:** Climate-resilient infrastructure — IPCC AR7 scenarios; 2150 planning horizon.
**Resolved:** 2026-06-10

- **Climate scenarios:** IPCC AR7 (2026) — SSP1-2.6 (optimistic), SSP2-4.5 (middle),
  SSP3-7.0 (pessimistic); SSP5-8.5 scenario retired per IPCC AR7 guidance
- **Planning horizon:** Extended to 2150 for infrastructure assets with multi-decade lifespans
- **Carbon accounting:** Per-project carbon footprint via CarbonRecord (§33-digital-twin §33.4)
- **Net-zero pathway:** Tenant-level net-zero pathway modelling — Phase 5 premium module
- **DR climate risk:** Data centre selection considers 2050 flood risk and temperature
  projections; AWS ap-southeast-7 (Bangkok) has published climate resilience roadmap to 2040

---

## 8.9 Container Build Specification

### Dockerfile standard (Phase 17)

Every deployable service listed in `32-implementation-specifications` §32.2 requires a
Dockerfile that meets all of the following:

- **Multi-stage build** — dependency installation is separated from the final runtime image
- **Non-root user** — final stage runs as `cosuser` (UID 1001, GID 1001)
- **HEALTHCHECK** — every Dockerfile must include a `HEALTHCHECK` instruction

| Service             | Dockerfile path                           | Build pattern                                               |
| ------------------- | ----------------------------------------- | ----------------------------------------------------------- |
| Main Application    | `backend/Dockerfile`                      | Node.js: `base → deps → builder → runner`                   |
| File Service        | `services/file-service/Dockerfile`        | Node.js: `builder → runner`                                 |
| AI Gateway          | `services/ai-gateway/Dockerfile`          | Python: builder installs venv; runner copies venv only      |
| AI Embedding Worker | `services/ai-embedding-worker/Dockerfile` | Python: builder installs venv; runner copies venv only      |
| AI OCR Pipeline     | `services/ai-ocr-pipeline/Dockerfile`     | Python: builder installs venv; runner copies venv only      |
| Analytics Worker    | `services/analytics-worker/Dockerfile`    | Go: builder compiles binary; alpine runner                  |
| KG Ingestion Worker | `services/kg-ingestion-worker/Dockerfile` | Go: builder compiles binary; alpine runner                  |
| Web App             | `apps/web/Dockerfile`                     | Next.js: `deps → builder → runner` (see note below)         |

Mobile (`apps/mobile/`) uses **Expo EAS Build** — no Dockerfile is required or permitted.

**Python multi-stage pattern:**

```dockerfile
FROM python:3.12-slim AS builder
RUN python -m venv /venv
COPY requirements.txt .
RUN /venv/bin/pip install --no-cache-dir -r requirements.txt

FROM python:3.12-slim AS runner
RUN useradd --system --uid 1001 cosuser
COPY --from=builder /venv /venv
COPY . .
USER cosuser
ENV PATH="/venv/bin:$PATH"
```

**Next.js requirement:** `next.config.js` must set `output: 'standalone'` so Next.js emits a
self-contained build that can be copied into the runner stage without `node_modules`.

### Helm chart per deployable service (Phase 17)

All services listed in §32.2 except Mobile require a Helm chart at
`infrastructure/helm/cos-{service}/`. Each chart must include:

`Chart.yaml` · `values.yaml` · `values-dev.yaml` · `values-staging.yaml` · `values-prod.yaml`
· `templates/_helpers.tpl` · `templates/deployment.yaml` · `templates/hpa.yaml`
· `templates/pdb.yaml` · `templates/service.yaml` · `templates/serviceaccount.yaml`

| Service             | Helm chart path                                |
| ------------------- | ---------------------------------------------- |
| Main Application    | `infrastructure/helm/cos-backend/`             |
| File Service        | `infrastructure/helm/cos-file-service/`        |
| AI Gateway          | `infrastructure/helm/cos-ai-gateway/`          |
| AI Embedding Worker | `infrastructure/helm/cos-ai-embedding-worker/` |
| AI OCR Pipeline     | `infrastructure/helm/cos-ai-ocr-pipeline/`     |
| Analytics Worker    | `infrastructure/helm/cos-analytics-worker/`    |
| KG Ingestion Worker | `infrastructure/helm/cos-kg-ingestion-worker/` |
| Web App             | `infrastructure/helm/cos-web/`                 |

### CI Docker build matrix (Phase 17)

GitHub Actions step 4 ("build Docker images") must build **all** deployable services in
parallel using a matrix strategy. The following services must appear in the matrix:

```yaml
matrix:
  service:
    - backend
    - services/file-service
    - services/ai-gateway
    - services/analytics-worker
    - services/kg-ingestion-worker
    - services/ai-embedding-worker
    - services/ai-ocr-pipeline
    - apps/web
```

- **Trivy security scan** (step 5) must run against every image built in the matrix — not
  only the backend image.
- **ECR push** (step 6) must push all service images — not only the backend image.
- **GitOps image tag update** (step 7) must commit the new image tag to the Helm
  `values-prod.yaml` (or equivalent) for each service and push to the GitOps repository
  to trigger ArgoCD sync; an `echo` statement is not sufficient.

---

## References

| ID           | Title                                               | Source                                                                                                       |
| ------------ | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| [IEEE 830]   | IEEE Recommended Practice for Software Requirements | IEEE Std 830-1998                                                                                            |
| [Kubernetes] | Kubernetes Documentation                            | [kubernetes.io/docs/home](https://kubernetes.io/docs/home/)                                                  |
| [Helm]       | Helm Package Manager Documentation                  | [helm.sh/docs](https://helm.sh/docs/)                                                                        |
| [ArgoCD]     | Argo CD GitOps Documentation                        | [argo-cd.readthedocs.io](https://argo-cd.readthedocs.io/)                                                    |
| [AWS-EKS]    | Amazon Elastic Kubernetes Service Documentation     | [docs.aws.amazon.com/eks](https://docs.aws.amazon.com/eks/latest/userguide/what-is-eks.html)                 |
| [AWS-RDS]    | Amazon RDS for PostgreSQL Documentation             | [docs.aws.amazon.com/AmazonRDS](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_PostgreSQL.html) |
| [SOC2]       | SOC 2 Type II Trust Service Criteria                | AICPA TSC 2017                                                                                               |
| [ISO27001]   | Information Security Management Systems             | ISO/IEC 27001:2022                                                                                           |

> 📎 See also: [04-tech-stack](04-tech-stack.md) · [05-security-compliance](05-security-compliance.md) · [07-multi-tenant-architecture](07-multi-tenant-architecture.md) · [18-enterprise-saas-scaling](18-enterprise-saas-scaling.md)

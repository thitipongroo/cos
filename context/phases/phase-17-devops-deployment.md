# Phase 17 — Devops + Deployment

> Moved out of `context/00_master_construction_os.md` on 2026-09-02, verbatim.
> That file keeps the index row pointing here; `.claude/skills/phase-index/SKILL.md`
> is the map. Depends on Phase 1, 15, 16 · SaaS Maturity Stage 4.
>
> Rule 36 applies at the end of this phase and Rule 38 before it starts.

```text
Build production deployment pipeline.

Cloud Provider Decision:
  Primary: AWS (EKS + RDS + ElastiCache + MSK + S3) — this is the authoritative default
    GCP and on-premises are supported deployment targets but agents implement AWS first
  Agent must implement AWS as DEFAULT; no EP needed — decision made.
  Note to agent: mark all cloud-specific resources with comment: # CLOUD: AWS

Kubernetes Cluster Specification (production):
  Control plane: cloud = managed (EKS); on-premise = self-managed — RKE2 with profile:cis for ALL production on-prem clusters (dev: k3s) — ADR-039 REVISED 2026-07-20, supersedes the old k3s-default/RKE2-for-regulated tiering. Reason: COS has real CIS/FIPS customers so RKE2 is required anyway, and k3s cannot produce a CIS self-assessment at all. Host OS = Ubuntu 24.04 + community RKE2 build (PO: no RHEL/SLES procurement) — this is OUTSIDE both FIPS certificates' tested operating environments, so FIPS status is user-ported: say "uses the FIPS 140-3 validated BoringCrypto module (CMVP #4735) on a user-ported OE", NEVER "FIPS 140-3 validated".
    Linux POC 2026-07-20: BOTH VALIDATED. k3s — air-gap, etcd restore RTO 90s, full HA drill. RKE2 profile:cis — air-gap, etcd restore RTO 277s, full 3-node failover drill, FIPS BoringCrypto in the stock binary (no special build), and real helm install running 1/1. Two chart blockers found+fixed: (1) profile:cis enforces PodSecurity restricted but the charts had no seccompProfile, so Pods were rejected while Deployments were admitted (silent failure) — all 8 now set seccompProfile.type=RuntimeDefault, DO NOT REMOVE; (2) four charts probed a health path the service does not serve (/health or /healthz vs the real /health/live) and would CrashLoop in production — only a real deploy catches this, lint and dry-run do not. cos-file-service and cos-web probes remain UNVERIFIED. CIS caveat: k3s has no profile:cis switch and runs the apiserver in-process, so kube-bench cannot read its config and reports false negatives — hardening k3s changed the score by zero checks. Use RKE2 where an auditable CIS self-assessment is required. Pin K8s <= 1.34 while CIS is required (kube-bench cis-1.12 covers 1.32-1.34 only).
  Node groups:
    system-pool:    2x nodes, t3.medium (control plane components)
    app-pool:       min 3, max 10 nodes, t3.xlarge (application services)
    ai-pool:        min 1, max 4 nodes, t3.2xlarge (AI workers — GPU optional)
    analytics-pool: min 1, max 3 nodes, r5.xlarge (ClickHouse — memory optimized)
      NOT BUILT, deliberately (2026-08-29, product-owner). The other three pools were created in
      Terraform that day — until then there was ONE undifferentiated node group on t3.large, an
      instance type that appears in none of the four above, with a single min/max shared by
      everything, and nothing tested it.
      This pool was left out because it has no workload: ClickHouse has no Kubernetes deployment
      anywhere in the repository — no Helm chart, no manifest, nothing in Terraform (only the
      docker-compose config under infrastructure/clickhouse/). An r5.xlarge that nothing can be
      scheduled onto is a bill with no service behind it. Build it in the same change that gives
      ClickHouse a chart, not before.
      The three that were built carry `workload=<pool>` node labels; the ai pool is additionally
      TAINTED workload=ai:NoSchedule, and the four AI charts carry the matching toleration plus a
      REQUIRED nodeAffinity. Required rather than preferred on purpose: a preferred rule falls back
      to any node the moment the pool is full, and an AI service running on a t3.xlarge behaves —
      just slowly — with nothing to report it.
      Pinned by tests/conformance/devops/.
  Auto-scaling: Cluster Autoscaler (scale up: 2 min, scale down: 10 min cooldown)
  Resource requests/limits per NestJS service (default):
    requests: cpu 100m, memory 256Mi
    limits:   cpu 500m, memory 512Mi
  Resource requests/limits per FastAPI service (AI):
    requests: cpu 500m, memory 1Gi
    limits:   cpu 2000m, memory 2Gi
  Resource requests/limits per Go worker:
    requests: cpu 200m, memory 128Mi
    limits:   cpu 1000m, memory 256Mi

Environments:
  local:    Docker Compose (all services + dependencies on single machine)
  dev:      Kubernetes single-node k3s (k3d for macOS/Windows laptops) — auto-deployed on PR merge to dev
            (standardised on k3s for dev/prod parity; minikube removed — product-owner decision 2026-06-30)
  staging:  Kubernetes multi-node — mirrors production spec at 50% size
  production: Kubernetes multi-node — full spec above

Secret Management: conditional per deployment type (spec §5.2)
  Cloud (AWS EKS):   AWS Secrets Manager + External Secrets Operator (ESO)
  On-premise/hybrid: HashiCorp Vault 1.16+ (Vault Agent sidecar injector)
  Git secrets:       sealed-secrets (kubeseal) — works across all deployment types
  All secrets:       committed to git as SealedSecret (encrypted) — never plain Secret
  Rotation:          cloud → AWS SM automated rotation; on-prem → Vault DB engine (see SecretRotation decision in Phase 17)
  Secret categories:
    DATABASE_URL: per service, per environment
    REDIS_URL: shared across services
    KAFKA_BROKERS: shared
    OPENAI_API_KEY: AI services only
    KEYCLOAK_CLIENT_SECRET: Identity Service
    MINIO_ACCESS_KEY + MINIO_SECRET_KEY: File Service
    NEO4J_PASSWORD: KG worker
    CLICKHOUSE_PASSWORD: Analytics service

Deployment Strategy:
  Method: Rolling deployment (default)
  Max surge: 1 pod
  Max unavailable: 0 pods (zero-downtime rolling)
  Rollback: automatic on health check failure (liveness probe 3 consecutive fails)
  Canary: Argo Rollouts (open-source Kubernetes progressive delivery) — no EP needed; decision made
  Production deployment window registry: docs/runbooks/deployment-windows.md
    (production deployments execute only within approved windows;
    emergency hotfixes exempt with product owner approval on record — source: spec §8.2)

CI/CD Pipeline (ArgoCD GitOps):

  GitHub Actions — CI ONLY (no kubectl, no helm upgrade):
    on: push to any branch
    Steps:
      1. lint (ESLint, Prettier)
      2. type-check (tsc --noEmit)
      3. build (turbo run build — all packages/services; runs on EVERY PR; tsc --noEmit is
         NOT a build, so this gate catches nest/next build + emit failures pre-merge; ADR-033)
      4. unit-tests (all services in parallel; 100% line + 100% branch coverage, QM-1).
         Temporal *.workflow.spec.ts run as a SERIAL step (pnpm test:workflows) — see the
         Phase 18 Temporal workflow test pattern; spec §30.12
      5. integration-tests (Testcontainers — backend pnpm test:integration, --runInBand; spec §30.4)
      6. isolation-tests (multi-tenant — cross-tenant query must return zero rows; spec §30.6)
      7. contract-tests (Pact consumer-driven; spec §30.8)
      8. dependency-audit (pnpm audit + pip-audit + govulncheck — blocks on High/Critical)
      9. build Docker images (parallel per service; main/staging branches only)
      10. Trivy security scan (per image)
      11. push to ECR (on main/staging/production branch only)
      12. update image tag in GitOps repo (commit new tag → triggers ArgoCD sync)
      13. smoke tests + E2E tests (post-deploy, staging only — ArgoCD PostSync wave 1: smoke
         health/auth/core-read < 30s; Playwright wave 2: critical user journeys)
      14. load tests (weekly scheduled, staging only — k6; spec §30.9; NOT per-deploy)

  ArgoCD — CD (GitOps, self-healing):
    - Monitors GitOps repo for image tag changes
    - Syncs cluster state to match git (auto-sync on staging, manual gate on production)
    - Self-healing: reverts manual kubectl changes within sync interval (default 3 min)
    - Rollback: argocd app rollback <app> <revision> (instant — no pipeline re-run needed)
    - Production promotion: manual sync gate in ArgoCD UI

Testing Tool: k6 (for load testing — see Phase 18)

Data Scaling Strategy (source §24.2):
  Hot storage (active data — < 90 days):
    PostgreSQL: primary RDS instance (multi-AZ) — all current project data
    Redis: session cache, real-time event state, leaderboards
    ClickHouse: recent analytics (90-day rolling window, fast query)
    TimescaleDB: recent telemetry (equipment + workforce — 90-day retention)

  Cold storage (historical data — > 90 days):
    PostgreSQL: automated archival → S3 in Apache Iceberg format via Debezium CDC → Kafka Connect S3 Sink (source: spec §9.4 Path 2; replaces "S3 Parquet via pg_partman" which conflicted with spec)
    ClickHouse: tiered storage — local NVMe for hot, S3-backed for cold (ClickHouse S3 integration); fed from Iceberg data lake via ClickHouse S3 import
    TimescaleDB: chunk compression after 30 days, chunk move to S3 after 90 days (to Iceberg layer)
    Raw files (photos, PDFs): MinIO lifecycle policy → S3 Glacier after 1 year

  Partition strategy:
    PostgreSQL: partition large tables by tenant_id + month
      (e.g. site_reports, cost_transactions, audit_logs — all high-volume tables)
    ClickHouse: partition by tenant_id + toYYYYMM(date)
    TimescaleDB: hypertable chunk interval = 1 day (equipment), 1 week (workforce)

  Multi-region replication:
    DECIDED: active-passive; primary ap-southeast-7 (Bangkok, Thailand) — GLOB-001 spec §8.8; DR ap-southeast-1 (Singapore); DR region via Terraform multi-region module; Route 53 latency routing; trigger: first tenant with data residency requirement
    Active-passive: primary ap-southeast-7 (Bangkok), DR ap-southeast-1 (Singapore)
    Data residency: EU tenants → eu-west-1, Thai PDPA → ap-southeast-7 (Bangkok)

- Terraform modules (AWS EKS, RDS, ElastiCache, MSK, S3 — default to AWS)

  with clear comments: # CLOUD: AWS — replace with GCP/on-prem equivalent

- Helm charts for all services (values-dev, values-staging, values-prod)
- GitHub Actions workflow files (all steps above)
- Dockerfile per service (multi-stage builds, non-root user)
  Exception: apps/mobile/ — uses Expo EAS Build; no Dockerfile required or permitted
  (source: docs/specifications/08-enterprise-deployment.md — Dockerfile table line "Mobile")
- Kubernetes HPA (Horizontal Pod Autoscaler) per service
- Kubernetes PodDisruptionBudget per service (minAvailable: 1)
- PgBouncer Kubernetes manifests: Deployment (transaction mode) + Service + ConfigMap +
  PodDisruptionBudget (minAvailable: 1) in infrastructure/kubernetes/pgbouncer/ (QM-18; spec §7.9)
  Config baseline: default_pool_size=25, max_client_conn=1000, server_idle_timeout=600
  pool_mode=transaction (REQUIRED; session mode and statement mode are PROHIBITED)
  Application DATABASE_URL must resolve to PgBouncer service, never to PostgreSQL port 5432
- sealed-secrets SealedSecret examples for all secret types
- Cluster Autoscaler manifests
- Resource quota per namespace
- Rollback script (helm rollback on failure)

Decisions in Phase 17 (documented in spec):

  SecretRotation:
    DECIDED: cloud → AWS SM automated rotation Lambda (per resource type);
    on-prem → Vault database secrets engine (dynamic secrets, TTL 24h)
    Interface: N/A — AWS SM rotation config (cloud) / Vault lease policy (on-prem)
    PostgreSQL: max_ttl 24h; JWT signing keys: rotation via JWKS endpoint (zero-downtime)

  MultiRegionDeploy:
    DECIDED: active-passive; primary ap-southeast-7 (Bangkok, Thailand) — GLOB-001 spec §8.8; DR ap-southeast-1 (Singapore); Terraform multi-region module;
    Route 53 latency routing; trigger: first tenant with data residency requirement
    Active-passive: primary ap-southeast-7 (Bangkok), DR ap-southeast-1 (Singapore) via Terraform module
    Active-active: NOT planned (requires CockroachDB or Aurora Global)
    Data residency routing: tenant metadata → region assignment → connection routing

Constraints:

- Before marking Phase 17 complete: read every Generate item above line by line,
  run ls/grep to verify each exists on disk, show output — Rule 36
  Cross-reference: docs/specifications/08-enterprise-deployment.md (Dockerfile table + mobile Expo EAS note)

```

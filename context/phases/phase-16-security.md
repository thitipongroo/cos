# Phase 16 — Security

> Moved out of `context/00_master_construction_os.md` on 2026-09-02, verbatim.
> That file keeps the index row pointing here; `.claude/skills/phase-index/SKILL.md`
> is the map. Depends on Phase 2, 15 · SaaS Maturity Stage —.
>
> Rule 36 applies at the end of this phase and Rule 38 before it starts.

```text
Implement enterprise security controls.

Compliance Targets (source §13.3):
  ISO 27001  — Information security management system (target: certification within 24 months)
  SOC 2 Type II — Trust service criteria: security, availability, confidentiality (target: 18 months)
  PDPA      — Thai Personal Data Protection Act (mandatory for Thai market)
  GDPR      — EU General Data Protection Regulation (mandatory for EU tenant data)
  Construction safety regulations — local jurisdiction per deployment region

  Note: compliance audit workflow (Temporal) covers SOC 2 Type II + ISO 27001 + PDPA; see spec §05-security-compliance §5.3.1
    ComplianceAuditWorkflow (Phase 16)
    Trigger: 6 months before target certification date
    Stub: follow §32.9 Integration Stub Pattern (Type A — fail-fast)

  Compliance documentation (must exist before Phase 16 sign-off):
    docs/registers/soc2-controls.md     — SOC 2 Type II control tracking (required before Stage 2→3)
    docs/registers/data-flow-map.md     — PDPA/GDPR personal data flow map (reviewed before each
                                           new feature that processes PII; required before Stage 1→2)
    docs/policies/data-retention-policy.md — retention period per entity type (reviewed annually)

Security Requirements:
  Encryption algorithm: AES-256 minimum for all at-rest data encryption — custom field-level
    or file encryption outside AWS infrastructure MUST use AES-256 or stronger (source: spec §5.2)
  SSE-KMS with customer-managed key (CMK) for all cloud storage (source: spec §5.2.1):
    - S3 buckets + RDS/Aurora → CMK (customer-managed); ElastiCache → AWS-managed key (at_rest_encryption_enabled)
    - One CMK per storage-type per env; alias convention `cos/{env}/rds`, `cos/{env}/s3`, `cos/{env}/elasticache`
    - Annual automatic KMS rotation; key policy grants use to the app service role + SYSTEM_ADMIN only
    - CMK definitions as Terraform IaC (infrastructure/terraform/aws/kms.tf); on-prem = Vault Transit envelope encryption
  TLS: TLS 1.3 minimum on all ingress (Kubernetes Ingress + cert-manager)
  RBAC: enforced via Phase 2 Keycloak + @cos/rbac guards (all services)
  Audit logging: all write operations logged to audit_logs (Phase 2 schema)
  Immutable logging: audit_logs table: no UPDATE or DELETE via application
    (PostgreSQL RLS policy: DENY UPDATE/DELETE on audit_logs for app role)
  Rate limiting: NestJS throttler guard (configurable per endpoint)
    Default limits: 100 req/min per user per endpoint
    Auth endpoints: 10 req/min per IP (brute force protection)
  Secret management: Kubernetes Secrets + sealed-secrets (kubeseal)
    No plaintext secrets in code, ConfigMaps, or environment files
  Tenant isolation: resolved during JWT auth (KeycloakJwtStrategy.validate → JwtAuthGuard publishes to CLS; TenantContextInterceptor secondary), not a pre-auth middleware (ADR-031)
    Cross-tenant data access: IMPOSSIBLE via API layer
    PostgreSQL RLS: PRIMARY enforcement on all domain schema tables (mandatory from MVP, spec §7.7)
      Purpose: prevents cross-tenant data access at DB level — enforced even if application layer is bypassed
      Enforced via the non-superuser app_user role (connecting as owner/superuser cos bypasses RLS) — ADR-031
      Policy: USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid)
      Note: RLS is PRIMARY isolation. Application-layer WHERE tenant_id = $1 is SECONDARY defense-in-depth.

WAF:
  Solution: Cloudflare WAF — CLOUD DEPLOYMENTS ONLY (Shared SaaS, Dedicated Tenant)
    Source: spec §05-security-compliance §5.5 + §08-enterprise-deployment §8.7
    On-premise: Cloudflare WAF is NOT applicable — Kong Gateway handles rate limiting;
      customer MUST provide their own WAF (OWASP CRS paranoia level 2 minimum)
      See: spec §08-enterprise-deployment §8.7 for full on-premise WAF requirements
  Architecture (cloud only): Internet → Cloudflare Edge → AWS ALB → EKS Ingress → NestJS
  Plan: Cloudflare Pro minimum (Enterprise for large tenants)
  CloudflareWAFIntegration (Phase 16)

  Enabled rule sets:
    - Cloudflare Managed Ruleset (OWASP Top 10, known CVEs)
    - OWASP Core Rule Set (CRS) paranoia level 2
    - Custom: Construction OS rules (API path patterns, tenant header validation)

  Rate limits (spec §05 §5.5):
    Note: API path convention is /api/v1/ — backend setGlobalPrefix('api/v1') confirmed (source: main.ts)
    Auth endpoints (/api/v*/auth/*):   10 req/min per IP — block 429
    General API  (/api/v*/):          100 req/min per user — block 429
    File upload  (/api/v*/files/*):    20 req/min per user — block 429 (spec §05 §5.5)
    Health/metrics:                    60 req/min per IP — block 429

  Origin protection (MANDATORY):
    AWS ALB security group MUST restrict port 443 inbound to Cloudflare IP ranges only
    Cloudflare IPs: https://api.cloudflare.com/client/v4/ips (fetch at deploy time)
    Terraform: infrastructure/terraform/cloudflare/
    Kubernetes: infrastructure/kubernetes/security/cloudflare-origin-protection.yaml

  Application integration (MANDATORY in every NestJS service):
    - Trust CF-Connecting-IP header as real client IP (NOT X-Forwarded-For)
    - Validate CF-Ray header present on every request (confirms WAF was traversed)
    - Log CF-Ray in structured logs for end-to-end tracing
    Middleware: backend/src/shared/middleware/cloudflare-waf.middleware.ts

  IaC: infrastructure/terraform/cloudflare/ (main.tf, waf.tf, variables.tf, outputs.tf)

Secure Headers (all HTTP responses):
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Content-Security-Policy: default-src 'self' (adjust per frontend needs;
    policy definition: docs/policies/csp-policy.md — no unsafe-inline/unsafe-eval; report-only in staging)
  Referrer-Policy: strict-origin-when-cross-origin

Input Security:
  All API inputs: validated via class-validator (NestJS) or Pydantic (FastAPI)
  SQL injection: impossible via Prisma parameterized queries
  File uploads: MIME type validation + extension whitelist (Phase 9)

Generate:

- PostgreSQL RLS policies for all tables (migration files)
- sealed-secrets manifests for all service secrets
- Kong Gateway declarative config (rate limits per route, JWT validation plugin, tenant routing)
- Secure headers NestJS middleware
- Audit log interceptor (auto-logs all mutating operations)
- cert-manager Kubernetes manifests (for TLS)
- Cloudflare WAF: infrastructure/terraform/cloudflare/ (main.tf + waf.tf + variables.tf + outputs.tf)
- Cloudflare WAF middleware: backend/src/shared/middleware/cloudflare-waf.middleware.ts
- Cloudflare origin protection: infrastructure/kubernetes/security/cloudflare-origin-protection.yaml
- CloudflareWAFIntegration (EP-WAF-001 RESOLVED): implemented as backend/src/shared/middleware/cloudflare-waf.middleware.ts (see line above)
- Security scanning: Trivy in GitHub Actions (container image scanning)
- OWASP dependency check in CI pipeline
- Unit tests: RBAC guards, rate limiting, tenant isolation middleware
- Integration tests: cross-tenant isolation (must not leak data)
- CORS policy: docs/policies/cors-policy.md (allowed origins per environment; no * in production;
  max-age ≤ 86400s; update policy before adding any new origin — source: spec §5.8)
- External pentest: docs/registers/pentest-findings.md (findings and resolution status;
  required before Stage 1→2 — source: spec §5.3.1, context.md §Security)

Constraints:

- Before marking Phase 16 complete: read every Generate item above line by line,
  run ls/grep to verify each exists on disk, show output — Rule 36

```

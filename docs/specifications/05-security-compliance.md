---
title: 'Security & Compliance'
version: '1.9.0'
status: Active
last_updated: '2026-07-03'
authors:
  - thitipongroo
related_docs:
  - 04-tech-stack.md
  - 06-rbac-permission-matrix.md
  - 07-multi-tenant-architecture.md
  - 08-enterprise-deployment.md
---

# 5. Security & Compliance

## Table of Contents

- [5.1 Security](#51-security)
- [5.2 Security Controls](#52-security-controls)
- [5.3 Compliance](#53-compliance)
- [5.4 Authentication Flow](#54-authentication-flow)
- [5.5 Cloudflare WAF](#55-cloudflare-waf)
- [5.6 Data Residency](#56-data-residency)
- [5.7 Content Security Policy (CSP)](#57-content-security-policy-csp)
- [5.8 CORS Policy](#58-cors-policy)
- [5.9 Threat Model (STRIDE)](#59-threat-model-stride)
- [5.10 Software Supply-Chain Security](#510-software-supply-chain-security)

---

## 5.1 Security

Principles :

- Zero trust
- Least privilege
- Encryption everywhere
- Immutable audit logs
- Tenant isolation

---

## 5.2 Security Controls

| Area                 | Control                                                                                                                          |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Authentication       | OAuth2/OIDC                                                                                                                      |
| Authorization        | RBAC/ABAC                                                                                                                        |
| Secrets              | AWS Secrets Manager (cloud deployment) / HashiCorp Vault (on-premise deployment)                                                 |
| Encryption           | AES-256                                                                                                                          |
| Transport            | TLS 1.3                                                                                                                          |
| Audit                | Immutable logging                                                                                                                |
| API Security         | Rate limiting + **Cloudflare WAF** (see §5.5)                                                                                    |
| File Upload Security | MIME type validation server-side + **ClamAV** antivirus scan before file marked CLEAN; quarantine on threat detection (Phase 9+) |

> **ClamAV quarantine procedure (Phase 9+):** Infected files are moved to a dedicated
> `cos-quarantine/{tenant_id}/` MinIO bucket (separate from `cos-files`); quarantine bucket
> retention: 30 days; event emitted on detection: `file.document.quarantined.v1`
> (payload: `{ file_id, tenant_id, threat_type }` — canonical event per
> `32-implementation-specifications` §32.4 #18 and master Phase 9);
> SYSTEM_ADMIN notified via `file.document.quarantined.v1` event; recovery from quarantine is
> SYSTEM_ADMIN-only action via platform admin API; files automatically deleted after
> 30-day retention period.

Note : AWS Secrets Manager is the default for cloud deployments on AWS. HashiCorp Vault is used
for on-premise and hybrid deployments. See 04-tech-stack section 4.7 for the AWS Services list.

Secret delivery into the cluster (the mechanism that injects stored secrets into pods) is part
of the decision, not just the secret store:

- **Cloud (AWS EKS):** the **External Secrets Operator** syncs AWS Secrets Manager secrets into
  native Kubernetes Secret objects, which are then mounted as pod environment variables.
- **On-premise / hybrid:** the **Vault Agent sidecar injector** delivers HashiCorp Vault secrets
  into pods.
- **Git-committed secrets** (any Kubernetes Secret that must live in the GitOps repository) are
  committed only as a `SealedSecret` via **sealed-secrets** (`kubeseal`) — never as a plaintext
  Secret. See §8.6 for the operator-level deployment view.

### 5.2.1 Encryption at Rest

All persistent storage must use AES-256 minimum. SSE-KMS with a customer-managed key (CMK)
is required for all cloud storage resources.

| Storage      | Encryption method  | Key management         | Constraint                                          |
| ------------ | ------------------ | ---------------------- | --------------------------------------------------- |
| S3 buckets   | SSE-KMS            | CMK (customer-managed) | All buckets; default encryption enforced at bucket  |
| RDS / Aurora | Storage encryption | CMK (customer-managed) | Enabled at instance creation; cannot be added later |
| ElastiCache  | Encryption-at-rest | AWS-managed key        | `at_rest_encryption_enabled = true` on all nodes    |

CMK definitions: managed as Terraform IaC (AWS KMS)

- One CMK per storage type, per environment (`staging`, `production`)
- Key alias convention: `cos/{env}/rds`, `cos/{env}/s3`, `cos/{env}/elasticache`
- Annual automatic key rotation enabled via AWS KMS
- CMK policy: only the application service role and SYSTEM_ADMIN role may use the key

On-premise equivalent: HashiCorp Vault Transit secrets engine provides envelope encryption;
CMK lifecycle managed by Vault policy.

---

## 5.3 Compliance

Targets (see §5.3.1 for audit workflow spec):

- ISO 27001
- SOC 2 Type II
- PDPA (Thailand Personal Data Protection Act B.E. 2562)
- GDPR
- Construction safety regulations

### 5.3.1 Compliance Audit Workflow

**Decision:** Three certification targets implemented in parallel; audit workflow triggered 6 months before certification date.

| Certification         | Scope                                                    | Timeline                   | Trigger                                                 |
| --------------------- | -------------------------------------------------------- | -------------------------- | ------------------------------------------------------- |
| SOC 2 Type II         | Security, Availability, Confidentiality trust criteria   | 6–12 months audit period   | 6 months before Stage 1→2 transition                    |
| ISO 27001             | Information Security Management System (ISMS)            | 12–18 months certification | 6 months before Stage 2→3 transition                    |
| PDPA Compliance Audit | Thai PDPA §37 — data processing, consent, subject rights | Annual audit               | 6 months before first Thai enterprise customer onboards |

**Audit workflow steps (implemented as Temporal workflow):**

1. Trigger: audit_start_date = certification_date - 6 months
2. Generate evidence collection checklist from `docs/compliance/` runbooks
3. Assign TENANT_ADMIN as evidence owner; notify via notification service
4. Track evidence completion status in audit_logs table
5. Gate: all evidence items marked COMPLETE before external auditor engagement
6. External auditor findings tracked in `docs/security/pentest-findings.md` (SOC 2) or audit tracker

**Controls tracking:** `docs/compliance/soc2-controls.md` (SOC 2) · `docs/compliance/iso27001-controls.md` (ISO 27001) · `docs/compliance/pdpa-controls.md` (PDPA)

**PDPA data governance:** `docs/compliance/data-flow-map.md` (personal data flow map — reviewed before
each new feature that processes PII; required before Stage 1→2 transition) ·
`docs/compliance/data-retention-policy.md` (retention period per entity type — reviewed annually)

### Regional Compliance Scope (COORD-003)

**Decision:** Tier 1 — TH / VN / SG full compliance modules; Tier 2 — MY / ID standard.
**Resolved:** 2026-06-10

- **Tier 1 (full compliance modules):** Thailand, Vietnam, Singapore
  - Full PDPA compliance: DPO workflow, consent management, data subject rights portal
  - Regulatory API integrations (BoT reporting, SBV reporting, MAS notifications)
  - Localised WHT rules and tax compliance (Avalara AvaTax TH/VN/SG jurisdiction config)
- **Tier 2 (standard modules + local legal review):** Malaysia, Indonesia
  - Standard GDPR-equivalent consent and data residency modules deployed
  - Local legal review required before tenant onboarding in Tier 2 countries
  - No regulatory API integrations until Tier 1 maturity confirmed
- **Promotion trigger:** Country promoted to Tier 1 after ≥ 5 paying tenants and full
  regulatory mapping confirmed by legal counsel

---

### Global Data Governance Framework (GLOB-003)

**Decision:** Data sovereignty first — store locally, aggregate globally only with consent.
**Resolved:** 2026-06-10

| Framework                          | Tier        | Applies to                      |
| ---------------------------------- | ----------- | ------------------------------- |
| PDPA Thailand §21                  | Mandatory   | All TH-resident tenant data     |
| Vietnam PDPA / Decree 13/2023      | Mandatory   | All VN-resident tenant data     |
| PDPA Singapore (PDPA 2012 amended) | Mandatory   | All SG-resident tenant data     |
| GDPR (EU Regulation 2016/679)      | Mandatory   | EU tenants and EU data subjects |
| ISO/IEC 27701 (Privacy extension)  | Target cert | Privacy management system       |
| ISO/IEC 42001:2026 (AI Management) | Target cert | AI governance path (STEW-001)   |

**Data residency principle:** Tenant data processed and stored in the tenant's home region
by default. Cross-region transfer requires explicit DPA amendment per GLOB-002 rules.

**PDPA enforcement context (2026):** Thailand — 8 fines totalling THB 21.5M since Aug 2025;
DPO appointment mandatory for data-intensive companies. Vietnam new law effective July 2026.

---

### Decentralised Governance Protocol (BG-001)

**Decision:** W3C DID v1.1 for decentralised identity; Verifiable Credentials for credentials.
**Resolved:** 2026-06-10

- **Standard:** W3C Decentralised Identifiers (DID) v1.1 — Candidate Recommendation
  published March 5, 2026
- **Use cases:** Contractor licence verification, equipment certification, worker safety
  training records — issued as W3C Verifiable Credentials (VCs)
- **Architecture:** DID Documents stored in platform identity service; VC issuance via
  `CredentialService.issue(subjectDid, credentialType, claims)`
- **Scope:** DID / VC integration is an opt-in Enterprise module; core authentication
  remains Keycloak OAuth2/OIDC (§5.4)
- **Self-sovereign identity:** Tenant admins may issue VCs to workers; third-party
  verification is cryptographic — no platform call required at verify time

---

## 5.4 Authentication Flow

Provider :

- Keycloak (OAuth2/OIDC)

Token Strategy :

- Access token — JWT, short-lived (15 min)
- Refresh token — long-lived (7 days), rotated on use
- Tenant claim embedded in JWT payload

Multi-tenant Realm Strategy :

- SMB and mid-market tenants — shared Keycloak realm, isolated by tenant_id
- Enterprise tenants — dedicated Keycloak realm per tenant

### 5.4.1 JWT Custom Claim Names (Authoritative)

All JWTs issued by the platform (Path A — Keycloak-signed via Direct Grant; Path B — Keycloak-signed via OIDC)
**MUST** contain the following custom claims with exactly these names:

| Claim name  | Type            | Value                                | Notes                                                                   |
| ----------- | --------------- | ------------------------------------ | ----------------------------------------------------------------------- |
| `tenant_id` | `string` (UUID) | `platform.tenants.tenant_id`         | Required on every request; Kong Gateway rejects tokens without it       |
| `user_id`   | `string` (UUID) | `platform.users.user_id`             | COS user UUID — distinct from Keycloak `sub` which is the Keycloak UUID |
| `role`      | `string` (enum) | CosRole value e.g. `PROJECT_MANAGER` | Role within this tenant                                                 |

Standard OIDC claim `sub` remains the Keycloak user UUID — it maps to `platform.users.keycloak_user_id`.

**Enforcement:**

- Kong Gateway validates `tenant_id` is present on every inbound request
- NestJS `KeycloakJwtStrategy.validate()` rejects tokens missing `tenant_id` or `role`, and
  resolves the tenant (active check) into `req.user` during authentication
- `JwtAuthGuard` publishes `tenant_id` / `user_id` / `role` (+ `tenantCode` / `dedicatedDbUrl`)
  into CLS (AsyncLocalStorage via `nestjs-cls`) — under the Fastify adapter the request is cloned and
  `req.user` does not survive downstream, so CLS is the authoritative carrier. A global
  `TenantContextInterceptor` also projects them onto `req.tenantId` / `userId` / `userRole` as a
  secondary path; tenant-scoped queries then run as the non-superuser `app_user` role so RLS is
  enforced
- No other naming variant (`cos_tenant_id`, `tenantId`, `cos_role`) is authoritative

### 5.4.2 Keycloak Protocol Mapper Specification

Every Keycloak realm used by this platform **MUST** have the following protocol mappers.
`tenant_id`, `user_id`, and `role` are stored as **Keycloak user attributes** (set via the
Keycloak Admin REST API during user provisioning) and mapped to the JWT access token:

```json
"protocolMappers": [
  {
    "name": "tenant_id",
    "protocol": "openid-connect",
    "protocolMapper": "oidc-usermodel-attribute-mapper",
    "consentRequired": false,
    "config": {
      "user.attribute": "tenant_id",
      "claim.name": "tenant_id",
      "jsonType.label": "String",
      "id.token.claim": "true",
      "access.token.claim": "true",
      "userinfo.token.claim": "true"
    }
  },
  {
    "name": "user_id",
    "protocol": "openid-connect",
    "protocolMapper": "oidc-usermodel-attribute-mapper",
    "consentRequired": false,
    "config": {
      "user.attribute": "user_id",
      "claim.name": "user_id",
      "jsonType.label": "String",
      "id.token.claim": "true",
      "access.token.claim": "true",
      "userinfo.token.claim": "true"
    }
  },
  {
    "name": "role",
    "protocol": "openid-connect",
    "protocolMapper": "oidc-usermodel-attribute-mapper",
    "consentRequired": false,
    "config": {
      "user.attribute": "role",
      "claim.name": "role",
      "jsonType.label": "String",
      "id.token.claim": "true",
      "access.token.claim": "true",
      "userinfo.token.claim": "true"
    }
  }
]
```

**Required Keycloak user attributes per user (set via Keycloak Admin REST API):**

| Attribute   | Value                                                                     |
| ----------- | ------------------------------------------------------------------------- |
| `tenant_id` | UUID from `platform.tenants.tenant_id`                                    |
| `user_id`   | UUID from `platform.users.user_id` (set after COS user record is created) |
| `role`      | CosRole enum value e.g. `FINANCE`, `PROJECT_MANAGER`                      |

**Path A (phone/OTP via Keycloak Direct Grant):**

SMS gateway: cloud (authoritative) = **AWS SNS** (region `ap-southeast-1` SMS-capable endpoint), via
AWS SDK v3 `@aws-sdk/client-sns` (`SNSClient.publish()`). **On-premise** = pluggable provider behind
the `SmsSender` abstraction (in-country aggregator / SMPP / customer gateway).
OTP delivery is the only step that uses the SMS gateway; token
issuance is Keycloak (below). OTP parameters: 6-digit numeric, TTL 5 min, max 3 attempts per session,
a **60-second resend cooldown per phone** (send-rate cap — a resend inside the window is rejected 429
with `retryAfterSeconds`, and the client counts it down on the "resend" control), and rate-limited 10
OTP requests per phone per day (see §14.3). A Thai SMS fallback applies if +66 delivery rate < 95%.

1. OTP verification succeeds in COS identity service.
2. `KeycloakAdminService.provisionPhoneUser(phone, displayName, realm)` creates a Keycloak user and sets an ephemeral one-time credential.
3. COS calls `POST /realms/{realm}/protocol/openid-connect/token` with `grant_type=password`, username=phone, password=ephemeralCredential (`directAccessGrantsEnabled: true` required on `cos-backend` client).
4. Keycloak issues RS256-signed access token (15 min) + refresh token (7 days). Ephemeral credential is discarded.
5. All custom claims (`tenant_id`, `user_id`, `role`) are embedded by Keycloak protocol mappers (§5.4.2).
6. Refresh: COS proxies `grant_type=refresh_token` to Keycloak — Keycloak rotates the refresh token natively (`refreshTokenMaxReuse: 0`).

**Path B (Keycloak OIDC):** Keycloak user attributes must be set via Keycloak Admin REST API during provisioning (KD-AUTH-001 in `32-implementation-specifications.md`).

> **Timeline note:** Protocol mapper _configuration_ on the Keycloak realm (the JSON above) is required at tenant provisioning in Phase 1 — configure once per realm. Keycloak user _attribute provisioning_ (`tenant_id`, `user_id`, `role` set via Keycloak Admin REST API) is required before each user (Path A or Path B) can authenticate — implemented in Phase 2 via `KeycloakAdminService` (KD-AUTH-001).

SSO / SAML :

- Enterprise IdP (Azure AD, Google Workspace) → Keycloak SAML broker → Platform
- Keycloak acts as OIDC gateway to all upstream IdPs

API Auth :

- Service-to-service — mTLS + JWT (issued by Keycloak)
- External API clients — OAuth2 client credentials flow

### 5.4.3 Vendor Portal External Authentication (magic-link)

External vendor-network users authenticate **outside** the tenant Keycloak realms. Vendors are not
`platform.users` and never receive a `CosRole`; the principal is `VENDOR_PORTAL` (§06 §6.8b).

**Tier 1 — frictionless RFQ response (no account, §28):**

- An RFQ invitation issues a **single-use, HMAC-signed token** stored only as `token_hash` in
  `procurement.rfq_invitations` (never the raw token).
- The token is embedded in an HTTPS-only magic-link, **expires in 5–15 minutes**, and is
  invalidated immediately after one successful use (replay-protected).
- A valid token grants a short-lived, narrowly-scoped session limited to the invited RFQ.

**Tier 2 — lightweight vendor session (PO-status tracking + invoice submission):**

- Responding to an RFQ (Tier 1) grants a Tier-2 **vendor session token** bound to the
  `platform.vendor_identities` row. The token is HMAC-signed and carries only `vendor_identity_id`.
- Tier-2 requests send the session as `Bearer` plus an `x-vendor-tenant-id` header that selects the
  buyer; authorization is by `platform.vendor_trading_relationships`, **not** tenant RLS.

All vendor-portal traffic is rate-limited at Kong independently of tenant API quotas.

---

## References

| ID            | Title                                                              | Source                                                                           |
| ------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| [IEEE 830]    | IEEE Recommended Practice for Software Requirements Specifications | IEEE Std 830-1998                                                                |
| [ISO 27001]   | Information Security Management Systems                            | ISO/IEC 27001:2022                                                               |
| [OWASP-TOP10] | OWASP Top Ten Web Application Security Risks                       | [owasp.org/Top10](https://owasp.org/www-project-top-ten/)                        |
| [PDPA]        | Personal Data Protection Act B.E. 2562 (2019)                      | Thailand PDPA                                                                    |
| [GDPR]        | General Data Protection Regulation                                 | EU Regulation 2016/679                                                           |
| [SOC2]        | SOC 2 Type II Trust Service Criteria                               | AICPA TSC 2017                                                                   |
| [TLS13]       | The Transport Layer Security (TLS) Protocol Version 1.3            | RFC 8446                                                                         |
| [OAuth2]      | The OAuth 2.0 Authorization Framework                              | RFC 6749                                                                         |
| [OIDC]        | OpenID Connect Core 1.0                                            | [openid-connect-core-1_0](https://openid.net/specs/openid-connect-core-1_0.html) |

---

## 5.5 Cloudflare WAF

**Decision:** Cloudflare WAF is the chosen WAF solution for **cloud deployments** (Shared SaaS and Dedicated Tenant). On-premise deployments use a different approach — see `08-enterprise-deployment` §8.7.

### Architecture

Traffic flow (**cloud deployments only**):

```text
Internet → Cloudflare Edge (WAF + DDoS + CDN) → AWS ALB → EKS Ingress → NestJS
```

Cloudflare acts as a **cloud-agnostic reverse proxy** in front of AWS infrastructure. The AWS ALB must only accept traffic from Cloudflare IP ranges (origin protection).

> **On-premise deployments:** Cloudflare WAF is not applicable. Rate limiting is enforced by Kong Gateway. A customer-provided WAF is required — see `08-enterprise-deployment` §8.7 for minimum requirements.

### Cloudflare Plan Requirement

Minimum: **Cloudflare Pro** (WAF custom rules + rate limiting). Enterprise recommended for construction enterprise customers requiring advanced bot management.

### Enabled Rule Sets

| Ruleset                       | Action     | Notes                                                        |
| ----------------------------- | ---------- | ------------------------------------------------------------ |
| Cloudflare Managed Ruleset    | Execute    | Covers OWASP Top 10, known CVEs                              |
| OWASP Core Rule Set (CRS)     | Execute    | Paranoia level 2 (balance security vs false positive)        |
| Cloudflare Bot Management     | Block bots | Score < 30 → block; 30–50 → CAPTCHA                          |
| Custom: Construction OS Rules | Block/Log  | API path rules, file upload limits, tenant header validation |

### Rate Limiting (QM-7 alignment)

| Endpoint Pattern       | Limit                | Action      |
| ---------------------- | -------------------- | ----------- |
| `/api/v*/auth/*`       | 10 req/min per IP    | Block (429) |
| `/api/v*/` (general)   | 100 req/min per user | Block (429) |
| `/api/v*/files/upload` | 20 req/min per user  | Block (429) |
| `/health`, `/metrics`  | 60 req/min per IP    | Block (429) |

> **Note on path convention:** Construction OS backend uses `setGlobalPrefix('api/v1')` — all versioned API routes are at `/api/v1/...`. Health/metrics endpoints are excluded from the global prefix. File upload rate: **20 req/min**.

### Application-layer Rate Limiting (NestJS ThrottlerModule)

Cloudflare WAF enforces rate limits at the edge (see table above). The NestJS backend applies
a **second, independent rate-limiting layer** using `@nestjs/throttler` to defend against
requests that reach the application after bypassing or before the WAF is in place (e.g., internal
cluster traffic, staging environments without Cloudflare).

**Decision:** `ThrottlerModule` is registered globally in `AppModule` with the limits below.
Per-endpoint overrides are applied via the `@Throttle()` decorator where the global default
is too permissive.

| Scope                             | Limit                | NestJS mechanism                                                         |
| --------------------------------- | -------------------- | ------------------------------------------------------------------------ |
| Default (all endpoints)           | 100 req/min per user | `ThrottlerModule` global guard                                           |
| Auth endpoints (`/api/v*/auth/*`) | 10 req/min per IP    | `@Throttle({ default: { limit: 10, ttl: 60000 } })` on `AuthController`  |
| File upload (`/api/v*/files/*`)   | 20 req/min per user  | `@Throttle({ default: { limit: 20, ttl: 60000 } })` on `FilesController` |

**Implementation requirements:**

- `ThrottlerModule` registered globally in the application root module, using Redis as the
  shared storage backend so limits are consistent across all pod replicas
- `APP_GUARD` provider bound to `ThrottlerGuard` so every route is protected by default
- `ThrottlerException` maps to HTTP `429` with `Retry-After` header set to seconds until reset
  (QM-7: "429 responses must include `Retry-After` header")
- Rate limit response headers on every response: `X-RateLimit-Limit`, `X-RateLimit-Remaining`,
  `X-RateLimit-Reset` (QM-7)
- Unit test required for the throttler guard (see `30-testing-strategy` §30.10)

**Library:** `@nestjs/throttler` (NestJS rate-limiting module)

### Origin Protection (mandatory)

The AWS ALB security group **must** restrict inbound HTTPS (443) to Cloudflare IP ranges only. This prevents attackers from bypassing the WAF by connecting directly to the origin.

Cloudflare publishes current IP ranges at: `https://api.cloudflare.com/client/v4/ips`

Configured via Cloudflare Terraform IaC and a Kubernetes origin-protection manifest.

### Application-level Integration

**Decision:** `CloudflareWafMiddleware` — NestJS middleware implemented and located at `backend/src/shared/middleware/cloudflare-waf.middleware.ts`. Wire into every NestJS service at Phase 16.

| Requirement     | Implementation                                                                         |
| --------------- | -------------------------------------------------------------------------------------- |
| Real client IP  | Trust `CF-Connecting-IP` header (not `X-Forwarded-For`)                                |
| WAF enforcement | Validate `CF-Ray` header is present; return `403 COS-SEC-001` in production if missing |
| Tracing         | Log `CF-Ray` + `CF-Connecting-IP` in all request logs for end-to-end tracing (QM-8)    |
| Dev bypass      | `NODE_ENV !== production` — CF-Ray validation skipped (no Cloudflare edge locally)     |

Implementation: a NestJS WAF middleware in the application layer.

### Infrastructure as Code

Terraform configuration: `infrastructure/terraform/cloudflare/`

- `main.tf` — Cloudflare provider, zone data source
- `waf.tf` — WAF rulesets (managed + custom + rate limit) + zone security settings
- `variables.tf` — zone_id, account_id, api_token (sensitive — use Vault/sealed-secrets)
- `outputs.tf` — ruleset IDs, zone name

---

## 5.6 Data Residency

Data residency rules determine where tenant data is stored and processed to satisfy
PDPA (Thailand) and GDPR (EU) obligations.

Authoritative file: `docs/compliance/data-residency-policy.md`

### Region assignment

The "Primary region" column below is the per-tenant **data-residency** region (the tenant's home
region per the GLOB-003 data-sovereignty principle, §5.3). It is **distinct from** the platform's
primary **compute/control-plane** region (`ap-southeast-7` Bangkok — GLOB-001, §8.8): a tenant's
data is stored in its own home region regardless of where the platform control plane runs.

| Tenant origin                                 | Data-residency region        | DR region        | Regulation / rationale                                                                                                                                                                                 |
| --------------------------------------------- | ---------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Thai tenants                                  | `ap-southeast-7` (Bangkok)   | `ap-southeast-1` | PDPA — data must not leave Thailand                                                                                                                                                                    |
| EU tenants                                    | `eu-west-1` (Ireland)        | —                | GDPR                                                                                                                                                                                                   |
| Other / default (SG/VN/MY/ID & international) | `ap-southeast-1` (Singapore) | —                | Default for non-Thai/non-EU tenants — Singapore is the established, neutral SEA data hub (no AWS region in VN/MY/ID); per GLOB-003 home-region principle. **Not** the platform-primary compute region. |

### Rules

- Thai-origin data must not leave `ap-southeast-7` / `ap-southeast-1` without explicit
  product owner approval and legal review recorded in the audit log.
- Tenant region assignment is stored in `platform.tenants.data_region` column at provisioning.
- Kafka topics carrying PII are confined to the tenant's assigned region cluster.
- ClickHouse analytics data is stored in the tenant's assigned region.
- Cross-border transfer requires a signed Data Processing Agreement (DPA) on file.

### Enforcement

- Region assignment is immutable after first data write; change requires full data migration
  with product owner and legal sign-off.
- `data_region` is a column on `platform.tenants` (see `11-database-schema` §11.1). Because the
  Base Event Envelope (§32.4) already carries `tenant_id`, downstream consumers resolve a tenant's
  `data_region` from `platform.tenants` — it is NOT a separate field on the event envelope.

---

## 5.7 Content Security Policy (CSP)

The platform Content Security Policy is defined in `docs/security/csp-policy.md`.
The policy must be reviewed and updated whenever a new third-party resource origin is
added (CDN, font provider, analytics).

Constraints:

- Never use `unsafe-inline` or `unsafe-eval` in production CSP
- `default-src 'self'` is the baseline; all overrides require justification in the policy file
- Report-only mode (`Content-Security-Policy-Report-Only`) is enabled in staging when testing
  new directives before production enforcement
- CSP headers are set by the application's secure-headers middleware

---

## 5.8 CORS Policy

Allowed origins per environment are defined in `docs/security/cors-policy.md`.

Constraints:

- Never use `Access-Control-Allow-Origin: *` in production
- The allowed origins list in `docs/security/cors-policy.md` must be updated before
  onboarding any new web client or partner origin
- Preflight response cache (`Access-Control-Max-Age`) must not exceed 86400 seconds (24 hours)
- CORS headers are set by the application's secure-headers middleware

---

## 5.9 Threat Model (STRIDE)

Every externally-reachable surface MUST be threat-modeled with STRIDE (Spoofing, Tampering,
Repudiation, Information disclosure, Denial of service, Elevation of privilege) before it ships.
Mitigations below reference controls that already exist elsewhere in this spec unless marked
**[GAP]** (control to build) or **[verify]** (control to confirm). AI/LLM-specific threats are
modeled separately in [22-ai-architecture §22 AI Security](22-ai-architecture.md).

### Surfaces in scope

Public REST API (`/api/v1`) · Authentication (SMS OTP + JWT / Keycloak OIDC) · CRM webhook ·
File upload (file-service) · Mobile offline sync (`/sync/delta`, `/sync/push`) · IoT ingestion
(EMQX MQTT → Kafka) · Vendor/contractor portals (magic-link).

### 5.9.1 Public API `/api/v1`

| STRIDE | Threat                           | Mitigation                                                                                                                                                                              |
| ------ | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S      | Forged identity                  | JWT (Keycloak OIDC) required; `TenantContextInterceptor` sets tenant from token claim (§5.4.1)                                                                                          |
| T      | Request tampering                | TLS in transit; DTO validation (class-validator); no mass-assignment                                                                                                                    |
| R      | Deny an action                   | Immutable audit logs on state-changing endpoints (§5.1)                                                                                                                                 |
| I      | **Cross-tenant read** (top risk) | RLS on every domain table + `app.current_tenant_id` set before every query; `WHERE tenant_id` as defense-in-depth (see [07-multi-tenant-architecture](07-multi-tenant-architecture.md)) |
| D      | Request flooding                 | Cloudflare WAF + Kong / ThrottlerModule rate limiting at the edge before compute (§5.5)                                                                                                 |
| E      | Privilege escalation             | RBAC/ABAC guards (JWT claims) + PolicyGuard ([06-rbac-permission-matrix](06-rbac-permission-matrix.md))                                                                                 |

### 5.9.2 Authentication — SMS OTP + JWT

| STRIDE | Threat                         | Mitigation                                                                                                          |
| ------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| S      | OTP interception / brute force | OTP send-rate cap (60s resend cooldown/phone + 10/phone/day) + attempt lockout (3 tries/OTP); short OTP TTL (5 min) |
| R      | Repudiate login                | Auth events audited                                                                                                 |
| I      | Token leakage                  | Short-lived access token + secure refresh; `expo-secure-store` on device                                            |
| E      | Token replay / forged claims   | Signed JWT, audience/issuer checks (§5.4.2), key rotation (180d)                                                    |

### 5.9.3 CRM webhook (`/platform/webhooks/*`)

| STRIDE | Threat         | Mitigation                                                                                                                             |
| ------ | -------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| S      | Forged webhook | HMAC-SHA256 signature (`X-Webhook-Signature`) verified (see [34-enterprise-tenant-provisioning](34-enterprise-tenant-provisioning.md)) |
| T/R    | Replay         | Idempotency key + timestamp window; event recorded                                                                                     |
| D      | Webhook flood  | Rate limit + async enqueue (never process inline)                                                                                      |

### 5.9.4 File upload (file-service)

| STRIDE | Threat                       | Mitigation                                                                                               |
| ------ | ---------------------------- | -------------------------------------------------------------------------------------------------------- |
| T      | Malicious file               | ClamAV antivirus scan + quarantine on threat (§5.2 File Upload Security); content-type + size validation |
| I      | Access another tenant's file | Tenant-scoped object keys + signed URLs, short expiry                                                    |
| D      | Large-file DoS               | Size limit + streaming multipart; per-tenant storage quota **[verify]**                                  |
| E      | Path traversal / SSRF        | No user-supplied fetch URLs                                                                              |

### 5.9.5 Mobile offline sync (`/sync/delta`, `/sync/push`)

| STRIDE | Threat                            | Mitigation                                                                                                                                 |
| ------ | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| T      | Replayed / out-of-order mutations | Idempotent delta cursor + server-side conflict resolution; server is source of truth ([17-offline-mobile-sync](17-offline-mobile-sync.md)) |
| R      | Dispute a synced change           | Per-mutation audit + `sync_status` trail                                                                                                   |
| I      | Over-fetch across tenant          | Delta query is tenant + role scoped (RLS)                                                                                                  |
| D      | Sync storm on reconnect           | Server backpressure + client backoff                                                                                                       |

### 5.9.6 IoT ingestion (EMQX MQTT → Kafka)

| STRIDE | Threat                  | Mitigation                                                                                                                     |
| ------ | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| S      | Rogue device            | Per-device credential/cert on EMQX **[verify]**; bridge validates before Kafka ([33-digital-twin-iot](33-digital-twin-iot.md)) |
| T      | Forged telemetry        | Device auth + Avro schema validation at ingestion                                                                              |
| I      | Cross-tenant topic read | Per-tenant topic prefix + `tenant_id` header validated by consumers; `allowAutoTopicCreation: false`                           |
| D      | Telemetry flood         | Consumer-lag SLO + DLQ + rate control                                                                                          |

### 5.9.7 Vendor/contractor portals (magic-link)

| STRIDE | Threat                        | Mitigation                                                                     |
| ------ | ----------------------------- | ------------------------------------------------------------------------------ |
| S      | Guess/replay link             | Single-use, time-boxed magic link (HMAC-signed); scoped to one vendor (§5.4.3) |
| I      | Enumerate other vendors' RFQs | Link scoped to `rfq_vendor`; RLS on read                                       |

### Cross-cutting controls

Zero-trust + mTLS (Istio) for cross-boundary calls · secrets in Vault / AWS Secrets Manager
(never in code) · SBOM + dependency pinning (§5.10) · NIST CSF 2.0 function mapping
(Govern / Identify / Protect / Detect / Respond / Recover) tracked in `docs/compliance/*-controls.md`.

### Acceptance criteria / gate

- [ ] A STRIDE row exists for every external surface before it ships
- [ ] All **[GAP]** / **[verify]** items resolved before enterprise GA (owner: Security Lead)
- [ ] Isolation tests prove no cross-tenant read on API + sync + file + IoT paths
- [ ] Annual penetration test covers all 7 surfaces

---

## 5.10 Software Supply-Chain Security

Aligns with OWASP Top 10:2025 **A03 — Software Supply-Chain Failures**. Community mobile plugins are a specific,
tracked exposure.

Requirements:

- **SBOM** (CycloneDX) generated per release for every deployable artifact
- **Dependency pinning + verification** — lockfiles committed; no floating ranges on production
  dependencies; third-party plugins pinned to a reviewed version
- **SLSA provenance + artifact signing** (cosign) on CI-built images
- **Dependency scanning** in CI (SCA) — build fails on a known critical CVE without an approved,
  time-boxed exception
- **Secret scanning** pre-commit (`gitleaks` / `git-secrets`) — see `context.md §QM-4`

Acceptance:

- [ ] SBOM published with every release artifact
- [ ] CI blocks unpinned or critically-vulnerable production dependencies
- [ ] Container images signed + provenance attached

---

> 📎 See also: [04-tech-stack](04-tech-stack.md) · [06-rbac-permission-matrix](06-rbac-permission-matrix.md) · [07-multi-tenant-architecture](07-multi-tenant-architecture.md) · [08-enterprise-deployment](08-enterprise-deployment.md)

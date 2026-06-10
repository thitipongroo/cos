---
title: 'Security & Compliance'
version: '1.6.0'
status: Active
last_updated: '2026-05-28'
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
> retention: 30 days; event emitted on detection: `file.scan.quarantined.v1`
> (payload: `{ file_id, tenant_id, threat_name, quarantined_at }`);
> SYSTEM_ADMIN notified via `file.scan.quarantined.v1` event; recovery from quarantine is
> SYSTEM_ADMIN-only action via platform admin API; files automatically deleted after
> 30-day retention period.

Note : AWS Secrets Manager is the default for cloud deployments on AWS. HashiCorp Vault is used
for on-premise and hybrid deployments. See 04-tech-stack section 4.7 for the AWS Services list.

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

All JWTs issued by the platform (Path A — COS-signed; Path B — Keycloak-signed)
**MUST** contain the following custom claims with exactly these names:

| Claim name  | Type            | Value                                | Notes                                                                   |
| ----------- | --------------- | ------------------------------------ | ----------------------------------------------------------------------- |
| `tenant_id` | `string` (UUID) | `platform.tenants.tenant_id`         | Required on every request; Kong Gateway rejects tokens without it       |
| `user_id`   | `string` (UUID) | `platform.users.user_id`             | COS user UUID — distinct from Keycloak `sub` which is the Keycloak UUID |
| `role`      | `string` (enum) | CosRole value e.g. `PROJECT_MANAGER` | Role within this tenant                                                 |

Standard OIDC claim `sub` remains the Keycloak user UUID — it maps to `platform.users.keycloak_user_id`.

**Enforcement:**

- Kong Gateway validates `tenant_id` is present on every inbound request
- NestJS `KeycloakJwtStrategy` rejects tokens missing `tenant_id` or `role`
- `TenantMiddleware` extracts `tenant_id` and `user_id` into request context
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

Path A (phone/OTP): claims are set directly by COS identity service at JWT issuance.
Path B (Keycloak): attributes must be set via Keycloak Admin REST API during provisioning (currently deferred — see Phase 2 constraints in master spec).

> **Timeline note:** Protocol mapper _configuration_ on the Keycloak realm (the JSON above) is required at tenant provisioning in Phase 1 — configure once per realm. Keycloak user _attribute provisioning_ (`tenant_id`, `user_id`, `role` values set per user via Keycloak Admin REST API) is required before each Path B user can authenticate, and is deferred to Phase 2. Phase 1 MVP uses Path A only; Path A JWTs are issued by COS directly and are not affected by realm mapper configuration.

SSO / SAML :

- Enterprise IdP (Azure AD, Google Workspace) → Keycloak SAML broker → Platform
- Keycloak acts as OIDC gateway to all upstream IdPs

API Auth :

- Service-to-service — mTLS + JWT (issued by Keycloak)
- External API clients — OAuth2 client credentials flow

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

### Origin Protection (mandatory)

The AWS ALB security group **must** restrict inbound HTTPS (443) to Cloudflare IP ranges only. This prevents attackers from bypassing the WAF by connecting directly to the origin.

Cloudflare publishes current IP ranges at: `https://api.cloudflare.com/client/v4/ips`

See: `infrastructure/terraform/cloudflare/` and `infrastructure/kubernetes/security/cloudflare-origin-protection.yaml`

### Application-level Integration

**Decision:** `CloudflareWafMiddleware` — NestJS middleware implemented and located at `backend/src/shared/middleware/cloudflare-waf.middleware.ts`. Wire into every NestJS service at Phase 16.

| Requirement     | Implementation                                                                         |
| --------------- | -------------------------------------------------------------------------------------- |
| Real client IP  | Trust `CF-Connecting-IP` header (not `X-Forwarded-For`)                                |
| WAF enforcement | Validate `CF-Ray` header is present; return `403 COS-SEC-001` in production if missing |
| Tracing         | Log `CF-Ray` + `CF-Connecting-IP` in all request logs for end-to-end tracing (QM-8)    |
| Dev bypass      | `NODE_ENV !== production` — CF-Ray validation skipped (no Cloudflare edge locally)     |

Implementation: `backend/src/shared/middleware/cloudflare-waf.middleware.ts`

### Infrastructure as Code

Terraform configuration: `infrastructure/terraform/cloudflare/`

- `main.tf` — Cloudflare provider, zone data source
- `waf.tf` — WAF rulesets (managed + custom + rate limit) + zone security settings
- `variables.tf` — zone_id, account_id, api_token (sensitive — use Vault/sealed-secrets)
- `outputs.tf` — ruleset IDs, zone name

---

> 📎 See also: [04-tech-stack](04-tech-stack.md) · [06-rbac-permission-matrix](06-rbac-permission-matrix.md) · [07-multi-tenant-architecture](07-multi-tenant-architecture.md) · [08-enterprise-deployment](08-enterprise-deployment.md)

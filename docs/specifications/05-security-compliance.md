---
title: "Security & Compliance"
version: "1.6.0"
status: Active
last_updated: "2026-05-28"
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

| Area | Control |
| --- | --- |
| Authentication | OAuth2/OIDC |
| Authorization | RBAC/ABAC |
| Secrets | AWS Secrets Manager (cloud deployment) / HashiCorp Vault (on-premise deployment) |
| Encryption | AES-256 |
| Transport | TLS 1.3 |
| Audit | Immutable logging |
| API Security | Rate limiting + **Cloudflare WAF** (see §5.5) |

Note : AWS Secrets Manager is the default for cloud deployments on AWS. HashiCorp Vault is used
for on-premise and hybrid deployments. See 04-tech-stack section 4.7 for the AWS Services list.

---

## 5.3 Compliance

Targets :

- ISO 27001
- SOC 2
- PDPA
- GDPR
- Construction safety regulations

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

SSO / SAML :

- Enterprise IdP (Azure AD, Google Workspace) → Keycloak SAML broker → Platform
- Keycloak acts as OIDC gateway to all upstream IdPs

API Auth :

- Service-to-service — mTLS + JWT (issued by Keycloak)
- External API clients — OAuth2 client credentials flow

---

## References

| ID | Title | Source |
| --- | --- | --- |
| [IEEE 830] | IEEE Recommended Practice for Software Requirements Specifications | IEEE Std 830-1998 |
| [ISO 27001] | Information Security Management Systems | ISO/IEC 27001:2022 |
| [OWASP-TOP10] | OWASP Top Ten Web Application Security Risks | [owasp.org/Top10](https://owasp.org/www-project-top-ten/) |
| [PDPA] | Personal Data Protection Act B.E. 2562 (2019) | Thailand PDPA |
| [GDPR] | General Data Protection Regulation | EU Regulation 2016/679 |
| [SOC2] | SOC 2 Type II Trust Service Criteria | AICPA TSC 2017 |
| [TLS13] | The Transport Layer Security (TLS) Protocol Version 1.3 | RFC 8446 |
| [OAuth2] | The OAuth 2.0 Authorization Framework | RFC 6749 |
| [OIDC] | OpenID Connect Core 1.0 | [openid.net/specs/openid-connect-core-1_0.html](https://openid.net/specs/openid-connect-core-1_0.html) |

---

## 5.5 Cloudflare WAF

**Decision:** Cloudflare WAF is the chosen WAF solution for Construction OS.

### Architecture

Traffic flow (all environments):

```text
Internet → Cloudflare Edge (WAF + DDoS + CDN) → AWS ALB → EKS Ingress → NestJS
```

Cloudflare acts as a **cloud-agnostic reverse proxy** in front of AWS infrastructure. The AWS ALB must only accept traffic from Cloudflare IP ranges (origin protection).

### Cloudflare Plan Requirement

Minimum: **Cloudflare Pro** (WAF custom rules + rate limiting). Enterprise recommended for construction enterprise customers requiring advanced bot management.

### Enabled Rule Sets

| Ruleset | Action | Notes |
| --- | --- | --- |
| Cloudflare Managed Ruleset | Execute | Covers OWASP Top 10, known CVEs |
| OWASP Core Rule Set (CRS) | Execute | Paranoia level 2 (balance security vs false positive) |
| Cloudflare Bot Management | Block bots | Score < 30 → block; 30–50 → CAPTCHA |
| Custom: Construction OS Rules | Block/Log | API path rules, file upload limits, tenant header validation |

### Rate Limiting (QM-7 alignment)

| Endpoint Pattern | Limit | Action |
| --- | --- | --- |
| `/api/v*/auth/*` | 10 req/min per IP | Block (429) |
| `/api/v*/` (general) | 100 req/min per user | Block (429) |
| `/api/v*/files/upload` | 20 req/min per user | Block (429) |
| `/health`, `/metrics` | 60 req/min per IP | Block (429) |

> **Note on path convention:** Construction OS backend uses `setGlobalPrefix('api/v1')` — all versioned API routes are at `/api/v1/...`. Health/metrics endpoints are excluded from the global prefix. File upload rate: **20 req/min**.

### Origin Protection (mandatory)

The AWS ALB security group **must** restrict inbound HTTPS (443) to Cloudflare IP ranges only. This prevents attackers from bypassing the WAF by connecting directly to the origin.

Cloudflare publishes current IP ranges at: `https://api.cloudflare.com/client/v4/ips`

See: `infrastructure/terraform/cloudflare/` and `infrastructure/kubernetes/security/cloudflare-origin-protection.yaml`

### Application-level Integration

NestJS services must:

1. Trust the `CF-Connecting-IP` header (not `X-Forwarded-For`) as the real client IP
2. Validate the `CF-Ray` header is present (confirms traffic passed through Cloudflare)
3. Log `CF-Ray` in all request logs for end-to-end tracing

See: `packages/@cos/extension-points/src/security/cloudflare-waf.middleware.ts`

### Infrastructure as Code

Terraform configuration: `infrastructure/terraform/cloudflare/`

- `main.tf` — Cloudflare provider, zone data source
- `waf.tf` — WAF rulesets (managed + custom + rate limit) + zone security settings
- `variables.tf` — zone_id, account_id, api_token (sensitive — use Vault/sealed-secrets)
- `outputs.tf` — ruleset IDs, zone name

---

> 📎 See also: [04-tech-stack](04-tech-stack.md) · [06-rbac-permission-matrix](06-rbac-permission-matrix.md) · [07-multi-tenant-architecture](07-multi-tenant-architecture.md) · [08-enterprise-deployment](08-enterprise-deployment.md)

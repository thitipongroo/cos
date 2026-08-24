---
title: 'ADR-003 — Keycloak for Identity and Authorization'
status: Accepted
last_updated: '2026-05-29'
authors:
  - thitipongroo
---

# ADR-003 — Keycloak for Identity and Authorization

**Status:** Accepted — Updated 2026-05-25
**Date:** 2026-01-15
**Deciders:** Engineering team

> ⚠️ **Update (2026-05-25):** The original ADR described "one realm per tenant" and listed a
> stale 7-role set. Both have been corrected below to match the current architecture.
> Authoritative sources: `05-security-compliance §5.4`, `07-multi-tenant-architecture §7.6`,
> and `06-rbac-permission-matrix §6.2`.

## Context

Construction OS needs enterprise-grade authentication supporting:

- JWT-based stateless API auth
- Multi-tenant realm isolation (tiered — shared realm for SMB/mid-market; dedicated realm for enterprise)
- RBAC (9 canonical roles — see `06-rbac-permission-matrix §6.2`)
- Future SSO integration (SAML/OIDC for enterprise tenants)

Options considered:

1. Custom JWT auth in NestJS
2. Auth0 / Okta (managed)
3. **Keycloak** (self-hosted, open-source)
4. Supabase Auth

## Decision

**Keycloak 24.x** — self-hosted, with a tiered realm model:

| Deployment Tier               | Keycloak Realm Strategy                                    |
| ----------------------------- | ---------------------------------------------------------- |
| Shared SaaS — SMB             | Shared realm; tenants isolated by `tenant_id` claim in JWT |
| Shared SaaS — Mid-market      | Shared realm; tenants isolated by `tenant_id` claim in JWT |
| Dedicated Tenant / Enterprise | Dedicated Keycloak realm per tenant                        |
| Hybrid / On-premise           | Dedicated Keycloak realm per tenant                        |

## Canonical Role Set (as of 2026-05-27)

Defined authoritatively in `06-rbac-permission-matrix §6.2` and the `UserRole` enum in
`docs/api/auth.openapi.yaml`. Role identifier `SUPER_ADMIN` was renamed to `SYSTEM_ADMIN`
per ADR-014 (2026-05-27):

| Role (display)                        | Enum value            |
| ------------------------------------- | --------------------- |
| System Admin (platform operator only) | `SYSTEM_ADMIN`        |
| Tenant Admin                          | `TENANT_ADMIN`        |
| Executive                             | `EXECUTIVE`           |
| Project Manager                       | `PROJECT_MANAGER`     |
| Site Engineer                         | `SITE_ENGINEER`       |
| Procurement Officer                   | `PROCUREMENT_OFFICER` |
| Finance                               | `FINANCE`             |
| Safety Officer                        | `SAFETY_OFFICER`      |
| CRM / Sales Manager                   | `CRM_SALES_MANAGER`   |

## Rationale

- Shared realm for SMB/mid-market: lower operational overhead; tenant isolation is enforced
  via the `tenant_id` claim in every JWT rather than realm-level separation
- Dedicated realm for enterprise: complete identity isolation; enables enterprise SSO
  (EP-AUTH-003) as a Keycloak identity provider configuration, not a code change
- RBAC roles are configured at Keycloak level — embedded in JWT claims
- NestJS Passport-JWT validates tokens — no Keycloak SDK in application code
- Open-source with strong community; no per-user pricing lock-in

## Consequences

- Keycloak cluster must be production-grade (HA, database-backed)
- `RequestContextMiddleware` extracts `tenant_id` and `user_id` from JWT; sets PostgreSQL
  `search_path` for schema-per-tenant tenants (mid-market) or passes `tenant_id` for
  shared-DB tenants (SMB) — see ADR-002 for isolation tier details
- Token TTL: access token 15 min, refresh token 7 days (rotated on use) — per `05-security-compliance §5.4`
- EP-AUTH-003 (Enterprise SSO) is a stub — Keycloak identity provider federation handles it

## Trade-offs accepted

- Self-hosted = operational overhead vs managed Auth0/Okta
- Keycloak admin UI learning curve
- Keycloak upgrade cadence must track security patches

---

## Alternatives Considered

| Option                    | Reason Rejected                                                                                                            |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Custom JWT auth in NestJS | Custom crypto is a security risk; no built-in user management, realm isolation, or SAML/OIDC federation for enterprise SSO |
| Auth0 / Okta (managed)    | Per-user pricing unsustainable at SaaS scale; vendor lock-in; tiered realm model harder to implement cleanly               |
| Supabase Auth             | Not enterprise-grade; no SAML/OIDC identity provider federation required by EP-AUTH-003                                    |

---

## References

- `docs/00-specifications/05-security-compliance.md` §5.4 — token TTL (access 15 min, refresh 7 days)
- `docs/00-specifications/06-rbac-permission-matrix.md` §6.2 — canonical role definitions
- `docs/00-specifications/07-multi-tenant-architecture.md` §7.6 — tenant provisioning and realm assignment strategy
- `docs/01-architecture/adr/002-schema-per-tenant.md` — isolation tier model this ADR's realm strategy maps to

---
title: 'ADR-010 — Kong Gateway for API Rate Limiting and Request Management'
status: Accepted
last_updated: '2026-05-29'
authors:
  - thitipongroo
---

# ADR-010: Kong Gateway for API Rate Limiting and Request Management

> **Status:** Accepted
>
> **Date:** 2026-05-27
>
> **Supersedes:** —

---

## Context

`docs/00-specifications/04-tech-stack.md` section 4.8 mandates Kong Gateway with the
following responsibilities: JWT validation, rate limiting per tenant and per API key,
tenant-based routing, request/response transformation, API usage analytics, and plugin
ecosystem for extensibility.

The previous implementation used **NestJS ThrottlerModule** for rate limiting at the
application layer, with Kong deferred to EP-API-001 (API monetization only). This
conflicted with spec §4.8 and created two problems:

1. Rate limiting at the application layer means requests consume infrastructure resources
   (network, load balancer, NestJS process) before being blocked — Kong blocks them at
   the edge.
2. JWT validation, tenant routing, and analytics were duplicated between NestJS middleware
   and the planned Kong layer — creating two code paths for the same concern.

---

## Decision

We will use **Kong Gateway (open-source, Kubernetes-native)** as the primary API gateway
for all rate limiting, JWT validation, tenant routing, and API analytics.

Kong is deployed as a Kubernetes service in front of the NestJS monolith
(configuration lives in `infrastructure/k8s/kong/`). NestJS retains its own guards
for defense-in-depth (authorization, business rule checks) but Kong is the
authoritative enforcement layer for rate limiting.

EP-API-001 (APIMonetizationProvider) is updated: Kong is now the infrastructure;
EP-API-001 covers advanced metering and billing integrations only (usage plans, quota
management for external API customers).

---

## Rationale

- **Spec authority:** spec §4.8 explicitly lists Kong as the API Gateway with rate
  limiting as a core responsibility — not deferred to an extension point.
- **Infrastructure-level protection:** Kong blocks over-limit requests before they
  reach the NestJS process, reducing compute waste on rejected requests.
- **Consolidation:** JWT validation, tenant routing, and analytics in one layer
  eliminates duplicate middleware code in NestJS.
- **Plugin ecosystem:** Kong's plugin system supports future needs (OAuth, response
  caching, request transformation) without NestJS code changes.
- **Kubernetes-native:** Kong Ingress Controller integrates directly with EKS and
  works with Istio (mTLS between Kong and backend services).

---

## Consequences

### Positive

- Rate limiting enforced at the edge — NestJS processes only legitimate traffic
- JWT validation centralized — NestJS guards focus on authorization, not authentication
- API usage analytics collected at Kong level — all traffic visible regardless of service
- Future API monetization (EP-API-001) has a platform to build on

### Negative / Trade-offs

- Additional Kubernetes deployment to manage (Kong pods, KongIngress CRDs)
- Rate limit configuration must be maintained in Kong declarative config (not NestJS code)
- Local development requires Kong in Docker Compose (adds ~500MB RAM to dev environment)

### Risks

- **Kong misconfiguration** could block legitimate traffic — mitigation: staging validation
  required before production; Phase 19 AUTO check for rate limit headers
- **NestJS ThrottlerModule** must be removed from Phase 16 implementation to avoid
  double-counting rate limits

---

## Alternatives Considered

| Option                 | Reason Rejected                                                                 |
| ---------------------- | ------------------------------------------------------------------------------- |
| NestJS ThrottlerModule | Application-layer only; conflicted with spec §4.8; no JWT validation or routing |
| AWS API Gateway        | Cloud-vendor lock-in; not Kubernetes-native; higher cost at scale               |
| NGINX rate limiting    | No plugin ecosystem; no API analytics; limited tenant-aware configuration       |

---

## References

- `docs/00-specifications/04-tech-stack.md` §4.8 — Kong Gateway responsibilities
- `docs/00-specifications/14-api-architecture.md` §14.2 — Rate limiting defaults
- `docs/00-specifications/05-security-compliance.md` §5.5 — WAF and rate limit rules

---

_Template source: `docs/01-architecture/adr/000-template.md`_
_Format: Based on Michael Nygard's ADR format_

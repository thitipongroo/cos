# ADR-010: Kong Gateway as API Gateway

**Date:** 2026-01-15
**Status:** Accepted
**Deciders:** thitipongroo
**Tags:** architecture | infra

---

## Context

Construction OS requires an API gateway that handles cross-cutting concerns at the
infrastructure level before requests reach NestJS services: JWT validation, tenant
identification, rate limiting, routing, and API analytics. Running these concerns
inside each NestJS service duplicates logic and wastes compute on requests that
should be blocked at the edge.

Three candidates were evaluated:

| Candidate | Notes |
| --- | --- |
| Kong Gateway (open-source) | Kubernetes-native, rich plugin ecosystem, self-hosted |
| AWS API Gateway | Managed, but vendor lock-in; limited plugin model |
| NGINX Ingress alone | No rate limiting or tenant-aware routing without custom Lua |

## Decision

**Kong Gateway (open-source, Kubernetes-native)** is the API gateway for Construction OS.

Kong is deployed as a Kubernetes Ingress controller in front of all NestJS services and
is responsible for:

- JWT validation and tenant claim extraction (tenant_id, tenant_tier)
- Rate limiting per tenant and per API key (primary infrastructure-layer enforcement)
- Tenant-based routing to upstream services
- Request/response transformation
- API usage analytics
- Plugin ecosystem for extensibility (OAuth, caching, logging)

Kong configuration lives in infrastructure/k8s/kong/.

## Rationale

- **Self-hosted:** no per-request cost; no vendor lock-in; runs on-premise identically
- **Kubernetes-native:** declarative KongIngress/KongPlugin CRDs; integrates with Helm
- **Rich plugin ecosystem:** rate-limiting, JWT, CORS, request-transformer, Prometheus
  metrics all available as first-class plugins without custom code
- **Separation of concerns:** blocks invalid/rate-limited requests before NestJS — avoids
  burning NestJS CPU on traffic that should be rejected at the gateway

AWS API Gateway was rejected due to vendor lock-in and incompatibility with on-premise
deployment targets (ENTERPRISE tier runs on customer infrastructure).

## Consequences

### Positive

- Cross-cutting concerns (auth, rate limiting) centralized in Kong; NestJS services are
  simpler and faster
- Rate limiting enforced before compute is consumed
- Kong Prometheus plugin provides per-route metrics without code changes
- Identical Kong configuration works on-premise (ENTERPRISE) and cloud (STARTER/PROFESSIONAL)

### Negative

- Kong is an additional operational component to manage, upgrade, and monitor
- Kong plugin configuration must be kept in sync with NestJS route changes
- Kong open-source has no management UI — configuration is code-only

### Neutral

- NestJS ThrottlerModule provides a second, application-layer rate limiting layer as
  defense-in-depth behind Kong (spec 05-security-compliance section 5.5)

## References

- spec section 4.8 API Gateway: docs/specifications/04-tech-stack.md
- spec section 5.5 Rate Limiting: docs/specifications/05-security-compliance.md
- C-01 concern resolved: Kong Gateway selected as API gateway

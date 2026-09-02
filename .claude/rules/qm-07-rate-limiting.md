---
paths:
  - "backend/src/app.module.ts"
  - "**/*throttler*"
  - "infrastructure/kubernetes/**"
---

# QM-7 — Rate Limiting

Indexed in: `context.md` §QUALITY MANDATES

- All public API endpoints: 100 req/min per tenant by default; burst allowance: 150 req/min for ≤ 10 consecutive seconds
- Authentication endpoints: 10 req/min per IP (brute force protection); account lockout after 5 consecutive failures for 15 minutes
- AI/LLM endpoints: 20 req/min per tenant (cost protection)
- File upload endpoints (`/api/v*/files/*`): **20 req/min per user** (spec §05 §5.5)
- Rate limiting via **Kong Gateway** (open-source, Kubernetes-native) at the infrastructure level — C-01 RESOLVED (spec §4.8; ADR-010); Kong enforces rate limits before requests reach NestJS, reducing compute waste on blocked requests; Kong also handles JWT validation, tenant routing, and API analytics per spec §4.8; API monetization covers billing/quota metering only — Kong is now the gateway infrastructure
- **Application-layer (NestJS ThrottlerModule)** — defense-in-depth behind Kong/Cloudflare WAF;
  `@nestjs/throttler` registered globally in `backend/src/app.module.ts` with Redis shared storage
  (`ThrottlerStorageRedisService`); `APP_GUARD` → `ThrottlerGuard`; per-endpoint overrides via
  `@Throttle()` decorator; same limits (100 req/min general, 10 auth, 20 file upload);
  `ThrottlerException` → HTTP 429 + `Retry-After` header (source: spec §05 §5.5)
- Tenants that require higher limits → expose via `TenantQuotaService`
- Rate limit headers in every response: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
- `429` responses must include `Retry-After` header with seconds until reset

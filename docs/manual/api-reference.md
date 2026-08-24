---
title: Construction OS — API Reference
last_updated: 2026-08-07
---

# API Reference

The **contracts** are the OpenAPI 3.1 specs in [`docs/api/`](../api/README.md) — 19 files, one per
service. This page is the conventions every one of them follows, so you do not have to infer them
from the YAML.

## Shape of every endpoint

- **Prefix `/api/v1/`** on everything (NestJS `setGlobalPrefix('api/v1')`, `backend/src/main.ts`).
  Versioned from the first commit — retrofitting is 10× more expensive (QM-2).
- **Authenticated by default.** Only `/auth/*` and the health probes are unauthenticated.
- **Tenant-scoped by middleware, not by controller.** Never re-derive `tenant_id` from a request body.
- **Validated by decorator.** `class-validator` DTOs (NestJS) or Pydantic models (FastAPI) — a
  hand-written `if` check is not sufficient (QM-4).

## Authentication — two paths, one Keycloak

| Path                     | Who                                          | Mechanism                                                                                       |
| ------------------------ | -------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **A — SMS OTP**          | Field roles (`SITE_WORKER`, `SITE_ENGINEER`) | Custom NestJS OTP module verifies the code, then **Keycloak Direct Grant** issues the RS256 JWT |
| **B — email + password** | Office / management roles                    | Keycloak OIDC over OAuth2; MFA (TOTP) required for `TENANT_ADMIN` and `FINANCE`                 |

Keycloak is the single source of truth for identity storage and JWT signing on **both** paths — there
is no custom email/password auth anywhere. Access token 15 min, refresh token 7 days.

External vendors are not a `CosRole`: the Vendor Portal authenticates a `VENDOR_PORTAL` principal via
magic link (Tier 1) or a vendor session token (Tier 2), scoped by
`platform.vendor_trading_relationships` rather than tenant RLS (ADR-030).

## Tenant isolation

`app.current_tenant_id` is set at request start and PostgreSQL **RLS** enforces isolation at the
database level — that is the _primary_ mechanism, not a backstop. An application-layer
`WHERE tenant_id = $1` is secondary defence-in-depth and never a replacement. The app role
(`app_user`) is never granted `BYPASSRLS`.

All SQL uses **schema-qualified** names (`procurement.vendors`, `finance.project_budgets`), never
bare table names — that is what keeps `search_path` from making isolation non-deterministic.

## Errors — QM-10

```json
{
  "error": {
    "code": "COS-PROC-042",
    "message": "Human-readable message (English)",
    "messageKey": "i18n.key.for.message",
    "details": {},
    "traceId": "opentelemetry-trace-id",
    "timestamp": "ISO8601"
  }
}
```

Register every new code in [`docs/api/error-codes.md`](../api/error-codes.md).

| Status | Use for                                                          |
| ------ | ---------------------------------------------------------------- |
| `400`  | Input validation failed (include field-level detail)             |
| `401`  | Unauthenticated                                                  |
| `403`  | Authenticated but unauthorized (include the required permission) |
| `404`  | Not found                                                        |
| `409`  | Conflict — optimistic lock, duplicate                            |
| `422`  | Business rule violation (e.g. a task completion gate failed)     |
| `429`  | Rate limited — must carry `Retry-After`                          |
| `500`  | Server error — never leak a stack trace or an internal path      |
| `503`  | Temporarily unavailable — maintenance, circuit breaker open      |

**Never return `200` with an error body. Never return `500` for a client error.**

## Rate limits — QM-7

Enforced at **Kong** before a request reaches NestJS, with `@nestjs/throttler` behind it as
defence-in-depth (Redis-backed, registered globally as an `APP_GUARD`).

| Scope                           | Limit                  |
| ------------------------------- | ---------------------- |
| General API                     | 100 req/min per tenant |
| Auth endpoints                  | 10 req/min per IP      |
| AI / LLM endpoints              | 20 req/min per tenant  |
| File upload (`/api/v*/files/*`) | 20 req/min per user    |

Every response carries `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`.

## Response requirements

- Security headers on **every** response: `Strict-Transport-Security`, `X-Content-Type-Options`,
  `X-Frame-Options: DENY`, `Referrer-Policy`, `Content-Security-Policy` (no `unsafe-inline` /
  `unsafe-eval` in production).
- `traceId` in every log line and every error body; `traceparent` propagated across HTTP and Kafka.
- **No PII in logs, traces or error messages** — IDs or `[REDACTED]` only.

## Changing an API

1. Update the service's `.openapi.yaml` in the same PR — CI fails on a stale spec.
2. New error code → [`error-codes.md`](../api/error-codes.md).
3. Breaking change (field removed/renamed, type changed, URL changed, auth changed) → **new version**;
   the old one stays functional ≥ 12 months, with ≥ 90 days' notice recorded in
   [`deprecation-schedule.md`](../api/deprecation-schedule.md) plus email and an in-app banner.
4. Non-breaking additions (new optional field, new endpoint) do **not** bump the version.
5. Never remove a JSON field from a response — mark it `@deprecated` in OpenAPI and keep it 6 months.

> 📎 [`docs/api/`](../api/README.md) (the contracts) ·
> [`specifications/14-api-architecture.md`](../specifications/14-api-architecture.md) (API
> architecture, §14.3 service→spec table, §14.4 versioning policy) ·
> [`specifications/06-rbac-permission-matrix.md`](../specifications/06-rbac-permission-matrix.md)
> (who may call what).

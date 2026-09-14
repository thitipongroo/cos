# Changelog

All notable changes to Construction OS will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **BREAKING CHANGE (deployment): file-service, credential-service and ai-gateway need
  `BACKEND_INTERNAL_URL`** (ADR-107). For a user token they now take `tenant_id`, `user_id` and `role` from
  the backend's `GET /api/v1/auth/identity`, not from the token's claims, which are Keycloak user
  attributes. Unset or unreachable, every user request to them answers `503` (file-service `COS-FILE-022`,
  credential-service `IDENTITY_UNAVAILABLE`) — they never fall back to the claims; only a backend `401` is a
  `401`. The URL is the backend's INTERNAL listener, port `3100` — the public port refuses these calls in
  production (Cloudflare WAF). Helm values set it for prod and staging; `docker-compose.yml` and
  `.env.example` set it locally. Service tokens are unaffected.

- **The backend listens on a second port, `INTERNAL_PORT` (default 3100)** (ADR-107). It serves only
  `GET /api/v1/auth/identity`, skips the Cloudflare WAF check, and answers 404 to every other path. The
  `cos-backend` chart adds the container and Service port `internal` and a NetworkPolicy that leaves `http`
  and `metrics` open to every source and admits `internal` from file-service, credential-service and
  ai-gateway pods only. Nothing that routes public traffic may target this port.

- **Keycloak identity attributes are admin-only** (ADR-107). The realm JSON sets
  `unmanagedAttributePolicy: ADMIN_EDIT`. A running realm keeps its old policy until
  `scripts/ops/keycloak-lock-identity-attributes.sh` runs against it; `--check` reports each realm. Users no
  longer see or edit `tenant_id`, `user_id` or `role` through the Keycloak Account API, and can no longer
  change their own `username` or `email` (`400 error-user-attribute-read-only`); first and last name stay
  editable, and the admin API — PDPA erasure — still overwrites both.

- **`POST /api/v1/users` refuses an email already used on the same Keycloak realm with `409`.** Its guard
  compared `keycloak_user_id` with the email and never matched, so a taken email reached Keycloak and came
  back as an unhandled error. It now compares the email case-insensitively among accounts of every tenant on
  the caller's realm, and a Keycloak `409` returns the same conflict.

- **A token's `sub` must now be the account its claims name** (ADR-106). `KeycloakJwtStrategy.validate()`
  refuses a token whose `sub` is not the `keycloak_user_id` of the `platform.users` row its `user_id` claim
  names. Kill switch `s1.identity.subject-binding`, default ON, evaluated globally only. An account whose
  stored `keycloak_user_id` is wrong can no longer sign in — run
  `scripts/readiness/check-keycloak-subject-binding.sh` against an environment first.

- **Several small tenants can now share the realm `construction-os`** (§7.6). Migration `20260914000001`
  replaces `UNIQUE (keycloak_realm)` with a partial unique index that exempts only that realm; every other
  realm is still held by one tenant, whatever its plan.

  **Deploy order — the backend first, the migration second.** Once two tenants share the realm, only
  ADR-106 keeps them apart. Roll out the backend carrying ADR-106 completely before `20260914000001` runs.
  To roll the backend back below ADR-106, run
  `backend/prisma/rollbacks/20260914000001_keycloak_realm_unique_except_shared.rollback.sql` first — it
  refuses once the shared realm holds two tenants, and then the backend must not be rolled back.

- **BREAKING CHANGE: every SYSTEM_ADMIN tenant action now requires a `justification`** (§6.7,
  product-owner decision 2026-09-14). `POST /api/v1/admin/tenants`, `PATCH …/{tenantId}/deactivate`,
  `PATCH …/{tenantId}/dedicated-db` and `PATCH …/{tenantId}/mark-contracted` answer `400` without a
  string of 10–500 characters (trimmed). `deactivate` gained a request body for it, and
  `mark-contracted`'s body is no longer optional. Each action now writes one `platform.audit_logs` row
  — tenant module actions wrote none before, although §20.4 said they did — in the action's own
  transaction, so an action that cannot be audited does not happen. The only caller found was
  `apps/web`'s admin panel, changed in the same commit. The CRM webhook
  (`POST /platform/webhooks/enterprise-contract-signed`) is unaffected: it is not a SYSTEM_ADMIN action
  and writes no admin audit row.

  **What an integrator must do:** send `justification` on those four requests. A SYSTEM_ADMIN whose
  JWT `user_id` has no `platform.users` row can no longer act at all, because the audit row's
  `actor_id` foreign key refuses it.

- **credential-service now rate-limits: 100 req/min**, keyed per authenticated user and falling back
  to source IP (`@fastify/rate-limit`, the §5.5 general limit). It previously had no rate limit of
  any kind while holding every tenant's AES-256-GCM encrypted issuer private keys, and two of its
  routes — `GET /tenants/:tenantId/did.json` and `GET /tenants/:tenantId/status-lists/:statusListId`
  — are unauthenticated by design. §14.5 recorded the mitigation as "IP-rate-limited", which was
  true only of the Kong route, and Kong is deployed nowhere.

  **Not labelled BREAKING**, but read this if you call those two GETs: a third-party verifier or an
  internal caller that exceeded 100 requests per minute previously received `200`s and now receives
  `429` with `Retry-After: 60`. Nothing on the platform polls them that fast; a client that does must
  back off. `GET /health` is registered before the limiter and is never throttled. The 429 body is
  the limiter's own `{ statusCode, error, message }`, not the service's `buildError` envelope.

### Added

- `@cos/service-identity` — the node-only identity client file-service and credential-service share
  (ADR-107): backend identity lookup, fail-closed errors, 30-second per-token cache. CI builds it before
  credential-service's unit and integration tests.
- `GET /api/v1/auth/identity` — the caller's verified `tenant_id`, `user_id` and database `role`, for internal
  services (ADR-107). Internal listener only (404 on the public port); 600 requests a minute per verified
  user; `503 COS-AUTH-004` when the backend cannot check the token or an identity kill switch is OFF.

- The enterprise-provisioning human gate over HTTP (§34.5): `GET /api/v1/admin/tenants/provisioning`
  (the `workflowState` of each ENTERPRISE tenant's run; `null` when a run exists but does not answer in
  5 s) and `POST …/{tenantId}/provisioning/approve` · `…/abort` (404 no run, 409 not at
  AWAITING_APPROVAL, 503 state unreadable). `GET /api/v1/admin/tenants` gains `dedicated_db_host` —
  the hostname only, never the credentialed URL.
- The workflow's query is registered as `workflowState`, as §34.3 names it; it was `state`. A run
  already parked at AWAITING_APPROVAL answers the new name once a worker on the new code picks it up —
  proven by `enterprise-provisioning-query-rename.workflow.spec.ts`. Any tool querying `state` by name
  must switch.

- `docs/api/credential.openapi.yaml` and `docs/api/platform.openapi.yaml` — credential-service had no
  OpenAPI document at all, and the monolith's `/api/v1/health/{live,ready}` and `/api/v1/flags`
  belonged to no domain document. Both are now in the §14.3 catalogue.
- `POST /api/v1/ai/transcribe`, `POST /api/v1/ai/intent`, `GET /api/v1/ai/usage` documented in
  `ai.openapi.yaml`, and `POST /api/v1/files/admin/{fileId}/recover` in `file.openapi.yaml`. All four
  had run since their ADRs shipped, carried by no document. §14.3 said voice transcription "is not
  yet exposed as a REST endpoint"; it has been for some time — corrected.
- `pnpm run lint:routes` (`scripts/ci/check-route-coverage.mjs`) — CI now fails when a route this
  repository serves appears in no OpenAPI document, across NestJS, Fastify and FastAPI. `ci.yml` had
  asserted this rule in a comment since 2026-08-24 with no script enforcing it; freshness compares
  timestamps and cannot see a route that is in no document.

- Terms of Use PDF + download receipt (ADR-092) — public `GET /api/v1/terms/metadata` and
  `GET /api/v1/terms/pdf` serve a byte-stable document; the mobile pre-auth screen's DOWNLOAD PDF
  button is live and pushes `(auth)/terms-of-use-downloaded`, which verifies the digest the server
  published against the bytes that landed. Reverses the 2026-08-09 decision to render it disabled.
- Phase 1: Foundation repository — monorepo scaffold, shared packages, local dev stack

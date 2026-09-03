# Changelog

All notable changes to Construction OS will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

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

---
paths:
  - "backend/src/shared/feature-flags/**"
  - "**/*feature-flag*"
  - "docs/registers/feature-flag-registry.md"
---

# QM-15 — Feature Flags & Progressive Delivery

Indexed in: `context.md` §QUALITY MANDATES

All user-facing features and high-risk changes must ship behind a feature flag.

- Feature flag system: **Unleash (open-source, self-hosted)** — single provider for cloud AND on-premise
  (product-owner decision 2026-07-04; ADR-049; replaces AWS AppConfig / LaunchDarkly plan)
- Delivery: **server-evaluated** — backend `FeatureFlagService` (`unleash-client`, 15s poll) evaluates per
  user/tenant; clients read `GET /api/v1/flags` and never hold flag-provider credentials (ADR-049)
- Local dev / degraded mode: `UNLEASH_URL` unset → fallback to registry defaults in
  `backend/src/shared/feature-flags/feature-flag.service.ts` (retrofit kill-switches fail-open);
  no Unleash server required for local dev
- Retrofit scope (product-owner decision 2026-07-04): critical surfaces only — AI/LLM endpoints, auth flows,
  financial mutations; other existing features are NOT retrofitted; flag registry in `docs/registers/feature-flag-registry.md`
- Flag naming convention: `{stage}.{domain}.{feature}` (e.g., `s1.procurement.bulk-upload`)
- **Mandatory flag scenarios:**
  - Any new UI screen or workflow step
  - Any new AI/LLM endpoint
  - Any database migration that modifies existing data (data backfill, column drop)
  - Any change to authentication or authorization logic
  - Any Kafka schema change
- **Progressive rollout order:** 1% of tenants → 10% → 50% → 100%; minimum 24 hours at each step unless a rollback is triggered
- Feature flags must be removed from code within 30 days of reaching 100% rollout; stale flags tracked in `docs/registers/feature-flag-cleanup-backlog.md`
- Emergency kill switch: every flag must be togglable to OFF within 60 seconds without a deployment

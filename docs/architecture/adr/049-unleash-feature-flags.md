# ADR-049: Unleash feature flags, server-evaluated delivery

**Date:** 2026-07-04
**Status:** Accepted
**Deciders:** Product owner
**Tags:** architecture, infra

---

## Context

QM-15 mandates feature flags for all user-facing features and high-risk changes, with a ≤60s
kill switch. The 2026-07-04 audit found no flag implementation existed — only AWS AppConfig env
placeholders. QM-15's original provider choice (AWS AppConfig, later LaunchDarkly) cannot serve
on-premise deployments (spec §08), and no spec section defined how flags reach web/mobile
clients or whether existing features must be retrofitted.

## Decision

Product-owner decisions (2026-07-04):

1. **Provider: Unleash (open-source, self-hosted)** — one provider for cloud (EKS) and
   on-premise, consistent with the platform's self-hosted OSS pattern (EMQX, MLflow,
   SonarQube CE). Replaces the AppConfig/LaunchDarkly plan in QM-15.
2. **Delivery: server-evaluated.** Backend `FeatureFlagService`
   (`backend/src/shared/feature-flags/`, `unleash-client`, 15s poll — kill switch well inside
   the 60s bound) evaluates flags per user/tenant. Clients call `GET /api/v1/flags`; they never
   talk to Unleash and hold no provider credentials. Endpoints are gated with
   `@FeatureFlag('<name>')` + a global `FeatureFlagGuard` (503 `COS-FLAG-001` when OFF).
3. **Retrofit scope: critical surfaces only** — AI/LLM endpoints, auth flows, financial
   mutations (permanent kill-switches, fail-open, registry: `docs/registers/feature-flag-registry.md`).
   No blanket retrofit of the existing 20 modules.

Local dev and unit tests run without an Unleash server: `UNLEASH_URL` unset → registry
defaults served (fail-open for kill-switches). The Unleash server (staging/production) is
deployed on EKS; its manifest ships with the first progressive-rollout flag (not required for
the kill-switch retrofit, which degrades safely to defaults).

## Rationale

- AppConfig is AWS-only — a second on-prem provider would mean two flag systems to operate
  and test. Unleash serves both from one codebase.
- Server-evaluated delivery keeps evaluation, auditing, and the kill switch in one place,
  avoids shipping provider SDKs/credentials into web/mobile, and lets offline mobile cache the
  last-known flag map.
- Alternatives rejected: client SDKs per app (credential + offline complexity), in-house
  DB-backed flags (violates QM-15's managed-provider requirement and re-invents rollout
  strategies Unleash already has).

## Consequences

### Positive

- QM-15 gap closed: kill switch ≤60s without deployment; single flag registry.
- On-prem story resolved without a second provider.

### Negative

- One more self-hosted service to operate at Stage 2+ (Unleash + its Postgres schema).
- Flag reads add an in-memory evaluation per gated request (no network hop — client polls).

## Updated artifacts

- `context.md` QM-15 (provider, delivery, retrofit scope)
- `backend/src/shared/feature-flags/` (service, guard, decorator, controller, module, tests)
- `.env.example` (`UNLEASH_*` replaces `APPCONFIG_*`)
- `docs/registers/feature-flag-registry.md`, `docs/api/error-codes.md` (COS-FLAG-001)

# Feature Flag Registry (QM-15; ADR-049)

Provider: **Unleash** (self-hosted). Delivery: server-evaluated via `GET /api/v1/flags`.
Naming: `{stage}.{domain}.{feature}`. Fallback defaults live in
`backend/src/shared/feature-flags/feature-flag.service.ts` (`DEFAULT_FLAGS`) and apply when
Unleash is not configured or unreachable.

Retrofit kill-switches are **fail-open** (default ON): a flag-service outage must never
disable a live production feature. New-feature flags should default OFF until rollout.

| Flag                                   | Gates                                                                                                                                                                                                                                                      | Fallback                          | Cleanup due             |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ----------------------- |
| `s1.identity.sms-otp-login`            | `POST /api/v1/auth/otp/request`, `POST /api/v1/auth/otp/verify` (Path A login)                                                                                                                                                                             | ON                                | kill-switch — permanent |
| `s1.finance.payment-mutations`         | `POST /api/v1/finance/payments`, `PATCH /api/v1/finance/payments/:id/approve`, `POST /api/v1/finance/billing`, `PATCH /api/v1/finance/billing/:id/approve`                                                                                                 | ON                                | kill-switch — permanent |
| `s1.ai.report-generation`              | AI report generation (`services/ai-gateway` — see registry note below)                                                                                                                                                                                     | ON                                | kill-switch — permanent |
| `s1.ai.completions`                    | `POST /api/v1/ai/completions` (general LLM completion endpoint, `services/ai-gateway`)                                                                                                                                                                     | ON                                | kill-switch — permanent |
| `s1.web.client-validation`             | Client-side form validation in `apps/web` (`@cos/schemas` + react-hook-form resolver)                                                                                                                                                                      | OFF                               | 30 days after 100%      |
| `s1.identity.authoritative-role-check` | `KeycloakJwtStrategy.validate()` — resolve `platform.users.is_active` and the effective role from the DB per request instead of trusting the JWT claim (ADR-077; security review F1b/F2b). OFF re-opens those findings by design; incident mitigation only | ON                                | kill-switch — permanent |
| `s1.tenant.encrypted-db-url`           | Encrypt `platform.tenants.dedicated_db_url` (AES-256-GCM) on WRITE in `TenantService` (security review F5b). Reads always accept both formats, so it is safe to flip either way; enterprise provisioning always encrypts (no DI in the Temporal worker)    | OFF                               | 30 days after 100%      |
| `s1.identity.data-export`              | `POST /api/v1/users/me/data-export`, `GET /api/v1/users/me/data-export`, `GET /api/v1/users/me/data-export/:id/download` — PDPA §30/§31 subject access + portability (ADR-078)                                                                             | OFF → **must flip to ON at 100%** | kill-switch — permanent |

Notes:

- Retrofit scope per product-owner decision 2026-07-04: critical surfaces only
  (AI/LLM endpoints, auth flows, financial mutations). No further retrofit without a new decision.
- `s1.ai.report-generation` is enforced inside `services/ai-gateway` (`flags.py` polls the
  backend `GET /api/v1/flags` with a 15s TTL via `BACKEND_FLAGS_URL`; fail-open) — gates all
  four `/api/v1/ai/reports/*` generation endpoints with 503 `COS-FLAG-001`.
- `s1.ai.completions` is enforced the same way inside `services/ai-gateway` — gates
  `POST /api/v1/ai/completions` with 503 `COS-FLAG-001`.
- `s1.web.client-validation` is the one **client-enforced** flag: `apps/web` reads it from
  `GET /api/v1/flags` via `useFlag()` and, when off, mounts forms without a resolver. It is not a
  kill-switch for a server surface, so it is **fail-closed** — an unreachable flag endpoint leaves
  forms on server-only validation (QM-4 `class-validator`), the behaviour that shipped before it.
  Backend Unleash poll (15s) + client refetch (30s) keeps worst-case propagation at 45s, inside
  the QM-15 60-second bound.
- `s1.identity.data-export` is the one flag whose fallback **changes** during its life, and the
  change is not optional. It ships OFF because it is a new feature and this registry says new
  features default OFF until rollout. Once rolled out it must become ON, because a fail-closed
  fallback on this surface means an Unleash outage suspends a **statutory right**: PDPA §30 gives
  the controller 30 days to answer a verified request, and "the flag service was unreachable" is not
  an answer to a regulator. It gates the download route as well as the request route — the incident
  it exists for is a bad join placing one person's rows in another's archive, and in that incident
  the archives already written to MinIO are exactly what must stop being served.
- Stale flags (100% rollout > 30 days) move to `cleanup-backlog.md` (QM-15) — kill-switches are
  exempt (permanent operational controls).

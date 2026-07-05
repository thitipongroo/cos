# Feature Flag Registry (QM-15; ADR-049)

Provider: **Unleash** (self-hosted). Delivery: server-evaluated via `GET /api/v1/flags`.
Naming: `{stage}.{domain}.{feature}`. Fallback defaults live in
`backend/src/shared/feature-flags/feature-flag.service.ts` (`DEFAULT_FLAGS`) and apply when
Unleash is not configured or unreachable.

Retrofit kill-switches are **fail-open** (default ON): a flag-service outage must never
disable a live production feature. New-feature flags should default OFF until rollout.

| Flag                           | Gates                                                                                                                                                      | Fallback | Cleanup due             |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------- |
| `s1.identity.sms-otp-login`    | `POST /api/v1/auth/otp/request`, `POST /api/v1/auth/otp/verify` (Path A login)                                                                             | ON       | kill-switch — permanent |
| `s1.finance.payment-mutations` | `POST /api/v1/finance/payments`, `PATCH /api/v1/finance/payments/:id/approve`, `POST /api/v1/finance/billing`, `PATCH /api/v1/finance/billing/:id/approve` | ON       | kill-switch — permanent |
| `s1.ai.report-generation`      | AI report generation (`services/ai-gateway` — see registry note below)                                                                                     | ON       | kill-switch — permanent |

Notes:

- Retrofit scope per product-owner decision 2026-07-04: critical surfaces only
  (AI/LLM endpoints, auth flows, financial mutations). No further retrofit without a new decision.
- `s1.ai.report-generation` is enforced inside `services/ai-gateway` (`flags.py` polls the
  backend `GET /api/v1/flags` with a 15s TTL via `BACKEND_FLAGS_URL`; fail-open) — gates all
  four `/api/v1/ai/reports/*` generation endpoints with 503 `COS-FLAG-001`.
- Stale flags (100% rollout > 30 days) move to `cleanup-backlog.md` (QM-15) — kill-switches are
  exempt (permanent operational controls).

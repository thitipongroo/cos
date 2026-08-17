# Feature Flag Registry (QM-15; ADR-049)

Provider: **Unleash** (self-hosted). Delivery: server-evaluated via `GET /api/v1/flags`.
Naming: `{stage}.{domain}.{feature}`. Fallback defaults live in
`backend/src/shared/feature-flags/feature-flag.service.ts` (`DEFAULT_FLAGS`) and apply when
Unleash is not configured or unreachable.

Retrofit kill-switches are **fail-open** (default ON): a flag-service outage must never
disable a live production feature. New-feature flags should default OFF until rollout.

| Flag                                   | Gates                                                                                                                                                                                                                                                      | Fallback                            | Cleanup due             |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ----------------------- |
| `s1.identity.sms-otp-login`            | `POST /api/v1/auth/otp/request`, `POST /api/v1/auth/otp/verify` (Path A login)                                                                                                                                                                             | ON                                  | kill-switch — permanent |
| `s1.finance.payment-mutations`         | `POST /api/v1/finance/payments`, `PATCH /api/v1/finance/payments/:id/approve`, `POST /api/v1/finance/billing`, `PATCH /api/v1/finance/billing/:id/approve`                                                                                                 | ON                                  | kill-switch — permanent |
| `s1.ai.report-generation`              | AI report generation (`services/ai-gateway` — see registry note below)                                                                                                                                                                                     | ON                                  | kill-switch — permanent |
| `s1.ai.completions`                    | `POST /api/v1/ai/completions` (general LLM completion endpoint, `services/ai-gateway`)                                                                                                                                                                     | ON                                  | kill-switch — permanent |
| `s1.web.client-validation`             | Client-side form validation in `apps/web` (`@cos/schemas` + react-hook-form resolver)                                                                                                                                                                      | OFF                                 | 30 days after 100%      |
| `s1.identity.authoritative-role-check` | `KeycloakJwtStrategy.validate()` — resolve `platform.users.is_active` and the effective role from the DB per request instead of trusting the JWT claim (ADR-077; security review F1b/F2b). OFF re-opens those findings by design; incident mitigation only | ON                                  | kill-switch — permanent |
| `s1.tenant.encrypted-db-url`           | Encrypt `platform.tenants.dedicated_db_url` (AES-256-GCM) on WRITE in `TenantService` (security review F5b). Reads always accept both formats, so it is safe to flip either way; enterprise provisioning always encrypts (no DI in the Temporal worker)    | OFF                                 | 30 days after 100%      |
| `s1.identity.data-export`              | `POST /api/v1/users/me/data-export`, `GET /api/v1/users/me/data-export`, `GET /api/v1/users/me/data-export/:id/download` — PDPA §30/§31 subject access + portability (ADR-078)                                                                             | **ON** (flipped 2026-08-05 at 100%) | kill-switch — permanent |
| `s1.identity.device-attestation`       | `DeviceTrustService.registerDevice()` — whether a Play Integrity / App Attest token is sent for server-side verification (ADR-082). Checked in code, NOT as a route decorator: a 503 on enrolment would make a Google outage break device enrolment        | ON                                  | kill-switch — permanent |
| `s1.identity.device-trust-score`       | `GET /api/v1/auth/devices/:deviceId/trust` — the rule-based device trust score (ADR-081). A route decorator here, unlike the attestation flag above: the score is advisory and gates nothing, so a 503 removes a panel and breaks no flow                  | OFF                                 | kill-switch — permanent |
| `s1.identity.privacy-inquiry`          | `POST /api/v1/privacy/inquiries` — the pre-auth inquiry channel on the Privacy Policy screen (ADR-091). Gates the PUBLIC write only; the SYSTEM_ADMIN reads beside it stay reachable so a queue accepted before the switch was thrown can still be worked  | OFF                                 | kill-switch — permanent |

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
- `s1.identity.data-export` is the one flag whose fallback **changed** during its life, and the
  change was not optional. It shipped OFF because it was a new feature and this registry says new
  features default OFF until rollout. **It reached 100% and was flipped ON on 2026-08-05**, because a
  fail-closed fallback on this surface means an Unleash outage suspends a **statutory right**: PDPA
  §30 gives the controller 30 days to answer a verified request, and "the flag service was
  unreachable" is not an answer to a regulator. It gates the download route as well as the request
  route — the incident it exists for is a bad join placing one person's rows in another's archive,
  and in that incident the archives already written to MinIO are exactly what must stop being served.
  **Do not flip it back as a matter of routine.** Turning it off is now an incident action, and the
  incident must be closed by turning it back on rather than by leaving it off.
- `s1.identity.privacy-inquiry` is a **permanent** kill-switch rather than a rollout flag, even
  though it ships OFF like any new feature. The route it gates is the one endpoint in the platform an
  unauthenticated stranger can write a row through, so the switch is the abuse control: a spam wave is
  stopped in under 60 seconds without a deploy (QM-15). Its fallback is deliberately the OPPOSITE of
  `s1.identity.data-export` above, and the difference is what OFF costs a person. Data-export OFF
  suspends a statutory right with no other route. Privacy-inquiry OFF removes an ADDITIONAL channel —
  the Privacy Policy screen still publishes the Data Protection Office address beside the form, and
  that address, not this endpoint, is the PDPA §37(3) contact.
- Stale flags (100% rollout > 30 days) move to `cleanup-backlog.md` (QM-15) — kill-switches are
  exempt (permanent operational controls).

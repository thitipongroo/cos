# Construction OS — PDPA Control Tracking

> **Purpose:** Track implementation status of Thai Personal Data Protection Act (PDPA, B.E. 2562)
> controls. Named as the PDPA controls tracker by spec §05-security-compliance §5.3.1 and referenced
> by `docs/compliance/data-residency-policy.md` §5. Audit cadence: annual, triggered 6 months before
> the first Thai enterprise customer onboards (§5.3.1).

---

## How to read this file

Every row states what the repository can be shown to contain **today** — verified against
`backend/prisma/migrations/`, `backend/prisma/schema.prisma`, `backend/src/`, and the sibling
compliance documents on the date in the Verified column. Nothing here is aspirational.

| Status    | Meaning                                                                      |
| --------- | ---------------------------------------------------------------------------- |
| `DONE`    | Implemented and verifiable on disk today                                     |
| `PARTIAL` | Mechanism exists but does not yet satisfy the obligation end-to-end          |
| `OPEN`    | Not implemented                                                              |
| `N/A S1`  | Not applicable at Stage 1 (the platform does not process this data category) |

A row marked `OPEN` or `PARTIAL` must never be described to a data subject as if it were `DONE` —
that is the failure mode this file exists to prevent (see § Known corrections).

Ownership: `R-03` in the master Risk Register assigns PDPA risk to **DPO / Legal**. No DPO is
appointed at Stage 1 (PDPA-05), so every `OPEN` row below is currently unowned — closing PDPA-05 is
the prerequisite for assigning the rest.

---

## §37 — Controller obligations

| ID      | PDPA ref | Obligation                                        | Implementation on disk                                                                                                                                                                                           | Status    | Verified   |
| ------- | -------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---------- |
| PDPA-01 | §37(1)   | Security measures appropriate to the risk         | AES-256-GCM field encryption (ADR-035); TLS 1.3 pinned at ingress (`infrastructure/kubernetes/cert-manager/cert-manager.yml:130` — `ssl-protocols: 'TLSv1.3'`); AES-256 SSE-KMS + CMK per §5.2.1                 | `DONE`    | 2026-08-03 |
| PDPA-02 | §37(2)   | Prevent unauthorised disclosure to third parties  | RLS `rls_tenant_isolation` on every domain table; `app_user` never granted BYPASSRLS (ADR-031); `isolation-tests` job in `.github/workflows/ci.yml:408` runs `backend/test/tenant-isolation.integration.spec.ts` | `DONE`    | 2026-08-03 |
| PDPA-03 | §37(3)   | Reachable controller contact published            | Pre-auth Privacy Policy screen renders the address from `EXPO_PUBLIC_DPO_EMAIL`; renders disabled while unset                                                                                                    | `PARTIAL` | 2026-08-03 |
| PDPA-04 | §37(4)   | Breach notification to the Office within 72 hours | No breach-notification workflow exists in `backend/src/`                                                                                                                                                         | `OPEN`    | 2026-08-03 |
| PDPA-05 | §41      | Data Protection Officer appointed                 | Not appointed. `data-flow-map.md` § Review schedule assigns an **External DPO** at the Stage 2→3 gate                                                                                                            | `OPEN`    | 2026-08-03 |

---

## §30–§34 — Data subject rights

Status is taken from `docs/compliance/data-flow-map.md` § Data subject rights implementation and
re-verified against the backend routes. **No route exists for any of these today** — a `grep` for
`data-export` across `backend/src/modules/identity` returns nothing — so requests are handled
manually through the controller contact (PDPA-03).

| ID      | PDPA ref | Right               | Planned implementation                        | Status   | Verified   |
| ------- | -------- | ------------------- | --------------------------------------------- | -------- | ---------- |
| PDPA-10 | §30      | Access              | `GET /api/v1/identity/me/data-export`         | `OPEN`   | 2026-08-03 |
| PDPA-11 | §31      | Portability         | `GET /api/v1/identity/me/data-export` → JSON  | `OPEN`   | 2026-08-03 |
| PDPA-12 | §32      | Object              | Marketing opt-out — not applicable at Stage 1 | `N/A S1` | 2026-08-03 |
| PDPA-13 | §33      | Erasure             | `DELETE /api/v1/identity/me` → anonymisation  | `OPEN`   | 2026-08-03 |
| PDPA-14 | §34      | Restrict processing | Account suspension (ADMIN action)             | `OPEN`   | 2026-08-03 |

Response deadline for a verified request: **30 days** (PDPA §32).

---

## §19 — Consent

| ID      | Obligation                                     | Implementation on disk                                                    | Status | Verified   |
| ------- | ---------------------------------------------- | ------------------------------------------------------------------------- | ------ | ---------- |
| PDPA-20 | Consent captured before PII is stored          | No consent table or consent capture exists in any migration               | `OPEN` | 2026-08-03 |
| PDPA-21 | Consent withdrawable as easily as it was given | Not implemented                                                           | `OPEN` | 2026-08-03 |
| PDPA-22 | Consent record retrievable for audit           | `data-residency-policy.md` §3 assumes a "Keycloak consent claim" — absent | `OPEN` | 2026-08-03 |

---

## §26 — Sensitive personal data

| ID      | Category              | Collected at Stage 1                                                                              | Status    | Verified   |
| ------- | --------------------- | ------------------------------------------------------------------------------------------------- | --------- | ---------- |
| PDPA-30 | Biometric identifiers | **No** — no biometric column in any migration; `BiometricCheckIn` remains an unimplemented EP     | `N/A S1`  | 2026-08-03 |
| PDPA-31 | Faces in site photos  | Photos may incidentally contain faces; no facial recognition is performed (`data-flow-map.md` §5) | `PARTIAL` | 2026-08-03 |
| PDPA-32 | National ID           | **No** — no `national_id` column exists in any migration                                          | `N/A S1`  | 2026-08-03 |

---

## §6 / §37 — Data inventory, residency and retention

| ID      | Obligation                             | Authoritative document                                                                                                                                                                                                                                          | Status    | Verified   |
| ------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---------- |
| PDPA-40 | Record of processing activities (RoPA) | `data-flow-map.md` — 8 service flows + processor table                                                                                                                                                                                                          | `PARTIAL` | 2026-08-03 |
| PDPA-41 | Retention period defined per data type | `data-retention-policy.md`                                                                                                                                                                                                                                      | `PARTIAL` | 2026-08-03 |
| PDPA-42 | Data residency enforced                | `data-residency-policy.md`; per-tenant `platform.tenants.data_region`                                                                                                                                                                                           | `PARTIAL` | 2026-08-03 |
| PDPA-43 | Cross-border transfer documented       | OTP SMS via AWS SNS `ap-southeast-1` (§5.3.1); OpenAI (USA, sanitised)                                                                                                                                                                                          | `PARTIAL` | 2026-08-03 |
| PDPA-44 | DPA signed with every processor        | AWS signed; **OpenAI and Cloudflare OPEN** (`data-flow-map.md`)                                                                                                                                                                                                 | `OPEN`    | 2026-08-03 |
| PDPA-45 | PII never written to logs or traces    | **Convention only.** `@cos/logger` configures pino with NO `redact` option (`packages/@cos/logger/src/logger.ts`), so nothing prevents a developer from logging PII. The allowlist in STRIDE DP-8 (§5.9) is scoped to the credential service, not platform-wide | `OPEN`    | 2026-08-03 |

`PDPA-41` and `PDPA-42` are `PARTIAL`, not `DONE`, because the documents exist and are now accurate
but the enforcement they describe (`TenantRoutingMiddleware` regional routing, automated retention
purge jobs) is not implemented in `backend/src/`.

---

## Known corrections

| Date       | Correction                                                                                                                                                                               |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-03 | `data-flow-map.md` listed date of birth, national ID and bank account as collected PII. None exist in the schema. The mobile privacy notice had repeated all three to users — corrected. |
| 2026-08-03 | `data-flow-map.md` named a `site_ops.check_ins` table that does not exist, and described GPS as check-in only. GPS is on 5 tables — corrected.                                           |
| 2026-08-03 | `data-flow-map.md` pinned every flow to `ap-southeast-1`, breaching residency for Thai tenants (must be `ap-southeast-7`, §5.6) — corrected.                                             |

---

## Review schedule

| Event                          | Reviewer              | Action                                                      |
| ------------------------------ | --------------------- | ----------------------------------------------------------- |
| Stage 1 → Stage 2 gate         | Product owner + legal | Close PDPA-03, PDPA-04, PDPA-20; sign OpenAI/Cloudflare DPA |
| Stage 2 → Stage 3 gate         | External DPO          | Full audit; close PDPA-05 and the §30–§34 rights rows       |
| Annual                         | DPO / Legal           | Re-verify every row against the code; update Verified date  |
| Any new PII field or processor | Engineering lead      | Update `data-flow-map.md` and this file before it ships     |

---

## Related documents

- `docs/specifications/05-security-compliance.md` §5.3.1 — audit workflow; names this file
- `docs/compliance/data-flow-map.md` — personal data flow map (RoPA)
- `docs/compliance/data-retention-policy.md` — retention period per entity type
- `docs/compliance/data-residency-policy.md` — region assignment per tenant
- `docs/compliance/soc2-controls.md` — SOC 2 Type II control tracking

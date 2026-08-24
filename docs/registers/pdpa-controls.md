# Construction OS — PDPA Control Tracking

> **Purpose:** Track implementation status of Thai Personal Data Protection Act (PDPA, B.E. 2562)
> controls. Named as the PDPA controls tracker by spec §05-security-compliance §5.3.1 and referenced
> by `docs/policies/data-residency-policy.md` §5. Audit cadence: annual, triggered 6 months before
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

| ID      | PDPA ref | Obligation                                        | Implementation on disk                                                                                                                                                                                                                                                                                  | Status    | Verified   |
| ------- | -------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---------- |
| PDPA-01 | §37(1)   | Security measures appropriate to the risk         | AES-256-GCM field encryption (ADR-035); TLS 1.3 pinned at ingress (`infrastructure/kubernetes/cert-manager/cert-manager.yml:130` — `ssl-protocols: 'TLSv1.3'`); AES-256 SSE-KMS + CMK per §5.2.1                                                                                                        | `DONE`    | 2026-08-03 |
| PDPA-02 | §37(2)   | Prevent unauthorised disclosure to third parties  | RLS `rls_tenant_isolation` on every domain table; `app_user` never granted BYPASSRLS (ADR-031); `isolation-tests` job in `.github/workflows/ci.yml:408` runs `backend/test/tenant-isolation.integration.spec.ts`                                                                                        | `DONE`    | 2026-08-03 |
| PDPA-03 | §37(3)   | Reachable controller contact published            | Pre-auth Privacy Policy screen renders the address from `EXPO_PUBLIC_DPO_EMAIL` (set to `support@construction-os.com`, PO 2026-08-03); renders disabled while unset. `PARTIAL`, not `DONE`: this is the general support address, not a dedicated DPO mailbox, because no DPO is appointed yet (PDPA-05) | `PARTIAL` | 2026-08-03 |
| PDPA-04 | §37(4)   | Breach notification to the Office within 72 hours | No breach-notification workflow exists in `backend/src/`                                                                                                                                                                                                                                                | `OPEN`    | 2026-08-03 |
| PDPA-05 | §41      | Data Protection Officer appointed                 | Not appointed. `data-flow-map.md` § Review schedule assigns an **External DPO** at the Stage 2→3 gate                                                                                                                                                                                                   | `OPEN`    | 2026-08-03 |

---

## §30–§34 — Data subject rights

Status is taken from `docs/registers/data-flow-map.md` § Data subject rights implementation and
re-verified against the backend routes.

**Access and portability are now self-service** (ADR-078, 2026-08-05). The paragraph that stood here
until then said "No route exists for any of these today — a `grep` for `data-export` across
`backend/src/modules/identity` returns nothing"; that grep now returns a controller, a service, a
collector, a serializer and a Temporal workflow. Erasure and restriction are still handled manually
through the controller contact (PDPA-03).

The route prefix also changed: ADR-078 rejected the `/api/v1/identity/me/...` path sketched here
originally, because `identity` is not a route prefix in this API and inventing a third namespace for
one feature would have left two ways to say "me". The paths below are the ones that exist.

| ID      | PDPA ref | Right               | Implementation on disk                                                                                                                                                                                                                                                                                                                                                          | Status   | Verified   |
| ------- | -------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------- |
| PDPA-10 | §30      | Access              | `POST /api/v1/users/me/data-export` (step-up verified) · `GET /api/v1/users/me/data-export` · `GET …/:id/download`. Collector reads all five @pdpa categories across BOTH databases; mobile screen at `apps/mobile/src/app/(app)/data-export.tsx`                                                                                                                               | `DONE`   | 2026-08-05 |
| PDPA-11 | §31      | Portability         | Same endpoints; `format: JSON \| CSV` — JSON preserves types, CSV is one file per table. Archive assembled by `data-export.workflow.ts`, delivered as a signed URL minted per request                                                                                                                                                                                           | `DONE`   | 2026-08-05 |
| PDPA-12 | §32      | Object              | Marketing opt-out — not applicable at Stage 1                                                                                                                                                                                                                                                                                                                                   | `N/A S1` | 2026-08-03 |
| PDPA-13 | §33      | Erasure             | `DELETE /api/v1/identity/me` → anonymisation. **Still not implemented** — the SELF-SERVICE route does not exist. An account holder's data CAN now be erased, but only through the tenant-operator desk (PDPA-48), which since 2026-08-23 reaches `platform.users` and the Keycloak account as well. That is the controller acting on a request, not the subject acting directly | `OPEN`   | 2026-08-23 |
| PDPA-14 | §34      | Restrict processing | Account suspension (ADMIN action). Not implemented                                                                                                                                                                                                                                                                                                                              | `OPEN`   | 2026-08-03 |

**PDPA-10 and PDPA-11 became `DONE` on 2026-08-05**, when `s1.identity.data-export` reached 100% and
its fallback was flipped ON (`docs/registers/feature-flag-registry.md`). They were `PARTIAL` until that day —
the mechanism was complete and tested, but a flag that ships OFF means the right is not exercisable
by a data subject, and this file's own rule is that a `PARTIAL` row must never be described to a
subject as if it were `DONE`.

The flag remains a permanent kill switch. Turning it off is an incident action that **suspends a
statutory right** for as long as it is off, so it is closed by turning it back on — not by leaving it
off. If it is ever left off, these two rows revert to `PARTIAL` on the same day.

Response deadline for a verified request: **30 days** (PDPA §32). The platform commits to no shorter
deadline: the export is produced by a workflow that reads every domain schema, and no SLA for it
exists in ADR-078 or anywhere else — which is why the mobile screen reports the request's actual
state instead of the mockup's "within 24 hours".

---

## §19 — Consent

| ID      | Obligation                                     | Implementation on disk                                                                                                                                                                                                                                                                                                         | Status    | Verified   |
| ------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- | ---------- |
| PDPA-20 | Consent captured before PII is stored          | `platform.consent_records` (migration `20260804000002_consent_records`) + `ConsentService.requireConsent()`, injected by the site-ops, workforce and finance write paths that persist consent-basis PII (ADR-079). Silence is never consent: a category with no recorded decision reports `granted:false`                      | `PARTIAL` | 2026-08-05 |
| PDPA-21 | Consent withdrawable as easily as it was given | `POST /api/v1/users/me/consents` takes a grant and a withdrawal through the identical route and body; the mobile consent screen offers both with one control. Withdrawal is forward-only — it stops future collection, it does not delete what was lawfully collected (that is erasure, PDPA-13)                               | `DONE`    | 2026-08-05 |
| PDPA-22 | Consent record retrievable for audit           | Append-only: every grant and every withdrawal inserts a new row and no prior row is mutated, so the history §19 requires survives. `GET /api/v1/users/me/consents` returns all five @pdpa categories with their lawful basis. The "Keycloak consent claim" `data-residency-policy.md` §3 assumed never existed and is not used | `DONE`    | 2026-08-05 |

**PDPA-20 is `PARTIAL`, not `DONE`.** The mechanism exists and the write paths that were identified
in ADR-079 call it, but "before PII is stored" is a claim about **every** write path in the platform,
and no automated check enforces that a new one calls `requireConsent()`. Until such a check exists —
the same class of gap as PDPA-45, which is `OPEN` for being convention-only — this row asserts a
mechanism, not a guarantee. Categories on the CONTRACT basis (identity, contact — PDPA §24(3)) are
outside the claim by design: they are processed without consent and the route out is erasure.

---

## §26 — Sensitive personal data

| ID      | Category              | Collected at Stage 1                                                                              | Status    | Verified   |
| ------- | --------------------- | ------------------------------------------------------------------------------------------------- | --------- | ---------- |
| PDPA-30 | Biometric identifiers | **No** — no biometric column in any migration; `BiometricCheckIn` remains an unimplemented EP     | `N/A S1`  | 2026-08-03 |
| PDPA-31 | Faces in site photos  | Photos may incidentally contain faces; no facial recognition is performed (`data-flow-map.md` §5) | `PARTIAL` | 2026-08-03 |
| PDPA-32 | National ID           | **No** — no `national_id` column exists in any migration                                          | `N/A S1`  | 2026-08-03 |

---

## §6 / §37 — Data inventory, residency and retention

| ID      | Obligation                                                                   | Authoritative document                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Status    | Verified   |
| ------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---------- |
| PDPA-40 | Record of processing activities (RoPA)                                       | `data-flow-map.md` — **10** service flows + third-party processor table + § Controller and processor roles. §9 (CRM) and §10 (vendor contact) added 2026-08-16 with `20260816000002_tag_external_party_pii`, closing the gap where the record covered only data subjects holding a platform account (ADR-090)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `PARTIAL` | 2026-08-16 |
| PDPA-47 | Processor-side record for tenant-entered personal data (§40, processor duty) | COS is processor for `crm.contacts`, `crm.leads`, `procurement.vendors` contact columns; tagged with `role: "processor"` so the inventory query in `20260803000001` returns the role beside the category. Role split declared in `data-flow-map.md` § Controller and processor roles (ADR-090)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `PARTIAL` | 2026-08-16 |
| PDPA-48 | Subject rights for people WITHOUT a platform account                         | Routed to the tenant, which is the controller (ADR-090 §3), with the desk at `apps/web` `/settings/subject-requests` over seven API routes. Search is bound to a request row and audited with the match count; erasure anonymises in place and can archive the pre-image to a WORM file (`FileLegalHoldService`). **Identity is verified by the platform, not asserted by the operator** (§6): a single-use HMAC link is emailed to the address ON THE MATCHED RECORD, `verified_at` is set only when the subject opens it, a DB CHECK refuses that timestamp without a record of what was sent where, and anonymisation is blocked until it is set. This proves CONTROL OF THE IDENTIFIER ON FILE — proportionate verification built on information already held, which is what Art 12(2)/12(6) asks for; it is not proof of legal identity and does not claim to be | `DONE`    | 2026-08-17 |
| PDPA-41 | Retention period defined per data type                                       | `data-retention-policy.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `PARTIAL` | 2026-08-03 |
| PDPA-42 | Data residency enforced                                                      | `data-residency-policy.md`; per-tenant `platform.tenants.data_region`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `PARTIAL` | 2026-08-03 |
| PDPA-43 | Cross-border transfer documented                                             | OTP SMS via AWS SNS `ap-southeast-1` (§5.3.1); OpenAI (USA, sanitised)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `PARTIAL` | 2026-08-03 |
| PDPA-44 | DPA signed with every processor                                              | AWS signed; **OpenAI and Cloudflare OPEN** (`data-flow-map.md`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `OPEN`    | 2026-08-03 |
| PDPA-45 | PII never written to logs or traces                                          | **Convention only.** `@cos/logger` configures pino with NO `redact` option (`packages/@cos/logger/src/logger.ts`), so nothing prevents a developer from logging PII. The allowlist in STRIDE DP-8 (§5.9) is scoped to the credential service, not platform-wide                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `OPEN`    | 2026-08-03 |
| PDPA-46 | Service-to-service mTLS (spec §5.4)                                          | **Not deployed.** No Istio manifest exists anywhere under `infrastructure/`; `cos-kg-ingestion-worker/templates/networkpolicy.yaml:22` states in its own comment that NetworkPolicy "does NOT replace" the specified Istio mTLS. NetworkPolicy itself covers only 2 of 11 Helm charts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `OPEN`    | 2026-08-03 |

> **Disclosure gap on PDPA-46 — product-owner decision 2026-08-03.** The pre-auth Privacy Policy
> screen lists "Zero-trust service mesh with mutual TLS" among its technical controls. That control
> is `OPEN`, not `DONE`. The product owner was shown this evidence and elected to keep the line as
> written. It is recorded here so the gap is tracked rather than invisible: closing PDPA-46 (deploying
> Istio, or an equivalent mTLS layer) makes the published statement accurate. Until then the notice
> describes a control the platform does not yet enforce.

`PDPA-41` and `PDPA-42` are `PARTIAL`, not `DONE`, because the documents exist and are now accurate
but the enforcement they describe (`TenantRoutingMiddleware` regional routing, automated retention
purge jobs) is not implemented in `backend/src/`.

---

## Cryptographic module validation

Evidence for the "keys are held in hardware security modules" statement published on the Trust
Center (`apps/web/src/app/trust`) and referenced in general terms by the mobile Privacy Policy.
Verified directly against the NIST CMVP register on 2026-08-03 — not taken from vendor marketing.

| Module                         | Standard   | Level     | Certificate                                                                                           | Validated  | Status                         |
| ------------------------------ | ---------- | --------- | ----------------------------------------------------------------------------------------------------- | ---------- | ------------------------------ |
| AWS Key Management Service HSM | FIPS 140-3 | Overall 3 | [CMVP #4884](https://csrc.nist.gov/projects/cryptographic-module-validation-program/certificate/4884) | 2024-11-18 | Active — **sunset 2026-11-17** |

Scope of the claim, stated the same way ADR-039 scopes the RKE2 FIPS claim — what the certificate
covers is the **module**, not our deployment:

- It covers the AWS-operated HSMs that generate and hold KMS key material. Our SSE-KMS
  customer-managed keys (`infrastructure/terraform/aws/kms.tf`) are created in that boundary.
- It does **not** make Construction OS "FIPS validated". Nothing about our own services, the host
  OS, or the on-premise deployment path is in scope. Do not write that phrase.
- The certificate carries a CMVP caveat: _"No assurance of minimum security of SSPs (e.g. keys, bit
  strings) that are externally loaded."_
- **The sunset date is a maintenance obligation.** After 2026-11-17 the published claim must be
  re-verified against whatever certificate supersedes #4884, or the Trust Center row corrected.
  Separately, FIPS 140-2 modules become Historical after 2026-09-21, so any future 140-2 citation is
  already unusable.

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
- `docs/registers/data-flow-map.md` — personal data flow map (RoPA)
- `docs/policies/data-retention-policy.md` — retention period per entity type
- `docs/policies/data-residency-policy.md` — region assignment per tenant
- `docs/registers/soc2-controls.md` — SOC 2 Type II control tracking

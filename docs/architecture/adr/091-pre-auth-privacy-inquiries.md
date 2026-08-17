# ADR-091: Pre-auth privacy inquiries — where a request from a stranger lands

**Date:** 2026-08-17
**Status:** Accepted
**Deciders:** Product owner, Security Lead
**Tags:** security | data | mobile

---

## Context

`mockup/mobile/01_authen/05_privacy_policy/07_data_protection_contact` draws a contact form on the
**pre-auth** Privacy Policy: full name, email, phone, inquiry category (General / Data Access / Data
Correction / Data Deletion / Security Concern), subject, message, and a document attachment. `08`
draws its success state with a reference number, an SHA-256 digest and a submission timestamp.

Nothing in the platform can accept that form today, and the product-owner decision of 2026-08-17 was
to build it rather than leave the affordance inert. Three questions had no answer anywhere in
`docs/specifications/` and are settled here.

**The sender has no account and no tenant.** That is the whole difficulty. Every existing route that
takes a request from a data subject either belongs to an account holder
(`POST /users/me/data-export`, ADR-078, keyed by `user_id`) or is opened on a subject's behalf by a
`TENANT_ADMIN` who already knows which tenant holds the data (`platform.subject_requests`, ADR-090).
A reader on the pre-auth policy screen is neither: they may not know which organisation on this
platform holds their data, or whether any does.

**Every platform table is tenant-scoped.** Checked against `backend/prisma/schema.prisma`: all nine
`@@schema("platform")` models — `Tenant`, `User`, `TrustedDevice`, `ConsentRecord`, `ExportRequest`,
`SubjectRequest`, `TenantMembership`, `UserAdditionalRole`, `AuditLog` — carry `tenant_id`. There was
no precedent for a row that belongs to no tenant.

## Decision

### 1. A new `platform.privacy_inquiries` table, with no `tenant_id` and no RLS

The row records an inquiry from someone with no account, before any tenant is known. `SYSTEM_ADMIN`
triages it. When an inquiry is matched to a tenant, that tenant's admin opens a
`platform.subject_requests` row in the normal way and the inquiry is closed with a pointer to it —
the two tables **chain**, they do not duplicate.

This is the first platform table without `tenant_id`, and it is explicitly permitted rather than
invented: master §Phase 2 states `tenant_id UUID NOT NULL on every domain table (**platform tables
exempt**)` and, of the identity tables, `live in schema "platform" (cross-tenant, no RLS needed)`.

### 2. No attachment in v1

The attach control is rendered, disabled, and labelled `COMING SOON` — the same treatment the
download button has carried since 2026-08-03, and the same rule the five section screens follow.

### 3. The inquiry is not a PDPA request in its own right

The form opens a conversation; it does not start the §30 clock on its own. `received_at` on a
`subject_requests` row is supplied by the operator precisely because the statutory clock runs from
when the **controller** received the request (ADR-090), and the controller here is the tenant, not
this platform. The success screen therefore states the response commitment as the platform's own
service target and does not print a statutory deadline the platform is not the addressee of.

## Rationale

**Why not reuse `platform.subject_requests`.** It is tenant-scoped and `opened_by` is a NOT NULL FK
to `platform.users`. Writing a pre-auth inquiry into it would require inventing both — a tenant the
sender has not identified, and an operator who does not exist at submission time. It also carries the
authorisation to search a tenant's customer base (ADR-090 §4); a row anyone on the internet can
create must never carry that.

**Why no RLS on the new table.** RLS is the tenant-isolation mechanism (spec §7.7) and there is no
tenant to isolate by. `app.current_tenant_id` is unset on a pre-auth request, and the policy shape
used everywhere else — `tenant_id = NULLIF(current_setting(...), '')::uuid` — would deny every row.
Access is confined by role instead: `SYSTEM_ADMIN` only, enforced by `RolesGuard`, and every read is
audited (spec §06 audit-access matrix, SYSTEM_ADMIN = FULL).

**Why no attachment.** An unauthenticated multipart upload is a new external surface: it needs its
own STRIDE row (§5.9), ClamAV scanning and quarantine (§9), and a size/rate budget that a rate limit
alone does not give. None of that is required to lodge a request — PDPA §30 asks the controller to
answer, not the subject to prove anything up front — so it is out of v1 rather than half-built.

**Why the reference number is not a hash of the message.** `08` draws an "SHA-256 Integrity Hash".
A digest of a message the sender still holds proves only that the row was not edited afterwards,
which is what the append-only audit log already provides. What the sender needs is a handle they can
quote, so the screen shows the reference and the submission timestamp, and the audit-metadata block
carries the digest of the stored record.

### Alternatives rejected

- **Resolve the tenant from the sender's email domain.** An unauthenticated lookup that answers
  "does this platform hold an organisation at this domain" is a customer-enumeration oracle.
- **Keep `mailto:` only.** It works, and it is what shipped, but a mail client is not available on
  every device and nothing records that the message was sent — there is no reference to quote and no
  queue to review against a deadline.
- **Accept attachments through the existing File Service.** Every route on it requires a JWT, and
  granting an unauthenticated one to a stranger to hold an upload is a larger decision than the
  form warrants.

## Consequences

### Positive

- A data subject with no account has a recorded channel and a reference, instead of an address that
  may bounce (`docs/compliance/pdpa-controls.md` scores PDPA-03 `PARTIAL` today, precisely because
  `EXPO_PUBLIC_DPO_EMAIL` points at a general support mailbox and no DPO is appointed).
- The inquiry queue is evidence for PDPA-03/PDPA-05 at the Stage 1→2 gate.

### Negative

- A publicly writable table is a spam and abuse target. Mitigated by the QM-7 auth-tier rate limit
  (10/min per IP, the tier `identity.controller.ts` already uses for OTP), hard length caps on every
  field, and no attachment.
- One more thing for `SYSTEM_ADMIN` to watch. There is no triage UI in this change; the queue is
  reachable through the API and the admin panel row is follow-up work.

### Neutral

- The table is the first `platform` row with no `tenant_id`. `scripts/` and audit tooling that assume
  every platform table carries one must be checked before they are pointed at it.

## 4. The policy PDF is generated server-side by `pdf-lib` (decided 2026-08-17)

`GET /api/v1/privacy/policy/pdf` serves the document; `GET /api/v1/privacy/policy/metadata` publishes
its version, file name, size and SHA-256. Both are public and neither is behind the inquiry flag — a
notice you must authenticate to read is not a notice, and the abuse switch for a write route must not
take the document down with it.

**Why server-side.** `pdf-lib` is already a backend dependency and
`finance/contract-document.util.ts` is a working precedent for building a legal document from data.
`apps/mobile` has `expo-file-system` and `expo-crypto` but **no** `expo-print` and no PDF library, so
generating on-device would add a dependency and a second lockfile change (Rule 28) — and would still
leave `apps/web` without a PDF, since the policy prose has no copy there either.

**The cost, and what pays it.** The prose now exists twice: `apps/mobile/src/i18n/{en,th}.json` for
the screen, `backend/.../privacy-policy/policy-document.ts` for the PDF. That is exactly the drift
`<PrivacyPolicyDocument />` was extracted to prevent, and it is only acceptable because
`scripts/ci/check-policy-parity.mjs` runs in the CI lint job and fails the build when the two
disagree on the version, the effective date, or any sentence. Verified to catch both classes before
it was wired in. Without that script this decision should be reversed, not merely watched.

**The digest is a real check, not decoration.** The bytes are deterministic — one static document,
built once, with the PDF's CreationDate/ModDate pinned to the effective date so pdf-lib's default
clock stamp cannot move them. The server publishes the digest before the transfer and
`apps/mobile/src/lib/policyDownload.ts` recomputes it over the bytes that reached the device, so
"verified" answers a question a reader can act on. This is the opposite call from the SHA-256 the
drawing puts on the inquiry receipt (`08`), which was dropped: hashing a message the sender still
holds proves nothing about what the server stored.

**English only.** pdf-lib's standard fonts carry no Thai glyphs; a Thai edition needs an embedded
Thai face, which is a font-licensing decision nobody has taken. The metadata endpoint returns
`language: "en"` rather than leaving a Thai reader to discover it by opening the file.

## References

- `docs/specifications/05-security-compliance.md` §5.3 (PDPA hard requirements), §5.9 (STRIDE)
- `docs/specifications/07-multi-tenant-architecture.md` §7.7 (RLS as the isolation mechanism)
- `context/00_master_construction_os.md` §Phase 2 — "platform tables exempt", "cross-tenant, no RLS needed"
- ADR-090 — external data subjects, processor role and tenant tooling (`platform.subject_requests`)
- ADR-078 — account-holder data export (`platform.export_requests`)
- ADR-030 / ADR-058 — magic-link surfaces authenticated by token rather than session
- `docs/compliance/pdpa-controls.md` — PDPA-03 `PARTIAL`, PDPA-05 (DPO not yet appointed)

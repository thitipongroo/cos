# 078: PDPA data export (access + portability) via an async job, gated by a step-up OTP

**Date:** 2026-08-04
**Status:** Accepted
**Deciders:** Product owner (thitipongroo), engineering
**Tags:** security, data, identity, mobile

---

## Context

`docs/compliance/pdpa-controls.md` records **PDPA-10 (§30 Access)** and **PDPA-11 (§31 Portability)**
as `OPEN`: no route exists, and a `grep` for `data-export` across `backend/src/modules/identity`
returns nothing. Subject requests are handled manually through the controller contact (PDPA-03),
which is itself `PARTIAL` — the address is a general support mailbox because no DPO is appointed
(PDPA-05). PDPA §30 gives a controller **30 days** to answer a verified request; a manual path with
no ticket, no identity check and no audit trail cannot be shown to meet that.

Three mockups under `mockup/mobile/01_authen/05_privacy_policy/01_data_collection/`
(`01_01_data_export_request`, `01_02_export_otp_verification`, `01_03_data_export_success`) specify
the user-facing flow: pick categories and a format, verify with a 6-digit code, and receive a link.
The shipped portal screen `transparency-identity.tsx` currently renders the Export action **disabled**
with the comment "PDPA-10/11/14 are OPEN, no route exists" — this ADR is what makes it live.

Two things in the mockups do not match the platform and are resolved here rather than copied:

- The category list (`Personal Identity / Attendance Logs / Activity History / Financial Records`,
  with Financial described as "payroll slips, expense claims") is not the platform's own taxonomy,
  and payroll does not exist — Phase 7 states plainly that the finance service "does NOT implement
  double-entry bookkeeping / chart of accounts / GL posting" and is project **cost tracking**.
- "Link expires in 7 days" contradicts the Phase 9 default signed-URL TTL of 1 hour.

## Decision

Implement PDPA access + portability as a **step-up-verified, asynchronous export job** that writes a
tenant-scoped object to MinIO and mails a time-limited link.

**Categories** — the export is selected by the platform's own `@pdpa` taxonomy, the five categories
tagged by migration `20260803000001_tag_pii_columns` and already counted on the portal hub:
`identity`, `contact`, `location`, `financial`, `operational`. `financial` stays in the list and in
the payload schema even though the only column tagged `@pdpa(category: "financial")` today is
`workforce.project_workforce.daily_rate` — an agreed pay rate for a named worker, not a payslip. If a
payroll/expense module is ever built, its columns join the category by being tagged; no API version
bump is needed because adding fields to an existing category is a non-breaking addition (QM-2).

**Endpoints** (`/api/v1/`, QM-2):

- `POST /identity/me/step-up/request` → sends a 6-digit code to the user's registered channel.
- `POST /identity/me/step-up/verify` → returns a single-use, short-lived **action token**.
- `POST /identity/me/data-export` → accepts `{ categories[], format: JSON|CSV, from?, to?, actionToken }`,
  persists an export request row and starts the Temporal workflow; returns the request id.
- `GET /identity/me/data-export` → lists the caller's own export requests and their status.

This supersedes the single `GET /api/v1/identity/me/data-export` sketched in `pdpa-controls.md`:
a `GET` cannot carry the category/format/date selection the mockup requires, and a synchronous
response cannot serve an export that must read across every domain schema.

**Step-up OTP is a distinct flow from login OTP.** It reuses the OTP primitives from Phase 2
(6-digit numeric, 5-minute TTL, max 3 attempts, 10 requests per phone per day) but issues an
**action token**, never a session: it can never be exchanged for an access token, it is bound to the
requesting user and to the single action that minted it, and it is consumed on first use. Rate limits
follow QM-7's auth tier (10 req/min per IP).

**Storage and delivery.** The archive is written to a dedicated bucket `cos-export-{tenant_id}`,
separate from `cos-files`, under `{year}/{month}/{export_id}/`. The download link is a signed URL with
a **7-day TTL** — an explicit per-file-type override of the Phase 9 1-hour default, which Phase 9
already provides for ("Signed URLs: GET signed URL TTL 1 hour (**configurable per file type**)"). A
lifecycle rule deletes the object when the link expires. Delivery is by email through the existing
`SendGridAdapter` in the notification module.

**Audit and classification.** The export request, the step-up verification result and every download
are written to `platform.audit_logs` (QM-4 immutable audit). Export payloads are classified
**RESTRICTED** (QM-5).

**Feature flag** `s1.identity.data-export` — kill-switch, permanent. It gates the endpoints, not only
the screens: the flag must be able to stop PII leaving the platform within 60 seconds (QM-15).

## Rationale

- **Step-up, not re-login.** The action being confirmed is "send all my personal data somewhere", so
  possession of a live session is not sufficient assurance; NIST SP 800-63B treats re-authentication
  as the control for high-value actions. Minting an action token rather than a session keeps the
  blast radius of a stolen code to one export.
- **Async, not synchronous.** The export reads across `platform`, `workforce`,
  `workforce_telemetry`, `site_ops` and `files`; doing that inside a request would blow the QM-6 write
  budget (p95 < 500 ms) and would fail for large accounts. Temporal already runs the Phase 9 file
  cleanup workflow, so no new infrastructure is introduced.
- **7 days is the honest number.** A field worker who opens the mail on the next shift must still be
  able to download. One hour, applied to a mail-delivered link, produces a dead link for most
  recipients — which would make PDPA §30 unmet in practice while looking implemented.
- **The platform's own taxonomy, not the mockup's.** A data-subject notice that lists categories the
  schema does not use is the exact failure `pdpa-controls.md` § Known corrections exists to prevent.

Alternatives rejected: **synchronous `GET` returning JSON** (cannot express the selection, cannot
scale, and streams RESTRICTED data through the API tier); **email attachment** (SendGrid caps
attachment size and mailing PII bypasses the SSE-KMS at-rest guarantee of QM-4); **no step-up**
(a stolen session becomes a full data exfiltration primitive); **reusing the login OTP endpoints with
a flag** (a code minted for step-up would then be redeemable for a session — a privilege-escalation
path).

## Consequences

### Positive

- PDPA-10 and PDPA-11 move from `OPEN` to implemented, with an audit trail per request.
- The step-up primitive is reusable for the other high-value actions PDPA implies (erasure, PDPA-13).

### Negative

- A new bucket, a new Temporal workflow and a new migration to operate and back up.
- Export payloads are RESTRICTED data at rest for up to 7 days — a new surface that the STRIDE
  review (§5.9) and `data-flow-map.md` must both cover.

### Neutral

- PDPA-13 (erasure) and PDPA-14 (restrict processing) stay `OPEN`; this ADR does not close them, and
  `transparency-delete.tsx` keeps its disabled state until they are decided.

## References

- `docs/compliance/pdpa-controls.md` §30–§34 (PDPA-10/11 rows), § Known corrections
- `docs/specifications/05-security-compliance.md` §5.3.1 · `docs/specifications/09-data-architecture.md`
- `context/00_master_construction_os.md` §Phase 9 (signed-URL TTL, bucket naming), §Phase 2 (OTP rules)
- `backend/prisma/migrations/20260803000001_tag_pii_columns/` (the five `@pdpa` categories)
- `backend/src/modules/notification/adapters/sendgrid.adapter.ts`
- ADR-030 (magic-link tokens), ADR-035 (AES-256-GCM field encryption)
- `mockup/mobile/01_authen/05_privacy_policy/01_data_collection/01_01_data_export_request`,
  `01_02_export_otp_verification`, `01_03_data_export_success`

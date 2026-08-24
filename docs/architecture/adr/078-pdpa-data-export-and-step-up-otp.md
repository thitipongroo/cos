# 078: PDPA data export (access + portability) via an async job, gated by a step-up OTP

**Date:** 2026-08-04
**Status:** Accepted
**Deciders:** Product owner (thitipongroo), engineering
**Tags:** security, data, identity, mobile

---

## Context

`docs/registers/pdpa-controls.md` records **PDPA-10 (§30 Access)** and **PDPA-11 (§31 Portability)**
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
`identity`, `contact`, `location`, `financial`, `operational`. Building the collector surfaced three
gaps in that first tagging pass, each closed by `20260804000005_tag_pii_columns_v2` so the tags stay
the authoritative scope statement rather than drifting from what the collector actually reads:

- **`financial` was rate without hours.** `workforce.project_workforce.daily_rate` is what was
  agreed; `workforce_telemetry.timesheets.regular_hours` / `.overtime_hours` is what was worked. A
  person cannot tell what their work was worth from either half alone, and this schema has no
  payroll table — Phase 7 states plainly that the finance service "does NOT implement double-entry
  bookkeeping / chart of accounts / GL posting" and is project **cost tracking**.
- **`finance.payments` is operational, not financial.** It is invoice-keyed with no personal payee,
  so the only personal datum is `recorded_by` — an action traced to a user, exactly as
  `platform.audit_logs.actor_id` is. The amount columns stay untagged and are **not** selected into
  any individual's archive: the money is the organisation's, and exporting it under cover of a
  subject-rights request would hand a former employee the tenant's finances.
- **Issue attribution was one-legged.** See below.

If a payroll/expense module is ever built, its columns join the category by being tagged; no API
version bump is needed because adding fields to an existing category is a non-breaking addition
(QM-2).

**Issue attribution needs three predicates, and one of them had to be created.** `site_ops.issues`
carries `latitude`/`longitude` — a record of where a person physically stood — but until
`20260804000004_issues_created_by` the only user column was the nullable `assigned_to`, so an issue
the subject raised and was never assigned was invisible in their own export. The value was never
missing, merely unpersisted: `SiteOpsService.createIssue` already held `this.userId` and put it in
the `site.issue.created.v1` payload. The collector now matches `created_by OR assigned_to OR
(report_id → site_reports.submitted_by)`, and all three are load-bearing —

| predicate                  | NULL when                       |
| -------------------------- | ------------------------------- |
| `created_by`               | the issue predates 2026-08-04   |
| `assigned_to`              | the issue was never assigned    |
| `report_id → submitted_by` | the issue was raised standalone |

**No backfill is possible and none is attempted.** `platform.audit_logs` records `actor_id` and
`resource_type` but no `resource_id`, so "user X created an issue" cannot be matched to _which_
issue; `platform.outbox_events` holds the creator in its payload but is a transient publish queue,
not an event store. Guessing would attribute one person's site location to another. Historical rows
keep `created_by = NULL` and **every export states this in the issues table's `note`** — a subject
cannot challenge a gap they are not told about, and this one is invisible from the rows themselves.

**Structural absences are explained, not blank.** An account with no `workforce.workers.user_id` link
has no worker-keyed data at all. Those tables still appear in the archive with zero rows and a `note`
saying why, so the same table list reaches every subject: an empty section that does not explain
itself is indistinguishable from one the export failed to fill.

**Endpoints** (`/api/v1/`, QM-2):

- `POST /auth/step-up/request` → sends a 6-digit code to the user's registered channel.
- `POST /auth/step-up/verify` → returns a single-use, short-lived **action token**.
- `POST /users/me/data-export` → accepts `{ categories[], format: JSON|CSV, from?, to?, actionToken }`,
  persists an export request row and starts the Temporal workflow; returns the request id.
- `GET /users/me/data-export` → lists the caller's own export requests and their status.

Two corrections to the path sketched as `GET /api/v1/identity/me/data-export` in `pdpa-controls.md`:

- **`identity` is not a route prefix in this codebase.** The identity module's controller is
  `@Controller('auth')` and self-service routes live under `@Controller('users')` with a `me/` path
  (`UserMeController`, whose header explains why self-service is a separate class from the
  TENANT_ADMIN-gated `UserController`). Inventing a third namespace for one feature would leave the
  API with two ways to say "the signed-in user". Step-up sits under `auth` because it is an auth
  primitive — and it therefore inherits `IdentityController`'s class-level
  `@Throttle({ limit: 10, ttl: 60000 })`, which is exactly QM-7's auth tier, rather than restating it.
- **`GET` cannot carry the request.** The selection is `{ categories[], format, from?, to?,
actionToken }`, and a synchronous response cannot serve an export that reads across every domain
  schema. `POST` creates the request; `GET` lists their status.

**Step-up OTP is a distinct flow from login OTP.** It reuses the OTP primitives from Phase 2
(6-digit numeric, 5-minute TTL, max 3 attempts, 10 requests per phone per day) but issues an
**action token**, never a session: it can never be exchanged for an access token, it is bound to the
requesting user and to the single action that minted it, and it is consumed on first use. Rate limits
follow QM-7's auth tier (10 req/min per IP).

**Storage and delivery** (corrected 2026-08-04, after checking the code — see the note below).

The archive is uploaded through the **existing `FileServiceClient`** (`POST /api/v1/files/upload`),
because the backend has no MinIO client and must not grow one: master §Architecture fixes
`Main App ↔ File Service: REST API (HTTP)`, and File Service was extracted precisely to own upload
I/O. The returned `file_id` is stored on the export-request row.

**The emailed link points at an authenticated in-app page, not at a signed URL.** The mail says "your
export is ready" and links to `/users/me/data-export`; the page mints a **fresh** signed URL when the
user actually clicks download. The export request stays valid for **7 days** — that is the
product-owner's 7-day decision — while each signed URL keeps the platform-wide 1-hour lifetime.

This is stronger than mailing a long-lived signed URL, which was the original plan:

- a signed URL is a **bearer credential**. Mailing one for a **RESTRICTED** payload (QM-5) puts every
  category of the subject's personal data behind a link that anyone with inbox access — or anyone
  the mail is forwarded to, or any mail-scanning intermediary — can replay for a week.
- re-minting on click means the download requires a live session, so the export is protected by the
  same authentication as the data it contains.
- a 1-hour link mailed to a field worker is dead before the next shift; a link to the app is not.

> **Correction to this ADR.** It originally claimed the 7-day TTL was "an explicit per-file-type
> override of the Phase 9 1-hour default, which Phase 9 already provides for". The **spec** says
> signed-URL TTL is "configurable per file type"; the **implementation** is not —
> `services/file-service/src/services/minio.service.ts` holds one `ttlSeconds` for the whole service,
> from `SIGNED_URL_TTL_SECONDS` (default 3600), and `getSignedUrl()` takes no per-call override. The
> ADR cited the spec as though it were built. Raising that env to 7 days was rejected: it would
> lengthen the TTL of **every** file on the platform — drawings, invoices, site photos — to buy one
> feature a longer link.

Email delivery itself is the existing `SendGridAdapter` in the notification module.

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
- **7 days is the honest number — for the REQUEST, not for a bearer URL.** A field worker who opens
  the mail on the next shift must still be able to download; one hour applied to a mail-delivered
  link produces a dead link for most recipients, which would make PDPA §30 unmet in practice while
  looking implemented. Keeping the 7 days on the export record and re-minting the signed URL on
  click gives the recipient a week without handing a week-long credential to an inbox.
- **The platform's own taxonomy, not the mockup's.** A data-subject notice that lists categories the
  schema does not use is the exact failure `pdpa-controls.md` § Known corrections exists to prevent.

Alternatives rejected: **synchronous `GET` returning JSON** (cannot express the selection, cannot
scale, and streams RESTRICTED data through the API tier); **email attachment** (SendGrid caps
attachment size and mailing PII bypasses the SSE-KMS at-rest guarantee of QM-4); **no step-up**
(a stolen session becomes a full data exfiltration primitive); **reusing the login OTP endpoints with
a flag** (a code minted for step-up would then be redeemable for a session — a privilege-escalation
path); **a MinIO client in the backend** (crosses the deployable boundary master §Architecture sets,
and duplicates a client File Service already owns); **raising `SIGNED_URL_TTL_SECONDS` to 7 days**
(one global knob — it would extend every file's link lifetime platform-wide); **a dedicated
`cos-export-{tenant_id}` bucket with a per-request TTL** (the faithful reading of the original plan,
but it requires new routes, OpenAPI and tests in a second deployable to deliver something the
in-app download page already gives without weakening the 1-hour signed-URL invariant).

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

- `docs/registers/pdpa-controls.md` §30–§34 (PDPA-10/11 rows), § Known corrections
- `docs/specifications/05-security-compliance.md` §5.3.1 · `docs/specifications/09-data-architecture.md`
- `context/00_master_construction_os.md` §Phase 9 (signed-URL TTL, bucket naming), §Phase 2 (OTP rules)
- `backend/prisma/migrations/20260803000001_tag_pii_columns/` (the five `@pdpa` categories)
- `backend/src/modules/notification/adapters/sendgrid.adapter.ts`
- ADR-030 (magic-link tokens), ADR-035 (AES-256-GCM field encryption)
- `mockup/mobile/01_authen/05_privacy_policy/01_data_collection/01_01_data_export_request`,
  `01_02_export_otp_verification`, `01_03_data_export_success`
- **Those drawings were withdrawn on 2026-08-15**, with the whole `01_data_collection/**` set (~114
  screens). This decision and the flow it shipped are unaffected — ADR-085.

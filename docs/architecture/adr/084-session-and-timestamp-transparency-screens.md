# 084: Session-metadata and timestamp transparency screens — real platform values, no invented infrastructure

**Date:** 2026-08-05
**Status:** Accepted
**Deciders:** Product owner (thitipongroo), engineering
**Tags:** security, ux, compliance, mobile

---

## Context

Two of the eleven transparency screens describe the platform's own machinery rather than the
subject's data, and both describe machinery this platform does not have.

`mockup/.../03_05_session_metadata_details` renders a "Secure Context Protocol" panel with a System
Parameters card:

| Mockup row                 | What the platform actually does                                                                                                                                                         |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TOKEN TTL 3600s`          | Access token **15 minutes**, refresh token **7 days**, refresh rotated natively with `refreshTokenMaxReuse: 0` (§5.4.1 step 4/6, §20.6)                                                 |
| `ENCRYPTION AES-256-GCM`   | Sessions are protected in transit by **TLS 1.3** (§5.2 transport row). AES-256-GCM is real but is the at-rest cipher for issuer private keys (ADR-035) — a different subsystem entirely |
| `SESSION ID sid_9f8a…2b1c` | No such field exists. `JwtPayload` carries `jti`, a token id; the platform models sessions as tokens and has no session identifier of its own                                           |

`mockup/.../03_06_request_timestamp_details` renders "Chronological Integrity" with four technical
claims. A `grep` across the whole of `docs/` for `NTP`, `Stratum`, `atomic clock` and
`latency compensation` returns **zero** matches:

- "Atomic Clock Sync — Primary NTP synchronization with Stratum 1 time sources"
- "Network Latency Compensation — accounting for packet travel time"
- "Millisecond Precision — T+0.00ms resolution"
- "Cryptographically hashed timestamps … immutable once committed"

The three explanatory cards on `03_05` are a different case: they turn out to describe things that do
exist. "Context Tracking" is the offline sync queue (`src/sync/`, `sync-queue.tsx`), "Role Metadata"
is the RBAC permission map (`@cos/rbac` `ROLE_PERMISSIONS`), and "Security Lifecycle" is Keycloak's
native refresh rotation. Only the parameters card was invented.

Every other correction of this kind on these screens has been an ADR: ADR-080 removed a geo-fence
that did not exist, ADR-081 removed a static 98% "AI Verified", ADR-083 removed a security patch date
no platform reports. This is the same class of problem on the last two screens.

## Decision

**Keep both screens, and state only what the platform does.**

### `03_05` — the System Parameters card is rewritten from the source of truth

| Row           | Value                  | Source                             |
| ------------- | ---------------------- | ---------------------------------- |
| Access token  | 15 minutes             | §5.4.1, §20.6                      |
| Refresh token | 7 days, rotated on use | §5.4.1 (`refreshTokenMaxReuse: 0`) |
| In transit    | TLS 1.3                | §5.2                               |
| Token id      | `jti`, truncated       | `JwtPayload.jti`                   |

`jti` replaces the invented session id because it is the real answer to the question the row was
asking — _which credential is this?_ — and it is already in the token the app holds, so no new field,
no new endpoint and no new stored data. It is truncated for display for the same reason the mockup
truncated its invented value: the full token id is a correlation handle.

"Secure Context Protocol" is dropped as a name. It is not a protocol and it is not a term this
platform uses anywhere else; a screen whose purpose is honesty should not open with branding invented
for a slide.

The three explanatory cards stay, re-anchored to the real subsystems named above.

### `03_06` — reduced to the four facts that hold

- **UTC / ISO 8601** — the platform's timestamp format throughout (§31 log schema, §32, §33)
- **`TIMESTAMPTZ`, microsecond resolution** — what PostgreSQL actually stores, replacing the
  "T+0.00ms" claim
- **Audit entries are append-only** — `app_user` holds no `DELETE` grant on `platform.audit_logs`
  (§11.4, migration `20260531000001`), which is a checkable property rather than a promise
- **Retention: 30 days hot / 1 year cold for application logs, 7 years WORM for audit** — §31.2,
  §31.4

Atomic clock sync, Stratum-1 NTP, network latency compensation and cryptographic timestamp hashing
are **removed**, not reworded. Node time synchronisation may well be a sensible infrastructure
requirement, but it is not specified anywhere today, and a transparency screen is the worst possible
place to first assert an operational control: the reader has no way to check it and every reason to
rely on it.

**Nothing here becomes a new requirement.** This ADR selects what to display from what already
exists. If NTP discipline should be a platform requirement, that is a separate decision with its own
ADR and its own infrastructure work (product owner, 2026-08-05).

### `01_04` / `01_05` are not built

The mockup's "Contact Preferences" and its success state duplicate `notification-preferences.tsx`,
which shipped against the real §19.4 event catalog and the real `GET`/`PATCH
/notifications/preferences`, and which already contains the success state as its second render mode.
The transparency hub gains a row linking to it instead.

Building the mockup's version would also have added an **SMS toggle**. §19.2 records that SMS has no
MVP delivery adapter, so that control would switch a preference nothing reads — a dead control on a
privacy screen, which is the same failure as the static 98%, in miniature (product owner,
2026-08-05).

## Rationale

- **A transparency screen is the one surface where an unverifiable claim costs the most.** Its entire
  purpose is to let someone check what the platform does. A false parameter there does not just
  mislead; it discredits the true rows next to it.
- **`jti` beats inventing a session id.** It answers the same question with a value that already
  exists, and adding a session table to satisfy a mockup row would create stored personal data — a
  new retention target and a new erasure obligation — for a display string.
- **Removing beats rewording.** "Atomic Clock Sync" softened to "time synchronisation" would still
  assert a control nobody has specified or tested. There is no wording of an unimplemented guarantee
  that makes it true.
- **The honest rows are not weaker.** Append-only enforced by a missing SQL grant is a stronger thing
  to be able to say than "cryptographically hashed", because a reader can go and check it.

Alternatives rejected: **display the mockup values as written** (states four falsehoods about
security machinery on a security screen); **drop both screens** (the hub would have rows that lead
nowhere, and the underlying facts are worth telling — the product owner chose to keep them);
**implement Stratum-1 NTP first** (scope creep well outside the D-series, and an infrastructure
decision that deserves its own ADR rather than being forced by a mockup).

## Consequences

### Positive

- Every value on both screens can be traced to a spec line or a code path.
- Two fewer screens to build (`01_04`, `01_05`), and no second surface writing notification
  preferences.

### Negative

- The screens render less impressively than the mockup. "TLS 1.3" is a duller row than
  "AES-256-GCM", and "no `DELETE` grant" is duller than "cryptographically hashed".
- `jti` truncation is a display convention this ADR introduces; if a support flow ever needs the full
  value, it needs a deliberate decision rather than an unnoticed widening.

### Neutral

- No schema change, no new endpoint, no new stored data on either screen.

## References

- `docs/specifications/05-security-compliance.md` §5.2 (transport), §5.4.1 (token lifetimes)
- `docs/specifications/20-ux-flow.md` §20.6 (session), `11-database-schema.md` §11.4 (no `DELETE`
  grant), `31-monitoring-observability.md` §31.2 / §31.4 (retention, WORM), `19` §19.2 / §19.4 / §19.6
  (channels, event catalog, critical events)
- `backend/src/modules/identity/jwt.payload.ts` (`jti`; no session id)
- `apps/mobile/src/app/(app)/notification-preferences.tsx` (the shipped preferences screen)
- ADR-035 (AES-256-GCM at rest, issuer keys), ADR-080, ADR-081, ADR-083 (the same correction on the
  other transparency screens)
- `mockup/mobile/01_authen/05_privacy_policy/01_data_collection/03_05_session_metadata_details`,
  `03_06_request_timestamp_details`, `01_04_contact_preferences`, `01_05_preferences_update_success`

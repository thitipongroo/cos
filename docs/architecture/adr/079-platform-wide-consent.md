# 079: Platform-wide PDPA consent — per-purpose records, split by lawful basis

**Date:** 2026-08-04
**Status:** Accepted
**Deciders:** Product owner (thitipongroo), engineering
**Tags:** security, data, architecture

---

## Context

`docs/registers/pdpa-controls.md` §19 records all three consent controls as `OPEN`:

| ID      | Obligation                                     | Status on disk                                                            |
| ------- | ---------------------------------------------- | ------------------------------------------------------------------------- |
| PDPA-20 | Consent captured before PII is stored          | No consent table or capture exists in any migration                       |
| PDPA-21 | Consent withdrawable as easily as it was given | Not implemented                                                           |
| PDPA-22 | Consent record retrievable for audit           | `data-residency-policy.md` §3 assumes a "Keycloak consent claim" — absent |

A `grep` for `consent` across `backend/prisma/migrations/` returns nothing, and the Keycloak realm
sets `"consentRequired": false` on every client — so the claim that document assumes does not exist.
QM-5 states plainly: "Consent must be captured before any PII is stored."

The immediate trigger is ADR-080 (geo-IP enrichment and the location-derived Behavioral Context),
which introduces profiling. But scoping consent to that one feature would leave PDPA-20/21/22 `OPEN`
while the platform already stores names, phone numbers, GPS coordinates and pay rates — so the
product owner scoped this to **every `@pdpa` category** (decision 2026-08-04).

## Decision

Introduce `platform.consents` as the single record of consent, keyed by **purpose**, and evaluate it
against a per-category **lawful basis** rather than treating all PII alike.

**Lawful-basis split** (product-owner decision 2026-08-04):

| `@pdpa` category | Lawful basis           | Withdrawable | Effect of withdrawal                                        |
| ---------------- | ---------------------- | ------------ | ----------------------------------------------------------- |
| `identity`       | Contract — PDPA §24(3) | No           | Surfaced as legal basis; erasure is the route out (PDPA-13) |
| `contact`        | Contract — PDPA §24(3) | No           | Same                                                        |
| `location`       | Consent — PDPA §19     | Yes          | Stop writing lat/lng; keep what was lawfully collected      |
| `financial`      | Consent — PDPA §19     | Yes          | Stop writing `daily_rate`; keep prior records               |
| `operational`    | Consent — PDPA §19     | Yes          | Stop deriving profile signals; audit logs are unaffected    |

`identity` and `contact` are the data a login **is**: an account cannot exist without a name and a
phone number or email. Offering a withdraw toggle that silently breaks sign-in would be worse for the
subject than stating the basis honestly. PDPA §24(3) permits processing necessary to perform a
contract with the data subject; withdrawal for these categories is expressed as **erasure**, tracked
separately as PDPA-13.

Withdrawal is **forward-only**: it stops future collection for that purpose. It does not retroactively
delete records that were lawfully collected while consent was live — that is erasure, a different
right with a different control. Audit logs are never suppressed by withdrawal: they are the §37(1)
security measure and their own retention rule governs them.

**Schema.** `platform.consents` — cross-tenant identity data, like `platform.users`, but carrying
`tenant_id` and the standard `rls_tenant_isolation` policy (ADR-031 shape: `AS PERMISSIVE`,
`FOR ALL`, `TO app_user`, `NULLIF(current_setting(...))`). Rows are **append-only**: granting and
withdrawing both insert a new row, so the history required by PDPA-22 survives. The effective state
is the latest row per `(user_id, purpose)`.

**Enforcement.** A `ConsentService` exposes `requireConsent(purpose)` for write paths on
consent-based categories. Absent or withdrawn consent fails the write with a typed error
(`COS-PDPA-*`, registered in `docs/api/error-codes.md`), never a silent no-op — a silent drop would
lose field data and look like a sync bug.

**Capture.** Consent is requested in context, not as a wall at first launch: the location purpose is
requested the first time a screen would attach coordinates, the profiling purpose from the
transparency portal. Every grant and withdrawal writes to `platform.audit_logs` (QM-4).

## Rationale

- **Per-purpose, not per-user.** PDPA §19 requires consent to be specific to a purpose; one blanket
  "I agree" is the pattern regulators reject, and it is unusable as evidence under PDPA-22.
- **Append-only.** An `UPDATE`-in-place consent row cannot answer "what did they consent to on the
  day this record was written", which is exactly what an audit asks.
- **Honest about contract basis.** Marking `identity`/`contact` as contract-based is the conservative
  reading that keeps the product working; the alternative (a withdraw toggle that bricks the account)
  is a worse subject experience and invites accidental lockouts.
- **Forward-only withdrawal keeps site data intact.** Retroactive deletion on withdrawal would erase
  safety incidents and inspection evidence that other obligations require retaining.

Alternatives rejected: **consent only for the new geo-IP feature** (leaves PDPA-20/21/22 `OPEN` while
names and GPS are already stored — the tracker would still read `OPEN`, so nothing is gained);
**Keycloak consent screens** (`consentRequired` is an OAuth client-scope grant, not a PDPA purpose
record, and the Path A SMS flow does not traverse a Keycloak consent screen at all);
**withdrawal deletes retroactively** (conflates §19 withdrawal with §33 erasure and destroys records
other retention rules require).

## Consequences

### Positive

- PDPA-20/21/22 become implementable and auditable; `data-residency-policy.md` §3's assumed consent
  record becomes real instead of assumed.
- Gives ADR-080's profiling a lawful basis instead of an unstated one.

### Negative

- Every write path touching a consent-based category gains a gate — this reaches beyond the
  transparency portal into site reports, attendance, workforce and finance.
- A user who withdraws location consent produces site reports without coordinates; downstream
  features that assume coordinates (the location transparency screen, map views) must handle absence.

### Neutral

- `data-residency-policy.md` §3 must be corrected in the same change: it currently describes a
  Keycloak consent claim that does not exist.

## References

- `docs/registers/pdpa-controls.md` §19 (PDPA-20/21/22) · `docs/registers/data-flow-map.md`
- `docs/specifications/05-security-compliance.md` §5.3 · `context.md` QM-5
- `backend/prisma/migrations/20260803000001_tag_pii_columns/` (the five categories)
- `backend/prisma/migrations/20260608000004_rls_policies/` · ADR-031 (RLS policy shape)
- ADR-080 (geo-IP enrichment + Behavioral Context — the trigger), ADR-078 (export)

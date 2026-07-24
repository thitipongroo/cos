# ADR-069: Human-readable issue numbers (`ISS-<year>-<seq>`, per tenant)

**Date:** 2026-07-25
**Status:** Accepted
**Deciders:** Product Owner, Platform Engineering
**Tags:** data, mobile

---

## Context

`site_ops.issues` is keyed only by `issue_id` (a UUID). Field users and the SITE_ENGINEER dashboard
need a short, speakable identifier for an issue — the design mockup shows an `ID` chip on every issue
card — and a UUID cannot be read over a radio or written on a whiteboard. The other documents in the
system already carry human-readable numbers: `pr_number` (`PR-<year>-<seq>`), `po_number`,
`permit_number`. Issues had none.

## Decision

Add a nullable `issue_number` column to `site_ops.issues`, formatted `ISS-<year>-<seq>` (e.g.
`ISS-2026-0042`), **unique per tenant**, and generate it server-side when an issue is created.

The number is derived from `MAX(existing seq for that tenant + year) + 1`, zero-padded to four digits
— the exact mechanism already used by `procurement.purchase_requests.nextPrNumber`. A unique index
`uq_issues_tenant_number (tenant_id, issue_number)` is what enforces uniqueness under concurrency: two
offline issues syncing at once can compute the same `MAX+1`, and the second insert then fails the
constraint rather than duplicating a number (identical to `uq_pr_tenant_number`).

## Rationale

- **Why mirror `pr_number` rather than a DB sequence:** the series must be per-tenant (numbers are
  unique within a tenant, not globally) and must restart each January. A shared `SEQUENCE` is global
  and monotonic, so it cannot do either; `MAX+1` over the tenant's rows for the year does both, and it
  is already the established, tested pattern in this repo.
- **Why nullable + generated at create, not backfilled:** a `NOT NULL` column would break the
  backward-compatible migration rule (QM-9) — every pre-existing issue would need a value in the same
  migration. Nullable lets old issues keep `NULL` (the unique index permits multiple NULLs) while
  every new issue gets a number. A one-off backfill can assign numbers to historical issues later if
  the product wants them, without a schema change.
- **Why generate server-side (not client):** issues are created offline and pushed on reconnect
  (G-M11). A document number is not something to ask a site engineer to invent on a phone; the server
  assigns it at `SiteOpsService.createIssue`, the same place the PR number is assigned.

## Consequences

### Positive

- Every issue created from now on has a short, per-tenant identifier for radios, whiteboards, and the
  dashboard card.
- Zero new infrastructure: reuses the `MAX+1` + unique-constraint pattern already proven for PR/PO.

### Negative

- Pre-existing issues have a `NULL` number until (optionally) backfilled; the mobile UI must render the
  missing number gracefully.
- `createIssue` gains a `MAX` query on the write path (one indexed aggregate per create), matching the
  cost already accepted for PR creation.

### Neutral

- The generator restarts the sequence each calendar year; a low-volume tenant may reuse a small
  sequence number across years, which is expected (the year is part of the identity).

## References

- Mirrors `procurement.purchase_requests.nextPrNumber` (`PR-<year>-<seq>`)
- QM-9 (backward-compatible migrations), QM-4 (schema-qualified SQL)
- `docs/specifications/11-database-schema.md` (Issues); PO decision 2026-07-25

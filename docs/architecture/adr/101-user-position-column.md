# ADR-101: A job title is a column on the user, not a drawing

**Date:** 2026-09-08
**Status:** Accepted
**Deciders:** Product Owner (the column and the endpoint), ADR-099 amendment 4 (the requirement)
**Tags:** data | backend | mobile | identity

---

## Context

The mobile drawer's profile block reads NAME · POSITION · ID (spec §32.7 "Drawer Profile Block").
The POSITION line had no column behind it. It was drawn: `PROFILE_JOB_TITLE` in
`apps/mobile/src/lib/mockupFigures.ts`, the single string `'Lead Controller'`, rendered
unconditionally for every account of every role.

Nothing in the schema carried a job title. `platform.users` had `display_name`, `email`,
`department` and no position; `platform.tenant_memberships.role` is an authorisation enum
(`FINANCE`, `SITE_ENGINEER`) and not a title anyone would introduce themselves with. The one field
that looked close was `workforce.workers.trade_type`, and it is a SITE TRADE — "Steel Fixer",
"Electrician".

For most of its life the drawn line was checked by the line beside it: the name row carried the role
enum as a chip, so a reader saw `FINANCE` and `Lead Controller` together and the drawn one could be
read against the real one. The chip was removed on 2026-09-08 (spec §32.7, "NO ROLE TAG"). ADR-099
amendment 4 recorded what that left behind — **every role's drawer said Lead Controller and nothing
on the block contradicted it** — and named the fix:

> A `position` (or `job_title`) column on `platform.users`, surfaced by `GET /users/me` beside
> `employee_code`.

The product owner asked for exactly that on the same day.

## Decision

1. **`platform.users.position VARCHAR(255) NULL`** — migration `20260908000001_user_position`, with
   a rollback. Free text, nullable, no default, no constraint, no index.
2. **`GET /users/me` returns it**, alongside `department` — which that query had been omitting even
   though `UserRow` declared it.
3. **The PDPA subject export returns it**, alongside `department`.
4. **The mobile drawer renders it, and renders nothing when it is null.**
5. **`PROFILE_JOB_TITLE` is deleted from the drawn-figures register**, which falls from 31 entries
   to 30.

No write path is added. Nothing in the API sets a position; it arrives by seed or by an HR import.
That is a deliberate boundary and not an oversight — see Consequences.

## Rationale

**Why `platform.users` and not `workforce.workers`.** The worker table is where an employer's own
identifiers live, and it would be the natural home if every account had a worker record. Most do
not: `workforce.workers.user_id` is nullable and the link is the exception. In the seeded dev tenant
exactly 1 of 19 workers is attached to an account, because office roles — finance, project managers,
tenant admins — have no worker record at all. Those are precisely the accounts whose drawer needed a
title, so a column there would have been null for everyone who wanted it.

**Why not `trade_type`.** It is a site trade, not a position. Printing "Electrician" under a
controller's name is worse than printing one wrong title, because it is wrong in a way that looks
deliberate.

**Why `position` and not `job_title`.** The product owner named the column. Both were offered in
ADR-099's amendment and either would have worked. `POSITION` is a reserved-but-usable identifier in
PostgreSQL, which is the one objection worth checking, so it was checked rather than assumed:

```sql
CREATE TEMP TABLE kwtest (position VARCHAR(255));
SELECT k.position, position('b' in 'abc') FROM kwtest k;   -- both resolve, in one statement
```

Every query in this codebase qualifies the column (`u.position`), so the column and the built-in
never meet. Prisma accepts `position` as a field name; `npx prisma validate` passes.

**Why free text and not an enum.** `department` — the column this one is shaped after — is free
text for the same reason: a title dictionary is a taxonomy decision about every customer's HR
practice, and this is a display field. An enum here would mean either refusing titles that do not
fit or growing the enum per tenant, and neither is a schema decision worth making to fill one line
of a drawer.

**Why nullable.** An account is created before anyone knows the person's title: `UserService.create`
provisions Keycloak from an email and a role and inserts the row. NOT NULL would force a value at
signup, which is inventing a title — the exact failure this column exists to end.

**Why the drawer draws nothing rather than a fallback.** A placeholder ("Staff", "—", the role) is
the drawn line coming back under another name. The name above and the id below already identify the
account; a missing title is information, and a fabricated one is not.

## Consequences

### Positive

- **The register lost an entry to real data.** Thirty-one becomes thirty. Every previous removal was
  a cancelled screen; this is the first time a drawn figure was deleted because the column arrived,
  which is the outcome ADR-099 exists to reach.
- The drawer now says something different for a site engineer and a controller. It had said
  "Lead Controller" to both since the entry was wired.
- `getMe` stopped silently omitting `department`. `UserRow` had declared it, the SELECT did not name
  it, and raw SQL is exactly where TypeScript cannot report the difference. A test now names both
  columns.
- Free text and nullable means an HR import can fill it later without a migration.

### Negative

- **No route sets it.** After this change a position can only be written by a seed or by SQL. Every
  demo account gets one from `positionFor(role)` in `seed-realistic.ts`; every real tenant's rows
  stay NULL, and their drawers show no title line — which is what they showed before this ADR, just
  for an honest reason now. Adding `position` to `POST /users` and a `PATCH /users/me` is a small,
  separate piece of work and was explicitly left out of scope.
- One more column in the PDPA subject export, and therefore one more field a data-subject request
  returns. That is the correct direction, and it is listed here because it changes what the
  controller discloses.
- `seed.ts` and `seed-tenant2.ts` do not set it — they do not set `department` either. Their INSERT
  column lists are unaffected by a nullable ADD COLUMN, verified by running that exact column list
  against the migrated table inside a rolled-back transaction.

### Rollback

`backend/prisma/rollbacks/20260908000001_user_position.rollback.sql` drops the column. **The
application must be rolled back with it**: `getMe` and `listUsers` name the column explicitly, so
both fail against a database without it. The mobile app is the exception and degrades cleanly —
`Me.position` is optional (QM-9) and the drawer draws nothing when the key is absent.

## References

- ADR-099 amendment 4 — the gap, and the sentence this ADR answers
- ADR-085 — mockups are authoritative for style, not composition
- `docs/specifications/11-database-schema.md` §platform.users
- `docs/specifications/14-api-architecture.md` — `GET /api/v1/users/me`
- `docs/specifications/32-implementation-specifications.md` §32.7 "Drawer Profile Block"

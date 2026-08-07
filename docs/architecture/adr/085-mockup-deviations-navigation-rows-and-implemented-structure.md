# 085: Mockup authority — style yes, composition no

**Date:** 2026-08-06
**Status:** Accepted
**Deciders:** Product owner (thitipongroo), engineering
**Tags:** ux, mobile, compliance, process

---

## Context

Every mobile screen carries a `mockup/...` reference in its header comment, and the mockups have been
treated as the source of truth for layout throughout Stage 1. A screenshot review across the 30
screens that cite one turned up two kinds of gap, and only one of them is a defect.

**Style gaps** — corner radii, icon alignment, badge shape, copy length. These are the mockup being
right and the code being wrong, and they were fixed against it (spec 32 §32.7).

**Structural gaps** — the screen and the mockup are built out of different parts. Two of these were
examined in detail.

### The transparency hub: accordion vs navigation rows

`mockup/mobile/01_authen/05_privacy_policy/01_data_collection/00_data_collection_detail` renders a
"Compliance Breakdown" section as accordion items that expand in place. The app renders the same
categories as rows that navigate to a detail screen.

The accordion's contents are the reason it exists, and none of those contents are real:

| Accordion row in the mockup           | What this platform has                                           |
| ------------------------------------- | ---------------------------------------------------------------- |
| `Biometric Hash — SHA-256: 0x9f86d0…` | No biometric hash exists anywhere in the schema                  |
| `Geofencing Radius — 500m`            | No geofence. A 100m radius does exist — a different thing, below |
| `Employee ID — C-8922-X`              | This one is REAL — `workforce.workers.employee_code`, see below  |
| `Sync Frequency — Real-time`          | Writes queue offline and flush on reconnect                      |

**On the 100m radius**, because "no geofencing" on its own is too broad a statement and invites the
obvious challenge. `STATIONARY_RADIUS_METRES = 100` exists (`backend/.../network-origin/stationary.ts`,
ADR-080). It is not a geofence:

|                  | The 100m the platform has                       | The 500m the mockup draws   |
| ---------------- | ----------------------------------------------- | --------------------------- |
| When it applies  | After the fact, over already-stored coordinates | Continuously, on entry/exit |
| Scope            | One platform-wide constant                      | Configurable per site       |
| What it controls | **Nothing** — it labels `STATIONARY`/`MOBILE`   | Whether monitoring is on    |
| Events           | None                                            | Entry / exit                |

It is a description of check-ins that already happened, not a boundary the platform enforces. The
only `GEOFENCE_BREACH` in the codebase is an enum member in `equipment/iot-integration.stub.ts` — the
IoT capability the transparency screens already label `PLANNED`.

**On the employee id — the one mockup row that turned out to be real.** A first pass on this ADR said
no employee or staff number column existed. That was wrong, and wrong in the specific way this
codebase keeps getting caught by: the search was for `employee_id` / `staff_no`, the column is
`employee_code`, and "not found" was reported as "does not exist".

`workforce.workers.employee_code VARCHAR(50) NOT NULL` exists, is unique per tenant
(`uq_worker_employee_code`), and is tagged `@pdpa(category: "identity") — employer-assigned identifier
for a person`. It reaches the signed-in user through `workforce.workers.user_id`, the nullable unique
column added by migration `20260624000001` so a worker can resolve "my worker" — the same join
ADR-078's data export uses. So the mockup's `Employee ID` row is the one row in that accordion that
describes something the platform genuinely holds.

It is still not on the screen, for a reason that is about plumbing rather than truth: `GET /users/me`
does not return it, and not every user has a worker row (the link is nullable — office staff
typically have none). Surfacing it needs the endpoint to carry the join and the screen to have an
honest empty state for users without a worker record.

What the identity screen shows today is the **short user id** — the first eight hex characters of
`user_id`, the same form the admin user list, user profile and reset-password screens already use.
That is a different identifier and is labelled as one: the account handle every audit entry and every
record keys on. A screen listing what the platform holds about someone should not omit the handle it
holds them under. Adding `employee_code` beside it remains open, and is a backend change, not a
copy change.

Meanwhile the real per-category detail already lives on thirteen dedicated screens (ADR-078, ADR-080,
ADR-081, ADR-084), each reviewed and accepted. Rebuilding the hub as an accordion would mean either
duplicating those screens inside it, or expanding to a summary that still requires a tap — a step
added for nothing.

### Screens that outgrew their mockups

`04_tenant_admin/02_users/02_user_management/01_management` shows user cards and a `more_vert` action
menu. The shipped screen has all of that plus a search field, role filter chips, an AI user-audit
card, and ROLE/STATUS columns. The mockup is not describing a different design of the same screen; it
is describing an earlier, smaller one.

This is the general shape of the structural gaps: the implementation is **ahead of** the mockup, not
divergent from it.

## Decision

**1. The transparency hub keeps navigation rows.** The accordion is not adopted. Its structure exists
to hold content this platform does not have, and the content it would hold instead already has
thirteen screens of its own.

**2. Where a screen's structure has outgrown its mockup, the implemented structure stands.** The
mockup does not get to remove a working, reviewed capability. Screens are not to be reduced to match
an older drawing.

**3. Mockups remain authoritative for style.** Radii, colour, spacing, alignment, badge shape and copy
length are still read off the mockups, and a difference there is still a defect in the code. This ADR
narrows their authority to presentation, not composition.

**4. A structural deviation must be recorded.** A screen that departs from its mockup's composition
carries the reason in its header comment, as the transparency screens already do. An unrecorded
deviation is indistinguishable from an oversight — which is exactly what happened here: the hub's
rows were the right call and had no written justification, so a review flagged them as a gap.

## Consequences

- The hub keeps a shape whose per-category depth is one tap away rather than inline. Someone scanning
  the hub sees five to thirteen category titles rather than an expandable wall.
- Mockup fidelity reviews now have two verdicts rather than one: a style difference is a bug to fix,
  a structural difference is a decision to record. Only the first can be actioned without asking.
- The mockup files are not edited to match. They stay as drawn, and this ADR is what reconciles them —
  editing them would destroy the record of what was originally specified.
- The thirteen transparency detail screens stay load-bearing. Anything that would collapse them into
  the hub has to revisit this decision.

## Alternatives considered

**Adopt the accordion with real data inlined.** Rejected: the real data is what the thirteen detail
screens exist to present, with provenance, retention and derivation rules that do not fit inside an
accordion row. Two presentations of the same facts drift.

**Adopt the accordion as a summary that still links out.** Rejected: it adds a tap without adding
information. The row already carries a one-line summary.

**Reduce screens to their mockups.** Rejected: it would remove reviewed, working capability — search
and filtering on the user list, the audit card — on the authority of a drawing that predates them.

**Re-draw the mockups to match the implementation.** Rejected for now: the mockups are the record of
what was specified, and overwriting them erases the ability to tell a deliberate deviation from an
accident. This ADR carries that information instead.

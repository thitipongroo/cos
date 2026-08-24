# ADR-072: Project standard working hours (`work_hours_start` / `work_hours_end`)

**Date:** 2026-07-25
**Status:** Accepted
**Deciders:** Product Owner, Platform Engineering
**Tags:** data, mobile, hr

---

## Context

The SITE_ENGINEER dashboard mockup shows a **time strip** ("07:00 START / 18:00 EOD GOAL") — the
project's standard daily working window. It was omitted (decision 2026-07-16) because no working-hours
model existed and shift features are post-MVP (`21-mvp-scope` §21.4/line 82). The Product Owner asked
to add the field (2026-07-25) to back the strip and to seed a future HR/timesheet capability.

## What the industry does (research, 2026-07-25)

Procore and Oracle Primavera P6 model working time through a **project (or resource) calendar** —
working days plus a working-hours window per day (e.g. Mon–Fri 07:00–16:00), which the scheduling
engine uses to compute activity durations. The mockup's strip is the daily window of that calendar.

## Decision

Add two nullable `TIME` columns to `projects.projects`: **`work_hours_start`** and **`work_hours_end`**
— the project's standard daily working window. This is the smallest slice of the Primavera "project
calendar" that backs the mockup strip and gives a future HR/timesheet module a per-project baseline.

- Nullable: pre-existing projects have no window (the strip is simply absent for them — §32.12: show
  nothing rather than a wrong value).
- Validated as 24-hour `HH:MM` (`@IsMilitaryTime`) at the API.
- **Not** a full work calendar (working-days bitmap, breaks, holidays): those are the fuller Primavera
  model and remain a follow-up until a scheduling/HR consumer needs them.

The mobile strip is rendered **separately from the progress bar** (its own labelled row), not beneath
it — the earlier omission noted that a strip under the `%` bar read as though the bar measured time.

## Consequences

### Positive

- The mockup time strip is backed by real data; a future HR/timesheet module has a per-project window.

### Negative / open

- Only a start/end window — no working-days or break model yet (deferred). A project with no window
  set shows no strip.

### Neutral

- `TIME` (no date, no zone): a wall-clock window interpreted in the project's local context, consistent
  with how a site states "we work 07:00–18:00".

## References

- `docs/specifications/11-database-schema.md` (Projects); `21-mvp-scope` §21.4 (shift features post-MVP)
- Research: Procore / Oracle Primavera P6 project & resource calendars; PO decision 2026-07-25
- Related: ADR-070 (phases), ADR-071 (SiteEngineerHome §32.7 exception)

# ADR-071: §32.7 visual exception for the SITE_ENGINEER mobile home (blueprint grid + progress glow)

**Date:** 2026-07-25
**Status:** Accepted
**Deciders:** Product Owner, Design
**Tags:** mobile, design-system, exception

---

## Context

`32-implementation-specifications.md` §32.7 (lines 622–623) prohibits, **in the signed-in app**,
"building/crane/hard hat/blueprint/gear icons … gradients or glow effects" — the app targets a
"Palantir / Datadog / Linear aesthetic — not construction contractor aesthetic". §32.7 grants one
exception: **pre-auth entry screens** (login, OTP, loading) may use the "technical / mission-critical"
motif — a gear mark and a **cyan glow** on accent elements.

The SITE_ENGINEER home mockup, however, leans into that same technical motif on a _signed-in_ screen:
a faint **blueprint grid background** and a **glow on the progress bar**. Both were previously omitted
(decision 2026-07-16) precisely because §32.7 prohibits them in the signed-in app.

The Product Owner decided (2026-07-25) to **override §32.7 for this one screen** — the role's landing
"command view" — to carry the mission-critical motif one step past the auth boundary.

## Decision

Add two §32.7-excepted visual treatments to **`components/SiteEngineerHome.tsx` only**:

1. A subtle **blueprint grid** behind the screen content — thin `darkColors.cyan` lines at low alpha
   over `darkColors.bg` (`#020617`), rendered with `react-native-svg` (`pointerEvents: none`, purely
   decorative).
2. A **glow** on the project-progress bar's fill — an RN shadow in `darkColors.primary`.

Both reuse the exact "technical / mission-critical" motif §32.7 already blesses for auth screens
(the cyan accent + glow), extended by explicit PO decision to this single landing screen.

**Scope guard:** this exception is limited to `SiteEngineerHome`. Every other signed-in screen — and
every other role's home — keeps §32.7 as written (flat surfaces, no blueprint, no glow). The voice
command FAB the mockup also shows is **not** part of this change: its tap action is undefined
(`<VoiceNoteButton />` is hold-to-record against a field, §32.7:855 — a home-screen tap-FAB has no
defined target), so it stays out until the action is specified.

## Consequences

### Positive

- The role's landing screen matches its approved mockup and reads as the "mission-critical operating
  system" the brand positions, without a jarring cut at the auth boundary.

### Negative

- A deliberate one-screen deviation from the app-wide design system. This ADR is the record so a later
  §32.7 audit does not "fix" the grid/glow back out — the deviation is intended, not an oversight.

### Neutral

- No logic changes: both treatments are pure style, so there is nothing new to unit-test; the screen's
  existing selection logic (siteEngineerHome.ts) is unaffected.

## References

- `docs/specifications/32-implementation-specifications.md` §32.7 (lines 622–623 prohibition;
  Exception 1 pre-auth motif) — the mandate this ADR scopes an exception to
- PO decision 2026-07-25 (override §32.7 for SiteEngineerHome); mockup
  `mockup/mobile/03_site_engineer/01_home/01_se_home_dashboard/` (the path this ADR was written
  against, `…/01_dashboard/`, was renamed in the 2026-08-11 mockup restructure)
- Related: ADR-069 (issue numbers), ADR-070 (project phases) — the other SiteEngineerHome mockup items

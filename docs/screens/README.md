---
title: Construction OS — App Screen Captures
last_updated: 2026-07-05
---

# Construction OS — App Screen Captures

Full-flow screenshots of the Construction OS apps, one folder per platform. Each platform folder
has its own `README.md` index of the individual screens.

Counts below are what is **committed right now**, not what each platform's README describes as
capturable. `7d2ba1b` ("update: screens out date") deleted every then-stale capture across all three
platforms; only Android has been fully recaptured since.

| Platform | Folder                          | Status                                                                                                                                                                                                           |
| -------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Android  | [`android/`](android/README.md) | ✅ Medium_Phone AVD, live backend + seeded data. Grouped by role / flow. The Safety Officer's five frames were added 2026-08-13; the count is not restated here because it went stale the last two times it was. |
| Web      | [`web/`](web/README.md)         | ⚠️ 4 screens — the pre-auth login flow only (`01-public/`). The 24-route set is not committed.                                                                                                                   |
| iOS      | [`ios/`](ios/README.md)         | ❌ 0 screens — all removed by `7d2ba1b`; not recaptured. Its README still indexes the old set.                                                                                                                   |

## Convention

- One folder per platform (`ios/`, `android/`, `web/`) under this directory.
- Screens are numbered by flow order (`00-login`, `01-home`, …) so the same index lines up
  across platforms for side-by-side comparison.
- Each platform folder documents how its shots were captured (simulator/emulator/browser + tooling).
- **A platform README may describe screens that are not committed.** Trust the table above for what
  actually exists; treat a platform README's per-screen index as the target set, not an inventory.
- **Not every figure in a capture came from the backend, and the exception is named.** Captures are
  made against a live local backend with seeded data, so a number on screen is a number the system
  produced — with one documented exception. The EXECUTIVE screens
  (`android/08-executive/`) print several values this platform cannot compute: a compliance
  percentage and its grade, safe man-hours, a six-month trend, a per-project safety score, each
  project card's contract number and location, and a dozen smaller ones — nineteen in all since the
  register was extended on 2026-09-07 to the Portfolio and Report screens. Those come from the
  mockups by product-owner decision, are held in one module
  (`apps/mobile/src/lib/mockupFigures.ts`), and are listed in
  [ADR-099](../architecture/adr/099-mockup-figures-without-a-data-source.md). The role's own README
  section marks them panel by panel. Everywhere else, and everywhere in the other role folders, a
  figure is live data or it says it is unavailable.

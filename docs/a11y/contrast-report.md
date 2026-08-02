---
title: 'Colour contrast audit — §32.7 design tokens (WCAG 2.2 AA)'
last_updated: 2026-08-03
---

# Colour contrast report

## Purpose

Spec §20.8 makes this file an acceptance criterion: _"Contrast audit of §32.7 tokens passes 4.5:1 /
3:1 (`docs/a11y/contrast-report.md`)"_. This is that audit, plus the page-level failures found on
`/login` and the rule that keeps them from returning.

Thresholds are the two §20.8 lists as required:

| SC                       | Applies to                                       | Minimum |
| ------------------------ | ------------------------------------------------ | ------- |
| 1.4.3 Contrast (Minimum) | Body text                                        | 4.5:1   |
| 1.4.3                    | Large text (≥18.66px bold or ≥24px)              | 3:1     |
| 1.4.11 Non-text Contrast | Input borders, focus rings, chips, state markers | 3:1     |

Conformance target is **AA**, not AAA. The brand palette is built around `--cos-navy`; AAA's 7:1
would rule out the entire slate mid-range the design system uses for secondary text.

## Method

Two independent methods, agreeing to two decimal places:

1. **Lighthouse `color-contrast`** on `http://localhost:3001/login`, mobile profile, 3 runs — the
   same configuration `.github/workflows/lighthouse.yml` uses.
2. **Direct computation** from the §32.7 token hexes and from
   `apps/web/node_modules/tailwindcss/theme.css`. Tailwind 4 stores its palette in OKLCH, so those
   values were converted OKLCH → linear sRGB → sRGB before the WCAG relative-luminance formula.
   Reading hexes off a screenshot would have measured the browser's rendering, not the source.

Method 2 reproduced Lighthouse's 3.97, 3.74 and 2.50 exactly, so the tables below can be trusted for
tokens that do not currently appear on `/login`.

## Part 1 — §32.7 design tokens

### Web dark (`--cos-dark-bg #020617`, `--cos-dark-surface #0F172A`)

| Token                | Hex       | on bg | on surface | Text 4.5 | Non-text 3.0 |
| -------------------- | --------- | ----- | ---------- | -------- | ------------ |
| `--cos-dark-text`    | `#F8FAFC` | 19.28 | 17.06      | ✅       | ✅           |
| `--cos-dark-cyan`    | `#22D3EE` | 11.16 | 9.88       | ✅       | ✅           |
| `--cos-dark-warning` | `#F59E0B` | 9.39  | 8.31       | ✅       | ✅           |
| `--cos-dark-success` | `#10B981` | 7.95  | 7.04       | ✅       | ✅           |
| `--cos-dark-muted`   | `#94A3B8` | 7.87  | 6.96       | ✅       | ✅           |
| `--cos-cyan`         | `#06B6D4` | 8.31  | 7.35       | ✅       | ✅           |
| `--cos-dark-danger`  | `#EF4444` | 5.36  | 4.74       | ✅       | ✅           |
| `--cos-gray`         | `#64748B` | 4.24  | 3.75       | ❌       | ✅           |
| `--cos-dark-blue`    | `#2563EB` | 3.90  | 3.45       | ❌       | ✅           |

### Web light (`--cos-white #F8FAFC`)

| Token        | Hex       | Ratio | Text 4.5 | Non-text 3.0 |
| ------------ | --------- | ----- | -------- | ------------ |
| `--cos-navy` | `#0B1020` | 18.10 | ✅       | ✅           |
| `--cos-blue` | `#2563EB` | 4.94  | ✅       | ✅           |
| `--cos-gray` | `#64748B` | 4.55  | ✅       | ✅           |
| `--cos-cyan` | `#06B6D4` | 2.32  | ❌       | ❌           |

### Mobile light (`--mobile-bg #FFFFFF`, `--mobile-surface #F5F5F5`)

| Token                     | Hex       | on bg | on surface | Text 4.5 | Non-text 3.0 |
| ------------------------- | --------- | ----- | ---------- | -------- | ------------ |
| `--mobile-text-primary`   | `#1C1C1E` | 17.01 | 15.61      | ✅       | ✅           |
| `--mobile-text-secondary` | `#6C6C70` | 5.23  | 4.80       | ✅       | ✅           |
| `--mobile-primary`        | `#0066FF` | 4.83  | 4.43       | ❌       | ✅           |
| `--mobile-danger`         | `#FF3B30` | 3.55  | 3.25       | ❌       | ✅           |
| `--mobile-offline`        | `#8E8E93` | 3.26  | 2.99       | ❌       | ❌           |
| `--mobile-success`        | `#00C853` | 2.24  | 2.05       | ❌       | ❌           |
| `--mobile-synced`         | `#00C853` | 2.24  | 2.05       | ❌       | ❌           |
| `--mobile-warning`        | `#FF9500` | 2.20  | 2.02       | ❌       | ❌           |
| `--mobile-syncing`        | `#FFD60A` | 1.41  | 1.29       | ❌       | ❌           |

### Mobile dark (§32.7 Mobile Dark Surfaces)

| Token                 | Hex       | on bg | on card | Text 4.5 | Non-text 3.0 |
| --------------------- | --------- | ----- | ------- | -------- | ------------ |
| `--cos-dark-text`     | `#F8FAFC` | 19.28 | 17.06   | ✅       | ✅           |
| `--cos-dark-muted`    | `#94A3B8` | 7.87  | 6.96    | ✅       | ✅           |
| `--mobile-primary`    | `#0066FF` | 4.17  | 3.69    | ❌       | ✅           |
| `--cos-dark-elevated` | `#111827` | 1.14  | 1.01    | ❌       | ❌           |

## Part 2 — findings the audit produced

**These are product-owner decisions, not defects to be silently patched.** §32.7 fixes each hex, and
several were chosen for outdoor sunlight visibility (`--mobile-primary #0066FF ≠ --cos-blue`, an
explicit design decision). Changing a token changes the product's identity, so each is recorded here
with its measured number for a decision, and none has been changed.

| #   | Finding                                                                                                                                                          | Severity |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| F1  | `--mobile-syncing #FFD60A` on white is **1.41:1** — fails both. §32.7 lists it as the _syncing indicator_; a status marker below 3:1 is invisible to many users. | High     |
| F2  | `--mobile-success` / `--mobile-synced #00C853` at **2.24:1** fail non-text 3:1 — the "synced" state marker likewise.                                             | High     |
| F3  | `--cos-dark-elevated #111827` is the _input / border_ token on the dark surfaces, at **1.14:1** against `--cos-dark-bg`. Input borders are squarely 1.4.11.      | High     |
| F4  | `--mobile-warning #FF9500` at **2.20:1** and `--mobile-offline #8E8E93` at **3.26:1** fail as text.                                                              | Medium   |
| F5  | `--cos-cyan #06B6D4` on `--cos-white` is **2.32:1** — unusable for text or for an indicator on light surfaces, though it passes on every dark surface.           | Medium   |
| F6  | `--cos-dark-blue #2563EB` (**3.90:1**) and `--cos-gray #64748B` (**4.24:1**) on `--cos-dark-bg` fail body text but pass large text and non-text.                 | Low      |
| F7  | `--mobile-primary #0066FF` on `--mobile-surface` is **4.43:1** — 0.07 short of the body-text floor.                                                              | Low      |

F1–F4 interact with a §20.8 rule that is already mandatory and independently actionable: _"colour is
never the only signal (WCAG 1.4.1) — pair with icon + text"_. Sync and offline state must carry an
icon and a label regardless of what the palette decides, which mitigates F1, F2 and F4 for the
status indicators even if the hexes stay.

## Part 3 — page-level failures, found and fixed (2026-08-03)

Lighthouse reported 5 `color-contrast` violations on `/login`, all `text-tiny` (11px), from Tailwind
slate shades rather than §32.7 tokens:

| Where                               | Was         | Ratio  | Now         |
| ----------------------------------- | ----------- | ------ | ----------- |
| `login/page.tsx` 273, 296, 304, 307 | `slate-500` | 3.97:1 | `slate-400` |
| `login/page.tsx` 299                | `slate-600` | 2.50:1 | `slate-400` |

The same class combination appeared on two pages Lighthouse does not scan. They fail by the same
computation, so they were fixed in the same pass:

| Where                                   | Was         | Now         |
| --------------------------------------- | ----------- | ----------- |
| `login/otp/page.tsx` 295, 299, 302, 305 | `slate-500` | `slate-400` |
| `post-login/page.tsx` 138, 152          | `slate-500` | `slate-400` |

Result: the Lighthouse accessibility category went **0.96 → 1.00**, zero failing audits, stable
across 3 runs.

Three more were found later, and are worth recording because of _how_ they were missed. The first
sweep matched lines containing `text-tiny`, which is the size class every Lighthouse finding
happened to carry — so anything at a different size, or styling a placeholder rather than text,
slipped through. A second sweep for `text-slate-500|600` on the dark pages regardless of size class
caught them:

| Where                          | Class                         | Ratio  | Now         |
| ------------------------------ | ----------------------------- | ------ | ----------- |
| `login/otp/page.tsx` 277       | `text-small … text-slate-500` | 3.74:1 | `slate-400` |
| `post-login/page.tsx` 119, 125 | `text-[9px] … text-slate-500` | 3.97:1 | `slate-400` |
| `login/page.tsx` (phone input) | `placeholder:text-slate-500`  | 3.97:1 | `slate-400` |

The placeholder is the instructive one: Lighthouse does not audit placeholder contrast, because the
placeholder is not rendered once the field has a value. WCAG still applies to it — an empty field is
the state the user reads before typing. No automated gate here covers it; the second sweep is what
did, and the rule below is what makes the sweep unnecessary next time.

`text-red-400` (`#ff6467`), introduced as the error colour on the dark login surfaces, measures
**6.55:1** on `--cos-navy` and **6.16:1** on `slate-900` — both pass.

### Tailwind slate on the dark surfaces

| Shade       | Hex       | on `#0b1020` | on `#0f172b` | Text 4.5 |
| ----------- | --------- | ------------ | ------------ | -------- |
| `slate-300` | `#cad5e2` | 12.75        | 12.01        | ✅       |
| `slate-400` | `#90a1b9` | 7.20         | 6.78         | ✅       |
| `slate-500` | `#62748e` | 3.97         | 3.74         | ❌       |
| `slate-600` | `#45556c` | 2.50         | 2.36         | ❌       |

**The rule: on `--cos-navy` and `slate-900`, secondary text stops at `slate-400`.** The 3:1
large-text allowance needs 18.66px bold or 24px; every failing element was 11px. Disabled controls
are exempt (1.4.3 excludes inactive components), which is why `disabled:text-slate-600` survives in
`login/otp/page.tsx`.

## How it stays fixed

| Check                                             | Scope                       | Blocking |
| ------------------------------------------------- | --------------------------- | -------- |
| `color-contrast` + `categories:accessibility` ≥ 1 | `/login`, Lighthouse CI     | yes      |
| `expectNoA11yViolations` (axe `wcag2aa`)          | 6 routes, Playwright E2E    | yes      |
| `eslint-plugin-jsx-a11y`                          | all `apps/web/src/**/*.tsx` | yes      |

Contrast is a _rendered_ property — no linter can catch `text-slate-500` on a dark parent, because
the parent may be three components away. The Lighthouse and axe scans are the only real gate; this
document exists so the fix is a lookup rather than a re-derivation.

## Not covered

- **Rendered mobile contrast.** Part 1 audits the mobile _tokens_; React Native has no scanner, so
  what actually renders on a device is unverified. `scripts/a11y/check-rn-a11y.sh` ratchets
  accessibility _props_, not colour.
- **Focus rings** — 1.4.11 applies to them and they were not measured; they are not §32.7 tokens.
- **Composed surfaces.** Ratios are foreground-on-background pairs. A token over a gradient, a
  photo, or a translucent overlay is not covered.

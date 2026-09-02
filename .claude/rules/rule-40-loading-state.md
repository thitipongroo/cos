---
paths:
  - "apps/mobile/**"
  - "apps/web/**"
---

# Rule 40 — Loading state

Indexed in: `context.md` §GLOBAL EXECUTION RULES

- Rule 40 — **Every surface that waits for data renders its wait through `<LoadingState />`** (prevents a
  specified component drifting out of use while screens hand-roll their own indicators). Authoritative:
  spec §32.7 "Loading State"; ADR-055. Applies the moment a screen, region, list, card or button gains an
  async state — fetch, submit, sync flush, AI job:
  (a) Pick the variant by the SHAPE of what it stands in for: `widget` card/tile/dashboard · `list` stacked
  list or feed (mobile) · `table` data-table rows (web) · `ai` an AI job, not a plain fetch · `micro` inline
  or inside a button
  (b) **Never hand-roll one** — no `ActivityIndicator`, no self-made skeleton `View`/`div`, **no line of text
  standing in for a loading state, no placeholder glyph (`…`)**. The last two have no signature a script can
  match, so they are caught in review or not at all — that is why this rule exists in prose
  (c) Mobile: wrap a region that reveals content in `<LoadingBoundary>`, not a ternary; a determinate loader
  runs to 100 and holds one fill before the crossfade
  (d) `label` is caller-supplied, already-translated copy (QM-3) — the component holds no key and no literal
  (e) `progress` only when a real percentage exists; omitted = indeterminate = **no percentage shown**, never
  a fabricated one. **A percentage needs ≥ 2 load steps** — one request can only report 0% then 100%, which
  reads as stuck (same rule that keeps a `micro` ring in a submit button wordless). Use
  `loadProgress(done, total)` (returns `null` below two steps) and count the steps that settle **while the
  loader is on screen**, not the APIs the file imports
  (g) Skeletons animate **per element**, never as one band across the card — the mockup puts
  `.skeleton-pulse` on each bar and plate separately
  (h) The bar and the percentage are **one JS-driven animated value**. Never move the bar to the native
  driver for smoothness: that driver keeps animating _while the JS thread is blocked_ and only JS can write
  text, so the bar fills while the number sits at 0 (hit on app launch 2026-08-17). Smoothness comes from
  animating `translateX` rather than `width`, and from isolating the counting text
  (f) Any ink override (`tone`, `color`) must **measure** ≥ 3:1 against the surface it sits on (SC 1.4.11),
  and ≥ 4.5:1 if it colours text (§20.8) — on 2026-08-17 every cyan in the product measured under 3:1 on a
  `--mobile-primary` button while looking fine
  Machine half: `scripts/ci/check-loading-state.sh` in the CI lint job — it catches `ActivityIndicator` and
  raw Tailwind `animate-*`, **not** (b)'s text/placeholder cases.
  (root cause: 24 hand-rolled indicators accumulated after `<LoadingState />` was specified, and web's own
  copy reached zero production consumers while ~35 list pages showed a plain "Loading…" line)

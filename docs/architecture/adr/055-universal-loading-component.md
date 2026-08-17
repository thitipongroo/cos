# ADR-055: Universal loading component (`<LoadingState />`)

**Date:** 2026-07-17
**Status:** Accepted
**Deciders:** Product owner
**Tags:** mobile | architecture

---

## Context

`mockup/mobile/00_loading` and
`mockup/desktop/imp_002_universal_loading_component_desktop_view` specify a standardised set of loading
patterns — a widget skeleton, a list/table skeleton, an AI insight processor, and micro-indicators.
Nothing in `docs/specifications/` covered them:

- The §32.7 Mobile Core Component Library listed nine components; none was a loading component.
- `grep -riE "skeleton|loading state|shimmer" docs/specifications/` returned no matches.
- `apps/web/src/components/ui/LoadingState.tsx` already existed but was a port of a figma mockup
  exporting three unrelated helpers (`SkeletonCard`, `LoadingSpinner`, `EmptyState`) — not a
  specified component, and with no mobile counterpart.

The mockups also conflicted with §32.7 as written on three points, each of which needed a decision
before any code could be written:

1. §32.7 prohibits "gradients or glow effects" in the signed-in app. The mockups place a cyan glow,
   a scan-line gradient, and a waveform behind a signed-in bottom nav. The existing exception was
   scoped to pre-auth entry screens only.
2. §32.7 "Mobile Dark Surfaces" lists the dark screens exhaustively and forbids extending the list
   without a product-owner decision. The mockups are dark, but a _universal_ component must also
   render on the light task screens.
3. The mockup palette (`#031427`, `#4cd7f6`, `surface-container-*`) is not a §32.7 token set. §32.7
   had already rejected the same `#031427` / `#4cd7f6` pair for the Site Engineer Home, on the
   grounds that they are not tokens.

## Decision

Add `<LoadingState />` to the §32.7 component library — one component per platform, same name and
same props — and resolve the three conflicts as follows (product-owner decisions, 2026-07-17):

1. **Extend the glow/gradient exception to loading states** (§32.7 "Exception 2 — loading states"),
   scoped to `<LoadingState />` and to the `ai` variant within it.
2. **Support both light and dark** via a `theme` prop on mobile, rather than adding a screen to the
   dark-screen list.
3. **Map to existing tokens.** The mockup palette is not adopted; mobile reads `colors` /
   `darkColors` from `apps/mobile/src/theme/tokens.ts`, web reads Tailwind token utilities.
4. **Caller owns progress** — `progress?: number` prop; omitted means indeterminate.
5. **Caller owns copy** — `label?: string` carries already-translated text; the component holds no
   i18n key and no literal.
6. **Per-platform variants** — mobile `widget | list | ai | micro`, web `widget | table | ai |
micro`. The mockups genuinely differ (mobile stacks cards, desktop renders table rows), and
   §32.7 prohibits tables on mobile.
7. **No feature flag** — see Rationale.
8. **Additive on web** — `<LoadingState />` joins the existing exports in
   `apps/web/src/components/ui/LoadingState.tsx`; `SkeletonCard` / `LoadingSpinner` / `EmptyState`
   stay, so the existing `dev/component-preview` consumer does not break.
9. **Testable logic is extracted to `src/lib/loadingState.ts`** in each app and unit-tested to the
   QM-1 100% line/branch gate; the `.tsx` files stay thin presentational shells.

## Rationale

**Why extend the glow exception rather than strip the motif.** The pre-auth exception exists
because "no project data is on screen yet" — the entry sequence sets the mission-critical
personality before content competes with it. A loading state is _definitionally_ that same
interval: it is the placeholder that exists precisely because data has not arrived. The moment real
data renders, the component unmounts and the motif goes with it. The prohibition's purpose — that
project data is never dressed in decoration — is therefore untouched. Restricting the motif to the
`ai` variant keeps it aligned with the existing §32.7 rule that `--cos-cyan` is reserved for
AI-native features.

**Why `theme` prop over extending the dark-screen list.** The dark-screen list is a list of
_screens_, chosen per §32.7 on a use-context argument (indoor one-off vs all-day outdoor). A
component is not a screen and has no use-context of its own — it inherits the surface of whatever
screen hosts it. Adding it to the list would have been a category error, and would have forced the
light task screens to render a dark loading state.

**Why the caller owns progress and copy.** The determinate percentages in the mockups (65/42/82/12)
imply a progress source, but no spec defines a sync or AI progress signal for mobile. Wiring the
component to the sync queue would have (a) required inventing that signal, (b) coupled a
presentational component to `src/sync`, and (c) made it unusable for AI and plain fetch. A `progress`
prop defers the question to the caller, who already holds the data. The same argument applies to
copy: a `label` prop keeps QM-3 satisfied without this ADR having to invent Thai and English strings
for machine-flavoured mockup text (`PRC_ID: 8092-A`, `CORE_AI`) whose meaning to a field worker is
unestablished.

**Why no feature flag.** QM-15 mandates a flag for "any new UI screen or workflow step". A
presentational component is neither. §32.7's retrofit scope (ADR-049) is explicitly limited to
critical surfaces — AI/LLM endpoints, auth flows, financial mutations — and a loading placeholder is
none of these. A flag would also be self-defeating: the OFF path of a loading-state flag is either
no feedback at all or a second loading implementation to maintain.

**Why per-platform variants over one shared union.** A shared union would have forced either a
`list` variant that renders as a table on web (a name that lies about what the user sees) or a
`table` variant that mobile must reject at runtime. Per-platform unions keep each type honest, and
`variant` stays a compile-time error when misused.

**Alternatives rejected:**

- _Drop variants A and C and ship only the flat skeletons_ — would have kept §32.7 unchanged, but
  discards the AI processor pattern, which is the one loading state where the platform has something
  specific to say (an AI job is running, not a fetch).
- _Adopt the mockup palette as new tokens_ — rejected for the same reason §32.7 rejected it for the
  Site Engineer Home: it is a second dark palette, and the product carries exactly one.
- _Render the component with `@testing-library/react-native`_ — rejected: `react-native` is mocked
  wholesale in `apps/mobile/jest.config.ts` (`src/__mocks__/react-native.ts` exports only
  `I18nManager` and `Platform`), and `testMatch` accepts `.ts` only. Introducing a renderer would
  mean swapping the environment to jsdom and removing the mock that the currently-green
  `direction.ts` / `deviceTrust.ts` suites depend on — a test-infrastructure change far exceeding
  this component's scope, and one whose `Animated` branches would fight the 100% branch gate.

## Consequences

### Positive

- Loading feedback is one specified component instead of ad-hoc skeletons per screen.
- The glow exception is now stated as a principle ("no project data on screen") rather than a list
  of screens, so the next loading surface does not need a fresh decision.
- Web gains a `test` script and a jest config, which it had neither of before.
- No breaking change: existing `LoadingState.tsx` exports and their consumer are untouched.

### Negative

- §32.7's glow prohibition now has two exceptions rather than one; the rule is correspondingly
  harder to state in a sentence.
- Two `loadingState.ts` logic modules (one per app) rather than one shared module. Extracting to
  `@cos/shared` was not worth a new package boundary for clamp-and-map logic whose token outputs are
  platform-specific.
- Callers must supply `progress` and `label` themselves; a caller that supplies neither gets a
  correct but wordless indeterminate state.

### Neutral

- The mockups' `PRC_ID` / `STAGING_v2` / `CALCULATING_PROBABILITY_MATRIX_V2.4` machine strings are
  not implemented — they are `label` content if a caller wants them.

### Update (2026-07-26) — visual parity, decisions unchanged

Product-owner request to bring the component closer to the mockup's visual chrome. The chrome was
added **within** this ADR's decisions (all colour from tokens; caller still owns copy + progress):
the `widget` variant gained the mockup's technical corner brackets and an analytics glyph inside its
icon-plate skeleton; the `list` variant gained a clustered bordered container and a sync-active
spinner on its first row (`syncing` added to the token palette); the `micro` variant's spinner became
the mockup's ring. The machine strings and the `65/42/82/12` percentages remain caller-supplied — the
in-app uses (SITE_ENGINEER dashboard, app launch) pass none, so they render as wordless indeterminate
skeletons. The `ai` variant keeps `psychology` (the mockup's `neurology` glyph is absent from the
installed MaterialIcons set).

A follow-up (same date) wired the in-app callers to supply a `label` + `progress` after all, keeping
this ADR's "caller owns them" decision intact: the SITE_ENGINEER dashboard passes `common.loadingLabel`
("Loading…" — the project's own copy, not the mockup's machine strings) and an **honest** percentage
derived from how many of its load steps (`GET /projects/mine` + the project's progress / issues /
tasks) have settled — no simulated timer, no baked demo values. The `list` variant now renders that
percentage beside its sync spinner, and the app-launch state derives its own two-step (hydration +
font) percentage. The percentages are real load progress, so the "no progress signal" rationale is
honoured, not reversed.

A further follow-up (same date) gave the `widget` variant two **opt-in, caller-owned** props for its
branded launch use — `iconSource` (a brand image that replaces the pulsing icon-plate skeleton) and
`heading` (already-resolved text that replaces the top skeleton bar). The app-launch state
([`_layout.tsx`](../../../apps/mobile/src/app/_layout.tsx)) passes the app favicon + the tagline
"AI-NATIVE / Construction Platform", so the launch loading continues the native splash's identity
(same mark + wordmark) rather than showing an abstract skeleton. Both props are optional and default
to the skeleton, so the dashboard's `widget` use is unchanged. This keeps decisions 4–5 intact: the
component still bakes no brand asset and no copy — the caller owns them, exactly as it owns `progress`
and `label`. The launch tagline is the English brand default (not i18n) because it renders before
`I18nProvider` mounts and before the persisted locale is known — QM-3's documented system default,
the same reason the interactive `label` is omitted there.

### Update (2026-08-17) — mockup conformance sweep; decision 8 reversed

Product-owner request: bring **every** loading animation in the project onto the mockup patterns. An
inventory found mobile largely conformant (30 screens on `<LoadingBoundary>` / `<LoadingState />`)
and two real gaps — web's `<LoadingState />` had **zero production consumers** (its only importer was
`dev/component-preview`, while ~35 list pages rendered a bare `Loading…` line through `DataTable`),
and mobile still had 24 raw `ActivityIndicator` call sites. Decisions 1–7 and 9 stand. Changes:

1. **Web follows the desktop mockup, including where it disagrees with the mobile one.** §32.7's
   "Exception 2" previously named one motif (glow + scan-line + waveform) for both platforms, which
   matched neither drawing: the desktop `ai` card carries a glow, a pulsing processor plate and a
   `ping` dot, and **no** scan-line or waveform. Web dropped both; mobile keeps both. §32.7 now
   states the motif per platform. ADR-085 is the rule applied — a mockup is authoritative for style
   (the web widget also gained the drawing's corner brackets, percentage chip, icon plate, bar glow
   and mono caption; the table gained its header strip, sync row and dimmed queue), but not for
   composition, so removing the two motif elements was escalated rather than assumed.
2. **`SkeletonCard` and `LoadingSpinner` are deleted — this reverses decision 8.** They drew the same
   two mockup patterns `<LoadingState />` draws (`widget`'s plate-plus-two-bars, `micro`'s spinner)
   but off-token (`gray-200`, `rounded-xl`, a round plate where the mockup has a rounded square), so
   the app carried two implementations of one specified component. `EmptyState` is untouched, and
   `dev/component-preview` now previews the variants instead.
3. **New `tone` prop** (mobile, `micro` only). Ten of the replaced `ActivityIndicator`s sat inside
   primary-filled submit buttons and passed `onPrimary`; the ring resolves `primary` from the palette
   and would have disappeared into the button's own fill. `tone="onPrimary"` is the mockup's
   "inside a button" case. `resolveToneColor` is in `lib/loadingState.ts`, inside the QM-1 gate.
4. **A determinate loader now completes before it is replaced.** `<LoadingBoundary />` drives the bar
   to 100, holds one fill duration (`completionHoldMs`), then crossfades. Raised by the product owner
   from the mockup's own progress script: it animates the percentage and the bar, so a loader that
   unmounted the instant a fetch settled discarded the completion the animation is about.
   Indeterminate callers hold 0ms — nothing to arrive at, and forcing a figure would break the
   honest-data policy. The crossfade itself was reviewed and kept: the mockup loops back to 0 at 100%
   rather than handing off to content, so it is **silent** on the handoff rather than against it.
5. **New `color` prop** (mobile, `micro` only), overriding `tone`. Two §32.7 components carry a
   spinner colour that is semantic rather than incidental, and neither tone can name it:
   `<QuickActionRow />` inks its spinner with the caller's per-action accent — "the caller's signal,
   not decoration" — and drawing it in `primary` would erase the grouping the menu is making. Like
   that component's own `accent` prop, `color` takes a palette colour and never a hex.
   `resolveMicroInk(palette, tone, color?)` replaces `resolveToneColor` and is inside the QM-1 gate.
   **Every `ActivityIndicator` in the app is now gone** — 24 call sites across 19 files.
6. **`<VoiceNoteButton />`'s transcribing ring stays white, and the reason is measured, not
   aesthetic.** The one mockup that draws this state
   (`mockup/desktop/role_site_worker_desktop_view/site_worker_desktop_3`) keeps the mic glyph in the
   button and puts a **cyan** "AI Transcribing…" label outside it — but that is a dark desktop screen
   (`#031427`), where cyan measures 10.25:1. `<VoiceNoteButton />` is fixed to the light `colors` set
   and its button is `--mobile-primary` `#0066FF`, where **every** cyan in the product fails even
   WCAG SC 1.4.11's 3:1 floor for a non-text control: `#22D3EE` → 2.67:1, `#4CD7F6` → 2.84:1,
   `#06B6D4` → 1.99:1. Cyan fails on the light page (`#FFFFFF`, 1.81–2.43:1) and card (`#F5F5F5`,
   1.56–2.23:1) too, so moving the label out of the button does not rescue it either. `tone`
   `onPrimary` resolves to `colors.bg` `#FFFFFF` — **4.83:1, the same ink the mic, the label and the
   waveform bars already use** — so the ring keeps exactly the colour it had and §20.8 holds. The AI
   signal is carried by the words: `voiceNote.transcribing` is already translated in `en` and `th`
   and already renders beside the ring in the `bar` shape. Product-owner decision 2026-08-17, taken
   against these measurements after cyan was first requested.

## References

- [32-implementation-specifications.md §32.7](../../specifications/32-implementation-specifications.md) —
  "Exception 2 — loading states"; Mobile Core Component Library → `<LoadingState />`
- [ADR-049](049-unleash-feature-flags.md) — feature-flag retrofit scope (critical surfaces only)
- `mockup/mobile/00_loading` · `mockup/desktop/imp_002_universal_loading_component_desktop_view`

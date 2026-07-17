# ADR-055: Universal loading component (`<LoadingState />`)

**Date:** 2026-07-17
**Status:** Accepted
**Deciders:** Product owner
**Tags:** mobile | architecture

---

## Context

`mockup/mobile/universal_loading_component_mobile_view` and
`mockup/desktop/universal_loading_component_desktop_view` specify a standardised set of loading
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
   without a product-owner decision. The mockups are dark, but a *universal* component must also
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
personality before content competes with it. A loading state is *definitionally* that same
interval: it is the placeholder that exists precisely because data has not arrived. The moment real
data renders, the component unmounts and the motif goes with it. The prohibition's purpose — that
project data is never dressed in decoration — is therefore untouched. Restricting the motif to the
`ai` variant keeps it aligned with the existing §32.7 rule that `--cos-cyan` is reserved for
AI-native features.

**Why `theme` prop over extending the dark-screen list.** The dark-screen list is a list of
*screens*, chosen per §32.7 on a use-context argument (indoor one-off vs all-day outdoor). A
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

- *Drop variants A and C and ship only the flat skeletons* — would have kept §32.7 unchanged, but
  discards the AI processor pattern, which is the one loading state where the platform has something
  specific to say (an AI job is running, not a fetch).
- *Adopt the mockup palette as new tokens* — rejected for the same reason §32.7 rejected it for the
  Site Engineer Home: it is a second dark palette, and the product carries exactly one.
- *Render the component with `@testing-library/react-native`* — rejected: `react-native` is mocked
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

## References

- [32-implementation-specifications.md §32.7](../../specifications/32-implementation-specifications.md) —
  "Exception 2 — loading states"; Mobile Core Component Library → `<LoadingState />`
- [ADR-049](049-unleash-feature-flags.md) — feature-flag retrofit scope (critical surfaces only)
- `mockup/mobile/universal_loading_component_mobile_view` · `mockup/desktop/universal_loading_component_desktop_view`

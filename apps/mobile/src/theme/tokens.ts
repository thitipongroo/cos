// Mobile design tokens — mirrors docs/specifications/32-implementation-specifications.md §32.7
// (Mobile Colour / Typography / Spacing / Touch Target tokens, React Native field app).
//
// Colour values are the §32.7 `--mobile-*` palette, optimised for outdoor sunlight visibility.
// `--mobile-primary` (#0066FF) is intentionally NOT `--cos-blue` (#2563EB) — see §32.7 design note.
// Font family names are the per-weight exports of `@expo-google-fonts/inter-tight`.

export const colors = {
  primary: '#0066FF', // --mobile-primary — bright blue (outdoor visibility), tap targets/CTAs
  success: '#00C853', // --mobile-success — confirmation green
  warning: '#FF9500', // --mobile-warning — caution orange
  danger: '#FF3B30', // --mobile-danger — urgent / delete red
  bg: '#FFFFFF', // --mobile-bg — background (also used as on-colour text)
  surface: '#F5F5F5', // --mobile-surface — card surface
  textPrimary: '#1C1C1E', // --mobile-text-primary
  textSecondary: '#6C6C70', // --mobile-text-secondary
  offline: '#8E8E93', // --mobile-offline — offline indicator
  syncing: '#FFD60A', // --mobile-syncing — syncing indicator
  synced: '#00C853', // --mobile-synced — synced indicator
} as const;

/**
 * Dark-surface palette (§32.7 "Mobile Dark Surfaces").
 *
 * Task screens — the forms and lists a worker keeps open all day — stay on `colors` above, whose
 * light palette exists for outdoor sunlight visibility. A defined set of screens renders dark
 * instead: login, OTP verify, the session-securing overlay, and the Site Engineer Home. §32.7 lists
 * them exhaustively; do not put a new screen on this palette without a product-owner decision.
 *
 * These are the shared `--cos-dark-*` tokens rather than a mobile-only dark set, so the product
 * carries exactly one dark palette across mobile, web login, and the Keycloak theme. `primary` stays
 * `--mobile-primary` so a learned tap target never changes colour between screens.
 */
export const darkColors = {
  primary: colors.primary, // --mobile-primary — CTAs stay the field-app blue
  onPrimary: '#F8FAFC', // --cos-dark-text — label/icon on a primary-filled button
  bg: '#020617', // --cos-dark-bg
  surface: '#0F172A', // --cos-dark-surface — card surface
  elevated: '#111827', // --cos-dark-elevated — inputs, inner panels, logo plate
  // --cos-dark-surface-container. SPECIFIED 2026-08-06 (PO decision) for the BOTTOM NAV, and only
  // for it. The mockups draw the two pieces of chrome differently and deliberately: the header is
  // `bg-surface dark:bg-dark-bg`, so on `<html class="dark">` with `darkMode: "class"` the dark:
  // variant wins on specificity and the bar is the page colour #020617; the nav is
  // `bg-surface-container dark:bg-surface-container` — the same value in both modes — and it also
  // carries `rounded-t-xl` and a top border, i.e. a raised sheet rather than a flat strip.
  //
  // This value was NOT in the --cos-dark-* set, which is why the nav had been sitting on `surface`
  // (#0F172A, the card colour) and then briefly on `bg`. Counted across mockup/mobile/**: 217 of the
  // code.html files define surface-container as #102034, 5 as #0F172A. Adding the token is the point
  // — §32.7 forbids a hex at the call site, and there was no token that meant this.
  surfaceContainer: '#102034',
  text: '#F8FAFC', // --cos-dark-text
  muted: '#94A3B8', // --cos-dark-muted — secondary text, footer
  cyan: '#22D3EE', // --cos-dark-cyan — AI/technical accent (auth entry screens only, §32.7)
  // --cos-dark-accent. For marks drawn ON the dark background: icons, eyebrows, card titles, tags.
  // ACCESSIBILITY, NOT STYLE: `primary` #0066FF measures 4.17:1 against `bg` #020617 — it clears
  // SC 1.4.11's 3:1 for a non-text control but fails SC 1.4.3's 4.5:1 for text, and §20.8 makes
  // WCAG 2.2 AA a shipping gate. This is 11.87:1. CTAs keep `primary`: a filled button puts the blue
  // behind white text, so the contrast that matters there is the button's, not the blue's.
  accent: '#4CD7F6',
  // Status marks take the --cos-dark-* set, not the --mobile-* one, so every colour on a dark screen
  // comes from the same palette. #F59E0B is amber, which §32.7 prohibits as a *brand* colour — as a
  // semantic warning token it is exactly what the spec's own dark table defines it for.
  success: '#10B981', // --cos-dark-success — on-track, security/status marks
  warning: '#F59E0B', // --cos-dark-warning — behind-schedule, medium-severity
  danger: '#EF4444', // --cos-dark-danger — errors, critical severity
  syncing: '#FFD60A', // --sync-active — offline-sync-in-progress indicator (matches colors.syncing)
  // --cos-dark-outline. SPECIFIED 2026-08-06; until then the dark set had no outline token and this
  // was `rgba(148, 163, 184, 0.24)` — muted at low alpha, invented here because nothing defined a
  // border. A translucent tint reads as a soft glow rather than an edge, which is why cards looked
  // blurrier than the mockups they were built from.
  //
  // NOT simply "the value the mockups use" — that claim was here and was wrong. `outline-variant` is
  // `#434655` in 189 of the mockup/mobile/** code.html files and `#46464C` in 28, so this is the
  // MINORITY value, kept deliberately (PO decision 2026-08-07, §32.7). The two are (70,70,76) against
  // (67,70,85); the neutral grey reads as an edge on a navy surface where the bluer one blends into
  // it, which is the whole point of replacing the translucent glow. Re-deriving tokens from the
  // mockups will land on #434655 — read §32.7 before "correcting" this.
  border: '#46464C',
} as const;

// Font family per weight (Inter Tight via @expo-google-fonts/inter-tight).
// Use these instead of `fontWeight` — custom fonts select the face by family name.
export const fontFamily = {
  regular: 'InterTight_400Regular', // 400 — body
  medium: 'InterTight_500Medium', // 500 — labels / UI
  semibold: 'InterTight_600SemiBold', // 600 — headings
  bold: 'InterTight_700Bold', // 700 — wordmark
} as const;

// Mobile typography scale (§32.7). Pair `size` with a `fontFamily.*` for the weight.
export const typography = {
  hero: { fontSize: 28, lineHeight: 28 * 1.3 }, // page titles
  title: { fontSize: 22, lineHeight: 22 * 1.3 }, // card titles
  body: { fontSize: 17, lineHeight: 17 * 1.5 }, // body (iOS standard)
  caption: { fontSize: 15, lineHeight: 15 * 1.5 }, // metadata
  label: { fontSize: 13, lineHeight: 13 * 1.5 }, // input labels
} as const;

export const lineHeightRatio = { normal: 1.5, tight: 1.3 } as const;

// Mobile spacing scale (§32.7, base unit 4px).
export const spacing = {
  xs: 8, // icon padding
  sm: 12, // card internal padding
  md: 16, // section padding
  lg: 24, // screen edge padding
  xl: 32, // major section separation
} as const;

/**
 * Border radius (§32.7 "Mobile Border Radius"; added 2026-08-05, corrected 2026-08-06).
 *
 * DELIBERATELY TIGHTER THAN THE WEB SCALE. `radius.lg` is 8 here and `--web-radius-lg` is 12: the
 * names are shared, the values are not, and they must not be "harmonised". A phone is held at arm's
 * length rather than desk distance, and every mockup under `mockup/mobile/` encodes that by
 * overriding Tailwind's radius in its own config — `lg` 0.25rem (4), `xl` 0.5rem (8), `full`
 * 0.75rem (12).
 *
 * THE FIRST VERSION OF THIS TOKEN COPIED THE WEB SCALE and justified it with "the mockups were
 * drawn against it". That was an assumption nobody had checked, and it was wrong — which is why
 * cards still looked too round after the first pass. The values below are read off the mockups.
 *
 * EVERY STATUS PILL AND BADGE TAKES `xl` (12) — one token, no exceptions. The mockups disagree with
 * each other: counted 2026-08-06, 153 of the 226 `code.html` files under `mockup/mobile` keep
 * `rounded-full` at 9999px, 52 override it to 0.75rem = 12px. A platform ruling, not a reading — and
 * costs nothing, because these badges are 18–26px tall and any radius at or above half the height
 * draws the same shape. At 18px `xl` IS a capsule; at 26px it is a pixel shy of one.
 *
 * `999` is reserved for genuinely circular elements — avatars, status dots, radio marks, the round
 * plate behind a flow-step icon — where the radius is half the width and is not on this scale.
 */
export const radius = {
  sm: 2, // inline provenance chips only (mockup `rounded`, e.g. the "from your account" tag)
  md: 4, // list rows, icon tiles, accordion items, buttons
  lg: 8, // cards, inputs
  xl: 12, // hero / summary cards, emphasised panels
  xxl: 16, // the dashed closing panel — the one radius the mockups leave at Tailwind's default
} as const;

/**
 * Corner radius for a SQUARE ICON PLATE — the tinted tile behind a glyph, an avatar box, a logo box.
 *
 * A quarter of the side, so the corner scales with the plate (PO decision 2026-08-06). These are not
 * on the `radius` scale and they are not circles either, which is why they were the last cluster of
 * magic numbers left after the 2026-08-06 sweep: nine sizes from 28px to 96px carrying six different
 * hand-picked radii. A fixed step cannot serve them — `md` (4) reads as a hard square at 96px, and
 * `xxl` (16) swallows a 28px plate.
 *
 * FLOOR AT 28px. Below that the plate is small enough that a quarter is under 7px and the corner
 * stops reading as deliberate; those take `radius.md` like any other icon tile (§32.7).
 *
 * NOT for circles. An avatar meant to be round takes half its width, not a quarter — that is a
 * different shape, not a smaller radius.
 */
export function plateRadius(side: number): number {
  return Math.round(side / 4);
}

// Touch target standards (§32.7) — minimum sizes (WCAG AAA where noted).
export const touchTarget = {
  primaryButton: 44, // recommended 52
  secondaryButton: 44, // recommended 48
  iconButton: 44, // WCAG AAA
  listItem: 52, // recommended 60
  formInput: 48, // recommended 52
  checkbox: 44, // tap area (visual 24–28)
  minSpacing: 8, // minimum gap between targets
} as const;

export const theme = {
  colors,
  darkColors,
  fontFamily,
  typography,
  lineHeightRatio,
  spacing,
  radius,
  touchTarget,
} as const;

export type Theme = typeof theme;

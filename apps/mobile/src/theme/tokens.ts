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
 * Auth-screen palette (§32.7 "Mobile Auth Screens"). The signed-in field app stays on `colors`
 * above — that light palette exists for outdoor sunlight visibility — but the pre-auth screens are
 * indoor/one-off and are specified dark, matching the web login surface and
 * mockup/00_login_flow/mobile/. These are the shared `--cos-dark-*` tokens rather than a mobile-only
 * dark set, so the product carries exactly one dark palette; `primary` stays `--mobile-primary`.
 */
export const authColors = {
  primary: colors.primary, // --mobile-primary — CTAs stay the field-app blue
  onPrimary: '#F8FAFC', // --cos-dark-text — label/icon on a primary-filled button
  bg: '#020617', // --cos-dark-bg
  surface: '#0F172A', // --cos-dark-surface — card surface
  elevated: '#111827', // --cos-dark-elevated — inputs, inner panels, logo plate
  text: '#F8FAFC', // --cos-dark-text
  muted: '#94A3B8', // --cos-dark-muted — secondary text, footer
  success: '#10B981', // --cos-dark-success — security/status marks
  danger: '#EF4444', // --cos-dark-danger — errors
  // Derived: --cos-dark-muted at low alpha. The dark set has no outline token, and --cos-dark-elevated
  // (#111827) is invisible against --cos-dark-surface (#0F172A), so borders take a muted tint instead.
  border: 'rgba(148, 163, 184, 0.24)',
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
  authColors,
  fontFamily,
  typography,
  lineHeightRatio,
  spacing,
  touchTarget,
} as const;

export type Theme = typeof theme;

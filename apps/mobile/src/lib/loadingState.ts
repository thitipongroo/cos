// Loading-state logic (§32.7 "Loading State"; ADR-055) — the unit-testable half of
// <LoadingState />.
//
// The component itself is a presentational shell: it renders what these functions return. Keeping
// the decisions here (which palette, which layout, is there a percentage, what does it read) means
// they are covered by the QM-1 100% line/branch gate — RN components are not (jest.config.ts
// collectCoverageFrom excludes src/components/**, and react-native is mocked wholesale, so a
// component cannot be rendered under jest at all).

import { colors, darkColors } from '../theme/tokens';

/** Mobile variants (§32.7). No `table` — §32.7 prohibits tables in React Native; `list` stacks cards. */
export type LoadingVariant = 'widget' | 'list' | 'ai' | 'micro';

export type LoadingTheme = 'light' | 'dark';

/**
 * The colours <LoadingState /> draws with, resolved from the §32.7 token modules.
 *
 * `accent` is the AI cyan and exists only on the dark palette: §32.7 reserves --cos-cyan for
 * AI-native features and defines no cyan in the light --mobile-* set. The `ai` variant is therefore
 * dark-only (see aiMotifEnabled).
 */
export interface LoadingPalette {
  readonly surface: string;
  readonly skeleton: string;
  readonly text: string;
  readonly muted: string;
  readonly primary: string;
  readonly accent: string | null;
}

/** Skeleton bars are the surface's neighbour, tinted — the §32.7 tonal-layer rule, not a new token. */
const LIGHT_SKELETON = 'rgba(108, 108, 112, 0.18)'; // --mobile-text-secondary at low alpha
const DARK_SKELETON = 'rgba(148, 163, 184, 0.18)'; // --cos-dark-muted at low alpha

export function resolvePalette(theme: LoadingTheme): LoadingPalette {
  if (theme === 'dark') {
    return {
      surface: darkColors.surface,
      skeleton: DARK_SKELETON,
      text: darkColors.text,
      muted: darkColors.muted,
      primary: darkColors.primary,
      accent: darkColors.cyan,
    };
  }
  return {
    surface: colors.surface,
    skeleton: LIGHT_SKELETON,
    text: colors.textPrimary,
    muted: colors.textSecondary,
    primary: colors.primary,
    accent: null,
  };
}

/**
 * Clamp a caller-supplied percentage into 0–100.
 *
 * Returns null for "no percentage to show" — the indeterminate case. A caller that has no progress
 * omits the prop; a caller wiring up a live signal may hand us a NaN mid-stream, and a spinner is a
 * better answer there than rendering "NaN%".
 */
export function clampProgress(progress?: number): number | null {
  if (progress === undefined || Number.isNaN(progress)) return null;
  if (progress < 0) return 0;
  if (progress > 100) return 100;
  return progress;
}

/** True when the caller gave us a usable percentage — i.e. render the bar and the % readout. */
export function isDeterminate(progress?: number): boolean {
  return clampProgress(progress) !== null;
}

/**
 * The percentage readout, or null when indeterminate.
 *
 * Digits are Western here by design: the caller passes pre-translated `label` copy, but a progress
 * percentage is a number, and §32.7 shows it in tabular figures on both mockups. Locale-aware digit
 * shaping would desynchronise the readout from the bar it labels.
 */
export function formatPercent(progress?: number): string | null {
  const value = clampProgress(progress);
  if (value === null) return null;
  return `${Math.round(value)}%`;
}

/** Bar fill width as a CSS/RN percentage string, or null when indeterminate. */
export function progressWidth(progress?: number): string | null {
  const value = clampProgress(progress);
  if (value === null) return null;
  return `${value}%`;
}

/**
 * Whether the glow / scan-line / waveform motif renders.
 *
 * §32.7 "Exception 2 — loading states" scopes the motif to the `ai` variant. It also needs the cyan
 * accent, which only the dark palette carries — so an `ai` variant on a light task screen renders
 * as a plain skeleton rather than inventing an off-token cyan.
 */
export function aiMotifEnabled(variant: LoadingVariant, theme: LoadingTheme): boolean {
  return variant === 'ai' && theme === 'dark';
}

/** How many skeleton rows the `list` variant stacks (mockup section B shows three). */
export const LIST_SKELETON_ROWS = 3;

/**
 * Per-row skeleton bar widths for the `list` variant.
 *
 * Ragged widths read as text; uniform bars read as a table. The mockup's three rows use these.
 */
export function listRowWidths(row: number): { title: string; subtitle: string } {
  const widths = [
    { title: '60%', subtitle: '40%' },
    { title: '75%', subtitle: '25%' },
    { title: '50%', subtitle: '60%' },
  ];
  return widths[row % widths.length];
}

/**
 * The accessibility announcement for a loading state.
 *
 * Returns null when there is nothing to announce — no label and no percentage — so the component
 * can omit the a11y props entirely rather than announce an empty string. Screen readers get the
 * caller's already-translated label; the percentage is appended only when determinate.
 */
export function accessibilityLabel(label?: string, progress?: number): string | null {
  const percent = formatPercent(progress);
  if (label === undefined || label === '') return percent;
  if (percent === null) return label;
  return `${label} ${percent}`;
}

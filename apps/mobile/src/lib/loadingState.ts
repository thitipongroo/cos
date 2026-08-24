// Loading-state logic (§32.7 "Loading State"; ADR-055) — the unit-testable half of <LoadingState />.
//
// The platform-agnostic math (clampProgress / isDeterminate / formatPercent / progressWidth /
// accessibilityLabel) lives in @cos/ui-logic and is shared with the web app (ADR-068); it is
// re-exported here so this module stays the single import surface for the mobile component. Only the
// React-Native-specific pieces (the token palette and the `list` variant) are defined below.
//
// The component itself is a presentational shell: it renders what these functions return. Keeping the
// decisions here (which palette, which layout) means they are covered by unit tests — RN components
// are not (jest.config.ts collectCoverageFrom excludes src/components/**, and react-native is mocked
// wholesale, so a component cannot be rendered under jest at all).

import { isDeterminate } from '@cos/ui-logic';
import { colors, darkColors } from '../theme/tokens';

export {
  clampProgress,
  isDeterminate,
  formatPercent,
  progressWidth,
  accessibilityLabel,
} from '@cos/ui-logic';

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
  /** Offline-sync-in-progress accent (mockup's `sync-active`) — the `list` variant's sync spinner. */
  readonly syncing: string;
  /** Ink on a primary-filled surface — what a `micro` loader inside a CTA button draws with. */
  readonly onPrimary: string;
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
      syncing: darkColors.syncing,
      onPrimary: darkColors.onPrimary,
    };
  }
  return {
    surface: colors.surface,
    skeleton: LIGHT_SKELETON,
    text: colors.textPrimary,
    muted: colors.textSecondary,
    primary: colors.primary,
    accent: null,
    syncing: colors.syncing,
    // The light set defines no `onPrimary`; `bg` is the token §32.7 documents as the on-colour ink.
    onPrimary: colors.bg,
  };
}

/**
 * Where a `micro` loader is drawn, which decides which ink it takes.
 *
 * `onPrimary` is for a loader sitting INSIDE a primary-filled control — a submit button mid-request,
 * which is the mockup's "Variant D / inside a button" case. Drawing `primary` there would put the
 * ring in the button's own fill colour and it would disappear. Everywhere else takes `default`.
 */
export type LoadingTone = 'default' | 'onPrimary';

/**
 * The ink a `micro` loader's ring and percentage take.
 *
 * Precedence: an explicit `color` wins, else the tone, else the palette's primary.
 *
 * `color` exists for the handful of hosts that carry a MEANINGFUL colour of their own, which neither
 * tone can name — <QuickActionRow />'s per-action accent is the case that forced it: the accent says
 * which of a menu's actions are alike, so a spinner drawn in `primary` would erase the grouping the
 * caller is making. Like that component's own `accent` prop, `color` takes a palette colour and
 * never a hex — §32.7 forbids a literal at the call site.
 */
export function resolveMicroInk(
  palette: LoadingPalette,
  tone: LoadingTone,
  color?: string,
): string {
  if (color !== undefined && color !== '') return color;
  return tone === 'onPrimary' ? palette.onPrimary : palette.primary;
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
 * Honest load progress for a surface, as a percentage — or `null` when it must not show one.
 *
 * A percentage is only meaningful when the surface has MORE THAN ONE load step (product-owner
 * decision 2026-08-17). A screen that loads with a single request can only ever report 0% and then
 * 100%: the number never moves, so it reads as a stuck loader rather than as progress. That is the
 * same reason a `micro` ring inside a submit button shows no percentage — one POST, one step.
 *
 * So: two or more steps → a real fraction that climbs as each settles. One step (or none) → `null`,
 * and the caller passes no `progress`, leaving an indeterminate loader whose skeletons sweep and
 * whose bar runs a segment across the track. Nothing is fabricated either way (ADR-055 honest-data).
 *
 * `doneSteps` is clamped into range, so a caller that miscounts cannot render 120% or a negative bar.
 */
export function loadProgress(doneSteps: number, totalSteps: number): number | null {
  if (!Number.isFinite(totalSteps) || totalSteps < 2) return null;
  if (!Number.isFinite(doneSteps)) return 0;
  const done = Math.min(Math.max(doneSteps, 0), totalSteps);
  return Math.round((done / totalSteps) * 100);
}

/** How long <LoadingState />'s fill eases to a new value — its own `advance` timing. */
export const FILL_DURATION_MS = 600;

/** How long <LoadingBoundary /> takes to crossfade the settled loader out over the real content. */
export const CROSSFADE_MS = 260;

/**
 * How long <LoadingBoundary /> holds a finished loader at 100% before starting its crossfade
 * (product-owner decision 2026-08-17 — "บังคับให้ bar วิ่งถึง 100 ก่อน fade").
 *
 * Why it exists: a fetch settles whenever it settles, which is usually while the bar is mid-travel —
 * so the loader used to vanish at, say, 70%, and the completion the user was watching for never
 * happened on screen. Holding for one fill duration lets the bar and the counting percentage finish
 * their run to 100 first, which is the moment the mockup's progress animation is about.
 *
 * Indeterminate callers get 0: with no honest percentage there is no bar to fill and nothing to
 * arrive at, so holding would just delay the content for a sweep that never completes (ADR-055
 * honest-data policy — the component must not imply a progress it does not have).
 */
export function completionHoldMs(progress?: number): number {
  return isDeterminate(progress) ? FILL_DURATION_MS : 0;
}

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

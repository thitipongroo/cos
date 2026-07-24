// Loading-state logic (§32.7 "Loading State"; ADR-055) — the unit-testable half of <LoadingState />.
//
// The platform-agnostic math (clampProgress / isDeterminate / formatPercent / progressWidth /
// accessibilityLabel) lives in @cos/ui-logic and is shared with the mobile app (ADR-068); it is
// re-exported here so this module stays the single import surface for the web component. Only the
// web-specific pieces are defined below.
//
// The web component styles with Tailwind token utilities rather than a TS token module (that is the
// mobile mechanism), so "resolve the palette" here means "resolve the token class names" — never
// arbitrary hex, per §32.7 Web Implementation. The prop contract is identical to the mobile app by
// design (§32.7): the two differ only where the platforms genuinely differ — web has a `table`
// variant, mobile a `list`.

export {
  clampProgress,
  isDeterminate,
  formatPercent,
  progressWidth,
  accessibilityLabel,
} from '@cos/ui-logic';

/** Web variants (§32.7). `table` renders row skeletons; there is no `list` (that is the mobile shape). */
export type LoadingVariant = 'widget' | 'table' | 'ai' | 'micro';

/**
 * Whether the glow / scan-line / waveform motif renders.
 *
 * §32.7 "Exception 2 — loading states" scopes the motif to the `ai` variant. Unlike mobile, web has
 * no theme prop: `--cos-cyan` exists in both the light and dark web token sets, and Tailwind's
 * `dark:` variants resolve the surface, so the `ai` variant carries the motif on either surface.
 */
export function aiMotifEnabled(variant: LoadingVariant): boolean {
  return variant === 'ai';
}

/** How many skeleton rows the `table` variant renders (the desktop mockup shows three). */
export const TABLE_SKELETON_ROWS = 3;

/** How many columns each `table` row skeletons out (the desktop mockup shows four). */
export const TABLE_SKELETON_COLUMNS = 4;

/**
 * Per-column skeleton bar widths for the `table` variant.
 *
 * Ragged widths read as data; uniform bars read as a placeholder grid. The desktop mockup's four
 * columns narrow left-to-right, then widen for the trailing column.
 */
export function tableColumnWidth(column: number): string {
  const widths = ['w-24', 'w-20', 'w-16', 'w-32'];
  return widths[column % widths.length];
}

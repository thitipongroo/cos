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
 * Whether the AI motif renders.
 *
 * §32.7 "Exception 2 — loading states" scopes the motif to the `ai` variant. Unlike mobile, web has
 * no theme prop: `--cos-cyan` exists in both the light and dark web token sets, and Tailwind's
 * `dark:` variants resolve the surface, so the `ai` variant carries the motif on either surface.
 *
 * WHAT THE MOTIF IS ON WEB (product-owner decision 2026-08-17): the cyan glow, the pulsing processor
 * plate and the ping dot — **not** a scan-line and **not** a waveform. The desktop mockup
 * (`imp_002_universal_loading_component_desktop_view`, the authoritative web reference per ADR-055)
 * carries none of those two; they are the mobile mockup's motif and stay in the React Native
 * component. §32.7 "Exception 2" was updated to match in the same commit (Rule 37).
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

/**
 * Per-column widths for the `table` variant's HEADER row.
 *
 * The desktop mockup heads the skeleton with a tinted strip of four short bars, so a loading table
 * reads as a table rather than as a stack of rows. Its header bars are shorter than the body bars
 * and raggedly ordered differently, which is what stops the header reading as a fourth data row.
 */
export function tableHeaderWidth(column: number): string {
  const widths = ['w-16', 'w-20', 'w-12', 'w-24'];
  return widths[column % widths.length];
}

/**
 * Whether a `table` cell is the one carrying the sync spinner + percentage.
 *
 * The desktop mockup puts a spinning sync glyph and a live percentage in the LAST column of the
 * FIRST row — the row being written — and leaves every other cell a plain skeleton bar. It only
 * applies when the caller gave an honest percentage; with no progress there is nothing to show
 * beside the spinner, so that cell stays a skeleton (ADR-055 honest-data policy).
 */
export function isTableSyncCell(
  row: number,
  column: number,
  columns: number,
  determinate: boolean,
): boolean {
  return determinate && row === 0 && column === columns - 1;
}

/**
 * Rows after the first are dimmed, per the desktop mockup — the eye reads the first row as the one
 * currently being filled and the rest as queued behind it.
 */
export function tableRowOpacity(row: number): string {
  return row === 0 ? '' : 'opacity-60';
}

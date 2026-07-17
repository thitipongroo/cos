// Loading-state logic (§32.7 "Loading State"; ADR-055) — the unit-testable half of
// <LoadingState />.
//
// The web component is a presentational shell that renders what these functions return. Web styles
// with Tailwind token utilities rather than a TS token module (that is the mobile mechanism), so
// "resolve the palette" here means "resolve the token class names" — never arbitrary hex, per
// §32.7 Web Implementation.
//
// The prop contract is identical to apps/mobile/src/lib/loadingState.ts by design (§32.7): the two
// differ only where the platforms genuinely differ — web has a `table` variant, mobile a `list`.

/** Web variants (§32.7). `table` renders row skeletons; there is no `list` (that is the mobile shape). */
export type LoadingVariant = 'widget' | 'table' | 'ai' | 'micro';

/**
 * Clamp a caller-supplied percentage into 0–100.
 *
 * Returns null for "no percentage to show" — the indeterminate case. A caller with no progress omits
 * the prop; a caller wiring a live signal may hand us NaN mid-stream, and a spinner beats "NaN%".
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
 * Western digits by design — the caller passes pre-translated `label` copy, but the percentage is a
 * number shown in tabular figures beside the bar it labels (§32.7, both mockups).
 */
export function formatPercent(progress?: number): string | null {
  const value = clampProgress(progress);
  if (value === null) return null;
  return `${Math.round(value)}%`;
}

/** Bar fill width as a CSS percentage, or null when indeterminate. */
export function progressWidth(progress?: number): string | null {
  const value = clampProgress(progress);
  if (value === null) return null;
  return `${value}%`;
}

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

/**
 * The accessibility announcement for a loading state.
 *
 * Returns null when there is nothing to announce — no label and no percentage — so the component can
 * omit the aria props entirely rather than announce an empty string.
 */
export function accessibilityLabel(label?: string, progress?: number): string | null {
  const percent = formatPercent(progress);
  if (label === undefined || label === '') return percent;
  if (percent === null) return label;
  return `${label} ${percent}`;
}

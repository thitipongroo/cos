// Loading-state math (§32.7 "Loading State"; ADR-055) — the platform-agnostic half of the
// <LoadingState /> components. These functions are pure number/string logic with no React Native,
// browser, or Node dependency, so the web and mobile shells share one implementation and one test
// suite (ADR-068). Platform-specific pieces — RN token palettes, Tailwind class names, the `list`
// vs `table` variant, skeleton layouts — stay in each app's own `lib/loadingState.ts`.

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

/** Bar fill width as a CSS/RN percentage string, or null when indeterminate. */
export function progressWidth(progress?: number): string | null {
  const value = clampProgress(progress);
  if (value === null) return null;
  return `${value}%`;
}

/**
 * The accessibility announcement for a loading state.
 *
 * Returns null when there is nothing to announce — no label and no percentage — so the component can
 * omit the a11y props entirely rather than announce an empty string. Screen readers get the caller's
 * already-translated label; the percentage is appended only when determinate.
 */
export function accessibilityLabel(label?: string, progress?: number): string | null {
  const percent = formatPercent(progress);
  if (label === undefined || label === '') return percent;
  if (percent === null) return label;
  return `${label} ${percent}`;
}

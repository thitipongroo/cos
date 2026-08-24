// <LoadingState /> — the standard loading placeholder / progress component for apps/web
// (§32.7 "Loading State"; ADR-055).
//
// Layout is the DESKTOP mockup, `mockup/desktop/imp_002_universal_loading_component_desktop_view`
// — the authoritative web reference per ADR-055 (the mobile `mockup/mobile/00_loading` governs the
// React Native component, which genuinely differs: it stacks cards where this renders table rows).
//
// Presentational only: it owns no data source and no i18n copy. The caller passes `progress`
// (0–100; omit for indeterminate) and an already-translated `label` (QM-3 — the component holds no
// key and no literal). The mockup's machine strings (`CORE_AI`, `PROCESSING LOGIC`,
// `CALCULATING_PROBABILITY_MATRIX_V2.4`) are deliberately NOT baked in; where the mockup shows one,
// this renders the caller's `label` or a skeleton bar standing in its place.
//
// Motion — the mockup animates (code.html of the mobile reference runs the bar and the percentage
// on a timer, and its bar carries `transition-all duration-1000`):
//   * determinate  → the percentage counts up to the caller's value and the fill bar eases to it,
//                    driven by ONE value so the number and the bar can never disagree.
//   * indeterminate → NO percentage, and a bright segment sweeps the track (`cos-indeterminate`),
//                    so the bar is visibly working without inventing a figure (honest-data policy).
//
// The `ai` variant carries §32.7 "Exception 2" — the cyan glow, the pulsing processor plate and the
// ping dot. It carries NO scan-line and NO waveform: the desktop mockup has neither (product-owner
// decision 2026-08-17). Those two are the mobile motif and stay in the React Native component.
//
// Colour is tokens only (§32.7): Tailwind token utilities, and the three glows come from the
// --cos-glow-* CSS variables in globals.css, which derive from the brand tokens via color-mix. No
// hardcoded hex, no arbitrary colour values.
//
// Testable decisions live in ../../lib/loadingState.ts so they sit inside the QM-1 100% gate; this
// file is the shell (jest.config.js collects coverage from src/lib only, and the runner is
// `testEnvironment: 'node'` with no jsdom — components are Playwright territory).

'use client';

import { useEffect, useRef, useState } from 'react';
import {
  clampProgress,
  formatPercent,
  progressWidth,
  aiMotifEnabled,
  tableColumnWidth,
  tableHeaderWidth,
  isTableSyncCell,
  tableRowOpacity,
  accessibilityLabel,
  TABLE_SKELETON_ROWS,
  TABLE_SKELETON_COLUMNS,
  type LoadingVariant,
} from '../../lib/loadingState';

export interface LoadingStateProps {
  /** Layout. `table` renders row skeletons; there is no `list` (that is the mobile shape). */
  variant: LoadingVariant;
  /** 0–100. Omit for indeterminate (no bar fill, no percentage). Clamped; NaN reads as indeterminate. */
  progress?: number;
  /** Already-translated copy. Omit to render no text. */
  label?: string;
  /** Rows for the `table` variant. Defaults to the three the mockup shows. */
  rows?: number;
  /** Columns for the `table` variant. Defaults to the four the mockup shows. */
  columns?: number;
  'data-testid'?: string;
}

/** Card chrome shared by the widget and ai variants — §32.7 web card radius (12px) + 1px outline. */
const CARD =
  'relative overflow-hidden rounded-lg border border-cos-gray/20 bg-white dark:border-cos-dark-muted/20 dark:bg-cos-dark-surface';
/** A pulsing skeleton bar — the shared primitive behind every non-ai variant. */
const BAR = 'animate-pulse rounded bg-cos-gray/20 dark:bg-cos-dark-muted/20';
/** The progress track both bars sit in. */
const TRACK = 'h-2 w-full overflow-hidden rounded-full bg-cos-gray/15 dark:bg-cos-dark-bg';

/** How long the fill/percentage takes to ease to a new value. Mirrors the mockup's 1s bar transition. */
const FILL_MS = 900;

/**
 * Counts a displayed percentage up to `target`, so the number the user reads is the same value the
 * bar is drawing. Returns null while indeterminate — nothing to count, and nothing may be shown.
 */
function useCountUp(target: number | null): number | null {
  const [shown, setShown] = useState(target ?? 0);
  const fromRef = useRef(target ?? 0);
  const frameRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (target === null) return;
    const from = fromRef.current;
    const start = performance.now();
    const step = (now: number) => {
      // easeOutCubic — fast first, settling into the value, matching the mobile component.
      const t = Math.min(1, (now - start) / FILL_MS);
      const eased = 1 - Math.pow(1 - t, 3);
      const value = from + (target - from) * eased;
      setShown(value);
      fromRef.current = value;
      if (t < 1) frameRef.current = requestAnimationFrame(step);
    };
    frameRef.current = requestAnimationFrame(step);
    return () => {
      if (frameRef.current !== undefined) cancelAnimationFrame(frameRef.current);
    };
  }, [target]);

  return target === null ? null : shown;
}

/** The mockup's spinning `sync` glyph — used by the table's active row and by the micro variant. */
function SyncGlyph({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z" />
    </svg>
  );
}

/** The `ai` variant's processor glyph (the mockup's `psychology` symbol). */
function ProcessorGlyph({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2a5 5 0 0 0-5 5v1a4 4 0 0 0 0 8v1a5 5 0 0 0 10 0v-1a4 4 0 0 0 0-8V7a5 5 0 0 0-5-5Zm0 4a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z" />
    </svg>
  );
}

/**
 * The progress bar. Determinate eases its width to the live counted value and carries the mockup's
 * glow; indeterminate sweeps a short segment across the track instead.
 */
function ProgressBar({ width, accent }: { width: string | null; accent: 'blue' | 'cyan' }) {
  const fill =
    accent === 'cyan'
      ? 'bg-cos-cyan shadow-[var(--cos-glow-bar-cyan)] dark:bg-cos-dark-cyan'
      : 'bg-cos-blue shadow-[var(--cos-glow-bar-blue)] dark:bg-cos-dark-blue';
  if (width === null) {
    return (
      <div className={TRACK}>
        <div
          className={`h-full w-1/3 rounded-full ${fill} animate-[cos-indeterminate_1.4s_ease-in-out_infinite]`}
        />
      </div>
    );
  }
  return (
    <div className={TRACK}>
      <div className={`h-full rounded-full ${fill}`} style={{ width }} />
    </div>
  );
}

/** The mockup's cyan percentage chip. */
function PercentPill({ percent }: { percent: string }) {
  return (
    <span className="shrink-0 rounded-full border border-cos-cyan/20 bg-cos-cyan/10 px-2 py-0.5 text-tiny font-bold tabular-nums text-cos-cyan dark:border-cos-dark-cyan/20 dark:bg-cos-dark-cyan/10 dark:text-cos-dark-cyan">
      {percent}
    </span>
  );
}

export function LoadingState({
  variant,
  progress,
  label,
  rows = TABLE_SKELETON_ROWS,
  columns = TABLE_SKELETON_COLUMNS,
  'data-testid': testId,
}: LoadingStateProps) {
  const clamped = clampProgress(progress);
  const determinate = clamped !== null;
  const shown = useCountUp(clamped);
  // Both the number and the bar read from the SAME counted value, so they cannot disagree.
  const percent = formatPercent(shown ?? undefined);
  const width = progressWidth(shown ?? undefined);
  const a11y = accessibilityLabel(label, progress);
  const hasLabel = label !== undefined && label !== '';

  // A loading state with nothing to announce is decoration — hide it from screen readers rather
  // than announce an empty progressbar.
  const a11yProps =
    a11y === null
      ? ({ 'aria-hidden': true } as const)
      : ({ role: 'progressbar', 'aria-label': a11y } as const);

  const gridStyle = { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` };

  // ── micro ─────────────────────────────────────────────────────────────────────────────────────
  // The mockup's in-button indicator: spinning sync glyph + copy + percentage, on no chrome of its
  // own so it can sit inside a button or beside a heading.
  if (variant === 'micro') {
    return (
      <span data-testid={testId} className="inline-flex items-center gap-2" {...a11yProps}>
        <SyncGlyph className="h-4 w-4 shrink-0 animate-spin text-cos-blue dark:text-cos-dark-blue" />
        {hasLabel && (
          <span className="text-small font-medium uppercase tracking-tight text-cos-gray dark:text-cos-dark-muted">
            {label}
          </span>
        )}
        {percent !== null && (
          <span className="text-small font-bold tabular-nums text-cos-blue dark:text-cos-dark-blue">
            {percent}
          </span>
        )}
      </span>
    );
  }

  // ── table ─────────────────────────────────────────────────────────────────────────────────────
  // A tinted header strip over dimmed body rows, the first of which carries the sync spinner.
  if (variant === 'table') {
    return (
      <div
        data-testid={testId}
        className="overflow-hidden rounded-md border border-cos-gray/20 dark:border-cos-dark-muted/20"
        {...a11yProps}
      >
        <div
          className="grid gap-4 border-b border-cos-gray/15 bg-cos-white px-4 py-3 dark:border-cos-dark-muted/15 dark:bg-cos-dark-bg"
          style={gridStyle}
        >
          {Array.from({ length: columns }, (_, column) => (
            <div
              key={column}
              className={`h-3 ${tableHeaderWidth(column)} rounded bg-cos-gray/25 dark:bg-cos-dark-muted/25`}
            />
          ))}
        </div>

        <div className="divide-y divide-cos-gray/10 dark:divide-cos-dark-muted/10">
          {Array.from({ length: rows }, (_, row) => (
            <div
              key={row}
              className={`grid items-center gap-4 bg-white px-4 py-3 dark:bg-cos-dark-surface ${tableRowOpacity(row)}`}
              style={gridStyle}
            >
              {Array.from({ length: columns }, (_, column) =>
                isTableSyncCell(row, column, columns, determinate) ? (
                  <div key={column} className="flex items-center gap-2">
                    <SyncGlyph className="h-4 w-4 shrink-0 animate-spin text-cos-blue dark:text-cos-dark-blue" />
                    <span className="text-small font-bold tabular-nums text-cos-blue dark:text-cos-dark-blue">
                      {percent}
                    </span>
                  </div>
                ) : (
                  <div key={column} className={`h-4 ${tableColumnWidth(column)} ${BAR}`} />
                ),
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── ai ────────────────────────────────────────────────────────────────────────────────────────
  // §32.7 "Exception 2 — loading states": cyan outline + glow, a pulsing processor plate, and a
  // ping dot on the machine-string row. No scan-line, no waveform (desktop mockup; PO 2026-08-17).
  if (aiMotifEnabled(variant)) {
    return (
      <div
        data-testid={testId}
        className="relative overflow-hidden rounded-lg border-2 border-cos-cyan/30 bg-white p-6 shadow-[var(--cos-glow-ai)] dark:border-cos-dark-cyan/30 dark:bg-cos-dark-elevated"
        {...a11yProps}
      >
        <div className="mb-6 flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-cos-cyan/20 dark:bg-cos-dark-cyan/20">
            <ProcessorGlyph className="h-5 w-5 animate-pulse text-cos-cyan dark:text-cos-dark-cyan" />
          </div>
          <div className="flex-1 space-y-2">
            {hasLabel ? (
              <p className="text-body font-bold text-cos-cyan dark:text-cos-dark-cyan">{label}</p>
            ) : (
              <>
                <div className={`h-4 w-1/2 ${BAR}`} />
                <div className={`h-3 w-3/4 ${BAR} opacity-60`} />
              </>
            )}
          </div>
          {percent !== null && <PercentPill percent={percent} />}
        </div>

        <ProgressBar width={width} accent="cyan" />

        {/* The mockup's machine-string row. The string itself is caller copy the component never
            bakes (ADR-055), so a skeleton bar stands in its place beside the live ping dot. */}
        <div className="mt-3 flex items-center gap-2">
          <span className="h-1 w-1 shrink-0 animate-ping rounded-full bg-cos-cyan dark:bg-cos-dark-cyan" />
          <div className={`h-2 w-40 max-w-full ${BAR} opacity-60`} />
        </div>
      </div>
    );
  }

  // ── widget ────────────────────────────────────────────────────────────────────────────────────
  // The dashboard tile: technical corner brackets, a percentage chip, an icon plate over two text
  // skeletons, the glowing progress bar, and the caller's copy as a centred mono caption.
  return (
    <div data-testid={testId} className={`${CARD} p-4`} {...a11yProps}>
      {/* Technical corner brackets — top-left and bottom-right, as the mockup draws them. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 h-2 w-2 border-l-2 border-t-2 border-cos-blue dark:border-cos-dark-blue"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 right-0 h-2 w-2 border-b-2 border-r-2 border-cos-blue dark:border-cos-dark-blue"
      />

      <div className="mb-6 flex items-center justify-between gap-2">
        <div className={`h-4 w-24 ${BAR}`} />
        {percent !== null && <PercentPill percent={percent} />}
      </div>

      <div className="space-y-4">
        <div className="flex gap-4">
          <div className={`h-12 w-12 shrink-0 rounded-md ${BAR}`} />
          <div className="flex-1 space-y-2">
            <div className={`h-4 w-3/4 ${BAR}`} />
            <div className={`h-3 w-1/2 ${BAR} opacity-60`} />
          </div>
        </div>

        <ProgressBar width={width} accent="blue" />

        {hasLabel && (
          <div className="flex justify-center">
            <span className="text-center font-mono text-tiny uppercase tracking-tight text-cos-gray dark:text-cos-dark-muted">
              {label}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

interface EmptyStateProps {
  icon?: string;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({
  icon = '📭',
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-4 text-6xl">{icon}</div>
      <h3 className="mb-2 text-h2 font-semibold text-cos-navy">{title}</h3>
      <p className="mb-6 max-w-sm text-body text-cos-gray">{description}</p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="rounded-lg bg-cos-blue px-6 py-3 text-body font-medium text-white hover:bg-blue-700"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

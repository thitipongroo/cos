// Loading UI for apps/web.

import {
  formatPercent,
  progressWidth,
  aiMotifEnabled,
  tableColumnWidth,
  accessibilityLabel,
  TABLE_SKELETON_ROWS,
  TABLE_SKELETON_COLUMNS,
  type LoadingVariant,
} from '../../lib/loadingState';

export interface LoadingStateProps {
  /** Layout. `table` renders row skeletons; there is no `list` (that is the mobile shape). */
  variant: LoadingVariant;
  /** 0–100. Omit for indeterminate (no bar, no percentage). Clamped; NaN reads as indeterminate. */
  progress?: number;
  /** Already-translated copy (QM-3 — this component holds no i18n key). Omit to render no text. */
  label?: string;
  /** Rows for the `table` variant. Defaults to the three the mockup shows. */
  rows?: number;
  /** Columns for the `table` variant. Defaults to the four the mockup shows. */
  columns?: number;
  'data-testid'?: string;
}

/** Card chrome shared by the widget and ai variants — §32.7 4px radius, 1px low-contrast outline. */
const CARD =
  'rounded border border-cos-gray/20 bg-white p-4 dark:border-cos-dark-muted/20 dark:bg-cos-dark-surface';
const BAR = 'animate-pulse rounded bg-cos-gray/20 dark:bg-cos-dark-muted/20';

export function LoadingState({
  variant,
  progress,
  label,
  rows = TABLE_SKELETON_ROWS,
  columns = TABLE_SKELETON_COLUMNS,
  'data-testid': testId,
}: LoadingStateProps) {
  const percent = formatPercent(progress);
  const width = progressWidth(progress);
  const a11y = accessibilityLabel(label, progress);
  const hasLabel = label !== undefined && label !== '';

  // A loading state with nothing to announce is decoration — hide it from screen readers rather
  // than announce an empty progressbar.
  const a11yProps =
    a11y === null
      ? ({ 'aria-hidden': true } as const)
      : ({ role: 'progressbar', 'aria-label': a11y } as const);

  // ── micro ─────────────────────────────────────────────────────────────────────────────────────
  if (variant === 'micro') {
    return (
      <div data-testid={testId} className="inline-flex items-center gap-2" {...a11yProps}>
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-cos-blue border-t-transparent dark:border-cos-dark-blue dark:border-t-transparent" />
        {hasLabel && (
          <span className="text-small text-cos-gray dark:text-cos-dark-muted">{label}</span>
        )}
        {percent !== null && (
          <span className="text-small font-medium tabular-nums text-cos-blue dark:text-cos-dark-blue">
            {percent}
          </span>
        )}
      </div>
    );
  }

  // ── table ─────────────────────────────────────────────────────────────────────────────────────
  if (variant === 'table') {
    return (
      <div
        data-testid={testId}
        className="overflow-hidden rounded border border-cos-gray/20 dark:border-cos-dark-muted/20"
        {...a11yProps}
      >
        {Array.from({ length: rows }, (_, row) => (
          <div
            key={row}
            className="flex items-center gap-4 border-b border-cos-gray/10 bg-white px-4 py-3 last:border-b-0 dark:border-cos-dark-muted/10 dark:bg-cos-dark-surface"
          >
            {Array.from({ length: columns }, (_, column) => (
              <div key={column} className={`h-4 ${tableColumnWidth(column)} ${BAR}`} />
            ))}
          </div>
        ))}
      </div>
    );
  }

  // ── ai ────────────────────────────────────────────────────────────────────────────────────────
  // §32.7 "Exception 2 — loading states": cyan left-border, 5% cyan tint, glow, scan-line, waveform.
  if (aiMotifEnabled(variant)) {
    return (
      // border-s-4 (inline-start), not border-l-4: the accent edge follows the reading direction
      // and flips under dir="rtl" for ar-SA (QM-3).
      <div
        data-testid={testId}
        className="relative overflow-hidden rounded border-s-4 border-cos-cyan bg-cos-cyan/5 p-4 shadow-[inset_0_0_20px_rgba(6,182,212,0.1)] dark:border-cos-dark-cyan"
        {...a11yProps}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 animate-[cos-scan_3s_linear_infinite] bg-gradient-to-r from-transparent via-cos-cyan to-transparent" />
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <svg
              className="h-4 w-4 text-cos-cyan dark:text-cos-dark-cyan"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M12 2a5 5 0 0 0-5 5v1a4 4 0 0 0 0 8v1a5 5 0 0 0 10 0v-1a4 4 0 0 0 0-8V7a5 5 0 0 0-5-5Zm0 4a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z" />
            </svg>
            {hasLabel && (
              <span className="text-body text-cos-navy dark:text-cos-dark-text">{label}</span>
            )}
          </div>
          {percent !== null && (
            <span className="text-body font-bold tabular-nums text-cos-cyan dark:text-cos-dark-cyan">
              {percent}
            </span>
          )}
        </div>

        {/* Waveform — nine bars, phase-shifted by animation-delay */}
        <div className="mt-3 flex h-5 items-end gap-1">
          {[0.1, 0.3, 0.2, 0.4, 0.15, 0.5, 0.25, 0.35, 0.05].map((delay, index) => (
            <span
              key={index}
              className="w-1 animate-[cos-waveform_1s_ease-in-out_infinite_alternate] rounded-full bg-cos-cyan dark:bg-cos-dark-cyan"
              style={{ animationDelay: `${delay}s` }}
            />
          ))}
        </div>

        {width !== null && (
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-cos-gray/20 dark:bg-cos-dark-muted/20">
            <div
              className="h-full rounded-full bg-cos-cyan transition-[width] duration-1000 dark:bg-cos-dark-cyan"
              style={{ width }}
            />
          </div>
        )}
      </div>
    );
  }

  // ── widget ────────────────────────────────────────────────────────────────────────────────────
  return (
    <div data-testid={testId} className={CARD} {...a11yProps}>
      <div className="flex items-start gap-4">
        <div className={`h-12 w-12 rounded-full ${BAR}`} />
        <div className="flex-1 space-y-3">
          <div className={`h-4 w-3/4 ${BAR}`} />
          <div className={`h-3 w-1/2 ${BAR}`} />
        </div>
      </div>

      {(hasLabel || percent !== null) && (
        <div className="mt-4 flex items-baseline justify-between gap-2">
          {hasLabel && (
            <span className="text-small text-cos-gray dark:text-cos-dark-muted">{label}</span>
          )}
          {percent !== null && (
            <span className="text-small font-bold tabular-nums text-cos-blue dark:text-cos-dark-blue">
              {percent}
            </span>
          )}
        </div>
      )}

      {width !== null && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-cos-gray/20 dark:bg-cos-dark-muted/20">
          <div
            className="h-full rounded-full bg-cos-blue transition-[width] duration-1000 dark:bg-cos-dark-blue"
            style={{ width }}
          />
        </div>
      )}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="w-full animate-pulse rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-start gap-4">
        <div className="h-12 w-12 rounded-full bg-gray-200" />
        <div className="flex-1 space-y-3">
          <div className="h-4 w-3/4 rounded bg-gray-200" />
          <div className="h-3 w-1/2 rounded bg-gray-200" />
        </div>
      </div>
    </div>
  );
}

export function LoadingSpinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = {
    sm: 'w-4 h-4 border-2',
    md: 'w-8 h-8 border-[3px]',
    lg: 'w-12 h-12 border-4',
  };

  return (
    <div
      className={`${sizeClasses[size]} animate-spin rounded-full border-cos-blue border-t-transparent`}
    />
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

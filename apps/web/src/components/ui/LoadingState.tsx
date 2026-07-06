// Ported from figma/mockup/src/app/components/mobile/LoadingState.tsx.
// Re-themed from React-Native mobile tokens (--mobile-*/--text-*/--touch-*) to the §32.7 web
// tokens used across apps/web: --mobile-primary → cos-blue, --text-title → text-h2,
// --text-base → text-body, --mobile-text-* → cos-navy/cos-gray; --touch-min dropped (web sizing).

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

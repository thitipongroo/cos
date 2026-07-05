export function SkeletonCard() {
  return (
    <div className="w-full p-4 bg-white rounded-xl border border-gray-200 animate-pulse">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 bg-gray-200 rounded-full" />
        <div className="flex-1 space-y-3">
          <div className="h-4 bg-gray-200 rounded w-3/4" />
          <div className="h-3 bg-gray-200 rounded w-1/2" />
        </div>
      </div>
    </div>
  );
}

export function LoadingSpinner({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const sizeClasses = {
    sm: "w-4 h-4 border-2",
    md: "w-8 h-8 border-3",
    lg: "w-12 h-12 border-4",
  };

  return (
    <div
      className={`
        ${sizeClasses[size]}
        border-[var(--mobile-primary)]
        border-t-transparent
        rounded-full
        animate-spin
      `}
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

export function EmptyState({ icon = "📭", title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
      <div className="text-6xl mb-4">{icon}</div>
      <h3 className="text-[var(--text-title)] font-semibold text-[var(--mobile-text-primary)] mb-2">
        {title}
      </h3>
      <p className="text-[var(--text-base)] text-[var(--mobile-text-secondary)] mb-6 max-w-sm">
        {description}
      </p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="min-h-[var(--touch-min)] px-6 py-3 bg-[var(--mobile-primary)] text-white rounded-xl font-medium text-[var(--text-base)] active:bg-blue-700 transition-colors"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

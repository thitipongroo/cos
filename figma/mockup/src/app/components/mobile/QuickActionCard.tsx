import { LucideIcon } from "lucide-react";
import { ReactNode } from "react";

interface QuickActionCardProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  badge?: string | number;
  badgeType?: "info" | "warning" | "success";
  onClick?: () => void;
  disabled?: boolean;
}

export function QuickActionCard({
  icon: Icon,
  title,
  description,
  badge,
  badgeType = "info",
  onClick,
  disabled = false,
}: QuickActionCardProps) {
  const badgeColors = {
    info: "bg-[var(--mobile-primary)] text-white",
    warning: "bg-[var(--mobile-warning)] text-white",
    success: "bg-[var(--mobile-success)] text-white",
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        w-full min-h-[var(--touch-large)] p-4
        bg-white rounded-xl border border-gray-200
        flex items-center gap-4
        active:bg-gray-50 transition-colors
        ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
      `}
    >
      <div className="flex-shrink-0 w-12 h-12 rounded-full bg-[var(--mobile-surface)] flex items-center justify-center">
        <Icon className="w-6 h-6 text-[var(--mobile-primary)]" />
      </div>

      <div className="flex-1 text-left">
        <h3 className="text-[var(--text-base)] font-medium text-[var(--mobile-text-primary)]">
          {title}
        </h3>
        {description && (
          <p className="text-[var(--text-caption)] text-[var(--mobile-text-secondary)] mt-0.5">
            {description}
          </p>
        )}
      </div>

      {badge !== undefined && (
        <div className={`
          flex-shrink-0 px-3 py-1 rounded-full text-sm font-medium
          ${badgeColors[badgeType]}
        `}>
          {badge}
        </div>
      )}
    </button>
  );
}

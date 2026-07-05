import { LucideIcon } from "lucide-react";

interface MobileInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  icon?: LucideIcon;
  error?: string;
  helperText?: string;
}

export function MobileInput({
  label,
  icon: Icon,
  error,
  helperText,
  className = "",
  ...props
}: MobileInputProps) {
  return (
    <div className="space-y-2">
      {label && (
        <label className="block text-[var(--text-base)] font-medium text-[var(--mobile-text-primary)]">
          {label}
        </label>
      )}

      <div className="relative">
        {Icon && (
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--mobile-text-tertiary)]">
            <Icon className="w-5 h-5" />
          </div>
        )}

        <input
          className={`
            w-full min-h-[var(--touch-min)] px-4 py-3
            ${Icon ? "pl-12" : ""}
            bg-[var(--mobile-surface)] rounded-xl
            border ${error ? "border-[var(--mobile-danger)]" : "border-gray-200"}
            text-[var(--text-base)] text-[var(--mobile-text-primary)]
            placeholder:text-[var(--mobile-text-tertiary)]
            focus:outline-none focus:ring-2 focus:ring-[var(--mobile-primary)] focus:border-transparent
            transition-all
            ${className}
          `}
          {...props}
        />
      </div>

      {error && (
        <p className="text-sm text-[var(--mobile-danger)]">{error}</p>
      )}

      {helperText && !error && (
        <p className="text-sm text-[var(--mobile-text-secondary)]">{helperText}</p>
      )}
    </div>
  );
}

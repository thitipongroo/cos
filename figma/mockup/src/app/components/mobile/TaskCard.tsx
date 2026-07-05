import { Calendar, MapPin, Paperclip, ChevronRight } from "lucide-react";
import { StatusChip } from "./StatusChip";

interface TaskCardProps {
  title: string;
  description?: string;
  status: "todo" | "inprogress" | "done";
  dueDate?: string;
  location?: string;
  attachmentCount?: number;
  onTap?: () => void;
  onSwipeComplete?: () => void;
}

export function TaskCard({
  title,
  description,
  status,
  dueDate,
  location,
  attachmentCount = 0,
  onTap,
}: TaskCardProps) {
  const isOverdue = dueDate && new Date(dueDate) < new Date() && status !== "done";

  return (
    <button
      onClick={onTap}
      className="w-full p-4 bg-white rounded-xl border border-gray-200
                 active:bg-gray-50 transition-colors text-left
                 min-h-[var(--touch-large)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-2">
          <div className="flex items-start gap-2">
            <h3 className="text-[var(--text-base)] font-medium text-[var(--mobile-text-primary)] flex-1">
              {title}
            </h3>
            <StatusChip status={status} />
          </div>

          {description && (
            <p className="text-[var(--text-caption)] text-[var(--mobile-text-secondary)] line-clamp-2">
              {description}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3 text-[var(--text-caption)] text-[var(--mobile-text-tertiary)]">
            {dueDate && (
              <div className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                <span className={isOverdue ? "text-[var(--mobile-danger)] font-medium" : ""}>
                  {new Date(dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
              </div>
            )}

            {location && (
              <div className="flex items-center gap-1">
                <MapPin className="w-4 h-4" />
                <span>{location}</span>
              </div>
            )}

            {attachmentCount > 0 && (
              <div className="flex items-center gap-1">
                <Paperclip className="w-4 h-4" />
                <span>{attachmentCount}</span>
              </div>
            )}
          </div>
        </div>

        <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0 mt-1" />
      </div>
    </button>
  );
}

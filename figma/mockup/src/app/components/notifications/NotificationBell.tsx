import { Bell } from "lucide-react";
import { useNotifications } from "../../services/notification.service";

interface NotificationBellProps {
  onClick: () => void;
}

export function NotificationBell({ onClick }: NotificationBellProps) {
  const { unreadCount } = useNotifications();

  return (
    <button
      onClick={onClick}
      className="relative w-10 h-10 rounded-full bg-white border border-gray-200 flex items-center justify-center active:bg-gray-50 transition-colors"
      aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
    >
      <Bell className="w-5 h-5 text-[var(--mobile-text-primary)]" />
      {unreadCount > 0 && (
        <div className="absolute -top-1 -right-1 w-5 h-5 bg-[var(--mobile-danger)] rounded-full flex items-center justify-center">
          <span className="text-xs font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        </div>
      )}
    </button>
  );
}

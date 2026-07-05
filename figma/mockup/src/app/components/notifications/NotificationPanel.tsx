import { X, Check, Trash2, AlertCircle, Package, ClipboardList, Bell as BellIcon } from "lucide-react";
import { useNotifications, Notification } from "../../services/notification.service";
import { formatDistanceToNow } from "date-fns";

interface NotificationPanelProps {
  onClose: () => void;
}

export function NotificationPanel({ onClose }: NotificationPanelProps) {
  const { notifications, unreadCount, markAsRead, markAllAsRead, deleteNotification, clearAll } =
    useNotifications();

  const getIcon = (type: Notification["type"]) => {
    switch (type) {
      case "task_assigned":
        return <ClipboardList className="w-5 h-5" />;
      case "material_delivered":
        return <Package className="w-5 h-5" />;
      case "urgent_issue":
        return <AlertCircle className="w-5 h-5" />;
      default:
        return <BellIcon className="w-5 h-5" />;
    }
  };

  const getColor = (priority: Notification["priority"]) => {
    switch (priority) {
      case "urgent":
        return "bg-red-100 text-red-700";
      case "high":
        return "bg-orange-100 text-orange-700";
      case "normal":
        return "bg-blue-100 text-blue-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex flex-col" onClick={onClose}>
      <div
        className="bg-white rounded-t-3xl mt-auto max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-semibold text-[var(--mobile-text-primary)]">Notifications</h2>
            {unreadCount > 0 && (
              <p className="text-sm text-[var(--mobile-text-secondary)]">{unreadCount} unread</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="px-3 py-1.5 text-sm text-[var(--mobile-primary)] font-medium"
              >
                Mark all read
              </button>
            )}
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Notifications List */}
        <div className="flex-1 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="py-16 text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <BellIcon className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-[var(--mobile-text-primary)] mb-1">
                No notifications
              </h3>
              <p className="text-sm text-[var(--mobile-text-secondary)]">
                You're all caught up!
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`p-4 flex gap-3 ${!notification.read ? "bg-blue-50/50" : ""}`}
                  onClick={() => markAsRead(notification.id)}
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${getColor(notification.priority)}`}>
                    {getIcon(notification.type)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h4 className="font-medium text-[var(--mobile-text-primary)] flex-1">
                        {notification.title}
                      </h4>
                      {!notification.read && (
                        <div className="w-2 h-2 bg-[var(--mobile-primary)] rounded-full mt-1.5 flex-shrink-0" />
                      )}
                    </div>
                    <p className="text-sm text-[var(--mobile-text-secondary)] mb-2">
                      {notification.body}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-[var(--mobile-text-tertiary)]">
                        {formatDistanceToNow(notification.timestamp, { addSuffix: true })}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteNotification(notification.id);
                        }}
                        className="text-[var(--mobile-text-tertiary)] p-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {notifications.length > 0 && (
          <div className="p-4 border-t border-gray-200">
            <button
              onClick={clearAll}
              className="w-full min-h-[44px] border border-gray-300 rounded-xl text-gray-700 font-medium"
            >
              Clear All
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

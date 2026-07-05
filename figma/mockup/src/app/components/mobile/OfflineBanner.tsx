import { WifiOff, CheckCircle, RefreshCw } from "lucide-react";
import { useState, useEffect } from "react";

interface OfflineBannerProps {
  queuedItems?: number;
  onRetrySync?: () => void;
}

export function OfflineBanner({ queuedItems = 0, onRetrySync }: OfflineBannerProps) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const handleRetry = () => {
    setIsSyncing(true);
    onRetrySync?.();
    setTimeout(() => setIsSyncing(false), 2000);
  };

  if (isOnline && queuedItems === 0) return null;

  return (
    <div
      className={`
        fixed top-0 left-0 right-0 z-50 px-4 py-3
        flex items-center justify-between gap-3
        ${isOnline
          ? "bg-[var(--mobile-syncing)] text-[var(--mobile-text-primary)]"
          : "bg-[var(--mobile-offline)] text-white"}
      `}
    >
      <div className="flex items-center gap-2">
        {isOnline ? (
          <RefreshCw className={`w-5 h-5 ${isSyncing ? "animate-spin" : ""}`} />
        ) : (
          <WifiOff className="w-5 h-5" />
        )}
        <span className="text-sm font-medium">
          {isOnline
            ? isSyncing
              ? "Syncing..."
              : `${queuedItems} items queued`
            : "You're offline"}
        </span>
      </div>

      {isOnline && queuedItems > 0 && (
        <button
          onClick={handleRetry}
          disabled={isSyncing}
          className="text-sm font-medium underline active:opacity-70"
        >
          Sync Now
        </button>
      )}
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useT } from '../../i18n';

/**
 * Offline / sync indicator (§20.6.2). Reflects browser connectivity; the PWA
 * Service Worker (next-auth-independent) replays queued mutations on reconnect
 * via the Background Sync queue in lib/pwa/sync-service.
 */
export function OfflineIndicator() {
  const t = useT();
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  if (online) {
    return null;
  }
  return (
    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
      {t('common.offline')}
    </span>
  );
}

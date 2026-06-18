'use client';

import { useSession } from 'next-auth/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useT } from '../../i18n';
import { API_BASE, apiFetch } from '../../lib/api/client';

/** Subset of the backend NotificationRow needed by the bell. */
interface NotificationItem {
  notification_id: string;
  subject: string | null;
  body: string;
  status: string;
  created_at: string;
}

/**
 * In-app notification bell (§20.6.2 / §19.2). Real-time delivery is SSE — NOT
 * WebSocket. Because the backend authenticates via a Bearer header (which the
 * native EventSource cannot set), the stream is consumed with a fetch +
 * ReadableStream reader that injects the session access token.
 */
export function NotificationBell() {
  const t = useT();
  const { data } = useSession();
  const token = data?.accessToken;
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [open, setOpen] = useState(false);
  const seen = useRef<Set<string>>(new Set());

  const unread = items.filter((n) => n.status !== 'READ').length;

  const addItem = useCallback((row: NotificationItem) => {
    if (seen.current.has(row.notification_id)) {
      return;
    }
    seen.current.add(row.notification_id);
    setItems((prev) => [row, ...prev]);
  }, []);

  // Initial load of recent notifications.
  useEffect(() => {
    if (!token) {
      return;
    }
    let active = true;
    apiFetch<{ rows: NotificationItem[]; total: number }>('/notifications?limit=20', token)
      .then((res) => {
        if (!active) {
          return;
        }
        for (const row of res.rows) {
          addItem(row);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [token, addItem]);

  // Live SSE stream (fetch-based — Bearer header).
  useEffect(() => {
    if (!token) {
      return;
    }
    const controller = new AbortController();
    void (async () => {
      try {
        const res = await fetch(`${API_BASE}/notifications/stream`, {
          headers: { authorization: `Bearer ${token}`, accept: 'text/event-stream' },
          signal: controller.signal,
        });
        if (!res.body) {
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let chunk = await reader.read();
        while (!chunk.done) {
          buffer += decoder.decode(chunk.value, { stream: true });
          let sep = buffer.indexOf('\n\n');
          while (sep !== -1) {
            const block = buffer.slice(0, sep);
            buffer = buffer.slice(sep + 2);
            for (const line of block.split('\n')) {
              if (line.startsWith('data:')) {
                try {
                  addItem(JSON.parse(line.slice(5).trim()) as NotificationItem);
                } catch {
                  // ignore malformed frame
                }
              }
            }
            sep = buffer.indexOf('\n\n');
          }
          chunk = await reader.read();
        }
      } catch {
        // stream aborted on unmount or network drop — PWA cache covers reads
      }
    })();
    return () => controller.abort();
  }, [token, addItem]);

  const markAllRead = useCallback(async () => {
    if (!token) {
      return;
    }
    await apiFetch('/notifications/read-all', token, { method: 'PATCH' }).catch(() => undefined);
    setItems((prev) => prev.map((n) => ({ ...n, status: 'READ' })));
  }, [token]);

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={t('shell.notifications')}
        onClick={() => setOpen((v) => !v)}
        className="relative rounded p-2 text-gray-600 hover:bg-gray-100"
      >
        <span aria-hidden>🔔</span>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-80 rounded-lg border border-gray-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
            <span className="text-sm font-semibold text-gray-700">{t('shell.notifications')}</span>
            <button
              type="button"
              onClick={markAllRead}
              className="text-xs text-blue-600 hover:underline"
            >
              {t('shell.markAllRead')}
            </button>
          </div>
          <ul className="max-h-80 divide-y divide-gray-100 overflow-y-auto">
            {items.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-gray-400">
                {t('shell.noNotifications')}
              </li>
            ) : (
              items.map((n) => (
                <li
                  key={n.notification_id}
                  className={`px-3 py-2 text-sm ${n.status !== 'READ' ? 'bg-blue-50' : ''}`}
                >
                  {n.subject && <p className="font-medium text-gray-800">{n.subject}</p>}
                  <p className="text-gray-600">{n.body}</p>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

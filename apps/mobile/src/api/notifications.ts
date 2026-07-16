// Notifications API — GET /notifications (paginated), PATCH /notifications/:id/read,
// PATCH /notifications/read-all. Unread is `read_at === null` (§19; notifications.notifications).
//
// The list is not cached offline: notifications are server-owned, and §17.4's offline entity cache
// covers the field entities a worker edits, not an inbox. Callers keep the last fetched page on
// error. Marking read goes through mutate() so a tap made underground replays on reconnect.

import { get, mutate } from './client';

export interface Notification {
  notification_id: string;
  channel: string;
  event_type: string;
  subject: string | null;
  body: string;
  status: string;
  sent_at: string | null;
  read_at: string | null;
  created_at: string;
}

interface ListResponse {
  rows: Notification[];
  total: number;
}

export async function listNotifications(page = 1, limit = 20): Promise<ListResponse> {
  return get<ListResponse>('/notifications', { page: String(page), limit: String(limit) });
}

export async function markNotificationRead(id: string): Promise<void> {
  await mutate<void>('PATCH', `/notifications/${id}/read`, {}, 'notification', id);
}

export async function markAllNotificationsRead(): Promise<void> {
  // No single entity id — 'all' is the queue key so repeated taps collapse rather than stacking.
  await mutate<void>('PATCH', '/notifications/read-all', {}, 'notification', 'all');
}

export function unreadCount(items: Notification[]): number {
  return items.filter((n) => n.read_at === null).length;
}

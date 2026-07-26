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

// ── Preferences (§19.6) ──────────────────────────────────────────────────────
// GET /notifications/preferences returns one row per (event_type, channel) the user has an explicit
// setting for, plus the stored quiet-hours window. PATCH updates the per-(event_type, channel) enable
// flags. Quiet-hours EDITING has no endpoint yet (the PATCH body is channel flags only), so the screen
// reads the stored window but does not write it back — see notification-preferences.tsx.

/** One stored per-(event_type, channel) enable flag. Quiet-hours columns ride along on every row. */
export interface PreferenceRow {
  event_type: string;
  channel: string;
  is_enabled: boolean;
  quiet_hours_start: string; // 'HH:MM:SS', tenant-timezone local (default '22:00:00')
  quiet_hours_end: string; // 'HH:MM:SS' (default '07:00:00')
}

export interface PreferenceUpdate {
  event_type: string;
  channel: string;
  is_enabled: boolean;
}

export async function getNotificationPreferences(): Promise<PreferenceRow[]> {
  return get<PreferenceRow[]>('/notifications/preferences');
}

export async function updateNotificationPreferences(
  preferences: PreferenceUpdate[],
): Promise<void> {
  // 'preferences' is the queue key so repeated saves collapse to the latest rather than stacking
  // (mirrors markAllNotificationsRead's 'all').
  await mutate<void>(
    'PATCH',
    '/notifications/preferences',
    { preferences },
    'notification-preferences',
    'me',
  );
}

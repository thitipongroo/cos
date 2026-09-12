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
// flags AND, when both edges are supplied, the quiet-hours window — `update-preferences.dto.ts`
// validates them as HH:MM and `notification.repository.ts` writes them as `::time`.
//
// THAT LAST SENTENCE USED TO SAY THE OPPOSITE. "Quiet-hours EDITING has no endpoint yet" stood here
// after the endpoint had been built and after `updateNotificationPreferences` below had grown the
// `quietHours` argument that writes it — so the one place a reader checks before building a control
// said the control was impossible. Both screens that show quiet hours had copied the claim into
// their own headers. Corrected 2026-09-13, with the two callers.

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
  quietHours?: { start: string; end: string },
): Promise<void> {
  // Body carries the channel flags plus, optionally, the quiet-hours window (§19.6) as 'HH:MM'
  // strings. 'preferences' is the queue key so repeated saves collapse to the latest rather than
  // stacking (mirrors markAllNotificationsRead's 'all').
  const body: {
    preferences: PreferenceUpdate[];
    quiet_hours_start?: string;
    quiet_hours_end?: string;
  } = { preferences };
  if (quietHours) {
    body.quiet_hours_start = quietHours.start;
    body.quiet_hours_end = quietHours.end;
  }
  await mutate<void>('PATCH', '/notifications/preferences', body, 'notification-preferences', 'me');
}

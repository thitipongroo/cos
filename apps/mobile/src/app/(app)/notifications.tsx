// Notifications screen — the inbox behind the Site Engineer Home's bell (§19).
//
// Reached via router.push('/notifications') only; it is not a bottom-nav tab (master §Phase 10 fixes
// each role's tab set, and the bell is the entry point). Read-only apart from marking read, which
// queues offline via mutate().
//
// Dark surface: this screen is opened from the dark Site Engineer Home and shares its palette
// (§32.7 "Mobile Dark Surfaces").

import { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  unreadCount,
  type Notification,
} from '../../api/notifications';
import { useI18n } from '../../i18n';
import { darkColors, fontFamily, spacing, touchTarget, typography } from '../../theme/tokens';

export default function NotificationsScreen() {
  const { t, formatDate } = useI18n();
  const [items, setItems] = useState<Notification[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(() => {
    listNotifications()
      .then((res) => {
        setItems(res.rows);
        setLoaded(true);
      })
      .catch(() => {
        // Offline or transient — keep whatever is already on screen rather than blanking the list.
        setLoaded(true);
      });
  }, []);

  useEffect(load, [load]);

  const unread = unreadCount(items);

  const onRead = async (n: Notification): Promise<void> => {
    if (n.read_at !== null) return;
    // Optimistic: the row greys out immediately, and mutate() replays the PATCH when back online.
    setItems((prev) =>
      prev.map((i) =>
        i.notification_id === n.notification_id ? { ...i, read_at: new Date().toISOString() } : i,
      ),
    );
    try {
      await markNotificationRead(n.notification_id);
    } catch {
      setItems((prev) =>
        prev.map((i) => (i.notification_id === n.notification_id ? { ...i, read_at: null } : i)),
      );
    }
  };

  const onReadAll = async (): Promise<void> => {
    const now = new Date().toISOString();
    const before = items;
    setItems((prev) => prev.map((i) => (i.read_at === null ? { ...i, read_at: now } : i)));
    try {
      await markAllNotificationsRead();
    } catch {
      setItems(before);
    }
  };

  return (
    <View testID="notifications-screen" style={styles.container}>
      <View style={styles.header}>
        {unread > 0 ? (
          <TouchableOpacity testID="mark-all-read" style={styles.readAll} onPress={onReadAll}>
            <Text style={styles.readAllText}>{t('notifications.markAllRead')}</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <FlatList
        data={items}
        keyExtractor={(n) => n.notification_id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          loaded ? (
            <Text testID="notifications-empty" style={styles.empty}>
              {t('notifications.empty')}
            </Text>
          ) : null
        }
        renderItem={({ item }) => {
          const isUnread = item.read_at === null;
          return (
            <TouchableOpacity
              testID={`notification-${item.notification_id}`}
              style={[styles.row, isUnread && styles.rowUnread]}
              onPress={() => void onRead(item)}
            >
              {isUnread ? <View testID="unread-dot" style={styles.dot} /> : null}
              <View style={styles.rowBody}>
                <Text style={styles.subject} numberOfLines={2}>
                  {item.subject ?? item.event_type}
                </Text>
                <Text style={styles.body} numberOfLines={3}>
                  {item.body}
                </Text>
                <Text style={styles.meta}>{formatDate(item.created_at)}</Text>
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: darkColors.bg, padding: spacing.md },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  readAll: {
    minHeight: touchTarget.secondaryButton,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  readAllText: {
    fontSize: typography.caption.fontSize,
    fontFamily: fontFamily.medium,
    color: darkColors.primary,
  },
  list: { gap: spacing.xs, paddingBottom: spacing.xl },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    minHeight: touchTarget.listItem,
    backgroundColor: darkColors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: darkColors.border,
    padding: spacing.sm,
  },
  // Read rows recede rather than disappear — the inbox stays scannable for what is still open.
  rowUnread: { borderColor: darkColors.primary },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: darkColors.primary,
    marginTop: 6,
  },
  rowBody: { flex: 1, gap: 2 },
  subject: {
    fontSize: typography.caption.fontSize,
    fontFamily: fontFamily.semibold,
    color: darkColors.text,
  },
  body: {
    fontSize: typography.label.fontSize,
    fontFamily: fontFamily.regular,
    color: darkColors.muted,
  },
  meta: {
    fontSize: typography.label.fontSize,
    fontFamily: fontFamily.regular,
    color: darkColors.muted,
  },
  empty: {
    fontSize: typography.caption.fontSize,
    fontFamily: fontFamily.regular,
    color: darkColors.muted,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
});

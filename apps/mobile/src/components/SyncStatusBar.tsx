// SyncStatusBar — shows sync status and pending count at the top of the screen.
// Spec §Phase 10 shared components — displays for all roles.

import { View, Text, StyleSheet } from 'react-native';
import { useSyncStatus } from '../hooks/useSyncStatus';
import { usePendingCount } from '../hooks/usePendingCount';
import { useSyncStore } from '../store/syncStore';
import { colors, fontFamily } from '../theme/tokens';

export function SyncStatusBar() {
  const status = useSyncStatus();
  const pendingCount = usePendingCount();
  const lastSyncAt = useSyncStore((s) => s.lastSyncAt);

  if (status === 'idle' && pendingCount === 0) return null;

  const label =
    status === 'syncing'
      ? 'Syncing…'
      : pendingCount > 0
        ? `${pendingCount} change${pendingCount === 1 ? '' : 's'} pending`
        : 'Sync error';

  const lastSyncLabel = lastSyncAt
    ? `Last synced ${new Date(lastSyncAt).toLocaleTimeString()}`
    : null;

  return (
    <View style={[styles.bar, status === 'error' ? styles.error : styles.pending]}>
      <Text style={styles.label}>{label}</Text>
      {lastSyncLabel ? <Text style={styles.sub}>{lastSyncLabel}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingVertical: 4,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pending: { backgroundColor: colors.syncing },
  error: { backgroundColor: colors.danger },
  label: { fontSize: 11, fontFamily: fontFamily.semibold, color: colors.textPrimary },
  sub: { fontSize: 10, fontFamily: fontFamily.regular, color: colors.textSecondary },
});

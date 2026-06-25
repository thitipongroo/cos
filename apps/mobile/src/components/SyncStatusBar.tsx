// SyncStatusBar — shows sync status and pending count at the top of the screen.
// Spec §Phase 10 shared components — displays for all roles. Always rendered (even when fully synced)
// so the E2E suites can assert on the "Up to date" state and the pending-sync-count after a sync.

import { View, Text, StyleSheet } from 'react-native';
import { useSyncStatus } from '../hooks/useSyncStatus';
import { usePendingCount } from '../hooks/usePendingCount';
import { useSyncStore } from '../store/syncStore';
import { colors, fontFamily } from '../theme/tokens';

export function SyncStatusBar() {
  const status = useSyncStatus();
  const pendingCount = usePendingCount();
  const lastSyncAt = useSyncStore((s) => s.lastSyncAt);

  const label =
    status === 'syncing'
      ? 'Syncing…'
      : status === 'error'
        ? 'Sync error'
        : pendingCount > 0
          ? `${pendingCount} change${pendingCount === 1 ? '' : 's'} pending`
          : 'Up to date';

  const lastSyncLabel = lastSyncAt
    ? `Last synced ${new Date(lastSyncAt).toLocaleTimeString()}`
    : null;

  const tone =
    status === 'error'
      ? styles.error
      : status === 'idle' && pendingCount === 0
        ? styles.synced
        : styles.pending;

  return (
    <View style={[styles.bar, tone]} testID="sync-status-bar">
      <Text style={styles.label} testID="sync-status-label">
        {label}
      </Text>
      {/* Pending count shown here too, but the canonical `pending-sync-count` testID lives on the home
          KPI (avoid a duplicate testID that would make Detox matchers ambiguous). */}
      <Text style={styles.count}>{String(pendingCount)}</Text>
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
  synced: { backgroundColor: '#1a7f37' },
  label: { fontSize: 11, fontFamily: fontFamily.semibold, color: colors.bg },
  count: { fontSize: 11, fontFamily: fontFamily.semibold, color: colors.bg },
  sub: { fontSize: 10, fontFamily: fontFamily.regular, color: colors.bg },
});

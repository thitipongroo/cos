// SyncStatusBar — shows sync status and pending count at the top of the screen.
// Spec §Phase 10 shared components — displays for all roles.

import { View, Text, StyleSheet } from 'react-native';
import { useSyncStatus } from '../hooks/useSyncStatus';
import { usePendingCount } from '../hooks/usePendingCount';
import { useSyncStore } from '../store/syncStore';

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
  pending: { backgroundColor: '#ECC94B' },
  error: { backgroundColor: '#E53E3E' },
  label: { fontSize: 11, fontWeight: '600', color: '#1A202C' },
  sub: { fontSize: 10, color: '#4A5568' },
});

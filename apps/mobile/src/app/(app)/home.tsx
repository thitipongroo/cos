// Home screen — SITE_WORKER landing: KPI summary + self check-in.
// KPI reads local data reactively (offline-first). Check-in resolves the worker linked to the
// current user (GET /workers/me, backend option A), records attendance (offline-queued), and writes
// a local_attendance row. NOTE: projects are not cached offline yet, so the project is entered
// manually here (same limitation as Report/Issues) — replace with a cached picker later.

import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { database } from '../../db/database';
import Issue from '../../db/models/Issue';
import Attendance from '../../db/models/Attendance';
import { useCollection } from '../../hooks/useCollection';
import { usePendingCount } from '../../hooks/usePendingCount';
import { getMyWorker, recordCheckIn } from '../../api/workforce';
import { colors, fontFamily, spacing, typography } from '../../theme/tokens';

export default function HomeScreen() {
  const issues = useCollection<Issue>('local_issues');
  const pending = usePendingCount();
  const openIssues = issues.filter((i) => i.status === 'OPEN' || i.status === 'IN_PROGRESS').length;

  const [projectId, setProjectId] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const onCheckIn = async (): Promise<void> => {
    setBusy(true);
    setMessage(null);
    try {
      const worker = await getMyWorker(); // 404 if no worker linked to this user
      const now = new Date().toISOString();
      await recordCheckIn(worker.worker_id, projectId.trim(), now); // offline-queued via mutate()
      await database.write(async () => {
        await database.get<Attendance>('local_attendance').create((r) => {
          r.logId = '';
          r.workerId = worker.worker_id;
          r.projectId = projectId.trim();
          r.checkInAt = now;
          r.checkOutAt = null;
          r.hoursWorked = null;
          r.offlineSyncStatus = 'PENDING';
        });
      });
      setMessage('Checked in — will sync when online');
    } catch {
      setMessage('Check-in unavailable: no worker profile linked to your account.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View testID="home-screen" style={styles.container}>
      <Text style={styles.heading}>Home</Text>

      <View style={styles.kpiRow}>
        <View testID="kpi-open-issues" style={styles.kpi}>
          <Text style={styles.kpiValue}>{openIssues}</Text>
          <Text style={styles.kpiLabel}>Open issues</Text>
        </View>
        <View testID="pending-sync-count" style={styles.kpi}>
          <Text style={styles.kpiValue}>{pending}</Text>
          <Text style={styles.kpiLabel}>Pending sync</Text>
        </View>
      </View>

      <Text style={styles.label}>Check in to project</Text>
      <TextInput
        testID="check-in-project-input"
        style={styles.input}
        placeholder="Project ID"
        placeholderTextColor={colors.textSecondary}
        value={projectId}
        onChangeText={setProjectId}
        editable={!busy}
      />
      <TouchableOpacity
        testID="check-in-button"
        style={[styles.checkIn, (busy || !projectId.trim()) && styles.disabled]}
        onPress={onCheckIn}
        disabled={busy || !projectId.trim()}
      >
        <Text style={styles.checkInText}>Check in</Text>
      </TouchableOpacity>

      {message ? (
        <Text testID="check-in-status" style={styles.message}>
          {message}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: spacing.md, gap: spacing.md },
  heading: {
    fontSize: typography.title.fontSize,
    fontFamily: fontFamily.semibold,
    color: colors.textPrimary,
  },
  kpiRow: { flexDirection: 'row', gap: spacing.md },
  kpi: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: spacing.md,
    alignItems: 'center',
    gap: spacing.xs,
  },
  kpiValue: {
    fontSize: typography.hero.fontSize,
    fontFamily: fontFamily.bold,
    color: colors.primary,
  },
  kpiLabel: {
    fontSize: typography.caption.fontSize,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
  },
  label: {
    fontSize: typography.body.fontSize,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.textSecondary,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    fontSize: typography.body.fontSize,
    fontFamily: fontFamily.regular,
    color: colors.textPrimary,
  },
  checkIn: {
    minHeight: 52,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.5 },
  checkInText: {
    color: colors.bg,
    fontSize: typography.body.fontSize,
    fontFamily: fontFamily.semibold,
  },
  message: {
    color: colors.textPrimary,
    fontFamily: fontFamily.regular,
    fontSize: typography.caption.fontSize,
  },
});

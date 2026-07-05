// Home screen — SITE_WORKER landing: KPI summary + self check-in.
// KPI reads local data reactively (offline-first). Check-in resolves the worker linked to the
// current user (GET /workers/me, backend option A), records attendance (offline-queued), and writes
// a local_attendance row. NOTE: projects are not cached offline yet, so the project is entered
// manually here (same limitation as Report/Issues) — replace with a cached picker later.

import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { db, newLocalId } from '../../db/database';
import type { Issue } from '../../db/database';
import { localAttendance } from '../../db/schema';
import { useCollection } from '../../hooks/useCollection';
import { usePendingCount } from '../../hooks/usePendingCount';
import { getMyWorker, recordCheckIn } from '../../api/workforce';
import { ProjectPicker } from '../../components/ProjectPicker';
import { useT } from '../../i18n';
import { colors, fontFamily, spacing, typography } from '../../theme/tokens';

export default function HomeScreen() {
  const issues = useCollection<Issue>('local_issues');
  const pending = usePendingCount();
  const t = useT();
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
      await db.insert(localAttendance).values({
        id: newLocalId(),
        logId: '',
        workerId: worker.worker_id,
        projectId: projectId.trim(),
        checkInAt: now,
        checkOutAt: null,
        hoursWorked: null,
        offlineSyncStatus: 'PENDING',
      });
      setMessage(t('home.main.checkedIn'));
    } catch {
      setMessage(t('home.main.checkInError'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View testID="home-screen" style={styles.container}>
      <Text style={styles.heading}>{t('home.main.title')}</Text>

      <View style={styles.kpiRow}>
        <View testID="kpi-open-issues" style={styles.kpi}>
          <Text style={styles.kpiValue}>{openIssues}</Text>
          <Text style={styles.kpiLabel}>{t('home.main.openIssues')}</Text>
        </View>
        <View testID="pending-sync-count" style={styles.kpi}>
          <Text style={styles.kpiValue}>{pending}</Text>
          <Text style={styles.kpiLabel}>{t('home.main.pendingSync')}</Text>
        </View>
      </View>

      <ProjectPicker selectedId={projectId} onSelect={setProjectId} />
      <TouchableOpacity
        testID="check-in-button"
        style={[styles.checkIn, (busy || !projectId.trim()) && styles.disabled]}
        onPress={onCheckIn}
        disabled={busy || !projectId.trim()}
      >
        <Text style={styles.checkInText}>{t('home.main.checkIn')}</Text>
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

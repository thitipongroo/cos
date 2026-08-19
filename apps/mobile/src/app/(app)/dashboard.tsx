// Dashboard screen — PROJECT_MANAGER analytics. Pick a project → GET /analytics/pm/:projectId.
// Response is PmDashboardRow[] (one row per event date); we render the labelled KPIs per day.

import { memo, useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { get } from '../../api/client';
import { ProjectPicker } from '../../components/ProjectPicker';
import { LoadingBoundary } from '../../components/LoadingBoundary';
import { useI18n } from '../../i18n';
import type { TranslateFn } from '../../i18n';
import { colors, fontFamily, radius, spacing, typography } from '../../theme/tokens';
import { screen } from '../../theme/screenStyles';

interface PmDashboardRow {
  eventDate: string;
  manpowerTotal: number;
  issueOpenCount: number;
  inspectionFailCount: number;
  reportCount: number;
}

const KPI_LABELS: Array<[keyof Omit<PmDashboardRow, 'eventDate'>, string]> = [
  ['manpowerTotal', 'pm.dashboard.manpower'],
  ['issueOpenCount', 'pm.dashboard.openIssues'],
  ['inspectionFailCount', 'pm.dashboard.failedInspections'],
  ['reportCount', 'pm.dashboard.reports'],
];

/**
 * One day's KPIs, memoized. `t` and `formatDate` are useCallback'd on locale (i18n/index.tsx), so a
 * card only re-renders when its own row or the language changes.
 */
const DayCard = memo(function DayCard({
  row,
  t,
  formatDate,
}: {
  row: PmDashboardRow;
  t: TranslateFn;
  formatDate: (date: Date | string) => string;
}) {
  return (
    <View testID="kpi-day" style={styles.dayCard}>
      <Text style={styles.dayDate}>{formatDate(row.eventDate)}</Text>
      {KPI_LABELS.map(([key, labelKey]) => (
        <View key={key} style={styles.kpiRow}>
          <Text style={screen.kvKey}>{t(labelKey)}</Text>
          <Text style={screen.kvValue}>{String(row[key])}</Text>
        </View>
      ))}
    </View>
  );
});

export default function DashboardScreen() {
  // `?projectId=` preselects, so a card that names a project can open THAT project's analytics
  // instead of dropping the reader on a picker and asking them to find it again (the Home and
  // Finance project cards both push here).
  const params = useLocalSearchParams<{ projectId?: string }>();
  const [projectId, setProjectId] = useState('');
  const [rows, setRows] = useState<PmDashboardRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { t, formatDate } = useI18n();

  const onSelect = useCallback(
    async (id: string): Promise<void> => {
      setProjectId(id);
      setError(null);
      setLoading(true);
      try {
        setRows(await get<PmDashboardRow[]>(`/analytics/pm/${id}`));
      } catch {
        setError(t('pm.dashboard.loadError'));
        setRows(null);
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    const incoming = params.projectId;
    if (typeof incoming === 'string' && incoming !== '') void onSelect(incoming);
    // `params.projectId` only. `onSelect` is deliberately not a dependency: its identity changes
    // with the active language, and a language change is not a route parameter arriving.
  }, [params.projectId]);

  const renderDay = useCallback(
    ({ item }: { item: PmDashboardRow }) => <DayCard row={item} t={t} formatDate={formatDate} />,
    [t, formatDate],
  );

  return (
    <View testID="dashboard-screen" style={styles.container}>
      <FlatList
        testID="kpi-list"
        contentContainerStyle={styles.content}
        // One row per event date, and a running project accumulates them without bound — so the
        // days are virtualized rather than all mounted at once. The picker and the error line stay
        // in the HEADER, so they still scroll away with the content exactly as they did inside the
        // ScrollView this replaced; the loader stays in the EMPTY slot, so it still occupies only
        // the list's own area and never hides the picker while analytics are in flight.
        data={rows ?? []}
        keyExtractor={(row) => row.eventDate}
        renderItem={renderDay}
        ListHeaderComponent={
          <View style={styles.header}>
            <ProjectPicker selectedId={projectId} onSelect={onSelect} />
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>
        }
        ListEmptyComponent={
          <LoadingBoundary loading={loading} variant="widget" theme="light">
            <Text style={screen.empty}>
              {rows ? t('pm.dashboard.emptyForProject') : t('pm.dashboard.selectPrompt')}
            </Text>
          </LoadingBoundary>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, gap: spacing.sm },
  header: { gap: spacing.sm },
  dayCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  dayDate: {
    fontSize: typography.body.fontSize,
    fontFamily: fontFamily.semibold,
    color: colors.textPrimary,
  },
  kpiRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs },
  error: {
    color: colors.danger,
    fontFamily: fontFamily.regular,
    fontSize: typography.caption.fontSize,
  },
});

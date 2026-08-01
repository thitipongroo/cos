// Dashboard screen — PROJECT_MANAGER analytics. Pick a project → GET /analytics/pm/:projectId.
// Response is PmDashboardRow[] (one row per event date); we render the labelled KPIs per day.

import { useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { get } from '../../api/client';
import { ProjectPicker } from '../../components/ProjectPicker';
import { LoadingBoundary } from '../../components/LoadingBoundary';
import { useI18n } from '../../i18n';
import { colors, fontFamily, spacing, typography } from '../../theme/tokens';
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

export default function DashboardScreen() {
  const [projectId, setProjectId] = useState('');
  const [rows, setRows] = useState<PmDashboardRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { t, formatDate } = useI18n();

  const onSelect = async (id: string): Promise<void> => {
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
  };

  return (
    <ScrollView
      testID="dashboard-screen"
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      <ProjectPicker selectedId={projectId} onSelect={onSelect} />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {/* Loader only while a picked project's analytics are in flight — never on the select-prompt. */}
      <LoadingBoundary loading={loading} variant="widget" theme="light">
        {rows && rows.length > 0 ? (
          <View testID="kpi-list" style={styles.kpis}>
            {rows.map((row) => (
              <View key={row.eventDate} testID="kpi-day" style={styles.dayCard}>
                <Text style={styles.dayDate}>{formatDate(row.eventDate)}</Text>
                {KPI_LABELS.map(([key, labelKey]) => (
                  <View key={key} style={styles.kpiRow}>
                    <Text style={screen.kvKey}>{t(labelKey)}</Text>
                    <Text style={screen.kvValue}>{String(row[key])}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        ) : (
          <Text style={screen.empty}>
            {rows ? t('pm.dashboard.emptyForProject') : t('pm.dashboard.selectPrompt')}
          </Text>
        )}
      </LoadingBoundary>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, gap: spacing.sm },
  kpis: { gap: spacing.sm, marginTop: spacing.sm },
  dayCard: {
    backgroundColor: colors.surface,
    borderRadius: 8,
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

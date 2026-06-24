// Alerts screen — EXECUTIVE risk feed. Source: GET /analytics/executive → ExecutiveDashboardRow[]
// (one row per project). At-risk projects are surfaced first with utilization + overdue invoices.

import { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { get } from '../../api/client';
import { colors, fontFamily, spacing, typography } from '../../theme/tokens';

interface ExecutiveDashboardRow {
  projectId: string;
  totalCommitted: string;
  totalActual: string;
  totalBudget: string;
  utilizationPct: number;
  atRisk: boolean;
  overdueInvoiceCount: number;
}

export default function AlertsScreen() {
  const [rows, setRows] = useState<ExecutiveDashboardRow[]>([]);

  useEffect(() => {
    get<ExecutiveDashboardRow[]>('/analytics/executive')
      .then((data) => setRows([...data].sort((a, b) => Number(b.atRisk) - Number(a.atRisk))))
      .catch(() => {
        /* offline — keep last */
      });
  }, []);

  return (
    <View testID="alerts-screen" style={styles.container}>
      <Text style={styles.heading}>Alerts</Text>
      <FlatList
        testID="alerts-list"
        data={rows}
        keyExtractor={(r, i) => r.projectId || String(i)}
        ListEmptyComponent={<Text style={styles.empty}>No alerts</Text>}
        renderItem={({ item }) => (
          <View testID="alert-item" style={[styles.card, item.atRisk && styles.cardRisk]}>
            <View style={styles.row}>
              <Text style={styles.project}>{item.projectId.slice(0, 8)}</Text>
              <Text style={[styles.badge, item.atRisk ? styles.badgeRisk : styles.badgeOk]}>
                {item.atRisk ? 'AT RISK' : 'OK'}
              </Text>
            </View>
            <Text style={styles.metric}>Utilization: {item.utilizationPct}%</Text>
            <Text style={styles.metric}>
              Budget {item.totalBudget} · Committed {item.totalCommitted} · Actual{' '}
              {item.totalActual}
            </Text>
            <Text style={styles.metric}>Overdue invoices: {item.overdueInvoiceCount}</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: spacing.md, gap: spacing.sm },
  heading: {
    fontSize: typography.title.fontSize,
    fontFamily: fontFamily.semibold,
    color: colors.textPrimary,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
  cardRisk: { borderLeftWidth: 3, borderLeftColor: colors.danger },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  project: {
    fontSize: typography.body.fontSize,
    fontFamily: fontFamily.semibold,
    color: colors.textPrimary,
  },
  badge: {
    fontSize: typography.caption.fontSize,
    fontFamily: fontFamily.semibold,
    overflow: 'hidden',
  },
  badgeRisk: { color: colors.danger },
  badgeOk: { color: colors.success },
  metric: {
    fontSize: typography.caption.fontSize,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
  },
  empty: { color: colors.textSecondary, fontFamily: fontFamily.regular, padding: spacing.md },
});

// Alerts screen — EXECUTIVE risk feed. Source: GET /analytics/executive → ExecutiveDashboardRow[]
// (one row per project). At-risk projects are surfaced first with utilization + overdue invoices.

import { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { get } from '../../api/client';
import { useT } from '../../i18n';
import { colors, fontFamily, spacing, typography } from '../../theme/tokens';
import { screen } from '../../theme/screenStyles';

interface ExecutiveDashboardRow {
  projectId: string;
  totalCommitted: string;
  totalActual: string;
  totalBudget: string;
  utilizationPct: number;
  atRisk: boolean;
  overdueInvoiceCount: number;
}

// Severity derived from the available executive metrics (the analytics endpoint has no severity field):
//   CRITICAL = budget overrun (utilization > 100%) · HIGH = flagged at-risk · MEDIUM = overdue invoices.
// Sorting the feed by this rank satisfies master 3097-3098 (CRITICAL → HIGH → MEDIUM) without
// fabricating data — it is a documented mapping over utilizationPct / atRisk / overdueInvoiceCount.
type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
const SEV_RANK: Record<Severity, number> = { CRITICAL: 3, HIGH: 2, MEDIUM: 1, LOW: 0 };

function severityOf(r: ExecutiveDashboardRow): Severity {
  if (Number(r.utilizationPct) > 100) return 'CRITICAL';
  if (r.atRisk) return 'HIGH';
  if (r.overdueInvoiceCount > 0) return 'MEDIUM';
  return 'LOW';
}

export default function AlertsScreen() {
  const [rows, setRows] = useState<ExecutiveDashboardRow[]>([]);
  const t = useT();

  useEffect(() => {
    get<ExecutiveDashboardRow[]>('/analytics/executive')
      .then((data) =>
        setRows([...data].sort((a, b) => SEV_RANK[severityOf(b)] - SEV_RANK[severityOf(a)])),
      )
      .catch(() => {
        /* offline — keep last */
      });
  }, []);

  return (
    <View testID="alerts-screen" style={screen.container}>
      <Text style={screen.heading}>{t('exec.alerts.title')}</Text>
      <FlatList
        testID="alerts-list"
        data={rows}
        keyExtractor={(r, i) => r.projectId || String(i)}
        ListEmptyComponent={<Text style={screen.empty}>{t('exec.alerts.empty')}</Text>}
        renderItem={({ item }) => (
          <View testID="alert-item" style={[styles.card, item.atRisk && styles.cardRisk]}>
            <View style={styles.row}>
              <Text style={styles.project}>{item.projectId.slice(0, 8)}</Text>
              <Text
                style={[
                  styles.badge,
                  severityOf(item) === 'LOW' ? styles.badgeOk : styles.badgeRisk,
                ]}
              >
                {t(`status.${severityOf(item)}`)}
              </Text>
            </View>
            <Text style={styles.metric}>
              {t('exec.alerts.utilization', { value: item.utilizationPct })}
            </Text>
            <Text style={styles.metric}>
              {t('exec.alerts.budgetLine', {
                budget: item.totalBudget,
                committed: item.totalCommitted,
                actual: item.totalActual,
              })}
            </Text>
            <Text style={styles.metric}>
              {t('exec.alerts.overdueInvoices', { count: item.overdueInvoiceCount })}
            </Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
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
});

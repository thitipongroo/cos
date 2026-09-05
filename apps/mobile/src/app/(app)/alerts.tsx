// Alerts screen — EXECUTIVE risk feed. Source: GET /analytics/executive → ExecutiveDashboardRow[]
// (one row per project). At-risk projects are surfaced first with utilization + overdue invoices.
//
// THIS SCREEN SHOWED NOTHING AGAINST A REAL BACKEND UNTIL 2026-09-05. It called the endpoint with no
// `projectIds`, and the controller turns that into an empty array, so the ClickHouse `project_id IN
// ()` matched no row and the API answered 200 with `[]` — an empty feed, identical on screen to
// "there are no alerts". The ids now come from `GET /projects/mine` first, which is why the two
// calls are sequential rather than parallel. The rule and the query-building live once, in
// `api/analytics.ts`.
//
// The severity mapping moved there too, for the same reason: the Home risk tile derives the same
// three bands from the same three columns, and two copies of one rule drift.

import { memo, useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import {
  EXECUTIVE_SEVERITY_RANK,
  executiveSeverityOf,
  getExecutiveDashboard,
  type ExecutiveDashboardRow,
} from '../../api/analytics';
import { getMyProjects } from '../../api/projects';
import { LoadingBoundary } from '../../components/LoadingBoundary';
import { useT } from '../../i18n';
import type { TranslateFn } from '../../i18n';
import { colors, fontFamily, radius, spacing, typography } from '../../theme/tokens';
import { screen } from '../../theme/screenStyles';

// The row shape and the severity mapping are both in `api/analytics.ts` now. Sorting the feed by
// that rank satisfies master 3097-3098 (CRITICAL → HIGH → MEDIUM) without fabricating data — it is a
// documented derivation over utilizationPct / atRisk / overdueInvoiceCount, and the endpoint returns
// no severity field of its own.

/**
 * One project's risk card, memoized.
 *
 * Severity is derived from this row's own metrics, so it belongs with the row rather than being
 * computed in a shared renderer — and memo then lets the feed skip every card whose figures have
 * not moved.
 */
const AlertItem = memo(function AlertItem({
  alert,
  t,
}: {
  alert: ExecutiveDashboardRow;
  t: TranslateFn;
}) {
  return (
    // === 1, not truthiness: atRisk is 0 | 1 (§35.13 ESC-34), and a 0 in a style array relies on
    // StyleSheet.flatten skipping falsy entries rather than saying what it means (ESC-36).
    <View testID="alert-item" style={[styles.card, alert.atRisk === 1 ? styles.cardRisk : null]}>
      <View style={styles.row}>
        <Text style={styles.project}>{alert.projectId.slice(0, 8)}</Text>
        <Text
          style={[
            styles.badge,
            executiveSeverityOf(alert) === 'LOW' ? styles.badgeOk : styles.badgeRisk,
          ]}
        >
          {t(`status.${executiveSeverityOf(alert)}`)}
        </Text>
      </View>
      <Text style={styles.metric}>
        {t('exec.alerts.utilization', { value: alert.utilizationPct })}
      </Text>
      <Text style={styles.metric}>
        {t('exec.alerts.budgetLine', {
          budget: alert.totalBudget,
          committed: alert.totalCommitted,
          actual: alert.totalActual,
        })}
      </Text>
      <Text style={styles.metric}>
        {t('exec.alerts.overdueInvoices', { count: alert.overdueInvoiceCount })}
      </Text>
    </View>
  );
});

export default function AlertsScreen() {
  const [rows, setRows] = useState<ExecutiveDashboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const t = useT();

  const renderAlert = useCallback(
    ({ item }: { item: ExecutiveDashboardRow }) => <AlertItem alert={item} t={t} />,
    [t],
  );

  useEffect(() => {
    // rows is [] both before the fetch and when genuinely empty, so a dedicated flag drives the loader.
    let cancelled = false;
    getMyProjects()
      .then(async (mine) => {
        const data = await getExecutiveDashboard(mine.map((project) => project.project_id));
        if (cancelled) return;
        setRows(
          [...data].sort(
            (a, b) =>
              EXECUTIVE_SEVERITY_RANK[executiveSeverityOf(b)] -
              EXECUTIVE_SEVERITY_RANK[executiveSeverityOf(a)],
          ),
        );
      })
      .catch(() => {
        /* offline — keep last */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <View testID="alerts-screen" style={screen.container}>
      <LoadingBoundary loading={loading} variant="widget" theme="light" style={styles.boundary}>
        <FlatList
          testID="alerts-list"
          data={rows}
          keyExtractor={(r, i) => r.projectId || String(i)}
          ListEmptyComponent={<Text style={screen.empty}>{t('exec.alerts.empty')}</Text>}
          renderItem={renderAlert}
        />
      </LoadingBoundary>
    </View>
  );
}

const styles = StyleSheet.create({
  boundary: { flex: 1 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
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

// Portfolio screen — EXECUTIVE: project list with status + budget-variance/at-risk badge, tap → a
// project health card (cost / utilization / overdue invoices) — G-M15 (master 3095-3096).
// Projects are the offline-cached list (local_projects); health metrics come online from
// GET /analytics/executive (one row per project). Offline: shows the cached list without badges.

import { memo, useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import type { Project } from '../../db/database';
import { useCollection } from '../../hooks/useCollection';
import { refreshProjectsCache } from '../../api/projects';
import { get } from '../../api/client';
import { StatusChip } from '../../components/StatusChip';
import { LoadingBoundary } from '../../components/LoadingBoundary';
import { useT } from '../../i18n';
import type { TranslateFn } from '../../i18n';
import { colors, fontFamily, radius, spacing, typography } from '../../theme/tokens';
import { screen } from '../../theme/screenStyles';

interface ExecRow {
  projectId: string;
  totalBudget: string;
  totalActual: string;
  totalCommitted: string;
  utilizationPct: number;
  /** 0 | 1, not boolean — ClickHouse `if()` returns UInt8. See §35.13 ESC-34. */
  atRisk: 0 | 1;
  overdueInvoiceCount: number;
}

/**
 * One project in the portfolio, memoized.
 *
 * `health` arrives from a SECOND source (/analytics/executive) and is joined to the project by id;
 * passing it in as this row's own prop is what keeps that join visible — and what lets memo skip
 * every row whose project and health are unchanged when the health request lands.
 */
const PortfolioItem = memo(function PortfolioItem({
  project,
  health,
  onOpen,
  t,
}: {
  project: Project;
  health: ExecRow | undefined;
  onOpen: (project: Project) => void;
  t: TranslateFn;
}) {
  return (
    <TouchableOpacity
      testID="portfolio-item"
      style={screen.item}
      onPress={() => onOpen(project)}
      accessibilityRole="button"
      // The row announces the project it opens, not "button" — the name is what distinguishes it
      // from the twenty others in the list.
      accessibilityLabel={project.projectName}
    >
      <Text style={screen.itemTitle}>{project.projectName}</Text>
      <View style={styles.chips}>
        <StatusChip label={project.status} />
        {health ? (
          <Text style={[styles.badge, health.atRisk ? styles.badgeRisk : styles.badgeOk]}>
            {health.atRisk ? t('exec.portfolio.atRisk') : `${health.utilizationPct}%`}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
});

export default function PortfolioScreen() {
  const projects = useCollection<Project>('local_projects');
  const [execById, setExecById] = useState<Record<string, ExecRow>>({});
  const [selected, setSelected] = useState<Project | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const t = useT();

  const renderProject = useCallback(
    ({ item }: { item: Project }) => (
      <PortfolioItem project={item} health={execById[item.projectId]} onOpen={setSelected} t={t} />
    ),
    [execById, t],
  );

  useEffect(() => {
    refreshProjectsCache().catch(() => {
      /* offline — show cached */
    });
    // Only the remote health metrics load — the project list is local and renders instantly (no loader).
    get<ExecRow[]>('/analytics/executive')
      .then((rows) => setExecById(Object.fromEntries(rows.map((r) => [r.projectId, r]))))
      .catch(() => {
        /* offline — no badges */
      })
      .finally(() => setHealthLoading(false));
  }, []);

  if (selected) {
    const h = execById[selected.projectId];
    const rowsOut: Array<[string, string]> = h
      ? [
          [t('exec.portfolio.budget'), h.totalBudget],
          [t('exec.portfolio.committed'), h.totalCommitted],
          [t('exec.portfolio.actual'), h.totalActual],
          [t('exec.portfolio.utilization'), `${h.utilizationPct}%`],
          [t('exec.portfolio.overdue'), String(h.overdueInvoiceCount)],
        ]
      : [];
    return (
      <View testID="portfolio-health" style={screen.container}>
        <Text style={screen.heading}>{selected.projectName}</Text>
        {/* Health metrics are remote; loader shows only while that fetch is still pending. */}
        <LoadingBoundary loading={healthLoading} variant="widget" theme="light">
          {h ? (
            <>
              {h.atRisk ? (
                <Text testID="health-at-risk" style={styles.atRisk}>
                  {t('exec.portfolio.atRisk')}
                </Text>
              ) : null}
              {rowsOut.map(([label, value]) => (
                <View key={label} style={screen.kvRow}>
                  <Text style={screen.kvKey}>{label}</Text>
                  <Text style={screen.kvValue}>{value}</Text>
                </View>
              ))}
            </>
          ) : (
            <Text style={screen.empty}>{t('exec.portfolio.noHealth')}</Text>
          )}
        </LoadingBoundary>
        <TouchableOpacity
          testID="portfolio-back"
          onPress={() => setSelected(null)}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <Text style={styles.back}>{t('common.back')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View testID="portfolio-screen" style={screen.container}>
      <FlatList
        testID="portfolio-list"
        data={projects}
        keyExtractor={(p) => p.id}
        ListEmptyComponent={<Text style={screen.empty}>{t('exec.portfolio.empty')}</Text>}
        renderItem={renderProject}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  badge: {
    fontSize: typography.caption.fontSize,
    fontFamily: fontFamily.semibold,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.xl,
    overflow: 'hidden',
  },
  badgeRisk: { color: colors.bg, backgroundColor: colors.danger, paddingVertical: 2 },
  badgeOk: { color: colors.textSecondary },
  atRisk: {
    color: colors.danger,
    fontFamily: fontFamily.semibold,
    fontSize: typography.caption.fontSize,
  },
  back: { color: colors.primary, fontFamily: fontFamily.medium, marginTop: spacing.md },
});

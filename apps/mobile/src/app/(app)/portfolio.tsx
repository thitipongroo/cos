// Portfolio screen — EXECUTIVE: project list with status + budget-variance/at-risk badge, tap → a
// project health card (cost / utilization / overdue invoices) — G-M15 (master 3095-3096).
// Projects are the offline-cached list (local_projects); health metrics come online from
// GET /analytics/executive (one row per project). Offline: shows the cached list without badges.

import { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import type { Project } from '../../db/database';
import { useCollection } from '../../hooks/useCollection';
import { refreshProjectsCache } from '../../api/projects';
import { get } from '../../api/client';
import { StatusChip } from '../../components/StatusChip';
import { useT } from '../../i18n';
import { colors, fontFamily, spacing, typography } from '../../theme/tokens';

interface ExecRow {
  projectId: string;
  totalBudget: string;
  totalActual: string;
  totalCommitted: string;
  utilizationPct: number;
  atRisk: boolean;
  overdueInvoiceCount: number;
}

export default function PortfolioScreen() {
  const projects = useCollection<Project>('local_projects');
  const [execById, setExecById] = useState<Record<string, ExecRow>>({});
  const [selected, setSelected] = useState<Project | null>(null);
  const t = useT();

  useEffect(() => {
    refreshProjectsCache().catch(() => {
      /* offline — show cached */
    });
    get<ExecRow[]>('/analytics/executive')
      .then((rows) => setExecById(Object.fromEntries(rows.map((r) => [r.projectId, r]))))
      .catch(() => {
        /* offline — no badges */
      });
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
      <View testID="portfolio-health" style={styles.container}>
        <Text style={styles.heading}>{selected.projectName}</Text>
        {h ? (
          <>
            {h.atRisk ? (
              <Text testID="health-at-risk" style={styles.atRisk}>
                {t('exec.portfolio.atRisk')}
              </Text>
            ) : null}
            {rowsOut.map(([label, value]) => (
              <View key={label} style={styles.row}>
                <Text style={styles.key}>{label}</Text>
                <Text style={styles.value}>{value}</Text>
              </View>
            ))}
          </>
        ) : (
          <Text style={styles.empty}>{t('exec.portfolio.noHealth')}</Text>
        )}
        <TouchableOpacity testID="portfolio-back" onPress={() => setSelected(null)}>
          <Text style={styles.back}>{t('common.back')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View testID="portfolio-screen" style={styles.container}>
      <Text style={styles.heading}>{t('exec.portfolio.title')}</Text>
      <FlatList
        testID="portfolio-list"
        data={projects}
        keyExtractor={(p) => p.id}
        ListEmptyComponent={<Text style={styles.empty}>{t('exec.portfolio.empty')}</Text>}
        renderItem={({ item }) => {
          const h = execById[item.projectId];
          return (
            <TouchableOpacity
              testID="portfolio-item"
              style={styles.item}
              onPress={() => setSelected(item)}
            >
              <Text style={styles.itemTitle}>{item.projectName}</Text>
              <View style={styles.chips}>
                <StatusChip label={item.status} />
                {h ? (
                  <Text style={[styles.badge, h.atRisk ? styles.badgeRisk : styles.badgeOk]}>
                    {h.atRisk ? t('exec.portfolio.atRisk') : `${h.utilizationPct}%`}
                  </Text>
                ) : null}
              </View>
            </TouchableOpacity>
          );
        }}
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
  item: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.surface,
    gap: spacing.xs,
  },
  itemTitle: {
    fontSize: typography.body.fontSize,
    fontFamily: fontFamily.medium,
    color: colors.textPrimary,
  },
  chips: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  badge: {
    fontSize: typography.caption.fontSize,
    fontFamily: fontFamily.semibold,
    paddingHorizontal: spacing.xs,
    borderRadius: 8,
    overflow: 'hidden',
  },
  badgeRisk: { color: colors.bg, backgroundColor: colors.danger, paddingVertical: 2 },
  badgeOk: { color: colors.textSecondary },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.surface,
  },
  key: {
    fontSize: typography.body.fontSize,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
  },
  value: {
    fontSize: typography.body.fontSize,
    fontFamily: fontFamily.semibold,
    color: colors.textPrimary,
  },
  atRisk: {
    color: colors.danger,
    fontFamily: fontFamily.semibold,
    fontSize: typography.caption.fontSize,
  },
  back: { color: colors.primary, fontFamily: fontFamily.medium, marginTop: spacing.md },
  empty: { color: colors.textSecondary, fontFamily: fontFamily.regular, padding: spacing.md },
});

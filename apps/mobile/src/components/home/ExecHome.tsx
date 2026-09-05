// ExecHome — the EXECUTIVE Home screen.
// Implements mockup/mobile/08_executive/01_home/01_ex_dashboard.
//
// REWRITTEN 2026-09-05 for that drawing. What was here before was four KPI tiles — active projects,
// open critical issues, budget, actual — and nothing else; the drawing adds an AI panel, a budget
// hero with a spend bar, the project list and a locations panel.
//
// WHAT IS REAL.
//   AI panel            `POST /ai/reports/executive-summary` through <PortfolioInsight /> — the
//                       model's own text and its own confidence band, never a figure from
//                       lib/mockupFigures (ADR-099 forbids exactly that)
//   Active projects     `local_projects` where status = ACTIVE, the offline-cached list
//   Risk alerts         derived from `GET /analytics/executive` by the SAME rule alerts.tsx uses —
//                       CRITICAL when utilisation is over 100%, HIGH when the row is flagged
//                       at-risk, MEDIUM when invoices are overdue. A documented mapping over real
//                       columns, not a severity the API returns
//   Portfolio budget    Σ budget and Σ actual over those rows, in decimal.js
//   Project cards       name, status, variance and the §32.12 progress the list row already carries
//
// WHAT IS DRAWN (lib/mockupFigures.ts, ADR-099): the "+2 this month" delta, the per-project sync
// chip, the Filter control and the Project Locations panel with its region caption.
//
// TWO DEVIATIONS FROM THE DRAWING, both recorded rather than silent:
//
//   THE CARD'S SECOND LINE IS PROGRESS, NOT "Phase: Structural Foundation". A phase name needs
//   `getProjectPhases(projectId)`, which is ONE REQUEST PER PROJECT — the exact fan-out that
//   `GET /tasks/portfolio-summary` was built to avoid on the Tasks screen, and worse here because
//   this list is the first thing the role sees. `getMyProjects()` already returns
//   `progress_percent` on the row (§32.12, null when not computable), so the line carries a real
//   figure at no extra request. Same substitution `tasks.tsx` makes for the Site Worker badge.
//
//   THE TWO BUTTONS UNDER THE AI PANEL ARE DRAWN AND SAY THEY DO NOT WORK. "Mitigation" and
//   "Dismiss" have no endpoint, and master §Phase 10 makes this role READ-ONLY on mobile, so
//   neither may write. Product-owner decision 2026-09-04: draw them and state it, the `more.tsx`
//   convention, rather than omit them.
//
// decimal.js, never `+` (master:991). These are the largest figures in the product — a portfolio's
// budget in hundreds of millions of baht — and the note the previous version carried still stands:
// `/analytics/executive` returns NO CURRENCY, so a portfolio spanning two of them is still added
// together. lib/portfolioFinance.ts refuses that trade for the PM's Finance screen and can only do
// so because `GET /finance/budget/:projectId` carries `total_budget_currency`. Giving this figure
// the same honesty needs the currency on the analytics row.

import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import type { Project } from '../../db/database';
import { useCollection } from '../../hooks/useCollection';
import { getMyProjects, refreshProjectsCache, type MyProject } from '../../api/projects';
import {
  executiveSeverityOf,
  getExecutiveDashboard,
  type ExecutiveDashboardRow,
} from '../../api/analytics';
import { PortfolioInsight } from '../PortfolioInsight';
import { useT } from '../../i18n';
import type { TranslateFn } from '../../i18n';
import { Decimal, formatMoney, sumDecimals, toDecimal } from '@cos/financial';
import { countSettled } from '../../lib/loadingState';
import { ACTIVE_PROJECTS_DELTA, ACTIVE_REGION } from '../../lib/mockupFigures';
import { fontFamily, plateRadius, radius, spacing, typography } from '../../theme/tokens';
import { usePalette, type Palette } from '../../theme/usePalette';
import { Screen, KpiRegion } from './HomeKit';

export default function ExecHome() {
  const t = useT();
  const p = usePalette();
  const styles = useMemo(() => makeStyles(p), [p]);
  const router = useRouter();
  const cached = useCollection<Project>('local_projects');

  const [rows, setRows] = useState<ExecutiveDashboardRow[]>([]);
  const [mine, setMine] = useState<MyProject[]>([]);
  const [loading, setLoading] = useState(true);
  // Rule 40 — ONE counted step. The analytics call cannot start until the project list answers (it
  // needs the ids), so there is only one independent thing to wait for, and `loadProgress` returns
  // null below two steps — an indeterminate loader rather than a percentage that would sit at 0
  // then jump to 100.
  const [settled, setSettled] = useState(0);
  const LOAD_STEPS = 1;

  const activeCount = cached.filter((project) => project.status === 'ACTIVE').length;

  useEffect(() => {
    let cancelled = false;
    refreshProjectsCache().catch(() => {
      /* offline — the cached list is what the screen shows */
    });
    const step = <T,>(promise: Promise<T>): Promise<T> =>
      countSettled(promise, () => {
        if (!cancelled) setSettled((n) => n + 1);
      });

    // `asList`, not the raw body. The endpoint answers a bare ARRAY, and reading it as one used
    // to happen inside the promise chain where a wrong shape was swallowed by the offline
    // `.catch`. Mapping during render moved that failure into the render pass, where it takes the
    // screen down instead — so the shape is normalised once, here, by the helper HomeKit exports
    // for exactly the endpoints that answer either form.
    // THE PROJECT IDS ARE REQUIRED, and leaving them out is why this dashboard was blank the first
    // time it was photographed — `/analytics/executive` filters `project_id IN ({projectIds})` and a
    // missing parameter becomes an empty array, so the endpoint answers 200 with []. That rule, and
    // the query-building it needs, live once in `api/analytics.ts`; this screen just supplies the ids.
    //
    // It makes the two calls SEQUENTIAL: the project list has to answer before the analytics call
    // can be made at all.
    const analytics = step(getMyProjects())
      .then(async (data) => {
        if (cancelled) return;
        setMine(data);
        const rowsForProjects = await getExecutiveDashboard(
          data.map((project) => project.project_id),
        );
        if (!cancelled) setRows(rowsForProjects);
      })
      .catch(() => {
        /* offline — the figures stay em dashes rather than going stale silently */
      });

    void Promise.allSettled([analytics]).then(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const budget = useMemo(
    () => (rows.length === 0 ? null : sumDecimals(rows.map((r) => toDecimal(r.totalBudget)))),
    [rows],
  );
  const actual = useMemo(
    () => (rows.length === 0 ? null : sumDecimals(rows.map((r) => toDecimal(r.totalActual)))),
    [rows],
  );

  /** Remaining share of the portfolio budget, 0–100. Null when there is no budget to divide by. */
  const remainingPct = useMemo(() => {
    if (budget === null || actual === null || budget.lte(0)) return null;
    const spent = actual.div(budget).times(100);
    return Math.max(0, Math.min(100, 100 - spent.toNumber()));
  }, [budget, actual]);

  const risk = useMemo(() => {
    const critical = rows.filter((r) => executiveSeverityOf(r) === 'CRITICAL').length;
    const warning = rows.filter(
      (r) => executiveSeverityOf(r) === 'HIGH' || executiveSeverityOf(r) === 'MEDIUM',
    ).length;
    return { critical, warning, total: critical + warning };
  }, [rows]);

  const money = (value: Decimal | null): string => (value === null ? '—' : formatMoney(value));
  const byId = useMemo(() => new Map(rows.map((r) => [r.projectId, r])), [rows]);

  return (
    <Screen testID="home-screen" scroll>
      {/* The drawing's "AI Executive Intelligence" panel — the real endpoint. */}
      <PortfolioInsight
        projectId={mine[0]?.project_id ?? ''}
        projectLabel={mine[0]?.project_name}
        titleKey="exec.home.intelligence"
      />

      {/* Drawn, and they say they do not work — see the header. */}
      <View style={styles.actionRow}>
        {(['mitigation', 'dismiss'] as const).map((action) => (
          <Pressable
            key={action}
            testID={`exec-home-${action}`}
            accessibilityRole="button"
            accessibilityLabel={t(`exec.home.${action}`)}
            onPress={() => Alert.alert(t(`exec.home.${action}`), t('more.comingSoon'))}
            style={[styles.actionButton, action === 'mitigation' ? styles.actionPrimary : null]}
          >
            <Text style={styles.actionText}>{t(`exec.home.${action}`)}</Text>
            <View style={styles.soonChip}>
              <Text style={styles.soonText}>{t('more.soon')}</Text>
            </View>
          </Pressable>
        ))}
      </View>

      <KpiRegion loading={loading} settled={settled} steps={LOAD_STEPS}>
        <View style={styles.tileRow}>
          <View testID="kpi-active-projects" style={[styles.card, styles.tile]}>
            <View style={styles.tileHead}>
              <Text style={styles.eyebrow}>{t('exec.home.activeProjects')}</Text>
              <MaterialIcons name="precision-manufacturing" size={18} color={p.accent} />
            </View>
            <Text style={styles.tileValue}>{String(activeCount)}</Text>
            <View style={styles.deltaRow}>
              <MaterialIcons name="arrow-upward" size={14} color={p.success} />
              <Text style={styles.delta}>
                {t('exec.home.thisMonth', { value: ACTIVE_PROJECTS_DELTA.value })}
              </Text>
            </View>
          </View>

          <View testID="kpi-risk-alerts" style={[styles.card, styles.tile]}>
            <View style={styles.tileHead}>
              <Text style={styles.eyebrow}>{t('exec.home.riskAlerts')}</Text>
              <MaterialIcons name="warning" size={18} color={p.danger} />
            </View>
            <Text style={styles.tileValue}>
              {rows.length === 0 ? '—' : String(risk.total).padStart(2, '0')}
            </Text>
            <Text style={styles.tileNote}>
              {t('exec.home.riskSplit', { critical: risk.critical, warning: risk.warning })}
            </Text>
          </View>
        </View>

        {/* Portfolio budget hero. */}
        <View testID="kpi-budget" style={[styles.card, styles.hero]}>
          <View style={styles.heroHead}>
            <View>
              <Text style={styles.eyebrow}>{t('exec.home.portfolioBudget')}</Text>
              <Text style={styles.heroValue}>{money(budget)}</Text>
            </View>
            <View style={styles.heroPlate}>
              <MaterialIcons name="account-balance-wallet" size={20} color={p.accent} />
            </View>
          </View>
          <View style={styles.heroLabels}>
            <Text style={styles.eyebrow}>{t('exec.home.actual', { value: money(actual) })}</Text>
            <Text style={styles.eyebrow}>
              {remainingPct === null
                ? t('exec.home.remainingUnknown')
                : t('exec.home.remaining', { value: remainingPct.toFixed(1) })}
            </Text>
          </View>
          <View style={styles.track}>
            <View
              testID="kpi-budget-bar"
              style={[styles.fill, { width: `${remainingPct ?? 0}%` }]}
            />
          </View>
        </View>

        {/* Project list. */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionLabel}>{t('exec.home.projectList')}</Text>
          <Pressable
            testID="exec-home-filter"
            accessibilityRole="button"
            accessibilityLabel={t('exec.home.filter')}
            onPress={() => Alert.alert(t('exec.home.filter'), t('more.comingSoon'))}
            style={styles.filter}
          >
            <Text style={styles.filterText}>{t('exec.home.filter')}</Text>
            <MaterialIcons name="filter-list" size={18} color={p.accent} />
          </Pressable>
        </View>

        {mine.length === 0 ? (
          <View testID="exec-home-projects-empty" style={styles.card}>
            <Text style={styles.emptyText}>{t('exec.home.noProjects')}</Text>
          </View>
        ) : (
          mine.map((project) => (
            <ProjectCard
              key={project.project_id}
              project={project}
              row={byId.get(project.project_id)}
              styles={styles}
              palette={p}
              t={t}
              onPress={() => router.push('/portfolio')}
            />
          ))
        )}

        {/* Project Locations — drawn (ADR-099). Projects carry no coordinates and there is no maps
            library, so the panel states what it would show rather than rendering an image of a map
            this app cannot plot. */}
        <View testID="exec-home-locations" style={[styles.card, styles.locations]}>
          <Text style={styles.eyebrow}>{t('exec.home.activeRegion')}</Text>
          <Text style={styles.regionName}>{ACTIVE_REGION.value}</Text>
        </View>
      </KpiRegion>
    </Screen>
  );
}

function ProjectCard({
  project,
  row,
  styles,
  palette,
  t,
  onPress,
}: {
  project: MyProject;
  row: ExecutiveDashboardRow | undefined;
  styles: ReturnType<typeof makeStyles>;
  palette: Palette;
  t: TranslateFn;
  onPress: () => void;
}): React.JSX.Element {
  const over = row !== undefined && Number(row.utilizationPct) > 100;
  const atRisk = row?.atRisk === 1;
  const stripe = over ? palette.danger : atRisk ? palette.warning : palette.success;
  const statusKey = over ? 'overBudget' : atRisk ? 'atRisk' : 'onTrack';
  // Variance is actual − budget: positive is an overrun, which is what the drawing colours red.
  const variance =
    row === undefined ? null : toDecimal(row.totalActual).minus(toDecimal(row.totalBudget));

  return (
    <Pressable
      testID={`exec-home-project-${project.project_id}`}
      accessibilityRole="button"
      accessibilityLabel={project.project_name}
      onPress={onPress}
      style={[styles.card, styles.project, { borderLeftColor: stripe }]}
    >
      <View style={styles.projectHead}>
        <View style={styles.projectText}>
          <Text style={styles.projectName} numberOfLines={1}>
            {project.project_name}
          </Text>
          {/* PROGRESS, not the drawing's phase name — see the header for why. */}
          <Text style={styles.projectMeta}>
            {project.progress_percent === null || project.progress_percent === undefined
              ? t('exec.home.progressUnknown')
              : t('exec.home.progress', { value: Math.round(project.progress_percent) })}
          </Text>
        </View>
        <Text style={[styles.badge, { color: stripe }]}>{t(`exec.home.${statusKey}`)}</Text>
      </View>
      <View style={styles.projectFoot}>
        <Text style={styles.eyebrow}>{t('exec.home.variance')}</Text>
        <Text
          style={[
            styles.varianceValue,
            { color: variance?.gt(0) ? palette.danger : palette.success },
          ]}
        >
          {variance === null ? '—' : formatMoney(variance)}
        </Text>
      </View>
    </Pressable>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    card: {
      backgroundColor: p.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: p.border,
      padding: spacing.md,
      marginBottom: spacing.sm,
    },

    actionRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
    actionButton: {
      flex: 1,
      minHeight: 52,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: p.border,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
    },
    actionPrimary: { borderColor: p.accent },
    actionText: {
      fontSize: typography.label.fontSize,
      fontFamily: fontFamily.semibold,
      color: p.text,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },

    tileRow: { flexDirection: 'row', gap: spacing.sm },
    tile: { flex: 1, gap: spacing.xs / 2 },
    tileHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    tileValue: {
      fontSize: typography.hero.fontSize,
      fontFamily: fontFamily.bold,
      color: p.text,
    },
    tileNote: {
      fontSize: typography.label.fontSize,
      fontFamily: fontFamily.regular,
      color: p.muted,
    },
    deltaRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    delta: {
      fontSize: typography.label.fontSize,
      fontFamily: fontFamily.medium,
      color: p.success,
    },

    hero: { gap: spacing.sm },
    heroHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    heroValue: {
      fontSize: typography.hero.fontSize,
      fontFamily: fontFamily.bold,
      color: p.text,
    },
    heroPlate: {
      width: 40,
      height: 40,
      borderRadius: plateRadius(40),
      backgroundColor: p.elevated,
      alignItems: 'center',
      justifyContent: 'center',
    },
    heroLabels: { flexDirection: 'row', justifyContent: 'space-between' },
    // radius.sm, not the literal 3 a capsule would take: the ratchet in
    // theme/__tests__/radiusRatchet.spec.ts only ever tightens, and a 6px bar reads the same at
    // 2px corners as at 3. VerifyingOverlay's identical track predates the ratchet.
    track: { height: 6, borderRadius: radius.sm, backgroundColor: p.elevated, overflow: 'hidden' },
    fill: { height: '100%', backgroundColor: p.accent },

    sectionHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.xs,
    },
    sectionLabel: {
      fontSize: typography.label.fontSize,
      fontFamily: fontFamily.semibold,
      color: p.text,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    filter: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      minHeight: 44,
      paddingHorizontal: spacing.xs,
    },
    filterText: {
      fontSize: typography.label.fontSize,
      fontFamily: fontFamily.semibold,
      color: p.accent,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },

    project: { borderLeftWidth: 4, gap: spacing.sm },
    projectHead: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
    projectText: { flex: 1, gap: 2 },
    projectName: {
      fontSize: typography.body.fontSize,
      fontFamily: fontFamily.semibold,
      color: p.text,
    },
    projectMeta: {
      fontSize: typography.label.fontSize,
      fontFamily: fontFamily.regular,
      color: p.muted,
    },
    badge: {
      fontSize: typography.label.fontSize,
      fontFamily: fontFamily.semibold,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    projectFoot: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    varianceValue: { fontSize: typography.label.fontSize, fontFamily: fontFamily.semibold },

    eyebrow: {
      fontSize: typography.label.fontSize,
      fontFamily: fontFamily.semibold,
      color: p.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    emptyText: {
      fontSize: typography.body.fontSize,
      fontFamily: fontFamily.regular,
      color: p.muted,
    },

    locations: { gap: 2 },
    regionName: {
      fontSize: typography.body.fontSize,
      fontFamily: fontFamily.semibold,
      color: p.text,
    },

    soonChip: {
      paddingHorizontal: spacing.xs,
      borderRadius: radius.xl,
      backgroundColor: p.elevated,
    },
    soonText: {
      fontSize: typography.label.fontSize,
      fontFamily: fontFamily.semibold,
      color: p.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
  });

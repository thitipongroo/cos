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
import { compactMoneyLabel } from '../../lib/compactMoney';
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

  /**
   * The budget hero's two figures, shortened — the drawing writes `฿ 4.82B` and `Actual: ฿ 2.15B`,
   * not the full grouped amounts.
   *
   * `compactMoney` already draws the line the product owner asked for: BELOW a million it returns
   * `formatMoney`'s exact output, cents and all, and only at or above one does it scale. So
   * "abbreviate once the amount passes ฿1,000,000" is the helper's existing behaviour rather than a
   * threshold added here — and the suffix is an i18n key ("M"/"B" in English, ล้าน/พันล้าน in Thai),
   * which is why this goes through `compactMoneyLabel` and not through a hardcoded letter.
   *
   * THE CURRENCY IS ASSUMED THB, exactly as the project cards' `formatMoney` assumes it and for the
   * same reason: `/analytics/executive` returns no currency field. See the header.
   */
  const compact = (value: Decimal | null): string =>
    // `maxScale: 'million'` so the hero and its ACTUAL line share one unit — a budget in B beside an
    // actual in M is two units in one card, and the eye cannot compare them (PO 2026-09-07).
    value === null ? '—' : compactMoneyLabel(value, 'THB', t, { maxScale: 'million' });
  const byId = useMemo(() => new Map(rows.map((r) => [r.projectId, r])), [rows]);

  return (
    <Screen testID="home-screen" scroll>
      {/* The drawing's "AI Executive Intelligence" panel — the real endpoint, in the drawing's own
          card: `variant="executive"` gives it the cyan border and the 3px edge, and the two buttons
          go INSIDE it through the footer slot, where the drawing puts them. */}
      <PortfolioInsight
        projectId={mine[0]?.project_id ?? ''}
        projectLabel={mine[0]?.project_name}
        titleKey="exec.home.intelligence"
        icon="bolt"
        variant="executive"
        autoRun
        footer={
          // Drawn, and they say they do not work — see the header.
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
                <Text
                  style={[
                    styles.actionText,
                    action === 'mitigation' ? styles.actionTextPrimary : null,
                  ]}
                >
                  {t(`exec.home.${action}`)}
                </Text>
              </Pressable>
            ))}
          </View>
        }
      />

      <KpiRegion loading={loading} settled={settled} steps={LOAD_STEPS}>
        <View style={styles.tileRow}>
          {/* THE CHEVRON SITS ON THE CARD, NOT IN THE HEADER ROW (PO 2026-09-07): vertically centred
              against the whole tile at its trailing edge, so the two tiles' marks line up with each
              other rather than with their own eyebrows. Decorative, as before — it names no
              destination — so it stays out of the accessibility tree. */}
          <View testID="kpi-active-projects" style={[styles.card, styles.tile]}>
            <View style={styles.tileBody}>
              {/* GLYPH FIRST, then the label — the shape every other KPI tile in this role already
                  uses (`ExecTasks`' OVERDUE / THIS WEEK, `safety.tsx`'s two tiles): a 20px mark, one
                  `spacing.xs` gap, then the word. It read the other way round here alone, which is
                  what made these two cards look like a different component (PO 2026-09-07). */}
              <View style={styles.tileHead}>
                <MaterialIcons name="precision-manufacturing" size={20} color={p.accent} />
                <Text style={[styles.eyebrow, styles.tileHeadLabel]} numberOfLines={1}>
                  {t('exec.home.activeProjects')}
                </Text>
              </View>
              <Text style={styles.tileValue}>{String(activeCount)}</Text>
              <View style={styles.deltaRow}>
                <MaterialIcons name="arrow-upward" size={14} color={p.success} />
                <Text style={styles.delta}>
                  {t('exec.home.thisMonth', { value: ACTIVE_PROJECTS_DELTA.value })}
                </Text>
              </View>
            </View>
            <MaterialIcons
              name="chevron-right"
              size={18}
              color={p.muted}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
          </View>

          <View testID="kpi-risk-alerts" style={[styles.card, styles.tile]}>
            <View style={styles.tileBody}>
              <View style={styles.tileHead}>
                <MaterialIcons name="warning" size={20} color={p.danger} />
                <Text style={[styles.eyebrow, styles.tileHeadLabel]} numberOfLines={1}>
                  {t('exec.home.riskAlerts')}
                </Text>
              </View>
              {/* A PLAIN COUNT — no `padStart(2, '0')` (PO 2026-09-07). The zero-padded "05" was the
                  drawing's own typography, and it reads as a code or a rank rather than as a number
                  of things. The em dash stays: it is "we could not ask", which is not zero.
                  NO UNIT EITHER (PO 2026-09-07): the heading above the figure already names what is
                  counted, and "5 Alerts" under "RISKS" said it twice. */}
              <Text style={styles.tileValue}>{rows.length === 0 ? '—' : String(risk.total)}</Text>
              <Text style={styles.tileNote}>
                {t('exec.home.riskSplit', { critical: risk.critical, warning: risk.warning })}
              </Text>
            </View>
            <MaterialIcons
              name="chevron-right"
              size={18}
              color={p.muted}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
          </View>
        </View>

        {/* Portfolio budget hero. */}
        <View testID="kpi-budget" style={[styles.card, styles.hero]}>
          <View style={styles.heroHead}>
            <View>
              <Text style={styles.eyebrow}>{t('exec.home.portfolioBudget')}</Text>
              <Text style={styles.heroValue}>{compact(budget)}</Text>
            </View>
            <View style={styles.heroPlate}>
              <MaterialIcons name="account-balance-wallet" size={20} color={p.accent} />
            </View>
          </View>
          <View style={styles.heroLabels}>
            <Text style={styles.eyebrow}>{t('exec.home.actual', { value: compact(actual) })}</Text>
            <Text style={styles.eyebrow}>
              {remainingPct === null
                ? t('exec.home.remainingUnknown')
                : t('exec.home.remaining', { value: remainingPct.toFixed(1) })}
            </Text>
          </View>
          {/* TWO SEGMENTS, not one (PO 2026-09-07, the replacement drawing). The bar was a single
              accent fill sized to `remainingPct`, and that is ambiguous in the way that matters:
              a filled bar reads as consumed, so a portfolio with 44.6% left LOOKED 44.6% spent —
              the exact opposite of the truth, and the two figures above it are the only thing that
              said otherwise. The drawing splits the track: accent for what is SPENT, then a dimmed
              blue remainder, and the pair always fills the track exactly.
              `flexDirection: 'row'` with two widths in percent, so the segments cannot drift apart
              at any screen width; the track's `overflow: 'hidden'` keeps the ends inside the radius.
              WHEN THERE IS NOTHING TO DIVIDE BY the track stays empty rather than drawing a full or
              an empty bar — `remainingPct` is null when the portfolio has no budget, and both
              readings of a bar would be a claim the data does not support. */}
          <View style={styles.track}>
            {remainingPct === null ? null : (
              <>
                <View
                  testID="kpi-budget-bar"
                  style={[styles.fill, { width: `${100 - remainingPct}%` }]}
                />
                <View
                  testID="kpi-budget-bar-remaining"
                  style={[styles.fillRemaining, { width: `${remainingPct}%` }]}
                />
              </>
            )}
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
  const p = palette;
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
        {/* The drawing's bordered status pill: a 1px edge and a 10% fill in the status colour, so
            the word reads as a chip rather than as coloured text. Radius stays radius.xl — every
            badge in this app takes it, a platform ruling that deliberately overrides the drawing's
            `rounded-sm` (.claude/rules/design-tokens.md). */}
        <View
          style={[styles.badgePill, { borderColor: `${stripe}33`, backgroundColor: `${stripe}1A` }]}
        >
          <Text style={[styles.badge, { color: stripe }]}>{t(`exec.home.${statusKey}`)}</Text>
        </View>
        {/* The drawing's trailing chevron. Decorative: the whole card is already the target, and a
            second focusable element for the same action is one more stop for a screen reader. */}
        <MaterialIcons
          name="chevron-right"
          size={20}
          color={p.muted}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
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
    actionPrimary: { borderColor: `${p.accent}66`, backgroundColor: `${p.accent}1A` },
    actionText: {
      fontSize: typography.label.fontSize,
      fontFamily: fontFamily.semibold,
      color: p.text,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    // The drawing's Mitigation button is cyan on a cyan tint; Dismiss stays the ordinary ink.
    actionTextPrimary: { color: p.accent },

    tileRow: { flexDirection: 'row', gap: spacing.sm },
    // The card is now a ROW — its content, then the chevron centred against the full height.
    tile: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.xs / 2 },
    tileBody: { flex: 1, gap: spacing.xs / 2 },
    // The eyebrow takes the row's spare width so the header glyph is pushed to the tile's trailing
    // edge (PO 2026-09-07). `justifyContent: 'space-between'` alone left the glyph sitting against
    // the end of a short label rather than against the card, so the two tiles' glyphs did not line
    // up with each other.
    // `gap: spacing.xs` — the same one `ExecTasks` and `safety.tsx` put between a tile's glyph and
    // its label. The earlier no-gap version was for the reversed order, where the label's `flex: 1`
    // did the separating; with the glyph in front the gap is what separates them.
    tileHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    tileHeadLabel: { flex: 1 },
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
    track: {
      height: 6,
      borderRadius: radius.sm,
      backgroundColor: p.elevated,
      overflow: 'hidden',
      flexDirection: 'row',
    },
    fill: { height: '100%', backgroundColor: p.accent },
    // The remainder. `primary` at 40% — the drawing's `bg-cos-blue/40` — so it reads as part of the
    // same bar rather than as a second measurement; the track colour underneath is what would show
    // if the two segments ever failed to fill it.
    fillRemaining: { height: '100%', backgroundColor: `${p.primary}66` },

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
    // `alignItems: 'center'`, not the default stretch: a flex child with no explicit height fills the
    // row, so the status pill grew to the full height of the two-line title block and drew a tall
    // rounded box around one word. The drawing hugs the text.
    projectHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
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
    badgePill: {
      paddingHorizontal: spacing.xs,
      paddingVertical: 2,
      borderRadius: radius.xl,
      borderWidth: 1,
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

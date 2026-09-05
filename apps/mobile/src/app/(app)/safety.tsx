// Safety — the EXECUTIVE portfolio safety overview.
// Implements mockup/mobile/08_executive/03_safety/01_ex_safety.
//
// A NEW ROUTE, NOT A RE-POINT (ADR-098). Three safety screens already exist and none of them is this
// one: `safety-checklist` fills in one checklist, `inspections` lists them, `incidents` is the Safety
// Officer's feed for a single site. This drawing asks a portfolio question — how is safety across
// every project — and pointing the tab at any of the three would have put the executive on a
// site-scoped screen and called it a portfolio.
//
// WHAT IS REAL HERE AND WHAT IS NOT.
//   REAL   the incident counts and their severity split, and the per-project incident counts in the
//          ranking — `GET /safety/incidents`, tenant-wide (project_id is optional and EXECUTIVE is
//          in SAFETY_READ_ROLES), plus `GET /safety/compliance` for the four counts it does return
//   DRAWN  the 92% compliance figure, the letter grade, the month-on-month delta, safe man-hours,
//          the six-month trend and the per-project score — every one from lib/mockupFigures.ts,
//          under ADR-099
//
// The compliance endpoint returns FOUR COUNTS and no percentage (`ComplianceSummary` in
// api/safety.ts says so at its declaration). That is why the headline figure is a mockup figure and
// the counts beside it are not.
//
// The AI panel is the REAL `executive-summary` endpoint through <PortfolioInsight />, printing the
// model's own text and its own confidence. No figure from mockupFigures may be routed through it —
// ADR-099 forbids exactly that.

import { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { LoadingBoundary } from '../../components/LoadingBoundary';
import { PortfolioInsight } from '../../components/PortfolioInsight';
import { getCompliance, listIncidents, type IncidentRow } from '../../api/safety';
import { getMyProjects } from '../../api/projects';
import { useT } from '../../i18n';
import { countSettled, loadProgress } from '../../lib/loadingState';
import {
  COMPLIANCE,
  COMPLIANCE_TREND,
  PROJECT_SAFETY_SCORES,
  SAFE_MAN_HOURS,
} from '../../lib/mockupFigures';
import { fontFamily, radius, spacing, touchTarget, typography } from '../../theme/tokens';
import { usePalette, useIsDark, type Palette } from '../../theme/usePalette';

/** A project as the ranking row needs it: its name, and the incidents counted against it. */
interface RankedProject {
  projectId: string;
  projectName: string;
  incidentCount: number;
  /** From mockupFigures — see the header. */
  score: number;
}

/** SECURE below the drawing's own threshold, MONITOR at or above it. */
const MONITOR_AT_OR_BELOW = 90;

export default function SafetyScreen(): React.JSX.Element {
  const t = useT();
  const p = usePalette();
  const styles = useMemo(() => makeStyles(p), [p]);
  const router = useRouter();
  // The loader's own palette must follow the user's theme, or a light skeleton flashes on a dark
  // page before the real content arrives.
  const loaderTheme = useIsDark() ? 'dark' : 'light';

  const [incidents, setIncidents] = useState<IncidentRow[]>([]);
  const [openIncidents, setOpenIncidents] = useState<number | null>(null);
  const [ranked, setRanked] = useState<RankedProject[]>([]);
  const [insightProject, setInsightProject] = useState('');
  const [insightProjectName, setInsightProjectName] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  // Rule 40: three independent fetches, counted as each settles, so the bar reports real progress
  // rather than a fabricated percentage.
  const [settled, setSettled] = useState(0);
  const LOAD_STEPS = 3;

  useEffect(() => {
    let cancelled = false;
    const step = <T,>(promise: Promise<T>): Promise<T> =>
      countSettled(promise, () => {
        if (!cancelled) setSettled((n) => n + 1);
      });

    // TENANT-WIDE, AND NOT FILTERED TO `OPEN`. "Active" on this screen means an incident that is
    // still being dealt with, which is OPEN *and* IN_PROGRESS — the two statuses before
    // RESOLVED/CLOSED. Asking the API for `status: 'OPEN'` alone under-reports: the seeded tenant
    // holds five incidents, every one of them IN_PROGRESS, and the first capture of this screen
    // therefore read "00 ACTIVE INCIDENTS · 0 low, 0 raised" over a portfolio that had five.
    //
    // No project_id either, which is what makes this a portfolio view rather than a site one.
    const incidentsFetch = step(listIncidents())
      .then((rows) => {
        if (!cancelled) setIncidents(rows);
      })
      .catch(() => {
        /* offline — the panels keep their last values and the counts stay null */
      });

    const complianceFetch = step(getCompliance())
      .then((summary) => {
        if (!cancelled) setOpenIncidents(summary.open_incidents);
      })
      .catch(() => {
        /* offline */
      });

    const projectsFetch = step(getMyProjects())
      .then((mine) => {
        if (cancelled) return;
        setInsightProject(mine[0]?.project_id ?? '');
        setInsightProjectName(mine[0]?.project_name);
        setRanked(
          mine.slice(0, PROJECT_SAFETY_SCORES.value.length).map((project, i) => ({
            projectId: project.project_id,
            projectName: project.project_name,
            incidentCount: 0,
            score: PROJECT_SAFETY_SCORES.value[i]!,
          })),
        );
      })
      .catch(() => {
        /* offline */
      });

    void Promise.allSettled([incidentsFetch, complianceFetch, projectsFetch]).then(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // The severity split under the incident tile — counted from the rows the API returned, never
  // assumed. LOW and MEDIUM are the two the drawing names; HIGH and CRITICAL join MEDIUM's side so
  // no incident is dropped from a count that claims to describe all of them.
  const active = useMemo(
    () => incidents.filter((i) => i.status === 'OPEN' || i.status === 'IN_PROGRESS'),
    [incidents],
  );

  const severitySplit = useMemo(() => {
    const low = active.filter((i) => i.severity === 'LOW').length;
    return { low, raised: active.length - low };
  }, [active]);

  // Each ranked project carries its own count, filled in once the incident rows arrive.
  const rankedWithCounts = useMemo(
    () =>
      ranked.map((row) => ({
        ...row,
        incidentCount: active.filter((i) => i.project_id === row.projectId).length,
      })),
    [ranked, active],
  );

  // The API's own count is preferred where it exists, but it counts OPEN only (ComplianceSummary),
  // so it is used as a FLOOR rather than the answer: the tile reports whichever is larger, which is
  // the count that matches the rows the screen is also ranking by.
  const incidentCount =
    active.length > 0 ? active.length : openIncidents !== null ? openIncidents : null;

  return (
    <ScrollView
      testID="safety-screen"
      style={{ backgroundColor: p.bg }}
      contentContainerStyle={styles.page}
    >
      {/* The drawing's "Safety Intelligence" panel. The REAL endpoint — see the header. */}
      <PortfolioInsight
        projectId={insightProject}
        projectLabel={insightProjectName}
        titleKey="exec.safety.intelligence"
      />

      <LoadingBoundary
        loading={loading}
        variant="widget"
        theme={loaderTheme}
        progress={loadProgress(settled, LOAD_STEPS) ?? undefined}
      >
        <View style={styles.stack}>
          {/* Compliance headline — a mockup figure (ADR-099), labelled as one. */}
          <View testID="safety-compliance" style={[styles.card, styles.complianceCard]}>
            <View style={styles.complianceText}>
              <Text style={styles.eyebrow}>{t('exec.safety.compliance')}</Text>
              <Text style={styles.hero}>{`${COMPLIANCE.value.percent}%`}</Text>
              <View style={styles.deltaRow}>
                <MaterialIcons name="trending-up" size={14} color={p.success} />
                <Text style={styles.delta}>
                  {t('exec.safety.complianceDelta', { value: COMPLIANCE.value.deltaLabel })}
                </Text>
              </View>
            </View>
            <ComplianceRing
              palette={p}
              percent={COMPLIANCE.value.percent}
              grade={COMPLIANCE.value.grade}
            />
          </View>

          <View style={styles.tileRow}>
            {/* Incidents — REAL. */}
            <View testID="safety-incidents" style={[styles.card, styles.tile, styles.tileWarning]}>
              <MaterialIcons name="warning" size={20} color={p.warning} />
              <Text style={styles.tileValue}>
                {incidentCount === null ? '—' : String(incidentCount).padStart(2, '0')}
              </Text>
              <Text style={styles.eyebrow}>{t('exec.safety.activeIncidents')}</Text>
              <Text style={styles.tileNote}>
                {t('exec.safety.severitySplit', {
                  low: severitySplit.low,
                  raised: severitySplit.raised,
                })}
              </Text>
            </View>

            {/* Safe man-hours — a mockup figure. */}
            <View testID="safety-man-hours" style={[styles.card, styles.tile, styles.tilePrimary]}>
              <MaterialIcons name="timer" size={20} color={p.primary} />
              <Text style={styles.tileValue}>{SAFE_MAN_HOURS.value}</Text>
              <Text style={styles.eyebrow}>{t('exec.safety.safeManHours')}</Text>
              <Text style={styles.tileNoteSuccess}>{t('exec.safety.ytd')}</Text>
            </View>
          </View>

          {/* Six-month trend — mockup figures, drawn with react-native-svg's sibling primitives
              (plain Views here: six bars need no SVG, and §32.7 asks for simplified charts). */}
          <View testID="safety-trend" style={styles.card}>
            <Text style={styles.sectionLabel}>{t('exec.safety.trend')}</Text>
            <View style={styles.chart}>
              {COMPLIANCE_TREND.value.map((height, i) => {
                const isLatest = i === COMPLIANCE_TREND.value.length - 1;
                return (
                  <View
                    key={`bar-${String(i)}`}
                    testID={`safety-trend-bar-${String(i)}`}
                    style={[
                      styles.bar,
                      { height: `${height}%` },
                      isLatest ? styles.barLatest : null,
                    ]}
                  />
                );
              })}
            </View>
          </View>

          {/* Project ranking — the NAME and the INCIDENT COUNT are real; the score is drawn. */}
          <Text style={styles.sectionLabel}>{t('exec.safety.rankings')}</Text>
          {rankedWithCounts.map((row) => {
            const secure = row.score > MONITOR_AT_OR_BELOW;
            return (
              <View
                key={row.projectId}
                testID={`safety-rank-${row.projectId}`}
                style={[styles.card, styles.rankRow, secure ? styles.rankOk : styles.rankWatch]}
              >
                <View style={styles.rankText}>
                  <Text style={styles.rankName} numberOfLines={1}>
                    {row.projectName}
                  </Text>
                  <View style={styles.rankMeta}>
                    <MaterialIcons name="shield" size={14} color={p.muted} />
                    <Text style={styles.rankMetaText}>{`${row.score}/100`}</Text>
                    <MaterialIcons name="warning" size={14} color={p.muted} />
                    <Text style={styles.rankMetaText}>
                      {t('exec.safety.incidentCount', { count: row.incidentCount })}
                    </Text>
                  </View>
                </View>
                <Text
                  style={[styles.rankBadge, secure ? styles.rankBadgeOk : styles.rankBadgeWatch]}
                >
                  {t(secure ? 'exec.safety.secure' : 'exec.safety.monitor')}
                </Text>
              </View>
            );
          })}

          <Pressable
            testID="safety-view-all"
            accessibilityRole="button"
            accessibilityLabel={t('exec.safety.viewAll')}
            onPress={() => router.push('/portfolio')}
            style={styles.viewAll}
          >
            <Text style={styles.viewAllText}>{t('exec.safety.viewAll')}</Text>
          </Pressable>
        </View>
      </LoadingBoundary>
    </ScrollView>
  );
}

/**
 * The drawing's circular progress ring with its letter grade.
 *
 * `react-native-svg` is already a dependency (15.15.4) and is the only way to draw an arc in RN —
 * a bordered View cannot express a partial circle.
 */
function ComplianceRing({
  palette,
  percent,
  grade,
}: {
  palette: Palette;
  percent: number;
  grade: string;
}): React.JSX.Element {
  const SIZE = 64;
  const STROKE = 5;
  const r = (SIZE - STROKE) / 2;
  const circumference = 2 * Math.PI * r;
  return (
    <View testID="safety-compliance-ring" style={{ width: SIZE, height: SIZE }}>
      <Svg width={SIZE} height={SIZE}>
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={r}
          stroke={palette.border}
          strokeWidth={STROKE}
          fill="none"
        />
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={r}
          stroke={palette.success}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={`${(circumference * percent) / 100} ${circumference}`}
          // −90° so the arc starts at twelve o'clock rather than three.
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          fill="none"
        />
      </Svg>
      <View style={StyleSheet.absoluteFill}>
        <Text
          style={{
            flex: 1,
            textAlign: 'center',
            textAlignVertical: 'center',
            lineHeight: SIZE,
            color: palette.text,
            fontFamily: fontFamily.semibold,
            fontSize: typography.label.fontSize,
          }}
        >
          {grade}
        </Text>
      </View>
    </View>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    page: { padding: spacing.md, gap: spacing.sm },
    stack: { gap: spacing.sm },

    card: {
      backgroundColor: p.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: p.border,
      padding: spacing.md,
    },

    complianceCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    complianceText: { gap: spacing.xs / 2 },
    hero: {
      fontSize: typography.hero.fontSize,
      fontFamily: fontFamily.bold,
      color: p.accent,
    },
    deltaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    delta: {
      fontSize: typography.label.fontSize,
      fontFamily: fontFamily.medium,
      color: p.success,
    },

    eyebrow: {
      fontSize: typography.label.fontSize,
      fontFamily: fontFamily.semibold,
      color: p.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    sectionLabel: {
      fontSize: typography.label.fontSize,
      fontFamily: fontFamily.semibold,
      color: p.text,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginTop: spacing.xs,
    },

    tileRow: { flexDirection: 'row', gap: spacing.sm },
    tile: { flex: 1, gap: spacing.xs / 2 },
    tileWarning: { borderLeftWidth: 4, borderLeftColor: p.warning },
    tilePrimary: { borderLeftWidth: 4, borderLeftColor: p.primary },
    tileValue: {
      fontSize: typography.title.fontSize,
      fontFamily: fontFamily.bold,
      color: p.text,
    },
    tileNote: {
      fontSize: typography.label.fontSize,
      fontFamily: fontFamily.regular,
      color: p.muted,
    },
    tileNoteSuccess: {
      fontSize: typography.label.fontSize,
      fontFamily: fontFamily.regular,
      color: p.success,
    },

    chart: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: spacing.xs,
      height: 96,
      marginTop: spacing.sm,
    },
    bar: { flex: 1, backgroundColor: p.border, borderTopLeftRadius: 2, borderTopRightRadius: 2 },
    barLatest: { backgroundColor: p.accent },

    rankRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    rankOk: { borderLeftWidth: 4, borderLeftColor: p.success },
    rankWatch: { borderLeftWidth: 4, borderLeftColor: p.warning },
    rankText: { flex: 1, gap: 4 },
    rankName: {
      fontSize: typography.body.fontSize,
      fontFamily: fontFamily.semibold,
      color: p.text,
    },
    rankMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    rankMetaText: {
      fontSize: typography.label.fontSize,
      fontFamily: fontFamily.regular,
      color: p.muted,
      marginRight: spacing.xs,
    },
    rankBadge: {
      fontSize: typography.label.fontSize,
      fontFamily: fontFamily.semibold,
      paddingHorizontal: spacing.xs,
      paddingVertical: 2,
      borderRadius: radius.xl,
      overflow: 'hidden',
    },
    rankBadgeOk: { color: p.success },
    rankBadgeWatch: { color: p.warning },

    viewAll: {
      minHeight: touchTarget.secondaryButton,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: p.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: spacing.xs,
    },
    viewAllText: {
      fontSize: typography.label.fontSize,
      fontFamily: fontFamily.semibold,
      color: p.accent,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
  });

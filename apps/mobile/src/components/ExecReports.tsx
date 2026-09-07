// ExecReports — the EXECUTIVE half of /reports.
// Implements mockup/mobile/08_executive/04_report/01_ex_report.
//
// A TAB AGAIN since 2026-09-07 (ADR-098 as amended): the replacement executive mockup set made
// `04_report` the role's fourth tab. NO NEW ROUTE WAS ADDED FOR IT — the screen that drawing draws
// is the AI executive summary `/reports` already rendered for this role, in a styled form, and two
// routes for one screen is the mistake `dashboard` and `home` made.
//
// WHAT WAS HERE BEFORE was a project picker, a GENERATE button and a paragraph, in the STATIC LIGHT
// palette. It is the last executive surface that had never been drawn.
//
// WHY NOT `<PortfolioInsight />`, which wraps the very same endpoint. That component owns its report
// internally and renders ONE card. This drawing spends the same report across THREE places — the
// brief's prose, the CRITICAL row's AI flag, and the Strategic Recommendations list — so the screen
// has to hold the report itself. That is a composition difference, not a styling one, which is the
// case ADR-085 keeps separate; `<ExecRiskAlerts />` made the same call on 2026-09-05 for the same
// reason. Every reading of the report goes through the SAME helpers the panel uses
// (`summaryText`, `confidenceBand`, `confidencePercent`, `recommendationList`), so the two surfaces
// cannot disagree about what a report says.
//
// WHAT IS REAL.
//   The brief's prose      `POST /ai/reports/executive-summary` — the model's own text, its own
//                          confidence, through the shared helpers.
//   Recommendations        `recommendations` on that report. The plan for this screen assumed they
//                          would have to be drawn; they are a real field (api/ai.ts), so they are
//                          the model's own advice and the section prints all of them rather than
//                          the one line a dashboard panel shows.
//   The AI flag            `risk_flags` on the same report, and it appears on ONE row — the project
//                          the report is about. A flag copied onto every card would attribute a
//                          finding to projects the model never looked at.
//   Per-row confidence     the same report's confidence, on that same one row, for the same reason.
//   The three tabs         counts over `GET /analytics/executive` through `executiveSeverityOf`.
//   Row order              worst first, by the same severity rank the risk feed sorts on.
//   Budget utilisation     `utilizationPct`, and the gap above 100 that the drawing calls a
//                          "Budget Gap".
//   Re-analyse             generates the report again. It is the drawing's "วิเคราะห์ใหม่" and it
//                          is the one control on this screen that does exactly what it says.
//
// THE REPORT IS PER PROJECT AND THIS SCREEN IS A PORTFOLIO. `ExecutiveSummaryRequest` requires a
// `project_id`, so the brief reports on the FIRST of the executive's projects and NAMES it — the
// resolution `more.tsx` reached on 2026-08-11 and `ExecTasks` reached for the critical path. The
// drawing's own copy ("ภาพรวมโครงการทั้งหมด 14 โครงการ") presents one report as a portfolio
// statement, and that is the one thing this screen must not do.
//
// WHAT IS DRAWN (lib/mockupFigures.ts, ADR-099): the three strategic metrics under the brief, and
// the "Export Portfolio PDF" button, which says so on tap (the `more.tsx` convention).
//
// WHAT THE DRAWING ASKS FOR THAT IS NOT HERE, each with its reason.
//   A prose summary per row   The drawing writes a paragraph under every project. That is one AI
//                             report per project — the fan-out `GET /tasks/portfolio-summary` was
//                             built to avoid, and worse here because each one is a metered LLM call
//                             (§26). The row carries the figures instead, and the prose stays where
//                             one report can honestly cover it.
//   "ดูรายงานฉบับเต็ม ›"       There is no full-report screen to open. `/ai/reports/history` returns
//                             METADATA only — report_id, confidence, created_at — so nothing can
//                             re-display a past report's text, which is also why `<InsightPanel />`
//                             regenerates rather than fetching. A link to nothing is worse than no
//                             link on a screen whose whole subject is a document.
//   The "W47-LIVE" chip       A week number is computable; "LIVE" is a claim about a data feed that
//                             does not exist. The heading carries neither rather than half of one.
//   "Acknowledge & Direct"    DRAWN, and it must never write: master §Phase 10 makes this role
//                             READ-ONLY on mobile, and there is no acknowledgement endpoint.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Alert } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LoadingBoundary } from './LoadingBoundary';
import { LoadingState } from './LoadingState';
import { generateExecutiveSummary, type AiReport } from '../api/ai';
import { getMyProjects, type MyProject } from '../api/projects';
import {
  EXECUTIVE_SEVERITY_RANK,
  executiveSeverityOf,
  getExecutiveDashboard,
  type ExecutiveDashboardRow,
} from '../api/analytics';
import { confidenceBand, confidencePercent, type ConfidenceBand } from '../lib/aiConfidence';
import { recommendationList } from '../lib/insightAdvice';
import { summaryText } from './InsightPanel';
import { decodeJwtPayload } from '../lib/jwt';
import { useAuthStore } from '../store/authStore';
import { useT } from '../i18n';
import { countSettled, loadProgress } from '../lib/loadingState';
import {
  PROJECT_CONTRACT_CODES,
  PROJECT_LOCATIONS,
  REPORT_STRATEGIC_METRICS,
} from '../lib/mockupFigures';
import { fontFamily, plateRadius, radius, spacing, touchTarget, typography } from '../theme/tokens';
import { usePalette, useIsDark, type Palette } from '../theme/usePalette';

/** Same map every other AI surface keeps, so one band word never reads two ways in one product. */
const BAND_LABEL: Record<ConfidenceBand, string> = {
  HIGH: 'insight.bandHigh',
  MEDIUM: 'insight.bandMedium',
  LOW: 'insight.bandLow',
  UNKNOWN: 'insight.bandUnknown',
};

/**
 * The three tabs, and the two bands they partition the portfolio into.
 *
 * THE DRAWING LABELS THE MIDDLE TAB "วิกฤต" (critical) and this calls it "needs attention", because
 * `executiveSeverityOf` returns four values and only ONE of them is CRITICAL. Labelling the tab
 * critical while it also collected HIGH and MEDIUM would overstate them; leaving HIGH and MEDIUM out
 * of both tabs would make a project reachable from "all" alone, which is worse — a filter a project
 * can hide behind is how something gets missed.
 */
type Tab = 'all' | 'attention' | 'onTrack';
const TABS: readonly Tab[] = ['all', 'attention', 'onTrack'];

/** The badge the drawing puts at the top-right of each row. */
type RowBand = 'critical' | 'monitor' | 'secure';

function rowBand(row: ExecutiveDashboardRow): RowBand {
  const severity = executiveSeverityOf(row);
  if (severity === 'CRITICAL') return 'critical';
  if (severity === 'HIGH' || severity === 'MEDIUM') return 'monitor';
  return 'secure';
}

function bandTone(band: RowBand, p: Palette): string {
  if (band === 'critical') return p.danger;
  if (band === 'monitor') return p.warning;
  return p.success;
}

export function ExecReports(): React.JSX.Element {
  const t = useT();
  const p = usePalette();
  const isDark = useIsDark();
  const styles = useMemo(() => makeStyles(p), [p]);
  const token = useAuthStore((s) => s.accessToken);
  const userId = useAuthStore((s) => s.userId);

  const [mine, setMine] = useState<MyProject[]>([]);
  const [rows, setRows] = useState<ExecutiveDashboardRow[]>([]);
  const [report, setReport] = useState<AiReport | null>(null);
  const [reporting, setReporting] = useState(false);
  const [reportFailed, setReportFailed] = useState(false);
  const [tab, setTab] = useState<Tab>('all');
  const [loading, setLoading] = useState(true);
  // Rule 40 — one counted step. The analytics call cannot start until the project list answers (it
  // needs the ids), so there is only one independent thing to wait for and `loadProgress` returns
  // null below two, giving an indeterminate loader rather than a percentage stuck at 0.
  const [settled, setSettled] = useState(0);
  const LOAD_STEPS = 1;

  useEffect(() => {
    let cancelled = false;
    const step = <T,>(promise: Promise<T>): Promise<T> =>
      countSettled(promise, () => {
        if (!cancelled) setSettled((n) => n + 1);
      });

    const load = step(getMyProjects())
      .then(async (projects) => {
        if (cancelled) return;
        setMine(projects);
        // THE IDS ARE REQUIRED. `/analytics/executive` filters `project_id IN ({projectIds})` and
        // the controller turns a missing parameter into an empty array, so a call without them
        // answers 200 with [] — the defect that made three screens look empty against a real
        // backend. That makes the two calls sequential rather than parallel.
        const fetched = await getExecutiveDashboard(projects.map((project) => project.project_id));
        if (!cancelled) setRows(fetched);
      })
      .catch(() => {
        /* offline — the rows stay empty and every figure reads as unavailable */
      });

    void load.then(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /** The project the report is about — the first of the executive's, and it is NAMED wherever used. */
  const subject = mine[0];

  const run = useCallback(async () => {
    // The tenant the gateway trusts comes from the token it verifies; this claim only fills the
    // required body field, and reading it from the same token is what keeps the two consistent.
    const tenantId = String(decodeJwtPayload(token ?? '')['tenant_id'] ?? '');
    if (subject === undefined || tenantId === '') return;
    setReporting(true);
    setReportFailed(false);
    try {
      setReport(
        await generateExecutiveSummary({
          projectId: subject.project_id,
          tenantId,
          // The audit row says which executive asked, not "system" — see api/ai.ts. `userId` is null
          // before the profile lands, and the gateway's own default covers that.
          ...(userId === null ? {} : { generatedBy: userId }),
        }),
      );
    } catch {
      setReport(null);
      setReportFailed(true);
    } finally {
      setReporting(false);
    }
  }, [subject, token, userId]);

  // GENERATED ON MOUNT, not on a press. The drawing is a report that is already written, and a page
  // whose subject is a document cannot open empty with a button on it. The cost is the one
  // `InsightPanel.autoRun` documents: §26 meters AI per tenant, so this bills on every visit to the
  // tab. Once per mount, and only once a project has arrived — the ref is what holds that when the
  // project list lands after the first paint.
  const started = useRef(false);
  useEffect(() => {
    if (started.current || subject === undefined) return;
    started.current = true;
    void run();
  }, [subject, run]);

  const nameById = useMemo(
    () => new Map(mine.map((project) => [project.project_id, project.project_name])),
    [mine],
  );
  /** Drawn per-row figures are indexed by the project's position in the ORIGINAL list, not the
      sorted one, so a card keeps its contract number when the sort or the filter changes. */
  const positionById = useMemo(
    () => new Map(mine.map((project, index) => [project.project_id, index])),
    [mine],
  );

  const counts = useMemo(() => {
    const tally: Record<Tab, number> = { all: rows.length, attention: 0, onTrack: 0 };
    for (const row of rows) {
      if (rowBand(row) === 'secure') tally.onTrack += 1;
      else tally.attention += 1;
    }
    return tally;
  }, [rows]);

  const shown = useMemo(() => {
    const matched = rows.filter((row) => {
      if (tab === 'all') return true;
      const band = rowBand(row);
      return tab === 'onTrack' ? band === 'secure' : band !== 'secure';
    });
    // A COPY, then sort: `rows` is state and sorting it in place would mutate what React is holding.
    return [...matched].sort(
      (a, b) =>
        EXECUTIVE_SEVERITY_RANK[executiveSeverityOf(b)] -
        EXECUTIVE_SEVERITY_RANK[executiveSeverityOf(a)],
    );
  }, [rows, tab]);

  const band = report === null ? null : confidenceBand(report.confidence, report.low_confidence);
  const percent = report === null ? null : confidencePercent(report.confidence);
  const prose = report === null ? null : summaryText(report.content);
  const recommendations = report === null ? [] : recommendationList(report.content);
  const flags = report === null ? [] : recommendationRisks(report.content);

  const soon = (labelKey: string): void => {
    Alert.alert(t(labelKey), t('more.comingSoon'));
  };

  return (
    <ScrollView
      testID="exec-reports-screen"
      style={{ backgroundColor: p.bg }}
      contentContainerStyle={styles.page}
    >
      <View>
        <Text style={styles.heading} accessibilityRole="header">
          {t('exec.reports.heading')}
        </Text>
        <Text style={styles.subtitle}>{t('exec.reports.subtitle')}</Text>
      </View>

      {/* Control bar — the tabs and the one control that does what it says. */}
      <View style={styles.controls}>
        <View style={styles.tabs}>
          {TABS.map((key) => {
            const active = tab === key;
            return (
              <Pressable
                key={key}
                testID={`exec-reports-tab-${key}`}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={t(`exec.reports.filter.${key}`)}
                onPress={() => setTab(key)}
                style={[styles.tab, active && { backgroundColor: p.primary }]}
              >
                <Text style={[styles.tabText, active && { color: p.onPrimary }]}>
                  {key === 'all'
                    ? t('exec.reports.filter.all')
                    : `${t(`exec.reports.filter.${key}`)} (${counts[key]})`}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Pressable
          testID="exec-reports-reanalyse"
          accessibilityRole="button"
          accessibilityLabel={t('exec.reports.reanalyse')}
          accessibilityState={{ disabled: reporting || subject === undefined }}
          disabled={reporting || subject === undefined}
          onPress={() => void run()}
          style={[styles.reanalyse, (reporting || subject === undefined) && styles.disabled]}
        >
          <MaterialIcons name="sync" size={16} color={p.accent} />
          <Text style={styles.reanalyseText}>{t('exec.reports.reanalyse')}</Text>
        </Pressable>
      </View>

      {/* ── AI Strategic Brief ──────────────────────────────────────────────────────────────── */}
      <View testID="exec-reports-brief" style={styles.brief}>
        <View style={styles.briefHead}>
          <View style={styles.briefHeadLeft}>
            <View style={styles.plate}>
              <MaterialIcons name="psychology" size={16} color={p.accent} />
            </View>
            <View style={styles.briefTitles}>
              <Text style={styles.eyebrow}>{t('exec.reports.brief')}</Text>
              <Text style={styles.briefTitle}>{t('exec.reports.briefSubtitle')}</Text>
            </View>
          </View>
          {band === null ? null : (
            <View testID="exec-reports-confidence" style={styles.confChip}>
              <Text style={styles.confText}>
                {percent === null ? t(BAND_LABEL[band]) : t('insight.conf', { value: percent })}
              </Text>
            </View>
          )}
        </View>

        {reporting ? (
          <LoadingState
            testID="exec-reports-loading"
            variant="ai"
            theme={isDark ? 'dark' : 'light'}
          />
        ) : (
          <Text testID="exec-reports-prose" style={styles.body}>
            {report === null
              ? t(reportFailed ? 'insight.failed' : 'insight.idle')
              : (prose ?? t('insight.noSummary'))}
          </Text>
        )}

        {/* The three strategic metrics. Drawn — see the header and the register. */}
        <View style={styles.metrics}>
          <Metric
            styles={styles}
            label={t('exec.reports.metricSaving')}
            value={REPORT_STRATEGIC_METRICS.value.saving}
            color={p.accent}
          />
          <Metric
            styles={styles}
            label={t('exec.reports.metricDelivery')}
            value={t('exec.portfolio.percent', {
              value: REPORT_STRATEGIC_METRICS.value.deliveryForecast,
            })}
            color={p.success}
          />
          <Metric
            styles={styles}
            label={t('exec.reports.metricSafety')}
            value={t('exec.portfolio.percent', {
              value: REPORT_STRATEGIC_METRICS.value.safetyIndex,
            })}
            color={p.text}
          />
        </View>

        {/* The report is about ONE project and says which — see the header. */}
        <Text style={styles.source}>
          {t('insight.source', { project: subject?.project_name ?? '—' })}
        </Text>

        <Pressable
          testID="exec-reports-export"
          accessibilityRole="button"
          accessibilityLabel={t('exec.reports.exportPdf')}
          onPress={() => soon('exec.reports.exportPdf')}
          style={styles.export}
        >
          <MaterialIcons name="picture-as-pdf" size={20} color={p.onPrimary} />
          <Text style={styles.exportText}>{t('exec.reports.exportPdf')}</Text>
        </Pressable>
      </View>

      {/* ── Project summaries ───────────────────────────────────────────────────────────────── */}
      <View style={styles.sectionHead}>
        <Text style={styles.sectionLabel} accessibilityRole="header">
          {t('exec.reports.summaries')}
        </Text>
        <Text style={styles.sectionNote}>{t('exec.reports.sortedByRisk')}</Text>
      </View>

      <LoadingBoundary
        loading={loading}
        variant="list"
        theme={isDark ? 'dark' : 'light'}
        progress={loadProgress(settled, LOAD_STEPS) ?? undefined}
      >
        <View style={styles.stack}>
          {shown.length === 0 ? (
            <View testID="exec-reports-empty" style={styles.card}>
              <Text style={styles.body}>{t('exec.reports.noProjects')}</Text>
            </View>
          ) : (
            shown.map((row) => {
              const band2 = rowBand(row);
              const tone = bandTone(band2, p);
              const position = positionById.get(row.projectId) ?? 0;
              const isSubject = subject !== undefined && row.projectId === subject.project_id;
              const gap = Math.round(row.utilizationPct) - 100;
              return (
                <View
                  key={row.projectId}
                  testID={`exec-reports-row-${row.projectId}`}
                  style={[styles.card, styles.row, { borderLeftColor: tone }]}
                >
                  <View style={styles.rowHead}>
                    <View style={styles.rowHeadText}>
                      <Text style={styles.rowTitle} numberOfLines={2}>
                        {nameById.get(row.projectId) ?? row.projectId}
                      </Text>
                      <Text style={styles.rowMeta} numberOfLines={1}>
                        {`${t('exec.portfolio.contract', {
                          code: PROJECT_CONTRACT_CODES.value[
                            position % PROJECT_CONTRACT_CODES.value.length
                          ],
                        })}  •  ${
                          PROJECT_LOCATIONS.value[position % PROJECT_LOCATIONS.value.length]
                        }`}
                      </Text>
                    </View>
                    <View style={[styles.rowPill, { borderColor: `${tone}66` }]}>
                      <Text style={[styles.rowPillText, { color: tone }]}>
                        {t(`exec.reports.band.${band2}`)}
                      </Text>
                    </View>
                  </View>

                  {/* The AI flag, and ONLY on the project the report is about. */}
                  {isSubject && flags.length > 0 ? (
                    <View
                      testID="exec-reports-flag"
                      style={[styles.flag, { borderColor: `${p.danger}66` }]}
                    >
                      <MaterialIcons
                        name="warning"
                        size={14}
                        color={p.danger}
                        accessibilityElementsHidden
                        importantForAccessibility="no"
                      />
                      <Text style={styles.flagText}>
                        {`${t('exec.reports.aiFlag')} ${flags[0] ?? ''}`}
                      </Text>
                    </View>
                  ) : null}

                  <View style={styles.rowFoot}>
                    <View style={styles.rowFigures}>
                      <Text style={[styles.rowFigure, { color: gap > 0 ? p.danger : p.success }]}>
                        {gap > 0
                          ? t('exec.reports.budgetGap', { value: gap })
                          : t('exec.reports.budgetHeadroom', { value: Math.abs(gap) })}
                      </Text>
                      <Text style={styles.rowFigureMuted}>
                        {t('exec.reports.utilized', { value: Math.round(row.utilizationPct) })}
                      </Text>
                      {/* The report's own confidence, on the one row it describes. */}
                      {isSubject && percent !== null ? (
                        <Text style={[styles.rowFigure, { color: p.accent }]}>
                          {t('insight.conf', { value: percent })}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </LoadingBoundary>

      {/* ── Strategic recommendations — the model's own, not drawn ──────────────────────────── */}
      <View testID="exec-reports-recommendations" style={[styles.card, styles.recCard]}>
        <View style={styles.recHead}>
          <MaterialIcons name="campaign" size={18} color={p.accent} />
          <Text style={styles.recTitle} accessibilityRole="header">
            {t('exec.reports.recommendations')}
          </Text>
        </View>
        {recommendations.length === 0 ? (
          <Text style={styles.body}>
            {report === null ? t('insight.idle') : t('exec.reports.noRecommendations')}
          </Text>
        ) : (
          recommendations.map((line, index) => (
            <View key={`${index}-${line.slice(0, 24)}`} style={styles.recRow}>
              <View style={styles.recDot} />
              <Text style={styles.recText}>{line}</Text>
            </View>
          ))
        )}
        {/* Drawn, and it must never write — master §Phase 10 makes this role read-only on mobile. */}
        <Pressable
          testID="exec-reports-acknowledge"
          accessibilityRole="button"
          accessibilityLabel={t('exec.reports.acknowledge')}
          onPress={() => soon('exec.reports.acknowledge')}
          style={styles.acknowledge}
        >
          <MaterialIcons name="fact-check" size={16} color={p.accent} />
          <Text style={styles.acknowledgeText}>{t('exec.reports.acknowledge')}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

/**
 * The report's risk flags, in order.
 *
 * `risk_flags` is a real field on EXECUTIVE_SUMMARY (api/ai.ts). It is read here rather than through
 * `insightAdvice`, which deliberately returns ONE item of whichever kind a report carried and would
 * hand back a recommendation when both are present — this screen prints the two separately and must
 * not let one stand in for the other.
 */
function recommendationRisks(content: Record<string, unknown>): string[] {
  const value = content['risk_flags'];
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim() !== '')
    .map((item) => item.trim());
}

/** One of the three strategic-metric tiles. */
function Metric({
  styles,
  label,
  value,
  color,
}: {
  styles: ReturnType<typeof makeStyles>;
  label: string;
  value: string;
  color: string;
}): React.JSX.Element {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
    </View>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    page: { padding: spacing.md, gap: spacing.sm },
    stack: { gap: spacing.sm },

    heading: {
      color: p.text,
      fontFamily: fontFamily.bold,
      fontSize: typography.title.fontSize,
    },
    subtitle: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
      marginTop: 2,
    },

    controls: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.xs,
      flexWrap: 'wrap',
    },
    tabs: {
      flexDirection: 'row',
      padding: 2,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
    },
    tab: {
      paddingHorizontal: spacing.xs,
      minHeight: 32,
      justifyContent: 'center',
      borderRadius: radius.md,
    },
    tabText: { color: p.muted, fontFamily: fontFamily.medium, fontSize: typography.label.fontSize },
    reanalyse: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs / 2,
      minHeight: touchTarget.secondaryButton,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: p.accent,
      backgroundColor: p.surface,
    },
    reanalyseText: {
      color: p.accent,
      fontFamily: fontFamily.medium,
      fontSize: typography.label.fontSize,
    },
    disabled: { opacity: 0.5 },

    card: {
      backgroundColor: p.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: p.border,
      padding: spacing.md,
      gap: spacing.xs,
    },
    // The drawing's cyan-bordered brief. No gradient behind it: gradients are prohibited wherever the
    // signed-in app shows project data (.claude/rules/design-tokens.md), and the two named exceptions
    // are pre-auth screens and <LoadingState />'s `ai` variant.
    brief: {
      backgroundColor: p.surface,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: p.accent,
      padding: spacing.md,
      gap: spacing.sm,
    },
    briefHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
    briefHeadLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flex: 1 },
    plate: {
      width: 28,
      height: 28,
      alignItems: 'center',
      justifyContent: 'center',
      // A square glyph plate: `plateRadius` scales the corner with the plate (§32.7), and it sits on
      // `surfaceBright` because `elevated` is DARKER than a card in dark mode.
      borderRadius: plateRadius(28),
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surfaceBright,
    },
    briefTitles: { flex: 1 },
    briefTitle: {
      color: p.text,
      fontFamily: fontFamily.semibold,
      fontSize: typography.caption.fontSize,
    },
    confChip: {
      paddingHorizontal: spacing.xs,
      paddingVertical: 2,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: p.accent,
      backgroundColor: p.bg,
    },
    confText: {
      color: p.accent,
      fontFamily: fontFamily.medium,
      fontSize: 10,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },

    metrics: { flexDirection: 'row', gap: spacing.xs },
    metric: {
      flex: 1,
      gap: 2,
      padding: spacing.xs,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surfaceBright,
    },
    metricLabel: { color: p.muted, fontFamily: fontFamily.regular, fontSize: 10 },
    metricValue: { fontFamily: fontFamily.bold, fontSize: typography.label.fontSize },

    export: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      minHeight: touchTarget.listItem,
      borderRadius: radius.lg,
      backgroundColor: p.primary,
    },
    exportText: {
      color: p.onPrimary,
      fontFamily: fontFamily.semibold,
      fontSize: typography.caption.fontSize,
    },

    sectionHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: spacing.xs,
    },
    sectionLabel: {
      color: p.text,
      fontFamily: fontFamily.bold,
      fontSize: typography.label.fontSize,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    sectionNote: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
    },

    row: { borderLeftWidth: 4, gap: spacing.xs },
    rowHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
    rowHeadText: { flex: 1, gap: 2 },
    rowTitle: {
      color: p.text,
      fontFamily: fontFamily.semibold,
      fontSize: typography.caption.fontSize,
    },
    rowMeta: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
    },
    rowPill: {
      paddingHorizontal: spacing.xs,
      paddingVertical: 2,
      borderRadius: radius.xl,
      borderWidth: 1,
    },
    rowPillText: {
      fontFamily: fontFamily.bold,
      fontSize: 10,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    rowFoot: {
      paddingTop: spacing.xs,
      borderTopWidth: 1,
      borderTopColor: p.border,
    },
    rowFigures: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
    rowFigure: { fontFamily: fontFamily.medium, fontSize: typography.label.fontSize },
    rowFigureMuted: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
    },

    flag: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.xs / 2,
      padding: spacing.xs,
      borderRadius: radius.md,
      borderWidth: 1,
    },
    flagText: {
      flex: 1,
      color: p.text,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
    },

    recCard: { borderColor: p.accent, gap: spacing.sm },
    recHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    recTitle: {
      color: p.text,
      fontFamily: fontFamily.semibold,
      fontSize: typography.caption.fontSize,
    },
    recRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
    // A dot: half the width, off the radius scale entirely (§32.7).
    recDot: { width: 6, height: 6, borderRadius: 999, backgroundColor: p.accent, marginTop: 6 },
    recText: {
      flex: 1,
      color: p.text,
      fontFamily: fontFamily.regular,
      fontSize: typography.caption.fontSize,
      lineHeight: typography.caption.lineHeight,
    },
    acknowledge: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      minHeight: touchTarget.secondaryButton,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: p.accent,
    },
    acknowledgeText: {
      color: p.accent,
      fontFamily: fontFamily.medium,
      fontSize: typography.label.fontSize,
    },

    eyebrow: {
      color: p.accent,
      fontFamily: fontFamily.semibold,
      fontSize: 10,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    body: {
      color: p.text,
      fontFamily: fontFamily.regular,
      fontSize: typography.caption.fontSize,
      lineHeight: typography.caption.lineHeight,
    },
    source: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
    },
  });

// ExecReports — the EXECUTIVE half of /reports.
// Implements mockup/mobile/08_executive/04_report/01_ex_report — the Stitch screen "Executive AI Reports - Mobile"
// (project 5714703984410484001, screen 71ac4c0921794e28be039bf4daeae597; its HTML is byte-identical to the repo copy).
//
// A TAB AGAIN since 2026-09-07 (ADR-098 as amended): the replacement executive mockup set made
// `04_report` the role's fourth tab. NO NEW ROUTE WAS ADDED FOR IT — the screen that drawing draws
// is the AI executive summary `/reports` already rendered for this role, in a styled form, and two
// routes for one screen is the mistake `dashboard` and `home` made.
//
// REBUILT 2026-09-16 TO THE DRAWING (revision R20, product-owner decisions D20–D26). The 2026-09-07
// build left several drawn things out; the product owner reversed that — "draw what Stitch draws" —
// with exactly TWO exceptions, which stay off the screen:
//   · the "Executive Reports" heading and its subtitle — on a TAB they repeat the label the bar shows
//   · the `W47-LIVE` chip — a week number is computable, "LIVE" claims a data feed that does not exist
//
// WHY NOT `<PortfolioInsight />`, which wraps the very same endpoint. That component owns its report
// internally and renders ONE card. This drawing spends the same report across THREE places — the
// brief's prose, the AI flag and the Strategic Recommendations list — so the screen has to hold the
// report itself. Every reading of the report goes through the SAME helpers the panel uses
// (`summaryText`, `confidenceBand`, `confidencePercent`, `recommendationList`), so the two surfaces
// cannot disagree about what a report says.
//
// TWO PATHS, AND THEY NEVER MIX (D21).
//   REAL — `POST /ai/reports/executive-summary` answered. The brief prose, its CONF, the AI flag and
//          the recommendations are the model's own, and the flag and a per-row confidence appear on
//          ONE row: the project the report is about. The "Source: project …" line names that
//          project (D26), because the report covers one project and must not read as a portfolio
//          statement.
//   DRAWN  — no report (the gateway is unreachable, failed, or has not answered yet). The brief
//          paragraph, the flag on the first CRITICAL row and the two recommendations are the
//          drawing's own, kept in lib/mockupFigures.ts + i18n. The source line is not shown, as drawn.
//   A report arriving displaces every drawn finding at once; nothing drawn is read on the real path.
//
// WHAT IS REAL on both paths.
//   The three tabs         counts over `GET /analytics/executive` through `executiveSeverityOf`.
//                          "วิกฤต (n)" is CRITICAL only (D24); "ตามแผน" is SECURE and carries no
//                          count, as drawn; MONITOR rows are listed under the "ทั้งหมด" tab only.
//   Row order              worst first, by the same severity rank the risk feed sorts on.
//   Budget utilisation     `utilizationPct`, and the gap above 100 that the drawing calls a
//                          "Budget Gap".
//   Re-analyse             generates the report again — the one control that does exactly what it says.
//
// COMING SOON — drawn as Stitch draws it (lib/mockupFigures.ts, ADR-099):
//   the brief's title line and "7d Summary" · the three strategic metrics · the CONF chip on
//   the drawn path (98 %) · the SOURCES chip on BOTH paths (D25 — this reverses ADR-098's "WHICH
//   SYSTEMS" carve-out for this screen; see its amendment) · each row's summary paragraph by
//   band and its trend figures ("+1.2% Ahead", "-2.8% Delay Risk", "Conf: 94%") (D22) · each row's
//   contract number and location.
// COMING SOON — actions with no process, each opening the "coming soon" dialog:
//   Export Portfolio PDF (nothing renders a portfolio document) · "ดูรายงานฉบับเต็ม" (no full-report
//   page; `/ai/reports/history` returns METADATA only) · Acknowledge & Direct (there is no
//   acknowledgement endpoint, and master §Phase 10 makes this role READ-ONLY on mobile — it never writes).
//
// DIFFERENCES FROM THE DRAWING, AND WHY.
//   The drawing's MODEL: LAYER-A/B chip and its "AI Strategic Brief" eyebrow are not drawn — both
//   removed by the product owner on 2026-09-17.
//   The Export button is a SOLID primary fill, not the drawn cyan→blue gradient (D23): gradients are
//   prohibited wherever the signed-in app shows project data (spec §32.7).
//   The report's subject row, when a real report exists, carries the real figures and the report's
//   own confidence instead of the drawn paragraph and trend — a drawn finding may not sit on the
//   one row a real model output describes.
//   A per-row AI report is not generated: that is one metered LLM call per project (§26), the fan-out
//   `GET /tasks/portfolio-summary` was built to avoid. The per-row paragraph is drawn instead (D22).

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
  REPORT_BRIEF_CHIPS,
  REPORT_BRIEF_FALLBACK,
  REPORT_BRIEF_WINDOW,
  REPORT_FINDINGS_FALLBACK,
  REPORT_ROW_TRENDS,
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
 * The three tabs, as drawn: "ทั้งหมด / วิกฤต (n) / ตามแผน" (D20, D24).
 *
 * "วิกฤต" holds CRITICAL rows only, so its name and its count mean the same thing. MONITOR rows are
 * in neither filter and are listed under "ทั้งหมด" only — the product owner's choice on 2026-09-16,
 * taken with that named; the 2026-09-07 "needs attention" tab that also collected them is gone.
 */
type Tab = 'all' | 'critical' | 'onTrack';
const TABS: readonly Tab[] = ['all', 'critical', 'onTrack'];

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

/** A drawn percentage, printed the way the drawing prints it — one decimal place. */
const oneDecimal = (value: number): string => value.toFixed(1);

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
    // The tenant the gateway trusts comes out of the token it verifies; this claim only fills the
    // required body field, and reading it off the same token is what keeps the two consistent.
    const tenantId = String(decodeJwtPayload(token ?? '')['tenant_id'] ?? '');
    if (subject === undefined || tenantId === '') return;
    setReporting(true);
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
      // A failed generation falls to the DRAWN path (D21) — the card is never left blank.
      setReport(null);
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

  const criticalCount = useMemo(
    () => rows.filter((row) => rowBand(row) === 'critical').length,
    [rows],
  );

  const sorted = useMemo(
    () =>
      // A COPY, then sort: `rows` is state and sorting it in place would mutate what React is holding.
      [...rows].sort(
        (a, b) =>
          EXECUTIVE_SEVERITY_RANK[executiveSeverityOf(b)] -
          EXECUTIVE_SEVERITY_RANK[executiveSeverityOf(a)],
      ),
    [rows],
  );

  const shown = useMemo(
    () =>
      sorted.filter((row) => {
        if (tab === 'all') return true;
        const band = rowBand(row);
        return tab === 'critical' ? band === 'critical' : band === 'secure';
      }),
    [sorted, tab],
  );

  /** The drawn path is on whenever there is no report and none is being generated (D21). */
  const drawn = report === null && !reporting;
  const percent = report === null ? null : confidencePercent(report.confidence);
  const prose = report === null ? null : summaryText(report.content);
  const realRecommendations = report === null ? [] : recommendationList(report.content);
  const flags = report === null ? [] : recommendationRisks(report.content);

  const recommendations: string[] = drawn
    ? REPORT_FINDINGS_FALLBACK.value.recommendations.map((key) => t(`exec.reports.fallback.${key}`))
    : realRecommendations;
  /** On the drawn path the drawing's flag sits on the first CRITICAL row, where the drawing puts it. */
  const drawnFlagRowId = drawn
    ? sorted.find((row) => rowBand(row) === 'critical')?.projectId
    : undefined;

  const confChip =
    report === null
      ? t('insight.conf', { value: REPORT_BRIEF_CHIPS.value.confidence })
      : percent === null
        ? t(BAND_LABEL[confidenceBand(report.confidence, report.low_confidence)])
        : t('insight.conf', { value: percent });

  const soon = (labelKey: string): void => {
    Alert.alert(t(labelKey), t('more.comingSoon'));
  };

  const counts = REPORT_BRIEF_FALLBACK.value;

  return (
    <ScrollView
      testID="exec-reports-screen"
      style={{ backgroundColor: p.bg }}
      contentContainerStyle={styles.page}
    >
      {/* NO SCREEN HEADING and NO W47-LIVE CHIP — the two exceptions D20 keeps (see the header). */}
      {/* Control bar — the tabs and the one control that does what it says. */}
      <View style={styles.controls}>
        <View style={styles.tabs}>
          {TABS.map((key) => {
            const active = tab === key;
            const label = t(`exec.reports.filter.${key}`);
            return (
              <Pressable
                key={key}
                testID={`exec-reports-tab-${key}`}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={label}
                onPress={() => setTab(key)}
                style={[styles.tab, active && { backgroundColor: p.primary }]}
              >
                <Text style={[styles.tabText, active && { color: p.onPrimary }]}>
                  {key === 'critical' ? `${label} (${criticalCount})` : label}
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
            {/* ONE TITLE LINE. The drawing's "AI Strategic Brief" eyebrow above it was removed by the
                product owner on 2026-09-17; the drawing's own title stays. COMING SOON. */}
            <View style={styles.briefTitles}>
              <Text testID="exec-reports-brief-title" style={styles.briefTitle}>
                {t('exec.reports.briefTitle')}
              </Text>
            </View>
          </View>
          {/* COMING SOON — REPORT_BRIEF_WINDOW: nothing states the window a report covers. */}
          <Text testID="exec-reports-window" style={styles.window}>
            {t('exec.reports.window', { days: REPORT_BRIEF_WINDOW.value })}
          </Text>
        </View>

        {reporting ? (
          <LoadingState
            testID="exec-reports-loading"
            variant="ai"
            theme={isDark ? 'dark' : 'light'}
          />
        ) : report === null ? (
          // COMING SOON — REPORT_BRIEF_FALLBACK: the drawing's own paragraph, on the drawn path only.
          <Text testID="exec-reports-prose" style={styles.body}>
            {`${t('exec.reports.fallback.briefLead', { total: counts.total })} `}
            <Text style={[styles.strong, { color: p.text }]}>
              {t('exec.reports.fallback.briefCount', { value: counts.normal })}
            </Text>
            {`${t('exec.reports.fallback.briefSchedule')} `}
            <Text style={[styles.strong, { color: p.warning }]}>
              {t('exec.reports.fallback.briefCount', { value: counts.scheduleRisk })}
            </Text>
            {` ${t('exec.reports.fallback.briefBudget')} `}
            <Text style={[styles.strong, { color: p.danger }]}>
              {t('exec.reports.fallback.briefCount', { value: counts.overBudget })}
            </Text>
          </Text>
        ) : (
          <Text testID="exec-reports-prose" style={styles.body}>
            {prose ?? t('insight.noSummary')}
          </Text>
        )}

        {/* The three strategic metrics. COMING SOON — REPORT_STRATEGIC_METRICS. */}
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

        {/* The chips (D25). CONF is the report's own on the real path; the drawn 98 % otherwise.
            COMING SOON — REPORT_BRIEF_CHIPS: SOURCES is drawn on BOTH paths. The drawing's third
            chip, MODEL: LAYER-A/B, was removed by the product owner on 2026-09-17. */}
        <View testID="exec-reports-chips" style={styles.chips}>
          <Chip styles={styles} icon="verified" color={p.accent} testID="exec-reports-confidence">
            {confChip}
          </Chip>
          <Chip styles={styles} icon="storage" color={p.accent}>
            {t('exec.reports.chipSources', { value: REPORT_BRIEF_CHIPS.value.sources })}
          </Chip>
        </View>

        {/* The report is about ONE project and says which — on the real path only (D26). */}
        {report === null ? null : (
          <Text testID="exec-reports-source" style={styles.source}>
            {t('insight.source', { project: subject?.project_name ?? '—' })}
          </Text>
        )}

        {/* COMING SOON — REPORT_PDF_EXPORT. Solid fill, not the drawn gradient (D23). */}
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
              const rowTone = rowBand(row);
              const tone = bandTone(rowTone, p);
              const position = positionById.get(row.projectId) ?? 0;
              const isSubject = subject !== undefined && row.projectId === subject.project_id;
              /** The report's own row keeps real content only — a drawn finding may not sit on it. */
              const realRow = isSubject && report !== null;
              const gap = Math.round(row.utilizationPct) - 100;
              const flagText = realRow
                ? flags[0]
                : row.projectId === drawnFlagRowId
                  ? t(`exec.reports.fallback.${REPORT_FINDINGS_FALLBACK.value.flag}`)
                  : undefined;
              const gapFigure = (
                <Text style={[styles.rowFigure, { color: gap > 0 ? p.danger : p.success }]}>
                  {gap > 0
                    ? t('exec.reports.budgetGap', { value: gap })
                    : t('exec.reports.budgetHeadroom', { value: Math.abs(gap) })}
                </Text>
              );
              const utilised = (
                <Text style={styles.rowFigureMuted}>
                  {`${t('exec.reports.budgetLabel')} `}
                  <Text style={styles.rowFigureStrong}>
                    {t('exec.reports.utilizedValue', { value: Math.round(row.utilizationPct) })}
                  </Text>
                </Text>
              );
              const dot = <Text style={styles.rowDot}>•</Text>;
              return (
                <View
                  key={row.projectId}
                  testID={`exec-reports-row-${row.projectId}`}
                  style={[styles.card, styles.row, { borderLeftColor: tone }]}
                >
                  <View style={styles.rowHead}>
                    <View style={styles.rowHeadText}>
                      {/* ONE LINE, cut with "…" (product owner 2026-09-17). The full name stays the
                          accessible label, so a screen reader still reads all of it. */}
                      <Text
                        testID={`exec-reports-title-${row.projectId}`}
                        style={styles.rowTitle}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                        accessibilityLabel={nameById.get(row.projectId) ?? row.projectId}
                      >
                        {nameById.get(row.projectId) ?? row.projectId}
                      </Text>
                      {/* COMING SOON — PROJECT_CONTRACT_CODES / PROJECT_LOCATIONS. */}
                      <Text style={styles.rowMeta} numberOfLines={1}>
                        {`${t('exec.portfolio.contract', {
                          code: PROJECT_CONTRACT_CODES.value[
                            position % PROJECT_CONTRACT_CODES.value.length
                          ],
                        })} • ${PROJECT_LOCATIONS.value[position % PROJECT_LOCATIONS.value.length]}`}
                      </Text>
                    </View>
                    {/* SQUARED, like the Home project card's tag and for the same reason: the
                        drawing writes `rounded`, which its own Tailwind config maps to 0.25rem =
                        4px, and the product owner chose the drawing (2026-09-07). Recorded in
                        theme/__tests__/badgeRadius.spec.ts's NOT_BADGES table, so the section 32.7
                        capsule ruling still binds every badge it was not overruled for. */}
                    <View
                      style={[
                        styles.rowStatusTag,
                        { borderColor: `${tone}66`, backgroundColor: `${tone}1A` },
                      ]}
                    >
                      <Text style={[styles.rowPillText, { color: tone }]}>
                        {t(`exec.reports.band.${rowTone}`)}
                      </Text>
                    </View>
                  </View>

                  {/* COMING SOON — the drawing's paragraph for this band (D22), never on the
                      report's own row. */}
                  {realRow ? null : (
                    <Text testID={`exec-reports-summary-${row.projectId}`} style={styles.body}>
                      {t(`exec.reports.rowSummary.${rowTone}`)}
                    </Text>
                  )}

                  {/* The AI flag: the report's own on its subject row, or the drawing's on the first
                      CRITICAL row when there is no report (D21). */}
                  {flagText === undefined ? null : (
                    <View
                      testID="exec-reports-flag"
                      style={[
                        styles.flag,
                        { borderColor: `${p.danger}66`, backgroundColor: `${p.danger}14` },
                      ]}
                    >
                      <MaterialIcons
                        name="warning"
                        size={14}
                        color={p.danger}
                        accessibilityElementsHidden
                        importantForAccessibility="no"
                      />
                      <Text style={styles.flagText}>
                        <Text style={styles.strong}>{`${t('exec.reports.aiFlag')} `}</Text>
                        {flagText}
                      </Text>
                    </View>
                  )}

                  <View style={styles.rowFoot}>
                    <View style={styles.rowFigures}>
                      {realRow ? (
                        <>
                          {gapFigure}
                          {dot}
                          {utilised}
                          {/* The report's own confidence, on the one row it describes. */}
                          {percent === null ? null : (
                            <Text style={[styles.rowFigure, { color: p.accent }]}>
                              {t('exec.reports.rowConf', { value: percent })}
                            </Text>
                          )}
                        </>
                      ) : rowTone === 'secure' ? (
                        <>
                          {/* COMING SOON — REPORT_ROW_TRENDS.aheadPct; utilisation is real. */}
                          <Text style={[styles.rowFigure, { color: p.success }]}>
                            {t('exec.reports.ahead', {
                              value: oneDecimal(REPORT_ROW_TRENDS.value.aheadPct),
                            })}
                          </Text>
                          {dot}
                          {utilised}
                        </>
                      ) : rowTone === 'monitor' ? (
                        <>
                          {/* COMING SOON — REPORT_ROW_TRENDS.delayRiskPct / confidence. */}
                          <Text style={[styles.rowFigure, { color: p.warning }]}>
                            {t('exec.reports.delayRisk', {
                              value: oneDecimal(REPORT_ROW_TRENDS.value.delayRiskPct),
                            })}
                          </Text>
                          {dot}
                          <Text style={[styles.rowFigure, { color: p.accent }]}>
                            {t('exec.reports.rowConf', {
                              value: REPORT_ROW_TRENDS.value.confidence,
                            })}
                          </Text>
                        </>
                      ) : (
                        gapFigure
                      )}
                    </View>
                    {/* COMING SOON — no full-report page exists; the words are back (D20). */}
                    <Pressable
                      testID={`exec-reports-full-${row.projectId}`}
                      accessibilityRole="button"
                      accessibilityLabel={t('exec.reports.fullReport')}
                      onPress={() => soon('exec.reports.fullReport')}
                      style={styles.rowLink}
                    >
                      <Text style={styles.rowLinkText}>{t('exec.reports.fullReport')}</Text>
                      <MaterialIcons name="chevron-right" size={16} color={p.accent} />
                    </Pressable>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </LoadingBoundary>

      {/* ── Strategic Recommendations — the model's own, or the drawing's on the drawn path ────── */}
      <View testID="exec-reports-recommendations" style={[styles.card, styles.recCard]}>
        <View style={styles.recHead}>
          <MaterialIcons name="campaign" size={18} color={p.accent} />
          <Text style={styles.recTitle} accessibilityRole="header">
            {t('exec.reports.recommendations')}
          </Text>
        </View>
        {reporting ? (
          <LoadingState
            testID="exec-reports-recommendations-loading"
            variant="micro"
            theme={isDark ? 'dark' : 'light'}
          />
        ) : recommendations.length === 0 ? (
          <Text style={styles.body}>{t('exec.reports.noRecommendations')}</Text>
        ) : (
          recommendations.map((line, index) => (
            <View key={`${index}-${line.slice(0, 24)}`} style={styles.recRow}>
              <View style={styles.recDot} />
              <Text style={styles.recText}>{line}</Text>
            </View>
          ))
        )}
        {/* COMING SOON — no acknowledgement endpoint, and master §Phase 10 makes this role read-only on
            mobile: it never writes. Enabled whenever there are lines to acknowledge. */}
        <Pressable
          testID="exec-reports-acknowledge"
          accessibilityRole="button"
          accessibilityLabel={t('exec.reports.acknowledge')}
          accessibilityState={{ disabled: reporting || recommendations.length === 0 }}
          disabled={reporting || recommendations.length === 0}
          onPress={() => soon('exec.reports.acknowledge')}
          style={[
            styles.acknowledge,
            (reporting || recommendations.length === 0) && styles.disabled,
          ]}
        >
          <MaterialIcons name="fact-check" size={16} color={p.accent} />
          <Text style={styles.acknowledgeText}>{t('exec.reports.acknowledge')}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

/** One of the brief's three chips — CONF, SOURCES, MODEL. */
function Chip({
  styles,
  icon,
  color,
  testID,
  children,
}: {
  styles: ReturnType<typeof makeStyles>;
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  color: string;
  testID?: string;
  children: string;
}): React.JSX.Element {
  return (
    <View testID={testID} style={styles.chip}>
      <MaterialIcons name={icon} size={11} color={color} />
      <Text style={styles.chipText}>{children}</Text>
    </View>
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
    // The brief's edge is the NEUTRAL card border: the drawing's rendered screen.png samples a dark
    // blue hairline on every side (its HTML's 3px cyan left edge is overridden by `border`). No
    // gradient behind it: gradients are prohibited wherever the signed-in app shows project data
    // (.claude/rules/design-tokens.md), and the two named exceptions are pre-auth screens and
    // <LoadingState />'s `ai` variant.
    brief: {
      backgroundColor: p.surface,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: p.border,
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
    // The drawing's "7d Summary" — mono, accent, at the head's trailing edge.
    window: { color: p.accent, fontFamily: fontFamily.regular, fontSize: 11 },

    // The drawing's three metadata chips — squared (`rounded` = 4px in its Tailwind config), mono.
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs / 2 },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: spacing.xs,
      paddingVertical: 2,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: `${p.accent}66`,
      backgroundColor: p.bg,
    },
    chipText: {
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
    // Named Tag, not Pill - the badge-radius guard reads style NAMES, and the squared corner is
    // excused once, in that guard's NOT_BADGES table.
    rowStatusTag: {
      paddingHorizontal: spacing.xs,
      paddingVertical: 2,
      borderRadius: radius.md,
      borderWidth: 1,
    },
    rowPillText: {
      fontFamily: fontFamily.bold,
      fontSize: 10,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    // Figures on the left, the full-report link on the right — the drawing's footer.
    rowFoot: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.xs,
      paddingTop: spacing.xs,
      borderTopWidth: 1,
      borderTopColor: p.border,
    },
    rowFigures: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      flexWrap: 'wrap',
    },
    rowDot: { color: p.muted, fontSize: typography.label.fontSize },
    // The words and the chevron, with the 44pt WCAG AAA target height (§32.7). The words may wrap
    // onto two lines, as they do in the drawing at this width.
    rowLink: {
      flexDirection: 'row',
      alignItems: 'center',
      maxWidth: '40%',
      minHeight: touchTarget.iconButton,
    },
    rowLinkText: {
      flexShrink: 1,
      color: p.accent,
      fontFamily: fontFamily.medium,
      fontSize: typography.label.fontSize,
    },
    rowFigureStrong: { color: p.text, fontFamily: fontFamily.semibold },
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
    strong: { fontFamily: fontFamily.semibold },

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

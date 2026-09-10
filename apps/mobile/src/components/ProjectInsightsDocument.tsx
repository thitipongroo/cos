// Project Insights — the VIEWER's analytics page.
//
// DRAWING: mockup/mobile/role_viewer/04_insights/01_analytics (Stitch screen "Project Analytics -
// Viewer (Mobile Dark Mode)").
//
// REDRAWN 2026-09-11, and it changed more than any other screen in this set. The header became the
// app's real <TopBar />; the `Project Insights` page heading went; a TIME-RANGE FILTER appeared
// above the cards; every card gained an action pill — `DETAILED METRICS`, `LOGS`, `VIEW EVIDENCE`,
// `VIEW ALL` — and every fact and severity row became a recessed row with a chevron. Issue Severity
// gained a `275 Total` chip. Its bottom nav is UNCHANGED (`Projects · Daily Logs · Safety ·
// Insights`), which is why this screen is a drawer row rather than a tab.
//
// NOTHING BEHIND ANY OF THE NEW AFFORDANCES EXISTS. There is no detailed-metrics screen, no safety
// log, no evidence view and no issue list this role can open — `/issues` is not even a route it can
// reach (§32.7 kept it off the bar because its create button is not role-gated). Every one of them
// is drawn and says so on the press, which is the standing rule since 2026-09-04.
//
// THE FILTER DOES NOT FILTER. Every figure on this screen is a registered constant; a range chip
// that changed nothing would be a control lying about its own effect, and one that appeared to
// change the numbers would be worse. The row is drawn with `Quarter` selected, as the drawing draws
// it, and the other four say so on the press.
//
// EVERY FIGURE ON THIS SCREEN IS DRAWN. That is unusual for this app and it is stated plainly
// rather than left to be discovered: no endpoint on this device returns a planned-vs-actual series,
// a safe-hours ledger, a supply-chain forecast or a portfolio-wide issue histogram. The four
// register entries — VIEWER_PROGRESS_CURVE, VIEWER_SAFETY_PERFORMANCE, VIEWER_RISK_FORECAST,
// VIEWER_ISSUE_SEVERITY — each name what would have to exist for it to go (ADR-099).
//
// THE ONE THING THAT IS COMPUTED rather than drawn is the severity bar's proportions: they are
// derived from the four counts above them, so the bar can never disagree with the numbers it sits
// under. The drawing hardcodes 5 / 12 / 31 / 52, which is those same counts rounded.
//
// TWO PERMISSIONS WERE ADDED FOR THIS SCREEN, NOT ASSUMED. `[CosRole.VIEWER]` held seven grants and
// none of `safety:read`, `analytics:read` or `ai:read` was among them — so the Safety Performance
// card, the page itself and the Risk Forecast card would each have been drawn against a grant the
// role does not hold. Escalated on 2026-09-10; the product owner added all three rather than
// dropping the cards, §6.8's Viewer table was amended in the same commit, and all three are `:read`
// so §20.7.9's "no create/edit/approve actions are rendered" is untouched.
//
// THE RISK CARD DOES NOT PRINT THE DRAWING'S SOURCE. It foots with "Data: Logistics Hub", and
// <AiCardFooter />'s contract is that `source` names something this repository HAS — never a system
// it does not (ADR-098 amendment 2). The card names the record set it is about instead: the
// viewer's assigned projects.
//
// NO HEADER OR BOTTOM NAV OF ITS OWN — the shell draws both, and this screen is reached from the
// navigation drawer rather than from a tab (PO decision 2026-09-10).

import { useMemo } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import { AiCardFooter } from './AiCardFooter';
import { useComingSoon } from './useComingSoon';
import {
  VIEWER_ISSUE_SEVERITY,
  VIEWER_PROGRESS_CURVE,
  VIEWER_RISK_FORECAST,
  VIEWER_SAFETY_PERFORMANCE,
} from '../lib/mockupFigures';
import { useT } from '../i18n';
import { fontFamily, radius, spacing, typography } from '../theme/tokens';
import { usePalette, type Palette } from '../theme/usePalette';

/** The severity rows, worst first — the drawing's order and its colour per row. */
const SEVERITIES = [
  { id: 'critical', tone: 'danger' },
  { id: 'high', tone: 'warning' },
  { id: 'medium', tone: 'accent' },
  { id: 'low', tone: 'muted' },
] as const;

/** The S-curve panel's height. The drawing gives it `h-48`. */
const CURVE_HEIGHT = 192;

/** The time-range chips, in the drawing's order. `quarter` is the one drawn selected. */
const RANGES = ['quarter', '7d', '30d', 'ytd', 'all'] as const;

/**
 * The action pill each card carries in the redraw — a tinted outline, a label and a chevron.
 *
 * Defined once because the drawing draws it four times (`DETAILED METRICS`, `LOGS`,
 * `VIEW EVIDENCE`, `VIEW ALL`) and four copies of one shape is how a fifth shape appears.
 */
function CardAction({
  testID,
  label,
  onPress,
}: {
  testID: string;
  /** Pre-translated (QM-3). */
  label: string;
  onPress: () => void;
}): React.JSX.Element {
  const p = usePalette();
  const styles = useMemo(() => makeStyles(p), [p]);
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={styles.cardAction}
    >
      <Text style={styles.cardActionText} numberOfLines={1}>
        {label}
      </Text>
      <MaterialIcons name="chevron-right" size={16} color={p.accent} />
    </Pressable>
  );
}

export function ProjectInsightsDocument(): React.JSX.Element {
  const t = useT();
  const p = usePalette();
  const styles = useMemo(() => makeStyles(p), [p]);
  const soon = useComingSoon();

  const toneColor = (tone: (typeof SEVERITIES)[number]['tone']): string =>
    tone === 'danger'
      ? p.danger
      : tone === 'warning'
        ? p.warning
        : tone === 'accent'
          ? p.accent
          : p.muted;

  const counts = VIEWER_ISSUE_SEVERITY.value;
  const total = SEVERITIES.reduce((sum, s) => sum + counts[s.id], 0);

  return (
    <ScrollView testID="insights-screen" style={styles.root} contentContainerStyle={styles.page}>
      {/* NO PAGE HEADING — removed in the redraw. The breadcrumb names this screen already, and
          §32.7's rule is that a screen is named once. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rangeRow}
      >
        {RANGES.map((range) => {
          const on = range === 'quarter';
          return on ? (
            <View key={range} testID={`insights-range-${range}`} style={styles.rangeChipOn}>
              <Text style={styles.rangeTextOn}>{t(`insights.viewer.range.${range}`)}</Text>
            </View>
          ) : (
            <Pressable
              key={range}
              testID={`insights-range-${range}`}
              accessibilityRole="button"
              accessibilityLabel={t(`insights.viewer.range.${range}`)}
              onPress={() => soon(`insights.viewer.range.${range}`)}
              style={styles.rangeChip}
            >
              <Text style={styles.rangeText}>{t(`insights.viewer.range.${range}`)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* ── OVERALL PROGRESS ─────────────────────────────────────────────────────────────────── */}
      <View testID="insights-progress" style={styles.card}>
        <View style={styles.cardHead}>
          <View style={styles.cardTitleBlock}>
            <Text style={styles.cardTitle}>{t('insights.viewer.overallProgress')}</Text>
            <Text style={styles.cardSubtitle}>{t('insights.viewer.plannedVsActual')}</Text>
          </View>
          <CardAction
            testID="insights-detailed-metrics"
            label={t('insights.viewer.detailedMetrics')}
            onPress={() => soon('insights.viewer.detailedMetrics')}
          />
        </View>

        {/* The curve is drawn in the mockup's own 0–100 viewBox, so the two paths are the drawing's
            control points unchanged. `preserveAspectRatio="none"` is what lets that box stretch to
            a phone's width without distorting the line weights. */}
        <View style={styles.curvePanel}>
          <Svg width="100%" height={CURVE_HEIGHT} viewBox="0 0 100 100" preserveAspectRatio="none">
            <Path
              d={VIEWER_PROGRESS_CURVE.value.planned}
              fill="none"
              stroke={p.primary}
              strokeWidth={2}
              strokeDasharray="4"
              vectorEffect="non-scaling-stroke"
            />
            <Path
              d={VIEWER_PROGRESS_CURVE.value.actual}
              fill="none"
              stroke={p.accent}
              strokeWidth={2.5}
              vectorEffect="non-scaling-stroke"
            />
          </Svg>
          <View style={styles.legendRow}>
            <View style={styles.legendItem}>
              <View style={[styles.legendSwatch, { backgroundColor: p.primary }]} />
              <Text style={styles.legendText}>{t('insights.viewer.planned')}</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendSwatch, { backgroundColor: p.accent }]} />
              <Text style={styles.legendText}>{t('insights.viewer.actual')}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* ── SAFETY PERFORMANCE ───────────────────────────────────────────────────────────────── */}
      <View testID="insights-safety" style={[styles.card, { borderLeftColor: p.success }]}>
        <View style={styles.cardHead}>
          <View style={styles.cardTitleRow}>
            <MaterialIcons name="health-and-safety" size={20} color={p.success} />
            <Text style={styles.cardTitle}>{t('insights.viewer.safetyPerformance')}</Text>
          </View>
          <CardAction
            testID="insights-logs"
            label={t('insights.viewer.logs')}
            onPress={() => soon('insights.viewer.logs')}
          />
        </View>

        <Pressable
          testID="insights-safe-hours"
          accessibilityRole="button"
          accessibilityLabel={t('insights.viewer.safeHours')}
          onPress={() => soon('insights.viewer.safeHours')}
          style={styles.factRow}
        >
          <Text style={styles.factLabel}>{t('insights.viewer.safeHours')}</Text>
          <View style={styles.factTrail}>
            <Text style={styles.factValue}>
              {t('insights.viewer.hours', { value: VIEWER_SAFETY_PERFORMANCE.value.safeHours })}
            </Text>
            <MaterialIcons name="chevron-right" size={16} color={p.muted} />
          </View>
        </Pressable>
        <Pressable
          testID="insights-zero-days"
          accessibilityRole="button"
          accessibilityLabel={t('insights.viewer.zeroIncidentDays')}
          onPress={() => soon('insights.viewer.zeroIncidentDays')}
          style={styles.factRow}
        >
          <Text style={styles.factLabel}>{t('insights.viewer.zeroIncidentDays')}</Text>
          <View style={styles.factTrail}>
            <Text style={styles.factValue}>
              {t('insights.viewer.days', {
                value: VIEWER_SAFETY_PERFORMANCE.value.zeroIncidentDays,
              })}
            </Text>
            <MaterialIcons name="chevron-right" size={16} color={p.muted} />
          </View>
        </Pressable>
        <View style={styles.statusRow}>
          <Text style={styles.factLabel}>{t('insights.viewer.systemStatus')}</Text>
          <View style={styles.statusChip}>
            <Text style={styles.statusText}>
              {t(`insights.viewer.status.${VIEWER_SAFETY_PERFORMANCE.value.status}`)}
            </Text>
          </View>
        </View>
      </View>

      {/* ── RISK FORECAST ────────────────────────────────────────────────────────────────────── */}
      <View testID="insights-risk" style={[styles.card, { borderLeftColor: p.accent }]}>
        <View style={styles.cardTitleRow}>
          <View style={styles.cardTitleRow}>
            <MaterialIcons name="memory" size={20} color={p.accent} />
            <Text style={styles.aiTitle}>{t('insights.viewer.riskForecast')}</Text>
          </View>
          <CardAction
            testID="insights-view-evidence"
            label={t('insights.viewer.viewEvidence')}
            onPress={() => soon('insights.viewer.viewEvidence')}
          />
        </View>
        <Text style={styles.aiBody}>{VIEWER_RISK_FORECAST.value.body}</Text>
        <AiCardFooter
          testID="insights-risk-foot"
          percent={VIEWER_RISK_FORECAST.value.confidence}
          source={t('insight.sourcePortfolio')}
          confLabel={t('insight.confShort')}
          sourceLabel={t('insight.sourceShort')}
          palette={p}
        />
      </View>

      {/* ── ISSUE SEVERITY ───────────────────────────────────────────────────────────────────── */}
      <View testID="insights-severity" style={styles.card}>
        <View style={styles.cardHead}>
          <View style={styles.cardTitleRow}>
            <MaterialIcons name="bug-report" size={20} color={p.muted} />
            <Text style={styles.cardTitle}>{t('insights.viewer.issueSeverity')}</Text>
            {/* COMPUTED from the four counts below, never a literal — the drawing writes 275 and
                12 + 34 + 87 + 142 is 275, so the chip and the rows can never disagree. */}
            <View style={styles.totalChip}>
              <Text style={styles.totalText}>{t('insights.viewer.total', { count: total })}</Text>
            </View>
          </View>
          <CardAction
            testID="insights-view-all"
            label={t('insights.viewer.viewAll')}
            onPress={() => soon('insights.viewer.viewAll')}
          />
        </View>

        {SEVERITIES.map((severity) => (
          <Pressable
            key={severity.id}
            testID={`insights-severity-${severity.id}`}
            accessibilityRole="button"
            accessibilityLabel={t(`insights.viewer.severity.${severity.id}`)}
            onPress={() => soon(`insights.viewer.severity.${severity.id}`)}
            style={styles.severityRow}
          >
            <View style={styles.severityLabelBlock}>
              <View style={[styles.severityDot, { backgroundColor: toneColor(severity.tone) }]} />
              <Text style={styles.severityLabel}>
                {t(`insights.viewer.severity.${severity.id}`)}
              </Text>
            </View>
            <View style={styles.factTrail}>
              <Text style={styles.severityCount}>{counts[severity.id]}</Text>
              <MaterialIcons name="chevron-right" size={16} color={p.muted} />
            </View>
          </Pressable>
        ))}

        {/* Proportions FROM the counts above, not the drawing's rounded percentages — a bar that
            can disagree with its own numbers is a bar nobody can check. */}
        <View style={styles.severityBar}>
          {SEVERITIES.map((severity) => (
            <View
              key={severity.id}
              testID={`insights-bar-${severity.id}`}
              style={{
                width: `${total === 0 ? 0 : (counts[severity.id] / total) * 100}%`,
                backgroundColor: toneColor(severity.tone),
              }}
            />
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: p.bg },
    page: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl * 3 },

    rangeRow: { gap: spacing.xs, paddingRight: spacing.md, paddingBottom: spacing.xs },
    rangeChip: {
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs / 2,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
    },
    rangeChipOn: {
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs / 2,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: p.primary,
      backgroundColor: p.primary,
    },
    rangeText: {
      color: p.muted,
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
    },
    rangeTextOn: {
      color: p.onPrimary,
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
    },

    cardAction: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs / 2,
      paddingHorizontal: spacing.xs,
      paddingVertical: 2,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: p.accent,
    },
    cardActionText: {
      color: p.accent,
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    totalChip: {
      paddingHorizontal: spacing.xs,
      paddingVertical: 2,
      borderRadius: radius.xl,
      backgroundColor: p.surfaceBright,
    },
    totalText: {
      color: p.muted,
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
    },

    card: {
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: p.border,
      borderLeftWidth: 4,
      borderLeftColor: p.border,
      backgroundColor: p.surface,
    },
    cardHead: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    cardTitleBlock: { flex: 1, gap: spacing.xs / 4 },
    cardTitleRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    cardTitle: {
      color: p.text,
      fontFamily: fontFamily.semibold,
      fontSize: typography.title.fontSize,
      lineHeight: typography.title.lineHeight,
    },
    cardSubtitle: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
    },
    aiTitle: {
      color: p.accent,
      fontFamily: fontFamily.bold,
      fontSize: typography.title.fontSize,
      lineHeight: typography.title.lineHeight,
    },
    aiBody: {
      color: p.text,
      fontFamily: fontFamily.regular,
      fontSize: typography.caption.fontSize,
      lineHeight: typography.caption.lineHeight,
    },

    // The curve sits in a RECESSED panel — the drawing's `bg-surface-container-low` inside a
    // `surface-container` card. Panels sink, chips rise.
    curvePanel: {
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surfaceSunk,
      overflow: 'hidden',
      paddingTop: spacing.sm,
    },
    legendRow: { flexDirection: 'row', gap: spacing.md, padding: spacing.sm },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs / 2 },
    legendSwatch: { width: 12, height: 4, borderRadius: 999 },
    legendText: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
    },

    // RECESSED ROWS, not hairline-ruled ones: the redraw sets each fact on its own
    // `surface-container-low` plate inside the card. Panels sink, chips rise.
    factRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
      padding: spacing.xs,
      borderRadius: radius.lg,
      backgroundColor: p.surfaceSunk,
    },
    factTrail: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs / 2 },
    factLabel: {
      flex: 1,
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.caption.fontSize,
    },
    factValue: {
      color: p.text,
      fontFamily: fontFamily.bold,
      fontSize: typography.title.fontSize,
    },
    statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    statusChip: {
      paddingHorizontal: spacing.xs,
      paddingVertical: spacing.xs / 2,
      borderRadius: radius.xl,
      backgroundColor: p.surfaceBright,
    },
    statusText: {
      color: p.success,
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },

    severityRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
      padding: spacing.xs,
      borderRadius: radius.lg,
      backgroundColor: p.surfaceSunk,
    },
    severityLabelBlock: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    severityDot: { width: 12, height: 12, borderRadius: 999 },
    severityLabel: {
      color: p.text,
      fontFamily: fontFamily.regular,
      fontSize: typography.caption.fontSize,
    },
    severityCount: {
      color: p.text,
      fontFamily: fontFamily.semibold,
      fontSize: typography.title.fontSize,
    },
    severityBar: {
      flexDirection: 'row',
      height: 8,
      marginTop: spacing.xs,
      borderRadius: 999,
      backgroundColor: p.surfaceSunk,
      overflow: 'hidden',
    },
  });

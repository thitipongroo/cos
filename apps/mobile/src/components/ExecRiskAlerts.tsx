// The EXECUTIVE Tasks screen's "AI Risk Alerts" feed.
// Implements the risk-alert section of mockup/mobile/08_executive/02_tasks/02_ex_tasks.
//
// WHY THIS IS NOT `<InsightPanel />`. That component draws ONE card containing one paragraph, which
// is what every other AI surface in the app is. This drawing is a FEED: one card per finding, each
// with its own severity chip and confidence, sitting directly on the page under a section heading.
// A panel wrapped around a list of cards would put a second border around every one of them, so the
// composition differs rather than the style — the case ADR-085 keeps separate from a styling bug.
// The report call, the confidence band and the reading of the body are the same functions the panel
// uses, so the two cannot disagree about what the report says.
//
// WHAT IS REAL AND WHAT THE DRAWING ASKS FOR THAT IS NOT.
//   Severity chip     the report's OWN `delay_risk_level`, and the same word on every card — the
//                     endpoint returns one level for the whole report, not one per factor. Saying so
//                     is the point of the section note: a per-card level would be this screen
//                     inventing a severity the model never assigned.
//   CONF: NN%         the report's own `confidence`, through `confidencePercent`. ON EVERY CARD
//                     since 2026-09-07 (PO), where the drawing puts it — and it is the SAME number
//                     on each, because there is one. Nothing is fabricated to fill the row; the
//                     section note that already explains the shared level covers the shared number
//                     too. It left the section header in the same change: printed in both places it
//                     read as two different measurements.
//   Card title        one `risk_factors` entry, set as the drawing's bold `<h4>`. `DelayRiskOutput`
//                     gives a single string per factor, so the drawing's title + body pair stays one
//                     line: writing the second would mean composing the model's finding for it, and
//                     a fabricated FINDING is the core of what ADR-099 forbids — the carve-out that
//                     record gained on 2026-09-07 covers a drawn label, not this
//   Category chip     DRAWN (PO decision 2026-09-07), from `RISK_ALERT_CATEGORIES` in
//                     lib/mockupFigures.ts. `risk_factors` is a list of bare strings with no field
//                     to carry a category, and classifying the text here would be this screen
//                     labelling a finding the model did not label. It is the first drawn value in
//                     this product to sit inside a card of real model output — see ADR-099's second
//                     amendment for the carve-out and its limits.
//                     NOT the drawing's "BIM + Site Logs": that names SYSTEMS, and a claim about
//                     which systems produced a report is the one category ADR-098's second
//                     amendment keeps off these screens. The drawing's own second card carries a
//                     subject instead — "Supply Chain" — and that is the shape used.
//   Action buttons    DRAWN, and they say so on tap — the standing instruction of 2026-09-07:
//                     build what the drawing draws, and where this codebase has no process behind
//                     it, mark it COMING SOON rather than leave it out. They were omitted until
//                     then. "ดูข้อมูล BIM" has no system behind it (BIM is a Type A stub, §32.9)
//                     and "ปรับแผนด่วน" has no endpoint — and could not gain one here anyway, since
//                     master §Phase 10 makes this role READ-ONLY on mobile. Both carry the
//                     `more.tsx` "coming soon" note.
//                     THEY ARE ON EVERY CARD, where the drawing puts them on the first only. The
//                     drawing's own second card is a different SEVERITY, not a card type; giving
//                     one finding buttons and the next none would read as a claim about which
//                     finding is actionable, which no field of the report supports.
//
// THE GENERATE BUTTON STAYS, for the reason recorded in `<InsightPanel />` (PO decision 2026-08-11):
// `POST /ai/reports/*` is the only way to obtain a report's text, and §26 meters AI per tenant, so a
// section that generated on every screen open would spend the tenant's allowance on every tab press.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { LoadingState } from './LoadingState';
import { MaterialSymbol } from './MaterialSymbol';
import { RISK_ALERT_CATEGORIES, RISK_ALERT_FALLBACK } from '../lib/mockupFigures';
import { generateDelayRisk, type AiReport } from '../api/ai';
import { confidenceBand, confidencePercent, type ConfidenceBand } from '../lib/aiConfidence';
import { delayFactorList, delayLevel } from '../lib/delayInsight';
import { decodeJwtPayload } from '../lib/jwt';
import { useAuthStore } from '../store/authStore';
import { useT } from '../i18n';
import { fontFamily, radius, spacing, touchTarget, typography } from '../theme/tokens';
import { usePalette, useIsDark, type Palette } from '../theme/usePalette';

/** Same map `<InsightPanel />` keeps, so one band word never reads two ways in one product. */
const BAND_LABEL: Record<ConfidenceBand, string> = {
  HIGH: 'insight.bandHigh',
  MEDIUM: 'insight.bandMedium',
  LOW: 'insight.bandLow',
  UNKNOWN: 'insight.bandUnknown',
};

/**
 * The accent each level takes — the drawing's `border-l-4` in the level's colour.
 *
 * `delay_risk_level` is a closed set in `DelayRiskOutput` (LOW · MEDIUM · HIGH · CRITICAL), so this
 * maps every value it can hold. Anything else — an older gateway, a changed schema — falls through
 * to the neutral border rather than being coloured by a guess.
 */
function levelColour(level: string | null, p: Palette): string {
  switch (level) {
    case 'CRITICAL':
      return p.danger;
    case 'HIGH':
      return p.warning;
    case 'MEDIUM':
      return p.warning;
    case 'LOW':
      return p.success;
    default:
      return p.border;
  }
}

export function ExecRiskAlerts({
  projectId,
}: {
  /**
   * The project the report is produced for.
   *
   * NO `projectLabel` any more: the "Source: project X" line was removed on 2026-09-07 (PO), so
   * nothing on this section names the project. That is a real loss of context and it is recorded
   * here rather than left to be rediscovered — the report IS per project, and the section no longer
   * says which. The AI panels on the other three screens still carry their source line.
   */
  projectId: string;
}): React.JSX.Element {
  const t = useT();
  const p = usePalette();
  const isDark = useIsDark();
  const styles = useMemo(() => makeStyles(p), [p]);
  const token = useAuthStore((s) => s.accessToken);

  const [report, setReport] = useState<AiReport | null>(null);
  const [loading, setLoading] = useState(false);
  // NO `failed` FLAG ANY MORE (2026-09-07). It existed to choose between two messages —
  // "not generated yet" and "not produced" — and neither is shown now: a gateway that says nothing,
  // for whatever reason, falls back to the drawing's own cards. The distinction had no surface left
  // to appear on, and a state nothing reads is a state that drifts.

  const run = useCallback(async () => {
    // The tenant the gateway trusts comes from the token it verifies; this claim only fills the
    // required body field, and reading it from the same token is what keeps the two consistent.
    const tenantId = String(decodeJwtPayload(token ?? '')['tenant_id'] ?? '');
    if (projectId === '' || tenantId === '') return;
    setLoading(true);
    try {
      setReport(await generateDelayRisk({ projectId, tenantId }));
    } catch {
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [projectId, token]);

  // GENERATED ON MOUNT, not on a press (PO decision 2026-09-07). The drawing shows a feed already
  // full of findings, and a section that must be asked before it says anything is not that. The
  // cost is the one `InsightPanel.autoRun` documents: §26 meters AI per tenant, so this bills on
  // every visit to the tab. One run per mounted section, and only once a project id has arrived.
  const started = useRef(false);
  useEffect(() => {
    if (started.current || projectId === '') return;
    started.current = true;
    void run();
  }, [projectId, run]);

  const level = report === null ? null : delayLevel(report.content);
  const factors = report === null ? [] : delayFactorList(report.content);
  const band = report === null ? null : confidenceBand(report.confidence, report.low_confidence);
  const percent = report === null ? null : confidencePercent(report.confidence);

  /**
   * The cards to draw, from whichever of the two sources is live.
   *
   * THE FEED IS NEVER EMPTY (PO decision 2026-09-07). It used to render one line — "the report was
   * not produced" — wherever the gateway said nothing, and the drawing shows a section already full
   * of findings. So when there is no report the DRAWING'S OWN cards are shown instead, from
   * `RISK_ALERT_FALLBACK`. See that entry: they are findings, which is the thing ADR-099 is most
   * careful about, and they are drawn on the product owner's instruction with COMING SOON recorded
   * against them.
   *
   * The two paths are exclusive and each card knows which it came from, because they do not agree
   * about what a card can carry: a real report has ONE level and ONE confidence for all of its
   * findings, and the drawing gives each card its own. `drawn` is what the section note below reads
   * to decide whether the "one level for the whole report" caveat applies at all.
   */
  const drawn = !loading && report === null;
  const cards = drawn
    ? RISK_ALERT_FALLBACK.value.map((card, index) => ({
        key: `drawn-${card.key}`,
        title: t(`exec.tasks.riskFallback.${card.key}.title`),
        body: t(`exec.tasks.riskFallback.${card.key}.body`),
        level: card.level as string,
        percent: card.confidence as number | null,
        band: 'HIGH' as ConfidenceBand,
        category: RISK_ALERT_CATEGORIES.value[index % RISK_ALERT_CATEGORIES.value.length] ?? '',
      }))
    : factors.map((factor, index) => ({
        key: `${index}-${factor.slice(0, 24)}`,
        title: factor,
        // No body on the real path: `risk_factors` gives ONE string per finding, and writing the
        // second line would be composing the model's output for it.
        body: null,
        level,
        percent,
        band,
        category: RISK_ALERT_CATEGORIES.value[index % RISK_ALERT_CATEGORIES.value.length] ?? '',
      }));

  return (
    <View testID="exec-risk-alerts" style={styles.section}>
      <View style={styles.head}>
        <View style={styles.headLeft}>
          {/* `auto_awesome`, drawn from Material Symbols — and both halves of that need saying.
              WHICH GLYPH: the drawing's HTML names `temp_preferences_custom` on this heading, but its
              rendered screen.png shows a SPARKLE. The two disagree and the picture is what the
              drawing actually is, so this follows the picture (sampled from
              mockup/mobile/08_executive/02_tasks/02_ex_tasks/screen.png, not read off the markup).
              WHICH FONT: `@expo/vector-icons`' MaterialIcons carries an `auto-awesome` of its own,
              but the two sets draw it differently — Symbols leaves the large star OUTLINED where the
              older set fills it — and the screen.png is the outlined one. */}
          <MaterialSymbol name="auto_awesome" size={20} color={p.accent} />
          <Text style={styles.sectionLabel} accessibilityRole="header">
            {t('exec.tasks.riskAlerts')}
          </Text>
        </View>
        {/* THE CONFIDENCE IS NOT HERE ANY MORE (PO 2026-09-07). It is on each card, where the
            drawing puts it. Printed in both places it read as two different measurements of two
            different things. */}
      </View>

      {loading ? (
        <LoadingState testID="exec-risk-loading" variant="ai" theme={isDark ? 'dark' : 'light'} />
      ) : null}

      {/* THE "not produced" LINE IS GONE. Where it stood, the drawing's own cards now stand — see
          `cards` above. A report that came back with no findings at all still says so: that is the
          model reporting nothing to report, which is an answer rather than an absence. */}
      {!loading && report !== null && factors.length === 0 ? (
        <View testID="exec-risk-empty" style={styles.card}>
          <Text style={styles.body}>{t('exec.tasks.riskNone')}</Text>
        </View>
      ) : null}

      {!loading
        ? cards.map((card, index) => {
            const accent = levelColour(card.level, p);
            return (
              <View
                key={card.key}
                testID={`exec-risk-${index}`}
                style={[styles.card, styles.alert, { borderLeftColor: accent }]}
              >
                <View style={styles.alertHead}>
                  <View style={styles.alertHeadLeft}>
                    {card.level === null ? null : (
                      <View style={[styles.levelChip, { borderColor: `${accent}66` }]}>
                        <Text style={[styles.levelText, { color: accent }]}>{card.level}</Text>
                      </View>
                    )}
                    {/* The drawing's category chip — DRAWN on both paths. See the header and ADR-099. */}
                    <View style={styles.categoryChip}>
                      <MaterialSymbol name="inventory_2" size={13} color={p.muted} />
                      <Text style={styles.categoryText}>{card.category}</Text>
                    </View>
                  </View>
                  {/* On the real path this is the report's own confidence — the SAME number on every
                    card, because the report carries one, which is what the footnote explains. On the
                    drawn path each card has the drawing's own. */}
                  {card.band === null ? null : (
                    <Text testID={`exec-risk-${index}-confidence`} style={styles.confText}>
                      {card.percent === null
                        ? t(BAND_LABEL[card.band])
                        : t('exec.tasks.conf', { value: card.percent })}
                    </Text>
                  )}
                </View>
                <Text style={styles.alertTitle}>{card.title}</Text>
                {card.body === null ? null : <Text style={styles.alertText}>{card.body}</Text>}
                {/* COMING SOON — see the header. Neither button may ever write: §Phase 10 makes this
                  role read-only on mobile. */}
                <View style={styles.alertActions}>
                  {(['bim', 'replan'] as const).map((action) => (
                    <Pressable
                      key={action}
                      testID={`exec-risk-${index}-${action}`}
                      accessibilityRole="button"
                      accessibilityLabel={t(`exec.tasks.riskAction.${action}`)}
                      onPress={() =>
                        Alert.alert(t(`exec.tasks.riskAction.${action}`), t('more.comingSoon'))
                      }
                      style={[
                        styles.alertAction,
                        action === 'replan' ? { borderColor: `${accent}66` } : null,
                      ]}
                    >
                      <Text
                        style={[
                          styles.alertActionText,
                          action === 'replan' ? { color: accent } : null,
                        ]}
                      >
                        {t(`exec.tasks.riskAction.${action}`)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            );
          })
        : null}

      {/* ONE LEVEL AND ONE CONFIDENCE for the whole report, so the cards say so rather than
          implying otherwise. The note earns its place the moment a second card appears: two cards
          carrying identical figures look like two measurements that happened to agree. */}
      {!loading && !drawn && factors.length > 1 && level !== null ? (
        <Text testID="exec-risk-level-note" style={styles.footnote}>
          {t('exec.tasks.riskLevelNote')}
        </Text>
      ) : null}
    </View>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    section: { gap: spacing.sm },
    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    headLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flex: 1 },
    sectionLabel: {
      fontSize: typography.body.fontSize,
      fontFamily: fontFamily.semibold,
      color: p.text,
    },
    confText: {
      color: p.accent,
      fontFamily: fontFamily.medium,
      fontSize: 10,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    card: {
      backgroundColor: p.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: p.border,
      padding: spacing.md,
    },
    // The drawing's `border-l-4` in the level's colour. No `bg-gradient-to-r` behind it: gradients
    // are prohibited wherever the signed-in app shows project data (.claude/rules/design-tokens.md),
    // and the two named exceptions are pre-auth screens and <LoadingState />'s `ai` variant.
    alert: { borderLeftWidth: 4, gap: spacing.xs },
    alertHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.xs,
    },
    alertHeadLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexShrink: 1 },
    categoryChip: { flexDirection: 'row', alignItems: 'center', gap: 2, flexShrink: 1 },
    categoryText: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: 10,
    },
    // The drawing's bold `<h4>` over the muted body. Only the title has a source — see the header.
    alertTitle: {
      color: p.text,
      fontFamily: fontFamily.semibold,
      fontSize: typography.caption.fontSize,
      lineHeight: typography.caption.lineHeight,
    },
    levelChip: {
      paddingHorizontal: spacing.xs,
      paddingVertical: 2,
      borderRadius: radius.xl,
      borderWidth: 1,
    },
    levelText: {
      fontFamily: fontFamily.semibold,
      fontSize: 10,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    alertActions: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xs / 2 },
    alertAction: {
      flex: 1,
      minHeight: touchTarget.secondaryButton,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surfaceBright,
    },
    alertActionText: {
      color: p.text,
      fontFamily: fontFamily.medium,
      fontSize: typography.label.fontSize,
    },
    alertText: {
      color: p.text,
      fontFamily: fontFamily.regular,
      fontSize: typography.caption.fontSize,
      lineHeight: typography.caption.lineHeight,
    },
    body: {
      color: p.text,
      fontFamily: fontFamily.regular,
      fontSize: typography.caption.fontSize,
      lineHeight: typography.caption.lineHeight,
    },
    footnote: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
    },
  });

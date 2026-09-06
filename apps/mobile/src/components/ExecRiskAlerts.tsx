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
//   CONF: NN%         the report's own `confidence`, through `confidencePercent` — one report, one
//                     number, so it is drawn once on the section header rather than repeated on
//                     every card as the drawing does
//   Card title        one `risk_factors` entry. `DelayRiskOutput` gives a single string per factor,
//                     so the drawing's title + body pair becomes one line of text — inventing a
//                     second line would mean writing the model's finding for it
//   Source chip       NOT DRAWN. The drawing's "BIM + Site Logs" names systems this platform does
//                     not read: BIM is a Type A stub (spec §32.9). `DelayRiskOutput.sources` does
//                     exist, but it carries verbatim snippets of retrieval context, not system
//                     names, so it cannot fill that chip either
//   Action buttons    NOT DRAWN. "ดูข้อมูล BIM" has no system behind it and "ปรับแผนด่วน" has no
//                     endpoint; master §Phase 10 also makes this role READ-ONLY on mobile. The
//                     drawing's own second card carries no buttons, so a card without them is a
//                     shape the drawing already contains
//
// THE GENERATE BUTTON STAYS, for the reason recorded in `<InsightPanel />` (PO decision 2026-08-11):
// `POST /ai/reports/*` is the only way to obtain a report's text, and §26 meters AI per tenant, so a
// section that generated on every screen open would spend the tenant's allowance on every tab press.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LoadingState } from './LoadingState';
import { MaterialSymbol } from './MaterialSymbol';
import { generateDelayRisk, type AiReport } from '../api/ai';
import { confidenceBand, confidencePercent, type ConfidenceBand } from '../lib/aiConfidence';
import { delayFactorList, delayLevel } from '../lib/delayInsight';
import { decodeJwtPayload } from '../lib/jwt';
import { useAuthStore } from '../store/authStore';
import { useT } from '../i18n';
import { fontFamily, radius, spacing, typography } from '../theme/tokens';
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
  const [failed, setFailed] = useState(false);

  const run = useCallback(async () => {
    // The tenant the gateway trusts comes from the token it verifies; this claim only fills the
    // required body field, and reading it from the same token is what keeps the two consistent.
    const tenantId = String(decodeJwtPayload(token ?? '')['tenant_id'] ?? '');
    if (projectId === '' || tenantId === '') return;
    setLoading(true);
    setFailed(false);
    try {
      setReport(await generateDelayRisk({ projectId, tenantId }));
    } catch {
      setReport(null);
      setFailed(true);
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
  const accent = levelColour(level, p);

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
        {band !== null ? (
          <View testID="exec-risk-confidence" style={styles.confChip}>
            <Text style={styles.confText}>
              {percent === null ? t(BAND_LABEL[band]) : t('exec.tasks.conf', { value: percent })}
            </Text>
          </View>
        ) : null}
      </View>

      {loading ? (
        <LoadingState testID="exec-risk-loading" variant="ai" theme={isDark ? 'dark' : 'light'} />
      ) : null}

      {!loading && report === null ? (
        <View style={styles.card}>
          <Text style={styles.body}>{t(failed ? 'insight.failed' : 'insight.idle')}</Text>
        </View>
      ) : null}

      {!loading && report !== null && factors.length === 0 ? (
        <View testID="exec-risk-empty" style={styles.card}>
          <Text style={styles.body}>{t('exec.tasks.riskNone')}</Text>
        </View>
      ) : null}

      {!loading
        ? factors.map((factor, index) => (
            <View
              key={`${index}-${factor.slice(0, 24)}`}
              testID={`exec-risk-${index}`}
              style={[styles.card, styles.alert, { borderLeftColor: accent }]}
            >
              <View style={styles.alertHead}>
                {level === null ? null : (
                  <View style={[styles.levelChip, { borderColor: `${accent}66` }]}>
                    <Text style={[styles.levelText, { color: accent }]}>{level}</Text>
                  </View>
                )}
              </View>
              <Text style={styles.alertText}>{factor}</Text>
            </View>
          ))
        : null}

      {/* One level for the whole report, so the cards say so rather than implying otherwise. */}
      {!loading && factors.length > 1 && level !== null ? (
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
    alertHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
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

// The AI panel every manager screen draws, in one place.
//
// It started life inside ProcurementInsight, which the Home and Procurement screens both render.
// The Finance screen (mockup 06_project_manager/03_finance) draws the same panel calling a DIFFERENT
// report type, and the honest choice there was one generic panel over a second ninety-line copy that
// would drift from this one the first time the confidence chip changed.
//
// NOTHING HERE IS DRAWN UNTIL THE SERVER SAYS IT. The mockups print "CONF: 96%" and a specific
// recommendation; both are placeholders in a drawing. This panel renders only what the response
// carries — the model's own text, its `confidence`, and the `low_confidence` verdict the gateway is
// required to return. Before the first successful call it shows the action that starts one, and on
// failure it says the report was not produced.
//
// THE "GENERATE REPORT" BUTTON STAYS, THOUGH NO MOCKUP DRAWS ONE (PO decision 2026-08-11). The
// drawings show a panel already full of prose, which implies a report produced somewhere out of
// sight. This product has nowhere out of sight: `POST /ai/reports/*` is the only way to obtain a
// report's text, and `GET /ai/reports/history` returns metadata only — report_id, confidence,
// tokens_used, generated_at — with no `content` field and no endpoint that fetches a stored one.
// Without the button the panel could only fill itself by generating on every screen open, and §26
// meters AI per tenant against a monthly quota (§31.3 alerts at 80 %), so a dashboard that reports
// on load would spend the tenant's allowance every time someone taps a tab. The button is the
// difference between a report someone asked for and a bill nobody authorised.
//
// THE CONFIDENCE IS SHOWN AS A BAND WITH THE NUMBER BESIDE IT, not as a bare percentage — see
// lib/aiConfidence.ts for the guidance and for why the band edges are the platform's own.
//
// THE `executive` VARIANT IS THE ONE EXCEPTION TO THAT, and it is a narrow one (PO 2026-09-07,
// mockup 08_executive/01_home/01_ex_dashboard). That drawing puts `✓ CONF: 94%` on the header row,
// so on this variant the NUMBER leads and the band is carried by the chip's tone and its glyph:
// success + `check-circle` for HIGH, warning + `error-outline` for MEDIUM, danger + `error-outline`
// for LOW. The band WORD still prints whenever there is no number to print, which is the case
// lib/aiConfidence.ts's guidance is really protecting — a reader who cannot be told how sure the
// model is must not be shown a figure at all. The other five AI surfaces are untouched and still
// lead with the word.
//
// WHAT THE DRAWING ASKS FOR THAT IS NOT DRAWN.
//   Badge pills inside the prose   The drawing marks up words INSIDE the model's paragraph — a
//                                  green STABLE and a red "ACTION REQUIRED:". The panel prints the
//                                  string the gateway returned and nothing else; colouring words
//                                  inside it means pattern-matching model output and assigning a
//                                  severity the model never stated. Where a report DOES carry a
//                                  level, this panel already shows it as its own chip (`level`),
//                                  which is the same information without the invention.
//                                  `executive-summary` returns no level, so no chip appears here.
//   SOURCES: BIM & ERP DATA        The FOOTER is drawn; that TEXT is not. BIM is a Type A stub
//                                  (spec §32.9) and there is no ERP integration, so the line would
//                                  tell an executive the report is grounded in two enterprise
//                                  systems that are not connected. That is not an ADR-099 figure —
//                                  a wrong number is a wrong number, a false provenance claim
//                                  changes how much the reader trusts everything above it. Same
//                                  call `<ExecRiskAlerts />` made on 2026-09-05 about the same
//                                  drawing's "BIM + Site Logs" chip. The footer therefore carries
//                                  the source this panel CAN name — the project the report was
//                                  produced for — in the drawing's own divider-and-caps treatment.
//
// PER PROJECT AND IT SAYS SO. Every report endpoint is project-scoped, so the host screen picks a
// project and the panel names it — product-owner decision 2026-08-10, taken over the alternative of
// choosing a project silently and letting one project's findings read as a tenant-wide statement.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { LoadingState } from './LoadingState';
import { MaterialIcons } from '@expo/vector-icons';
import type { AiReport } from '../api/ai';
import { decodeJwtPayload } from '../lib/jwt';
import { confidenceBand, confidencePercent } from '../lib/aiConfidence';
import { insightAdvice } from '../lib/insightAdvice';
import { useAuthStore } from '../store/authStore';
import { useT } from '../i18n';
import { fontFamily, radius, spacing, touchTarget, typography } from '../theme/tokens';
import { usePalette, type Palette, useIsDark } from '../theme/usePalette';

const BAND_LABEL = {
  HIGH: 'insight.bandHigh',
  MEDIUM: 'insight.bandMedium',
  LOW: 'insight.bandLow',
  UNKNOWN: 'insight.bandUnknown',
} as const;

/**
 * Pull readable prose out of the structured body.
 *
 * `content` is declared free-form per report type, so this takes the first string value rather than
 * assuming a field name that a template change could rename out from under it. Nothing readable ⇒ the
 * panel says the report carried no summary, instead of rendering `[object Object]`.
 */
export function summaryText(content: Record<string, unknown>): string | null {
  for (const value of Object.values(content)) {
    if (typeof value === 'string' && value.trim() !== '') return value;
  }
  return null;
}

export interface InsightPanelProps {
  projectId: string;
  /** The report call. Takes both ids because every report request body requires both. */
  generate: (params: { projectId: string; tenantId: string }) => Promise<AiReport>;
  /** i18n key for the panel's eyebrow — each screen names the report it actually asks for. */
  titleKey: string;
  /**
   * The drawing's glyph. Three of the four panels use `memory`; the More menu's uses `psychology`.
   * It was hardcoded to `psychology` for all of them.
   */
  icon?: keyof typeof MaterialIcons.glyphMap;
  testID: string;
  /**
   * What to call the project on the "Source:" line. Defaults to the id, which is what the panel had
   * before — and a UUID is thirty-six characters of noise in a sentence meant to tell the reader
   * whose figures these are.
   */
  projectLabel?: string;
  /**
   * Which drawing this panel is following.
   *
   * The three mockups do not agree, so neither does this. `plain` is the procurement dashboard's
   * panel — the ordinary card surface with a faint accent wash. `washed` is the finance dashboard's
   * — a teal field, a filled confidence pill and a button that sits at its own width rather than
   * spanning the card. `executive` is mockup 08_executive/01_home/01_ex_dashboard: an accent-tinted
   * BORDER, a 3px strip and no wash at all. All three keep the left accent strip; finance draws it
   * at 4px and the executive card at 3.
   *
   * The executive drawing also carries a blurred cyan blob behind its top-right corner. That is NOT
   * reproduced and the omission is deliberate: `.claude/rules/design-tokens.md` prohibits glow
   * wherever the signed-in app shows project data, and names the only two exceptions (pre-auth entry
   * screens, and `<LoadingState />`'s `ai` variant). A dashboard of budgets is neither. The drawing's
   * `.ai-glow` class is not affected by that rule — `box-shadow: -3px 0 0 0` has zero blur radius, so
   * it is an EDGE, and that is exactly what the 3px strip draws.
   */
  variant?: 'plain' | 'washed' | 'executive';
  /**
   * The drawing's follow-up button ("Review Adjustments ›" on the Finance panel). Optional: the
   * panels whose mockup has no such button do not grow one.
   */
  followUp?: { labelKey: string; onPress: () => void };
  /**
   * How to read this report's prose, when `summaryText`'s first-string default is wrong for it.
   *
   * DELAY_RISK is the case that forced this prop and is still the only user (PO decision
   * 2026-08-12). `DelayRiskOutput` has NO prose field: its fields are `delay_risk_level`,
   * `risk_factors`, `confidence`, `data_points_used` and a constant `disclaimer` — so the default
   * takes the first string it finds and prints the word "HIGH" as the panel's paragraph. That
   * mismatch is on record: app/(app)/more.tsx documents it being escalated in August and answered
   * then by choosing a different report type for that panel. Here the report type is not
   * substitutable — DELAY_RISK is the only schedule report the gateway serves — so the panel learns
   * to read it instead.
   */
  bodyFrom?: (content: Record<string, unknown>) => string | null;
  /**
   * A short status word to show as a chip beside the confidence band — DELAY_RISK's
   * `delay_risk_level`. Rendered as the model returned it, in the panel's ordinary chip: mapping
   * LOW/MEDIUM/HIGH/CRITICAL onto colours would be this component inventing a severity scale that
   * the report does not define.
   */
  levelFrom?: (content: Record<string, unknown>) => string | null;
  /**
   * Set false when `bodyFrom` already prints the array the advice block would draw from, so the
   * panel does not say the same thing twice — `insightAdvice` reads `risk_factors` too.
   */
  showAdvice?: boolean;
  /**
   * Extra controls rendered INSIDE the card, after everything else.
   *
   * The executive drawing puts its "Mitigation" and "Dismiss" buttons inside the AI card rather than
   * under it, which is where `ExecHome` had them. A slot rather than two more props: they belong to
   * the host screen — they are that screen's actions, not the panel's — and the panel has no
   * business knowing what they do.
   */
  footer?: React.ReactNode;
  /**
   * Generate on mount instead of on a button press, and draw no button.
   *
   * THIS SPENDS AI QUOTA ON EVERY SCREEN OPEN. The button existed precisely to stop that:
   * `POST /ai/reports/*` is the only way to obtain a report's text, §26 meters AI per tenant against
   * a monthly quota, and §31.3 alerts at 80% of it — so a panel that reports on load bills the
   * tenant every time someone taps the tab (PO decision 2026-08-11, which this reverses for the
   * screens that pass it). Product-owner decision 2026-09-07: the EXECUTIVE screens show the
   * narrative their drawings show, and a card that must be pressed before it says anything is not
   * that.
   *
   * It runs ONCE per mounted panel and only once a project id has arrived — never on every render,
   * and never while `projectId` is still the empty string the host starts with.
   */
  autoRun?: boolean;
}

export function InsightPanel({
  projectId,
  generate,
  titleKey,
  icon = 'psychology',
  testID,
  projectLabel,
  variant = 'plain',
  followUp,
  bodyFrom,
  levelFrom,
  showAdvice = true,
  footer,
  autoRun = false,
}: InsightPanelProps): React.JSX.Element {
  const t = useT();
  const p = usePalette();
  const isDark = useIsDark();
  const styles = useMemo(() => makeStyles(p), [p]);
  const washed = variant === 'washed';
  const executive = variant === 'executive';
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
      setReport(await generate({ projectId, tenantId }));
    } catch {
      setReport(null);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [projectId, token, generate]);

  // One generation per mounted panel. The ref, not a piece of state: re-running on a re-render would
  // bill the tenant again, and `report !== null` is not a guard — a failed call leaves it null.
  const started = useRef(false);
  useEffect(() => {
    if (!autoRun || started.current || projectId === '') return;
    started.current = true;
    void run();
  }, [autoRun, projectId, run]);

  const band = report === null ? null : confidenceBand(report.confidence, report.low_confidence);
  const percent = report === null ? null : confidencePercent(report.confidence);
  /**
   * The colour the `executive` chip takes, which is how that variant carries the BAND once the
   * number has taken the words (see the header). UNKNOWN never reaches the toned branch — the chip
   * prints the band word instead when there is no percentage — but it is mapped rather than left to
   * a default so the switch is total.
   */
  const bandTone =
    band === 'HIGH'
      ? p.success
      : band === 'MEDIUM'
        ? p.warning
        : band === 'LOW'
          ? p.danger
          : p.muted;
  const text = report === null ? null : (bodyFrom ?? summaryText)(report.content);
  const level = report === null || levelFrom === undefined ? null : levelFrom(report.content);
  const advice = report === null || !showAdvice ? null : insightAdvice(report.content);

  return (
    <View testID={testID} style={[styles.panel, executive && styles.panelExecutive]}>
      {/* The drawing's card shape: the ordinary card border, a 6px accent strip down the left edge
          and a 5%-accent wash over the surface — not an accent-coloured border on all four sides,
          which is what this was and which made the panel shout louder than the money beside it.
          The executive drawing is the one place that DOES take an accent border, and it drops the
          wash in exchange, so the two never shout together. */}
      <View
        style={[
          styles.accentStrip,
          washed && styles.accentStripWashed,
          executive && styles.accentStripExecutive,
        ]}
      />
      {executive ? null : (
        <View style={[styles.tint, washed && styles.tintWashed]} pointerEvents="none" />
      )}
      <View style={styles.head}>
        <View style={styles.eyebrowRow}>
          <MaterialIcons name={icon} size={18} color={p.accent} />
          <Text style={styles.eyebrow}>{t(titleKey)}</Text>
        </View>
        <View style={styles.headChips}>
          {/* The report's own level word, where it has one. Beside the confidence, not instead of
              it: they answer different questions — how bad, and how sure. */}
          {level !== null && level !== '' ? (
            <View testID="insight-level" style={[styles.bandChip, washed && styles.bandChipWashed]}>
              <Text style={[styles.bandText, washed && styles.bandTextWashed]}>{level}</Text>
            </View>
          ) : null}
          {band !== null ? (
            <View
              testID="insight-confidence"
              style={[
                styles.bandChip,
                washed && styles.bandChipWashed,
                executive && [styles.bandChipExecutive, { borderColor: `${bandTone}66` }],
              ]}
            >
              {/* The drawing's tick. It is NOT always a tick: a chip that says "MEDIUM confidence"
                  under a green check mark reads as reassurance the band does not give. */}
              {executive && percent !== null ? (
                <MaterialIcons
                  name={band === 'HIGH' ? 'check-circle' : 'error-outline'}
                  size={13}
                  color={bandTone}
                  accessibilityElementsHidden
                  importantForAccessibility="no"
                />
              ) : null}
              <Text
                style={[
                  styles.bandText,
                  washed && styles.bandTextWashed,
                  executive && { color: bandTone },
                ]}
              >
                {percent === null
                  ? t(BAND_LABEL[band])
                  : executive
                    ? t('insight.conf', { value: percent })
                    : `${t(BAND_LABEL[band])} · ${String(percent)}%`}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      {loading ? (
        <LoadingState testID="insight-loading" variant="ai" theme={isDark ? 'dark' : 'light'} />
      ) : null}

      {!loading && report === null && !failed ? (
        <Text style={styles.body}>{t('insight.idle')}</Text>
      ) : null}

      {!loading && failed ? <Text style={styles.body}>{t('insight.failed')}</Text> : null}

      {!loading && report !== null ? (
        <Text testID="insight-body" style={styles.body}>
          {text ?? t('insight.noSummary')}
        </Text>
      ) : null}

      {/* The drawing's lightbulb block. It appears only once a report has carried something to put
          in it, and it is LABELLED for what that something is — see lib/insightAdvice.ts for why a
          procurement risk item must not be printed under the word "Recommendation". */}
      {!loading && advice !== null ? (
        <View testID={`insight-${advice.kind}`} style={styles.advice}>
          <MaterialIcons
            name={advice.kind === 'recommendation' ? 'lightbulb' : 'error-outline'}
            size={16}
            color={p.accent}
          />
          <View style={styles.adviceText}>
            <Text style={styles.adviceLabel}>
              {t(advice.kind === 'recommendation' ? 'insight.recommendation' : 'insight.risk')}
            </Text>
            <Text style={styles.body}>{advice.text}</Text>
          </View>
        </View>
      ) : null}

      {/* The mockup's "Source:" line. It names the project the figures came from, which is the whole
          reason the host screen asks for one — and on the `executive` variant it also IS the
          drawing's SOURCES footer: a divider, then the same line in caps. See the header for why it
          names the project rather than the drawing's "BIM & ERP DATA". */}
      <Text style={[styles.source, executive && styles.sourceExecutive]}>
        {t('insight.source', { project: projectLabel ?? projectId })}
      </Text>

      {/* No button when the panel generates for itself — there is nothing left for it to ask. */}
      {autoRun ? null : (
        <Pressable
          testID="insight-run"
          accessibilityRole="button"
          accessibilityLabel={t('insight.action')}
          accessibilityState={{ disabled: loading || projectId === '' }}
          disabled={loading || projectId === ''}
          onPress={() => void run()}
          style={[
            styles.action,
            washed && styles.actionWashed,
            (loading || projectId === '') && styles.actionDisabled,
          ]}
        >
          <Text style={styles.actionText}>{t('insight.action')}</Text>
          <MaterialIcons name="chevron-right" size={18} color={p.primary} />
        </Pressable>
      )}

      {followUp !== undefined ? (
        <Pressable
          testID="insight-follow-up"
          accessibilityRole="button"
          accessibilityLabel={t(followUp.labelKey)}
          onPress={followUp.onPress}
          style={styles.followUp}
        >
          <Text style={styles.followUpText}>{t(followUp.labelKey)}</Text>
          <MaterialIcons name="chevron-right" size={18} color={p.text} />
        </Pressable>
      ) : null}

      {/* The host's own controls, inside the card — see `footer`. */}
      {footer}
    </View>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    panel: {
      borderWidth: 1,
      borderColor: p.border,
      borderRadius: radius.lg,
      backgroundColor: p.surface,
      padding: spacing.md,
      paddingLeft: spacing.md + 6,
      gap: spacing.sm,
      overflow: 'hidden',
    },
    // The executive drawing's card: `border border-cos-cyan/30` — 30% of the accent, which is 4D in
    // the alpha byte — and the left padding closes up to match the narrower strip.
    panelExecutive: { borderColor: `${p.accent}4D`, paddingLeft: spacing.md + 3 },
    accentStripWashed: { width: 4 },
    // `box-shadow: -3px 0 0 0 #06B6D4` in the drawing's `.ai-glow`.
    accentStripExecutive: { width: 3 },
    // The drawing's teal field: the accent laid over the card rather than beside it.
    tintWashed: { backgroundColor: `${p.accent}1F` },
    bandChipWashed: { backgroundColor: `${p.accent}33`, borderColor: 'transparent' },
    bandTextWashed: { color: p.text },
    // Sits at its own width, as the drawing places it — not spanning the panel.
    actionWashed: { alignSelf: 'flex-start', paddingHorizontal: spacing.md },
    accentStrip: {
      position: 'absolute',
      top: 0,
      left: 0,
      bottom: 0,
      width: 6,
      backgroundColor: p.accent,
    },
    tint: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: `${p.accent}0D`,
    },
    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    // Two chips can now sit here (a level and a confidence), so they need their own row to space
    // themselves in rather than both being pushed against the panel's right edge.
    headChips: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    eyebrow: {
      color: p.accent,
      fontFamily: fontFamily.semibold,
      fontSize: 11,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
    },
    bandChip: {
      paddingHorizontal: spacing.xs,
      paddingVertical: 2,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: p.accent,
      backgroundColor: p.bg,
    },
    // The drawing's confidence read-out is a glyph beside the figure with no plate behind it, so the
    // executive chip drops the fill and keeps a hairline in the band's own tone (set inline, since
    // the tone is per report). `flexDirection` is what puts the tick on the same line as the number.
    bandChipExecutive: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs / 2,
      backgroundColor: 'transparent',
    },
    bandText: {
      color: p.accent,
      fontFamily: fontFamily.medium,
      fontSize: 10,
      letterSpacing: 0.5,
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
    // The drawing's SOURCES footer: a divider across the card, then the line in caps at the eyebrow
    // size. Same text as every other variant's source line — see the header for why it names the
    // project and not the drawing's two systems.
    sourceExecutive: {
      marginTop: spacing.xs,
      paddingTop: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: p.border,
      fontFamily: fontFamily.medium,
      fontSize: 10,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    action: {
      flexDirection: 'row',
      gap: spacing.xs / 2,
      minHeight: touchTarget.secondaryButton,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.elevated,
      alignItems: 'center',
      justifyContent: 'center',
    },
    advice: {
      flexDirection: 'row',
      gap: spacing.xs,
      padding: spacing.sm,
      borderRadius: radius.md,
      backgroundColor: p.bg,
    },
    adviceText: { flex: 1, gap: 2 },
    adviceLabel: {
      color: p.accent,
      fontFamily: fontFamily.semibold,
      fontSize: 10,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    followUp: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs / 2,
      minHeight: touchTarget.secondaryButton,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.bg,
    },
    followUpText: {
      color: p.text,
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    actionDisabled: { opacity: 0.6 },
    actionText: {
      color: p.primary,
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
  });

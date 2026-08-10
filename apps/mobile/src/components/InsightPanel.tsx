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
// THE CONFIDENCE IS SHOWN AS A BAND WITH THE NUMBER BESIDE IT, not as a bare percentage — see
// lib/aiConfidence.ts for the guidance and for why the band edges are the platform's own.
//
// PER PROJECT AND IT SAYS SO. Every report endpoint is project-scoped, so the host screen picks a
// project and the panel names it — product-owner decision 2026-08-10, taken over the alternative of
// choosing a project silently and letting one project's findings read as a tenant-wide statement.

import { useCallback, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import type { AiReport } from '../api/ai';
import { decodeJwtPayload } from '../lib/jwt';
import { confidenceBand, confidencePercent } from '../lib/aiConfidence';
import { insightAdvice } from '../lib/insightAdvice';
import { useAuthStore } from '../store/authStore';
import { useT } from '../i18n';
import { fontFamily, radius, spacing, touchTarget, typography } from '../theme/tokens';
import { usePalette, type Palette } from '../theme/usePalette';

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
  testID: string;
  /**
   * The drawing's follow-up button ("Review Adjustments ›" on the Finance panel). Optional: the
   * panels whose mockup has no such button do not grow one.
   */
  followUp?: { labelKey: string; onPress: () => void };
}

export function InsightPanel({
  projectId,
  generate,
  titleKey,
  testID,
  followUp,
}: InsightPanelProps): React.JSX.Element {
  const t = useT();
  const p = usePalette();
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
      setReport(await generate({ projectId, tenantId }));
    } catch {
      setReport(null);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [projectId, token, generate]);

  const band = report === null ? null : confidenceBand(report.confidence, report.low_confidence);
  const percent = report === null ? null : confidencePercent(report.confidence);
  const text = report === null ? null : summaryText(report.content);
  const advice = report === null ? null : insightAdvice(report.content);

  return (
    <View testID={testID} style={styles.panel}>
      <View style={styles.head}>
        <View style={styles.eyebrowRow}>
          <MaterialIcons name="psychology" size={18} color={p.accent} />
          <Text style={styles.eyebrow}>{t(titleKey)}</Text>
        </View>
        {band !== null ? (
          <View testID="insight-confidence" style={styles.bandChip}>
            <Text style={styles.bandText}>
              {percent === null
                ? t(BAND_LABEL[band])
                : `${t(BAND_LABEL[band])} · ${String(percent)}%`}
            </Text>
          </View>
        ) : null}
      </View>

      {loading ? <ActivityIndicator testID="insight-loading" color={p.primary} /> : null}

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
          reason the host screen asks for one. */}
      <Text style={styles.source}>{t('insight.source', { project: projectId })}</Text>

      <Pressable
        testID="insight-run"
        accessibilityRole="button"
        accessibilityLabel={t('insight.action')}
        accessibilityState={{ disabled: loading || projectId === '' }}
        disabled={loading || projectId === ''}
        onPress={() => void run()}
        style={[styles.action, (loading || projectId === '') && styles.actionDisabled]}
      >
        <Text style={styles.actionText}>{t('insight.action')}</Text>
      </Pressable>

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
    </View>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    panel: {
      borderWidth: 1,
      borderColor: p.accent,
      borderRadius: radius.lg,
      backgroundColor: p.surface,
      padding: spacing.md,
      gap: spacing.sm,
    },
    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
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
    action: {
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

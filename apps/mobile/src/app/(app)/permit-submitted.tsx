// Permit request submitted — the confirmation after a permit is raised.
//
// Reference mockup: `mockup/mobile/07_safety_officer/04_permit_management/03_permit_request_submitted/`.
//
// EVERY FIGURE ON THIS SCREEN COMES FROM THE SERVER'S OWN RESPONSE, passed as route params by the
// form: the permit number it stored, the type it stored, and the status it assigned. Nothing is
// re-fetched (there is no permit-detail endpoint to fetch from) and nothing is assumed — in
// particular the status pill prints what came back rather than a hardcoded PENDING, because a
// default is a server-side decision and this screen is not the place to restate it.
//
// REDRAWN 2026-09-17 (R23) to the Stitch screen "Permit Request Submitted - Success State"
// (1e91678f6603…, byte-identical to the repo drawing), with the 2026-08-13 "not available yet" note
// reversed (D40) and the drawing's photograph bundled (D44):
//
//   THE BACK CONTROL GOES TO THE REGISTER, NOT TO THE FORM. The drawing heads the screen with an
//   arrow_back, and this route is TERMINAL — it is reached with `router.replace` — so the arrow is
//   drawn and sends the reader to `/permits`. Going back to the form that already succeeded would
//   let the same request be raised twice.
//
//   THE INSIGHT CARD IS DRAWN IN FULL (`PERMIT_SUBMITTED_INSIGHT`): the sentence, the 98 %
//   confidence and the source line. No AI reads a permit in this platform, and nothing routes one to
//   a controlling engineer — §15.5's chain is Safety Officer → PM, worked by people. It follows the
//   project's AI-card standard: one way in, the footer chevron (R22, D38).
//
//   THE ILLUSTRATION is the drawing's own photograph, bundled under `assets/safety/` like the CRM
//   and Tenant Admin screens' images already are.

import { useMemo } from 'react';
import { View, Text, Image, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { permitStatusTone } from '../../lib/safetyOfficer';
import { AiCardFooter } from '../../components/AiCardFooter';
import { useComingSoon } from '../../components/useComingSoon';
import { PERMIT_SUBMITTED_INSIGHT } from '../../lib/mockupFigures';
import { useI18n } from '../../i18n';
import { fontFamily, radius, spacing, touchTarget, typography } from '../../theme/tokens';
import { usePalette, type Palette } from '../../theme/usePalette';
import { screenChrome } from '../../theme/screenStyles';
import submittedPhoto from '../../../assets/safety/permit-submitted.jpg';

/** A route param arrives as `string | string[]`; take the first value either way. */
function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

export default function PermitSubmittedScreen(): React.JSX.Element {
  const router = useRouter();
  const { t } = useI18n();
  const p = usePalette();
  const styles = useMemo(() => makeStyles(p), [p]);
  const soon = useComingSoon();
  const params = useLocalSearchParams<{
    permitNumber?: string;
    permitType?: string;
    status?: string;
  }>();

  const permitNumber = one(params.permitNumber);
  const permitType = one(params.permitType);
  const status = one(params.status);

  const tone = permitStatusTone(status);
  const toneColour =
    tone === 'danger'
      ? p.danger
      : tone === 'warning'
        ? p.warning
        : tone === 'success'
          ? p.success
          : p.muted;

  return (
    <ScrollView
      testID="permit-submitted-screen"
      style={styles.root}
      contentContainerStyle={styles.page}
    >
      {/* The drawing's arrow — to the REGISTER, never back to the form (see the header). */}
      <TouchableOpacity
        testID="permit-submitted-back"
        accessibilityRole="button"
        accessibilityLabel={t('common.back')}
        onPress={() => router.replace('/permits')}
        style={styles.backRow}
      >
        <MaterialIcons name="arrow-back" size={22} color={p.accent} />
      </TouchableOpacity>

      <View style={styles.hero}>
        <MaterialIcons name="check-circle" size={72} color={p.success} />
        <Text testID="permit-submitted-title" style={styles.title}>
          {t('safety.permitSubmitted.title')}
        </Text>
      </View>

      <View testID="permit-submitted-card" style={styles.card}>
        <View style={[styles.accent, { backgroundColor: p.success }]} />
        <View style={styles.cardBody}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>{t('safety.permitSubmitted.requestId')}</Text>
            <Text testID="permit-submitted-number" style={styles.rowValue} numberOfLines={1}>
              {permitNumber}
            </Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.rowLabel}>{t('safety.permitSubmitted.type')}</Text>
            <Text style={styles.rowValue}>
              {permitType === '' ? '—' : t(`safety.permits.type.${permitType}`)}
            </Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.rowLabel}>{t('safety.permitSubmitted.status')}</Text>
            <View style={[styles.statusPill, { borderColor: toneColour }]}>
              <Text
                testID="permit-submitted-status"
                style={[styles.statusText, { color: toneColour }]}
              >
                {status}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* INSIGHT — DRAWN in full: nothing reads a permit, and nothing routes one onward. */}
      <View
        testID="permit-submitted-insight"
        style={[styles.aiCard, { borderLeftColor: p.accent }]}
      >
        <View style={styles.aiHead}>
          <MaterialIcons name="auto-awesome" size={18} color={p.accent} />
          <Text style={[styles.aiTitle, { color: p.accent }]}>
            {t('safety.permits.insightTitle')}
          </Text>
        </View>
        <Text style={styles.insightBody}>{t('safety.permits.insightBody')}</Text>
        <AiCardFooter
          testID="permit-submitted-insight-foot"
          percent={PERMIT_SUBMITTED_INSIGHT.value.confidence}
          source={t('safety.permits.insightSource')}
          confLabel={t('insight.confShort')}
          sourceLabel={t('insight.sourceShort')}
          // The card's one way in (R22, D38) — nothing tracks a permit automatically.
          onPress={() => soon('safety.permits.insightTitle')}
          palette={p}
        />
      </View>

      {/* The drawing's closing photograph (D44). */}
      <Image
        testID="permit-submitted-illustration"
        source={submittedPhoto}
        style={styles.illustration}
        accessibilityIgnoresInvertColors
      />

      <TouchableOpacity
        testID="permit-submitted-home"
        accessibilityRole="button"
        accessibilityLabel={t('safety.permitSubmitted.backHome')}
        onPress={() => router.replace('/home')}
        style={styles.primary}
      >
        <Text style={styles.primaryText}>{t('safety.permitSubmitted.backHome')}</Text>
        <MaterialIcons name="home" size={18} color={p.onPrimary} />
      </TouchableOpacity>

      <TouchableOpacity
        testID="permit-submitted-view"
        accessibilityRole="button"
        accessibilityLabel={t('safety.permitSubmitted.viewStatus')}
        onPress={() => router.replace('/permits')}
        style={styles.secondary}
      >
        <Text style={styles.secondaryText}>{t('safety.permitSubmitted.viewStatus')}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    ...screenChrome(p),
    page: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl * 2 },
    backRow: {
      alignSelf: 'flex-start',
      width: touchTarget.iconButton,
      height: touchTarget.iconButton,
      alignItems: 'center',
      justifyContent: 'center',
    },
    insightBody: {
      color: p.text,
      fontSize: typography.label.fontSize,
      lineHeight: typography.label.fontSize * 1.5,
      fontFamily: fontFamily.regular,
    },
    illustration: { width: '100%', height: 128, borderRadius: radius.lg, opacity: 0.8 },
    hero: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
    // Hero-sized, and it IS this screen's name — but the screen is not a tab, so §32.7's
    // "a tab screen is named by its tab" rule (pageTitle.spec.ts) does not reach it.
    title: {
      color: p.text,
      textAlign: 'center',
      fontSize: typography.hero.fontSize,
      lineHeight: typography.hero.lineHeight,
      fontFamily: fontFamily.bold,
    },
    card: {
      overflow: 'hidden',
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
    },
    accent: { height: 4 },
    cardBody: { padding: spacing.md, gap: spacing.sm },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    rowLabel: {
      color: p.muted,
      fontSize: typography.label.fontSize,
      fontFamily: fontFamily.semibold,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    rowValue: {
      flexShrink: 1,
      color: p.text,
      fontSize: typography.caption.fontSize,
      fontFamily: fontFamily.semibold,
    },
    divider: { height: 1, backgroundColor: p.border },
    statusPill: {
      borderWidth: 1,
      borderRadius: radius.xl,
      paddingHorizontal: spacing.xs,
      paddingVertical: 1,
    },
    statusText: { fontSize: 10, fontFamily: fontFamily.bold, letterSpacing: 0.5 },
    primary: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      minHeight: touchTarget.primaryButton + 4,
      borderRadius: radius.md,
      backgroundColor: p.primary,
      marginTop: spacing.sm,
    },
    primaryText: {
      color: p.onPrimary,
      fontSize: typography.caption.fontSize,
      fontFamily: fontFamily.semibold,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    secondary: {
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: touchTarget.secondaryButton,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: p.border,
    },
    secondaryText: {
      color: p.text,
      fontSize: typography.caption.fontSize,
      fontFamily: fontFamily.medium,
    },
  });

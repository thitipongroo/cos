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
// TWO DEVIATIONS FROM THE DRAWING, both recorded here per ADR-085:
//
//   NO BACK CONTROL. The drawing heads the screen with an arrow_back. This route is TERMINAL — it is
//   reached with `router.replace` and is absent from BREADCRUMB_MAP, which is what denies it the
//   TopBar's Back — because "back" from here is the form that already succeeded, and re-submitting it
//   would raise a second permit. The drawing's own two buttons are the way out, and they are built.
//
//   NO ILLUSTRATION. The drawing closes with a decorative site photograph. There is no stock-image
//   pipeline in this app and none of the twelve roles' screens carries one; adding a bundled JPEG for
//   ornament would be the first.
//
// THE AI TRACKING NOTE ("98% — เอกสารครบถ้วนแล้ว… กำลังส่งให้วิศวกรควบคุม") is drawn and marked. No
// AI reads a permit in this platform, and nothing routes one to a controlling engineer: §15.5's chain
// is Safety Officer → PM, worked by people, and §22.3 forbids a placeholder that reads as AI.

import { useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { permitStatusTone } from '../../lib/safetyOfficer';
import { UnavailableNote } from '../../components/UnavailableNote';
import { useI18n } from '../../i18n';
import { fontFamily, radius, spacing, touchTarget, typography } from '../../theme/tokens';
import { usePalette, type Palette } from '../../theme/usePalette';

/** A route param arrives as `string | string[]`; take the first value either way. */
function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

export default function PermitSubmittedScreen(): React.JSX.Element {
  const router = useRouter();
  const { t } = useI18n();
  const p = usePalette();
  const styles = useMemo(() => makeStyles(p), [p]);
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
    <ScrollView style={styles.root} contentContainerStyle={styles.page}>
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

      <UnavailableNote
        testID="permit-submitted-ai-unavailable"
        reason={t('safety.permitSubmitted.aiUnavailable')}
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
    root: { flex: 1, backgroundColor: p.bg },
    page: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl * 2 },
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

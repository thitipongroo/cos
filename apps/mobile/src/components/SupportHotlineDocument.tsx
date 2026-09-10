// IT Support Hotline — the content BOTH hotline routes render.
//
// DRAWING: mockup/mobile/01_authen/05_get_help/02_hotline_details. Drawn complete, exactly as the
// mockup draws it (product-owner decision 2026-09-10, "วาด UI ให้ครบตามแบบ mockup").
//
// A child of the Support Centre on both sides of login, reached by the chevron the drawing puts on
// that screen's IT Hotline card — which is why that card no longer dials in place (§32.7, ADR-093
// decision 4). `CALL NOW` here is the dial.
//
// Same pre-auth/post-auth pair as `SupportCenterDocument` and `PrivacyPolicyDocument`: one copy of
// the content, two frames around it, the palette taken as a prop rather than read from the store.
// The pre-auth route is pinned dark because it is pushed from the dark OTP flow (§32.7 pinned
// pre-auth surfaces); the post-auth route follows the user's theme.
//
// ── WHAT DIALS, AND WHAT IS DRAWN ──────────────────────────────────────────────────────────────
//
// THE HOTLINE NUMBER IS REAL WHERE A DEPLOYMENT SET ONE. `EXPO_PUBLIC_SUPPORT_IT_HOTLINE` already
// exists and is already read by the Support Centre's IT Hotline card, so this screen reads the same
// variable and `CALL NOW` places a real call wherever it is configured. Unset, it falls back to the
// drawn number — which is what "draw the mockup complete" asks for, and the register below says so.
//
// EVERYTHING ELSE ON THIS SCREEN IS DRAWN, and every drawn value is registered in
// `lib/mockupFigures.ts` (ADR-099) before it renders: the operating hours, the two regional desks
// and their numbers. `platform.support_desk_default` and `platform.tenant_support_desks` exist as
// tables (migration `20260818000001_support_desk_and_help_chat`) and hold columns for all of it —
// `itHotlinePhone`, `itHotlineLabel`, `itHotlineDescription`, `operatingHours`, `regionalHotlines` —
// but `GET /api/v1/support/desk` is not written, so nothing can read them yet. The register entries
// name those columns as what replaces each figure.
//
// THE PREPARATION CHECKLIST IS THE DRAWING'S OWN, all three rows and both lines of each. ADR-093's
// Rationale argues for rewriting it against what this product has — a device record, a project code,
// a `COS-{DOMAIN}-{NNN}` error code — and the product owner's 2026-09-10 instruction supersedes that
// for this screen: draw the mockup. The ADR stays on disk with its reasoning intact for whoever
// builds the endpoint.
//
// EVERY CALL BUTTON DIALS. There is no "coming soon" here — `Linking.openURL('tel:…')` is real for
// all three, so nothing on this screen is inert.

import { useMemo } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Linking, Alert } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useT } from '../i18n';
import { HOTLINE_HOURS, HOTLINE_NUMBER, HOTLINE_REGIONS } from '../lib/mockupFigures';
import { fontFamily, plateRadius, radius, spacing, touchTarget, typography } from '../theme/tokens';
import type { Palette } from '../theme/usePalette';

/** The deployment's own number, when it has one. The same variable the Support Centre reads. */
const IT_HOTLINE: string | null = process.env['EXPO_PUBLIC_SUPPORT_IT_HOTLINE']?.trim() || null;

/** The glyph plate at the head of the call card. */
const PLATE = 64;

/** `tel:` needs the number without its formatting — spaces, dashes and brackets are display only. */
function dial(number: string, failed: string): void {
  const url = `tel:${number.replace(/[^\d+]/g, '')}`;
  void Linking.openURL(url).catch(() => Alert.alert(failed));
}

export function SupportHotlineDocument({
  testID = 'support-hotline',
  palette,
  paddingBottom,
}: {
  testID?: string;
  palette: Palette;
  paddingBottom: number;
}): React.JSX.Element {
  const t = useT();
  const s = useMemo(() => makeStyles(palette), [palette]);

  // REAL where a deployment set one; the drawn number otherwise. See the note at the head.
  const number = IT_HOTLINE ?? HOTLINE_NUMBER.value;

  return (
    <ScrollView
      testID={testID}
      contentContainerStyle={[s.page, { paddingBottom }]}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Primary call card ─────────────────────────────────────────────────────────────────── */}
      <View testID="hotline-call-card" style={s.callCard}>
        <View style={s.plate}>
          <MaterialIcons name="headset-mic" size={30} color={palette.primary} />
        </View>
        <Text style={s.deskName}>{t('supportHotline.deskName')}</Text>
        <Text style={s.deskDescription}>{t('supportHotline.deskDescription')}</Text>

        <View style={s.numberPlate}>
          <Text testID="hotline-number" style={s.number}>
            {number}
          </Text>
        </View>

        <Pressable
          testID="hotline-call-now"
          accessibilityRole="button"
          accessibilityLabel={t('supportHotline.callNow')}
          onPress={() => dial(number, t('supportHotline.callFailed'))}
          style={s.callNow}
        >
          <MaterialIcons name="call" size={20} color={palette.onPrimary} />
          <Text style={s.callNowText}>{t('supportHotline.callNow')}</Text>
        </Pressable>
      </View>

      {/* ── Operating hours ───────────────────────────────────────────────────────────────────── */}
      <View testID="hotline-hours" style={s.card}>
        <View style={s.cardHead}>
          <MaterialIcons name="schedule" size={18} color={palette.muted} />
          <Text style={s.cardTitle}>{t('supportHotline.hoursHeading')}</Text>
        </View>

        <View style={s.hoursRowDivided}>
          <Text style={s.hoursLabel}>{t('supportHotline.criticalSystems')}</Text>
          {/* The drawing gives this one a success-toned pill and the other plain text. */}
          <View style={s.hoursPill}>
            <Text style={s.hoursPillText}>{HOTLINE_HOURS.value.critical}</Text>
          </View>
        </View>

        <View style={s.hoursRow}>
          <Text style={s.hoursLabel}>{t('supportHotline.generalInquiry')}</Text>
          <Text style={s.hoursValue}>{HOTLINE_HOURS.value.general}</Text>
        </View>
      </View>

      {/* ── Information to prepare ────────────────────────────────────────────────────────────── */}
      <View testID="hotline-prepare" style={s.card}>
        <View style={s.cardHead}>
          <MaterialIcons name="list-alt" size={18} color={palette.muted} />
          <Text style={s.cardTitle}>{t('supportHotline.prepareHeading')}</Text>
        </View>
        <Text style={s.cardIntro}>{t('supportHotline.prepareIntro')}</Text>

        <PrepareRow
          icon="devices"
          tone={palette.accent}
          title={t('supportHotline.deviceTitle')}
          hint={t('supportHotline.deviceHint')}
          s={s}
        />
        <PrepareRow
          icon="location-on"
          tone={palette.accent}
          title={t('supportHotline.siteTitle')}
          hint={t('supportHotline.siteHint')}
          s={s}
        />
        {/* The drawing tones this one danger rather than accent. */}
        <PrepareRow
          icon="error"
          tone={palette.danger}
          title={t('supportHotline.errorTitle')}
          hint={t('supportHotline.errorHint')}
          s={s}
        />
      </View>

      {/* ── Regional hotlines ─────────────────────────────────────────────────────────────────── */}
      <View testID="hotline-regions" style={s.card}>
        <View style={s.cardHead}>
          <MaterialIcons name="public" size={18} color={palette.muted} />
          <Text style={s.cardTitle}>{t('supportHotline.regionalHeading')}</Text>
        </View>

        {HOTLINE_REGIONS.value.map((region, index) => (
          <View key={region.name} style={[s.regionRow, index > 0 && s.regionRowDivided]}>
            <View style={s.regionText}>
              <Text style={s.regionName} numberOfLines={1}>
                {region.name}
              </Text>
              <Text style={s.regionNumber} numberOfLines={1}>
                {region.number}
              </Text>
            </View>
            <Pressable
              testID={`hotline-region-call-${region.name}`}
              accessibilityRole="button"
              accessibilityLabel={t('supportHotline.callRegion', { name: region.name })}
              onPress={() => dial(region.number, t('supportHotline.callFailed'))}
              style={s.regionCall}
            >
              <MaterialIcons name="call" size={20} color={palette.primary} />
            </Pressable>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

/** One row of the preparation checklist — glyph, title, and the drawing's own sub-line. */
function PrepareRow({
  icon,
  tone,
  title,
  hint,
  s,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  tone: string;
  title: string;
  hint: string;
  s: ReturnType<typeof makeStyles>;
}): React.JSX.Element {
  return (
    <View style={s.prepareRow}>
      <MaterialIcons name={icon} size={20} color={tone} style={s.prepareGlyph} />
      <View style={s.prepareText}>
        <Text style={s.prepareTitle}>{title}</Text>
        <Text style={s.prepareHint}>{hint}</Text>
      </View>
    </View>
  );
}

function makeStyles(p: Palette) {
  return StyleSheet.create({
    page: { padding: spacing.md, gap: spacing.md },

    // ── Call card ─────────────────────────────────────────────────────────────────────────────
    callCard: {
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
      padding: spacing.md,
      alignItems: 'center',
      gap: spacing.xs,
    },
    plate: {
      width: PLATE,
      height: PLATE,
      borderRadius: plateRadius(PLATE),
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surfaceSoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.xs,
    },
    deskName: {
      color: p.text,
      fontFamily: fontFamily.semibold,
      fontSize: typography.title.fontSize,
      textAlign: 'center',
    },
    deskDescription: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.caption.fontSize,
      textAlign: 'center',
    },
    numberPlate: {
      marginTop: spacing.sm,
      width: '100%',
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surfaceSunk,
      paddingVertical: spacing.sm,
      alignItems: 'center',
    },
    number: {
      color: p.accent,
      fontFamily: fontFamily.bold,
      fontSize: typography.title.fontSize,
      letterSpacing: 1,
    },
    callNow: {
      marginTop: spacing.sm,
      width: '100%',
      minHeight: touchTarget.primaryButton,
      borderRadius: radius.md,
      backgroundColor: p.primary,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
    },
    callNowText: {
      color: p.onPrimary,
      fontFamily: fontFamily.bold,
      fontSize: typography.label.fontSize,
      letterSpacing: 0.5,
    },

    // ── The three panels below it ─────────────────────────────────────────────────────────────
    card: {
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
      padding: spacing.md,
      gap: spacing.sm,
    },
    cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    cardTitle: {
      color: p.text,
      fontFamily: fontFamily.semibold,
      fontSize: typography.body.fontSize,
    },
    cardIntro: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
    },

    hoursRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    hoursRowDivided: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottomWidth: 1,
      borderBottomColor: p.border,
      paddingBottom: spacing.xs,
    },
    hoursLabel: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.caption.fontSize,
    },
    hoursValue: {
      color: p.text,
      fontFamily: fontFamily.regular,
      fontSize: typography.caption.fontSize,
    },
    hoursPill: {
      paddingHorizontal: spacing.xs,
      paddingVertical: 2,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: `${p.success}55`,
      backgroundColor: `${p.success}33`,
    },
    hoursPillText: {
      color: p.success,
      fontFamily: fontFamily.semibold,
      fontSize: 10,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },

    prepareRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    prepareGlyph: { marginTop: 1 },
    prepareText: { flex: 1, gap: 1 },
    prepareTitle: {
      color: p.text,
      fontFamily: fontFamily.regular,
      fontSize: typography.caption.fontSize,
    },
    prepareHint: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
    },

    regionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    regionRowDivided: {
      borderTopWidth: 1,
      borderTopColor: p.border,
      paddingTop: spacing.sm,
    },
    regionText: { flex: 1, gap: 1 },
    regionName: {
      color: p.text,
      fontFamily: fontFamily.regular,
      fontSize: typography.caption.fontSize,
    },
    regionNumber: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
    },
    regionCall: {
      width: touchTarget.iconButton,
      height: touchTarget.iconButton,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: p.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}

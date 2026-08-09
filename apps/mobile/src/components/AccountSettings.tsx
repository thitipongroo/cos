// Account settings — security, preferences, app info (all roles; master 3100).
//
// Rendered by `app/(app)/account-settings.tsx`, pushed from the navigation drawer's Settings row.
// It lived INSIDE the drawer for one build — the first shape of the 2026-08-09 "the drawer IS the
// profile" ruling — until the panel was carrying both navigation and settings with ~900px below the
// fold. There is still no `/profile` route: identity lives in the drawer, this is reached from it.
//
// LAYOUT IS mockup/mobile/05_site_worker/05_profile/01_account_settings: an uppercase section label
// over a bordered card, and inside it hairline-separated rows that all share one anatomy —
// leading icon, label, then either a value, a value + chevron, or a switch. That regularity is the
// point of the drawing, so <Row /> below is the only row this file knows how to draw.
//
// Palette-resolved, because it is a page now rather than the always-dark drawer panel.
//
// Offline-safe: everything here is local state except the MFA row's target screen.

import { useMemo, useState } from 'react';
import { View, Text, Pressable, Switch, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useThemeStore } from '../store/themeStore';
import { useBiometricStore } from '../store/biometricStore';
import { useI18n } from '../i18n';
import { fontFamily, radius, spacing, touchTarget, typography } from '../theme/tokens';
import { usePalette, type Palette } from '../theme/usePalette';

type IconName = keyof typeof MaterialIcons.glyphMap;

/**
 * MFA enrolment is behind the same feature flag the rest of the app reads, so a build without MFA
 * does not offer a screen it cannot honour.
 */
const MFA_ENROLLMENT_ENABLED = process.env.EXPO_PUBLIC_FF_S1_AUTH_MFA_ENROLLMENT === '1';

/**
 * One settings row — the mockup's single row anatomy.
 *
 * `value` renders as trailing text, `onPress` adds the chevron and makes it a button, `toggle`
 * replaces both with a switch. A row is a button ONLY when it has somewhere to go, so a row with a
 * switch never announces as one to a screen reader.
 */
function Row({
  testID,
  icon,
  label,
  description,
  value,
  valueTone,
  onPress,
  trailingIcon = 'chevron-right',
  toggle,
  last,
}: {
  testID?: string;
  icon: IconName;
  label: string;
  /** A second line under the label. For explanations — a trailing `value` competes with the label
   *  for the same row and squeezes it to nothing when the text is a full sentence. */
  description?: string;
  value?: string;
  valueTone?: 'muted' | 'success';
  onPress?: () => void;
  trailingIcon?: IconName;
  toggle?: { on: boolean; onChange: (next: boolean) => void; disabled?: boolean };
  last?: boolean;
}) {
  const p = usePalette();
  const styles = useMemo(() => makeStyles(p), [p]);
  const body = (
    <>
      <View style={styles.rowLead}>
        <MaterialIcons name={icon} size={22} color={p.accent} />
        <View style={styles.rowLabelBlock}>
          <Text style={styles.rowLabel} numberOfLines={2}>
            {label}
          </Text>
          {description ? (
            <Text style={styles.rowDescription} numberOfLines={2}>
              {description}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={styles.rowTail}>
        {value ? (
          <Text
            style={[styles.rowValue, valueTone === 'success' && styles.rowValueSuccess]}
            numberOfLines={1}
          >
            {value}
          </Text>
        ) : null}
        {toggle ? (
          <Switch
            testID={testID ? `${testID}-switch` : undefined}
            value={toggle.on}
            onValueChange={toggle.onChange}
            disabled={toggle.disabled}
            accessibilityLabel={label}
            trackColor={{ true: p.primary, false: p.border }}
          />
        ) : onPress ? (
          <MaterialIcons name={trailingIcon} size={20} color={p.muted} />
        ) : null}
      </View>
    </>
  );

  const style = [styles.row, !last && styles.rowDivider];

  return onPress ? (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={style}
    >
      {body}
    </Pressable>
  ) : (
    <View testID={testID} style={style}>
      {body}
    </View>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  const p = usePalette();
  const styles = useMemo(() => makeStyles(p), [p]);
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

export function AccountSettings() {
  const { t, locale, setLocale } = useI18n();
  const p = usePalette();
  const styles = useMemo(() => makeStyles(p), [p]);
  const router = useRouter();
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);
  const available = useBiometricStore((s) => s.available);
  const needsEnrolment = useBiometricStore((s) => s.needsEnrolment);
  const enabled = useBiometricStore((s) => s.enabled);
  const setEnabled = useBiometricStore((s) => s.setEnabled);
  const [busy, setBusy] = useState(false);

  // The REAL build version (app.json), read the way the login footer reads it. The mockup prints
  // "2.4.0-stable"; that is a drawing, and a version a user might quote in a support request is the
  // one thing here that must never be decorative.
  const appVersion = Constants.expoConfig?.version ?? '—';

  return (
    <View testID="account-settings" style={styles.root}>
      <Section label={t('profile.main.securitySection')}>
        {MFA_ENROLLMENT_ENABLED ? (
          <Row
            testID="profile-mfa-row"
            icon="shield"
            label={t('mfa.enroll.title')}
            onPress={() => router.push('/mfa-enrollment')}
          />
        ) : null}
        {/* Biometric unlock. Disabled rather than hidden when the device has no enrolled biometric:
            the mockup shows the row, and hiding it would leave a worker wondering where it went.
            NOT BUILT: the mockup's "Change Secure PIN" — this product has no PIN. Device unlock is
            biometric, and inventing a second credential would be a security feature with no
            backend, no recovery path and no spec. */}
        <Row
          testID="biometric-row"
          icon="fingerprint"
          label={t('profile.biometric.title')}
          // Hardware present but nothing enrolled points at OS Settings rather than giving up;
          // no hardware at all says so plainly. A DESCRIPTION, not a trailing value: these are full
          // sentences, and in the tail they pushed the label out of the row entirely.
          description={
            available
              ? undefined
              : needsEnrolment
                ? t('profile.biometric.needsEnrolment')
                : t('profile.biometric.unavailable')
          }
          toggle={{
            on: enabled,
            disabled: !available || busy,
            onChange: (next) => {
              setBusy(true);
              void Promise.resolve(setEnabled(next)).finally(() => setBusy(false));
            },
          }}
          last
        />
      </Section>

      <Section label={t('profile.main.preferencesSection')}>
        {/* The mockup shows the current language with a chevron. With exactly two locales a picker
            screen would be a screen to choose between two items, so the row TOGGLES and names what
            it will switch to — the chevron is dropped for a swap glyph, which is what it does. */}
        <Row
          testID="locale-row"
          icon="language"
          label={t('profile.main.language')}
          value={locale === 'th' ? t('profile.main.thai') : t('profile.main.english')}
          trailingIcon="swap-horiz"
          onPress={() => setLocale(locale === 'th' ? 'en' : 'th')}
        />
        {/* Per-event notification preferences are their own screen (the drawer used to link to it
            twice). This row is the mockup's single "Notification Alerts" entry pointing at it. */}
        <Row
          testID="notifications-row"
          icon="notifications-active"
          label={t('profile.notifications.title')}
          onPress={() => router.push('/notification-preferences')}
        />
        <Row
          testID="theme-row"
          icon="dark-mode"
          label={t('profile.main.themeDark')}
          toggle={{
            on: mode === 'dark',
            onChange: (next) => void setMode(next ? 'dark' : 'light'),
          }}
          last
        />
      </Section>

      <Section label={t('profile.main.aboutSection')}>
        <Row
          testID="profile-version"
          icon="info"
          label={t('profile.main.version')}
          value={appVersion}
        />
        <Row
          testID="profile-privacy-link"
          icon="policy"
          label={t('privacy.policy.title')}
          trailingIcon="open-in-new"
          onPress={() => router.push('/privacy-policy')}
          last
        />
      </Section>
    </View>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    root: { gap: spacing.md, paddingTop: spacing.sm },
    section: { gap: spacing.xs },
    sectionLabel: {
      fontSize: 11,
      fontFamily: fontFamily.semibold,
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: p.muted,
      marginLeft: spacing.xs,
    },
    card: {
      backgroundColor: p.surface,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: p.border,
      overflow: 'hidden',
    },
    row: {
      minHeight: touchTarget.formInput,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
    },
    rowDivider: { borderBottomWidth: 1, borderBottomColor: p.border },
    rowLead: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    rowLabelBlock: { flex: 1, gap: 2 },
    rowLabel: {
      fontSize: typography.body.fontSize,
      fontFamily: fontFamily.regular,
      color: p.text,
    },
    rowDescription: {
      fontSize: typography.caption.fontSize,
      fontFamily: fontFamily.regular,
      color: p.muted,
    },
    rowTail: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    rowValue: {
      fontSize: typography.label.fontSize,
      fontFamily: fontFamily.medium,
      color: p.muted,
      maxWidth: 140,
    },
    rowValueSuccess: { color: p.success },
  });

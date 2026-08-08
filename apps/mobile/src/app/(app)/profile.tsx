// Profile screen — account info, notification preferences + logout (all roles; master 3100).
// Offline-safe: account info reads local auth state; notification preferences load online.

import { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useAuthStore } from '../../store/authStore';
import { initialsOf } from '../../lib/initials';
import { useThemeStore, type ThemeMode } from '../../store/themeStore';
import { useBiometricStore } from '../../store/biometricStore';
import { get, mutate } from '../../api/client';
import { useI18n } from '../../i18n';
import type { Locale } from '../../i18n';
import { fontFamily, radius, spacing, typography } from '../../theme/tokens';
import { usePalette, type Palette } from '../../theme/usePalette';
import { makeScreenStyles } from '../../theme/screenStyles';

interface Preference {
  event_type: string;
  channel: string;
  is_enabled: boolean;
}

// Notification preferences (master 3100 / §19.6) — GET/PATCH /notifications/preferences.
function NotificationPreferences() {
  const { t } = useI18n();
  // Named `palette`, not `p`: this component already uses `p` for the preference row it is mapping
  // over, and shadowing that with the theme would be a silent, confusing bug.
  const palette = usePalette();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const [prefs, setPrefs] = useState<Preference[]>([]);

  useEffect(() => {
    get<{ items?: Preference[] } | Preference[]>('/notifications/preferences')
      .then((res) => setPrefs(Array.isArray(res) ? res : (res.items ?? [])))
      .catch(() => {
        /* offline — no prefs */
      });
  }, []);

  const toggle = (p: Preference): void => {
    const next = !p.is_enabled;
    setPrefs((prev) =>
      prev.map((x) =>
        x.event_type === p.event_type && x.channel === p.channel ? { ...x, is_enabled: next } : x,
      ),
    );
    void mutate(
      'PATCH',
      '/notifications/preferences',
      { preferences: [{ event_type: p.event_type, channel: p.channel, is_enabled: next }] },
      'notification-preference',
      `${p.event_type}:${p.channel}`,
    );
  };

  if (prefs.length === 0) return null;

  return (
    <View testID="notification-preferences" style={styles.prefs}>
      <Text style={styles.prefsHeading}>{t('profile.notifications.title')}</Text>
      {prefs.map((p) => (
        <View key={`${p.event_type}:${p.channel}`} style={styles.prefRow}>
          <Text style={styles.prefLabel}>
            {p.event_type} · {p.channel}
          </Text>
          <TouchableOpacity
            testID={`pref-${p.event_type}-${p.channel}`}
            style={[styles.toggle, p.is_enabled && styles.toggleOn]}
            onPress={() => toggle(p)}
          >
            <Text style={[styles.toggleText, p.is_enabled && styles.toggleTextOn]}>
              {p.is_enabled ? t('profile.notifications.on') : t('profile.notifications.off')}
            </Text>
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
}

/**
 * Security Settings → Biometric Unlock (mockup 03_04_manage_account_access).
 *
 * Lives here for now because 03_04 itself is not built yet; it reads the same store, so moving it
 * onto that screen later is a re-render, not a rewrite.
 *
 * The row STATES why it is unavailable rather than hiding. "Not supported on this device" and "set
 * one up in Settings first" send the user to different places, and the second is something they can
 * act on — silently omitting the control tells them nothing and looks like a missing feature.
 */
function BiometricUnlockRow() {
  const p = usePalette();
  const screen = useMemo(() => makeScreenStyles(p), [p]);
  const styles = useMemo(() => makeStyles(p), [p]);
  const { t } = useI18n();
  const enabled = useBiometricStore((s) => s.enabled);
  const available = useBiometricStore((s) => s.available);
  const needsEnrolment = useBiometricStore((s) => s.needsEnrolment);
  const kind = useBiometricStore((s) => s.kind);
  const setEnabled = useBiometricStore((s) => s.setEnabled);

  const kindLabel =
    kind === 'face'
      ? t('profile.biometric.face')
      : kind === 'fingerprint'
        ? t('profile.biometric.fingerprint')
        : kind === 'iris'
          ? t('profile.biometric.iris')
          : null;

  return (
    // `kvRowStacked`, not `kvRow`: the unavailable-state message is a full sentence ("Set up Face ID
    // or a fingerprint in your device Settings first"), and side-by-side it ran off the screen edge.
    <View style={[screen.kvRow, styles.kvRowStacked]}>
      <Text style={screen.kvKey}>{t('profile.biometric.title')}</Text>
      {available ? (
        <TouchableOpacity
          testID="biometric-toggle"
          accessibilityRole="switch"
          accessibilityState={{ checked: enabled }}
          style={[styles.toggle, enabled && styles.toggleOn]}
          onPress={() => void setEnabled(!enabled)}
        >
          <Text style={[styles.toggleText, enabled && styles.toggleTextOn]}>
            {kindLabel != null && enabled
              ? kindLabel
              : enabled
                ? t('profile.biometric.on')
                : t('profile.biometric.off')}
          </Text>
        </TouchableOpacity>
      ) : (
        <Text testID="biometric-unavailable" style={styles.value}>
          {needsEnrolment
            ? t('profile.biometric.needsEnrolment')
            : t('profile.biometric.unavailable')}
        </Text>
      )}
    </View>
  );
}

const THEMES: Array<{ mode: ThemeMode; labelKey: string }> = [
  { mode: 'dark', labelKey: 'profile.main.themeDark' },
  { mode: 'light', labelKey: 'profile.main.themeLight' },
];

const LOCALES: Array<{ locale: Locale; labelKey: string }> = [
  { locale: 'th', labelKey: 'profile.main.thai' },
  { locale: 'en', labelKey: 'profile.main.english' },
];

/**
 * MFA enrolment is behind the same feature flag the navigation drawer reads, so the two entry
 * points to one screen cannot disagree about whether it exists.
 */
const MFA_ENROLLMENT_ENABLED = process.env.EXPO_PUBLIC_FF_S1_AUTH_MFA_ENROLLMENT === '1';

export default function ProfileScreen() {
  const p = usePalette();
  const screen = useMemo(() => makeScreenStyles(p), [p]);
  const styles = useMemo(() => makeStyles(p), [p]);
  const userId = useAuthStore((s) => s.userId);
  const displayName = useAuthStore((s) => s.displayName);
  const role = useAuthStore((s) => s.role);
  const logout = useAuthStore((s) => s.logout);
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);
  const { t, locale, setLocale } = useI18n();
  const router = useRouter();
  // The REAL build version (app.json), read the same way the login footer reads it. The mockup
  // prints "2.4.0-stable"; that is a drawing, and a version number a user might quote in a support
  // request is the one thing on this screen that must never be decorative.
  const appVersion = Constants.expoConfig?.version ?? '—';

  return (
    // A ScrollView, not a View. The mockup restructure (05_profile) added the MFA row, the version
    // line and the legal link on top of eleven existing rows, which overflows a 2400px viewport with
    // nothing to scroll — the sign-out button and the rows above it became unreachable on a phone.
    <ScrollView
      testID="profile-screen"
      style={styles.page}
      contentContainerStyle={styles.pageContent}
    >
      {/* Identity card (mockup 05_profile "Profile Bento Card") — avatar, display name, and the id
          beneath it. It replaces two bare key/value rows: the mockup opens on who you are, and a
          `userId` row wedged between settings read as one more setting. */}
      <View style={styles.identityCard}>
        <View style={styles.identityAvatar}>
          <Text style={styles.identityInitials}>
            {initialsOf(displayName) || String(role ?? '?').slice(0, 1)}
          </Text>
        </View>
        <View style={styles.identityBody}>
          <Text testID="profile-role" style={styles.identityName} numberOfLines={1}>
            {displayName ?? t('drawer.member')}
          </Text>
          <Text style={styles.identityRole} numberOfLines={1}>
            {role ?? '—'}
          </Text>
          <Text testID="profile-user-id" style={styles.identityId} numberOfLines={1}>
            {t('profile.main.userId')}: {userId ?? '—'}
          </Text>
        </View>
      </View>

      <Text style={styles.sectionHeading}>{t('profile.main.securitySection')}</Text>
      <BiometricUnlockRow />

      <Text style={styles.sectionHeading}>{t('profile.main.preferencesSection')}</Text>
      <View style={screen.kvRow}>
        <Text style={screen.kvKey}>{t('profile.main.language')}</Text>
        <View style={styles.localeRow}>
          {LOCALES.map((item) => {
            const active = item.locale === locale;
            return (
              <TouchableOpacity
                key={item.locale}
                testID={`locale-${item.locale}`}
                style={[styles.localeChip, active && styles.localeChipActive]}
                onPress={() => setLocale(item.locale)}
              >
                <Text style={[styles.localeText, active && styles.localeTextActive]}>
                  {t(item.labelKey)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <NotificationPreferences />

      {/* Appearance — dark is the product default (PO 2026-08-04); light stays selectable because the
          §32.7 light palette exists for outdoor sunlight visibility, which is a real field need. */}
      <View style={screen.kvRow}>
        <Text style={screen.kvKey}>{t('profile.main.theme')}</Text>
        <View style={styles.localeRow}>
          {THEMES.map((item) => {
            const active = item.mode === mode;
            return (
              <TouchableOpacity
                key={item.mode}
                testID={`theme-${item.mode}`}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[styles.localeChip, active && styles.localeChipActive]}
                onPress={() => void setMode(item.mode)}
              >
                <Text style={[styles.localeText, active && styles.localeTextActive]}>
                  {t(item.labelKey)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Security — the mockup's MFA row. Behind the same flag as the drawer's entry, so a build
          without MFA does not offer a screen it cannot honour.
          NOT BUILT: the mockup's "Change Secure PIN". This product has no PIN — device unlock is
          biometric (the row above), and inventing a second credential here would be a security
          feature with no backend, no recovery path and no spec. */}
      {/* Rendered here rather than beside <BiometricUnlockRow /> so the flag-gated row cannot leave
          the Security heading with nothing under it in a build without MFA. */}
      {MFA_ENROLLMENT_ENABLED ? (
        <TouchableOpacity
          testID="profile-mfa-row"
          style={screen.kvRow}
          accessibilityRole="button"
          accessibilityLabel={t('mfa.enroll.title')}
          onPress={() => router.push('/mfa-enrollment')}
        >
          <Text style={screen.kvKey}>{t('mfa.enroll.title')}</Text>
          <MaterialIcons name="chevron-right" size={20} color={p.muted} />
        </TouchableOpacity>
      ) : null}

      {/* About — the mockup's version line and legal link, under its own heading. */}
      <Text style={styles.sectionHeading}>{t('profile.main.aboutSection')}</Text>
      <View style={screen.kvRow}>
        <Text style={screen.kvKey}>{t('profile.main.version')}</Text>
        <Text testID="profile-version" style={styles.value}>
          {appVersion}
        </Text>
      </View>
      <TouchableOpacity
        testID="profile-privacy-link"
        style={screen.kvRow}
        accessibilityRole="link"
        accessibilityLabel={t('privacy.policy.title')}
        onPress={() => router.push('/privacy-policy')}
      >
        <Text style={screen.kvKey}>{t('privacy.policy.title')}</Text>
        <MaterialIcons name="open-in-new" size={20} color={p.muted} />
      </TouchableOpacity>

      <TouchableOpacity
        testID="logout-button"
        style={styles.logout}
        accessibilityRole="button"
        accessibilityLabel={t('profile.main.logout')}
        onPress={() => logout()}
      >
        <Text style={styles.logoutText}>{t('profile.main.logout')}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    page: { flex: 1, backgroundColor: p.bg },
    pageContent: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
    kvRowStacked: { flexDirection: 'column', alignItems: 'flex-start', gap: spacing.xs },
    identityCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.md,
      backgroundColor: p.surface,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: p.muted,
    },
    identityAvatar: {
      width: 56,
      height: 56,
      borderRadius: 999, // circle — half the width (§32.7)
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: p.bg,
      borderWidth: 1,
      borderColor: p.muted,
    },
    identityInitials: {
      fontSize: typography.title.fontSize,
      fontFamily: fontFamily.semibold,
      color: p.text,
    },
    identityBody: { flex: 1, gap: 2 },
    identityName: {
      fontSize: typography.title.fontSize,
      fontFamily: fontFamily.semibold,
      color: p.text,
    },
    identityRole: {
      fontSize: typography.label.fontSize,
      fontFamily: fontFamily.medium,
      color: p.primary,
    },
    identityId: {
      fontSize: typography.caption.fontSize,
      fontFamily: fontFamily.regular,
      color: p.muted,
    },
    // Section headings (mockup: Security / Preferences / About). Uppercase and tracked, the same
    // treatment the drawer gives its own group labels.
    sectionHeading: {
      fontSize: 11,
      fontFamily: fontFamily.semibold,
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: p.muted,
      marginTop: spacing.sm,
    },
    value: {
      fontSize: typography.body.fontSize,
      fontFamily: fontFamily.medium,
      color: p.text,
    },
    prefs: { marginTop: spacing.md, gap: spacing.xs },
    prefsHeading: {
      fontSize: typography.caption.fontSize,
      fontFamily: fontFamily.semibold,
      color: p.muted,
    },
    prefRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: spacing.xs,
      gap: spacing.sm,
    },
    prefLabel: {
      flex: 1,
      fontSize: typography.caption.fontSize,
      fontFamily: fontFamily.regular,
      color: p.text,
    },
    toggle: {
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: p.muted,
      paddingHorizontal: spacing.md,
      paddingVertical: 2,
    },
    toggleOn: { backgroundColor: p.success, borderColor: p.success },
    toggleText: {
      fontSize: typography.caption.fontSize,
      fontFamily: fontFamily.medium,
      color: p.muted,
    },
    toggleTextOn: { color: p.bg },
    localeRow: { flexDirection: 'row', gap: spacing.xs },
    localeChip: {
      borderWidth: 1,
      borderColor: p.muted,
      borderRadius: radius.xl,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
    },
    localeChipActive: { backgroundColor: p.primary, borderColor: p.primary },
    localeText: {
      fontSize: typography.caption.fontSize,
      fontFamily: fontFamily.medium,
      color: p.text,
    },
    localeTextActive: { color: p.bg },
    logout: {
      marginTop: spacing.lg,
      minHeight: 48,
      borderRadius: radius.lg,
      backgroundColor: p.danger,
      alignItems: 'center',
      justifyContent: 'center',
    },
    logoutText: {
      color: p.bg,
      fontSize: typography.body.fontSize,
      fontFamily: fontFamily.semibold,
      textTransform: 'uppercase',
    },
  });

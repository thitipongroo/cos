// Profile screen — account info, notification preferences + logout (all roles; master 3100).
// Offline-safe: account info reads local auth state; notification preferences load online.

import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useAuthStore } from '../../store/authStore';
import { useThemeStore, type ThemeMode } from '../../store/themeStore';
import { useBiometricStore } from '../../store/biometricStore';
import { get, mutate } from '../../api/client';
import { useI18n } from '../../i18n';
import type { Locale } from '../../i18n';
import { colors, fontFamily, radius, spacing, typography } from '../../theme/tokens';
import { screen } from '../../theme/screenStyles';

interface Preference {
  event_type: string;
  channel: string;
  is_enabled: boolean;
}

// Notification preferences (master 3100 / §19.6) — GET/PATCH /notifications/preferences.
function NotificationPreferences() {
  const { t } = useI18n();
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
    <View style={screen.kvRow}>
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

export default function ProfileScreen() {
  const userId = useAuthStore((s) => s.userId);
  const role = useAuthStore((s) => s.role);
  const logout = useAuthStore((s) => s.logout);
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);
  const { t, locale, setLocale } = useI18n();

  return (
    <View testID="profile-screen" style={screen.container}>
      <View style={screen.kvRow}>
        <Text style={screen.kvKey}>{t('profile.main.userId')}</Text>
        <Text testID="profile-user-id" style={styles.value}>
          {userId ?? '—'}
        </Text>
      </View>
      <View style={screen.kvRow}>
        <Text style={screen.kvKey}>{t('profile.main.role')}</Text>
        <Text testID="profile-role" style={styles.value}>
          {role ?? '—'}
        </Text>
      </View>
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

      <BiometricUnlockRow />

      <TouchableOpacity testID="logout-button" style={styles.logout} onPress={() => logout()}>
        <Text style={styles.logoutText}>{t('profile.main.logout')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  value: {
    fontSize: typography.body.fontSize,
    fontFamily: fontFamily.medium,
    color: colors.textPrimary,
  },
  prefs: { marginTop: spacing.md, gap: spacing.xs },
  prefsHeading: {
    fontSize: typography.caption.fontSize,
    fontFamily: fontFamily.semibold,
    color: colors.textSecondary,
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
    color: colors.textPrimary,
  },
  toggle: {
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.textSecondary,
    paddingHorizontal: spacing.md,
    paddingVertical: 2,
  },
  toggleOn: { backgroundColor: colors.success, borderColor: colors.success },
  toggleText: {
    fontSize: typography.caption.fontSize,
    fontFamily: fontFamily.medium,
    color: colors.textSecondary,
  },
  toggleTextOn: { color: colors.bg },
  localeRow: { flexDirection: 'row', gap: spacing.xs },
  localeChip: {
    borderWidth: 1,
    borderColor: colors.textSecondary,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  localeChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  localeText: {
    fontSize: typography.caption.fontSize,
    fontFamily: fontFamily.medium,
    color: colors.textPrimary,
  },
  localeTextActive: { color: colors.bg },
  logout: {
    marginTop: spacing.lg,
    minHeight: 48,
    borderRadius: radius.lg,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutText: {
    color: colors.bg,
    fontSize: typography.body.fontSize,
    fontFamily: fontFamily.semibold,
    textTransform: 'uppercase',
  },
});

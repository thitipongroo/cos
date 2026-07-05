// Profile screen — account info + logout (all roles). Offline-safe (reads local auth state).

import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useAuthStore } from '../../store/authStore';
import { useI18n } from '../../i18n';
import type { Locale } from '../../i18n';
import { colors, fontFamily, spacing, typography } from '../../theme/tokens';

const LOCALES: Array<{ locale: Locale; labelKey: string }> = [
  { locale: 'th', labelKey: 'profile.main.thai' },
  { locale: 'en', labelKey: 'profile.main.english' },
];

export default function ProfileScreen() {
  const userId = useAuthStore((s) => s.userId);
  const role = useAuthStore((s) => s.role);
  const logout = useAuthStore((s) => s.logout);
  const { t, locale, setLocale } = useI18n();

  return (
    <View testID="profile-screen" style={styles.container}>
      <Text style={styles.heading}>{t('profile.main.title')}</Text>

      <View style={styles.row}>
        <Text style={styles.label}>{t('profile.main.userId')}</Text>
        <Text testID="profile-user-id" style={styles.value}>
          {userId ?? '—'}
        </Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>{t('profile.main.role')}</Text>
        <Text testID="profile-role" style={styles.value}>
          {role ?? '—'}
        </Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>{t('profile.main.language')}</Text>
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

      <TouchableOpacity testID="logout-button" style={styles.logout} onPress={() => logout()}>
        <Text style={styles.logoutText}>{t('profile.main.logout')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: spacing.md, gap: spacing.sm },
  heading: {
    fontSize: typography.title.fontSize,
    fontFamily: fontFamily.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.surface,
  },
  label: {
    fontSize: typography.body.fontSize,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
  },
  value: {
    fontSize: typography.body.fontSize,
    fontFamily: fontFamily.medium,
    color: colors.textPrimary,
  },
  localeRow: { flexDirection: 'row', gap: spacing.xs },
  localeChip: {
    borderWidth: 1,
    borderColor: colors.textSecondary,
    borderRadius: 8,
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
    borderRadius: 8,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutText: {
    color: colors.bg,
    fontSize: typography.body.fontSize,
    fontFamily: fontFamily.semibold,
  },
});

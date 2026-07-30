// Reset-password success (mockup 04_tenant_admin/02_users/02_user_management/06_reset_password_success;
// §32.7 dark). Terminal screen shown after Reset-password's CONFIRM succeeds — reached via router.replace
// with the target user's id/name + the one-time temporary password. No top bar of its own; the global
// TopBar shows the CONSTRUCTION OS wordmark with no Back (terminal, nothing to go back to).
//
// Honest data: the mockup's heading "ส่งลิงก์รีเซ็ตรหัสผ่านสำเร็จ / link sent to somchai@const-os.com"
// describes an EMAIL delivery that this deployment cannot perform (no SMTP). What actually happened is a
// temporary-password reset, so the copy says exactly that. The password is the real value the backend
// returned — shown MASKED by default (reveal to read for hand-off) so a plaintext credential is never
// left on screen or committed in a screenshot; it is never persisted and cannot be shown again. The
// mockup's SYSTEM SECURITY LOG with fabricated UIDs (OS-001 / OS-99210) is replaced with the truthful
// audit fact (recorded via identity.user.password_reset.v1).

import { useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useT } from '../../i18n';
import { darkColors, fontFamily, spacing, touchTarget, typography } from '../../theme/tokens';

export default function ResetPasswordSuccessScreen(): React.JSX.Element {
  const t = useT();
  const router = useRouter();
  const params = useLocalSearchParams<{ display_name: string; temp_password: string }>();
  const str = (v: string | string[] | undefined): string =>
    typeof v === 'string' ? v : Array.isArray(v) ? (v[0] ?? '') : '';
  const name = str(params.display_name);
  const tempPassword = str(params.temp_password);

  const [revealed, setRevealed] = useState(false);

  return (
    <View style={styles.root} testID="reset-password-success">
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={styles.checkCircle}>
            <MaterialIcons name="check-circle" size={48} color={darkColors.success} />
          </View>
          <Text style={styles.heading}>{t('resetSuccess.heading')}</Text>
          <View style={styles.accentLine} />
          <Text style={styles.body}>
            {name !== '' ? t('resetSuccess.body', { name }) : t('resetSuccess.bodyGeneric')}
          </Text>
        </View>

        {/* One-time temporary password — masked until revealed for hand-off. */}
        <View style={styles.pwCard}>
          <Text style={styles.pwLabel}>{t('resetSuccess.tempLabel')}</Text>
          <View style={styles.pwRow}>
            <Text style={styles.pwValue} numberOfLines={1} selectable={revealed}>
              {revealed && tempPassword !== '' ? tempPassword : '••••••••••'}
            </Text>
            <Pressable
              style={styles.revealBtn}
              onPress={() => setRevealed((v) => !v)}
              testID="reveal-temp-password"
              accessibilityRole="button"
            >
              <MaterialIcons
                name={revealed ? 'visibility-off' : 'visibility'}
                size={20}
                color={darkColors.cyan}
              />
              <Text style={styles.revealText}>
                {revealed ? t('resetSuccess.hide') : t('resetSuccess.reveal')}
              </Text>
            </Pressable>
          </View>
          <Text style={styles.pwNote}>{t('resetSuccess.tempNote')}</Text>
        </View>

        {/* System security log — honest audit fact (no fabricated confidence / UIDs). */}
        <View style={styles.logCard}>
          <View style={styles.logHead}>
            <MaterialIcons name="terminal" size={18} color={darkColors.cyan} />
            <Text style={styles.logTitle}>{t('resetSuccess.logTitle')}</Text>
          </View>
          <Text style={styles.logBody}>{t('resetSuccess.logBody')}</Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          style={styles.primaryBtn}
          onPress={() => router.replace('/users')}
          testID="reset-success-users"
          accessibilityRole="button"
        >
          <Text style={styles.primaryText}>{t('resetSuccess.returnToUsers')}</Text>
          <MaterialIcons name="arrow-forward" size={20} color={darkColors.onPrimary} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: darkColors.bg },
  scroll: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md },

  hero: { alignItems: 'center', marginTop: spacing.sm, marginBottom: spacing.sm },
  checkCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: `${darkColors.success}1A`,
    borderWidth: 1,
    borderColor: `${darkColors.success}4D`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  heading: {
    fontFamily: fontFamily.bold,
    fontSize: typography.hero.fontSize,
    color: darkColors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  accentLine: {
    width: 48,
    height: 4,
    borderRadius: 2,
    backgroundColor: `${darkColors.success}80`,
    marginBottom: spacing.md,
  },
  body: {
    fontFamily: fontFamily.regular,
    fontSize: typography.body.fontSize,
    lineHeight: typography.body.fontSize * 1.5,
    color: darkColors.muted,
    textAlign: 'center',
  },

  pwCard: {
    backgroundColor: darkColors.surface,
    borderWidth: 1,
    borderColor: darkColors.border,
    borderRadius: 12,
    padding: spacing.md,
    gap: spacing.sm,
  },
  pwLabel: {
    fontFamily: fontFamily.bold,
    fontSize: typography.label.fontSize,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: darkColors.muted,
  },
  pwRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    backgroundColor: darkColors.elevated,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  pwValue: {
    flex: 1,
    minWidth: 0,
    fontFamily: 'monospace',
    fontSize: 20,
    letterSpacing: 2,
    color: darkColors.text,
  },
  revealBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  revealText: {
    fontFamily: fontFamily.semibold,
    fontSize: typography.label.fontSize,
    color: darkColors.cyan,
  },
  pwNote: { fontFamily: fontFamily.regular, fontSize: 12, lineHeight: 18, color: darkColors.muted },

  logCard: {
    backgroundColor: `${darkColors.cyan}0D`,
    borderLeftWidth: 4,
    borderLeftColor: darkColors.cyan,
    borderRadius: 8,
    padding: spacing.md,
    gap: spacing.xs,
  },
  logHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  logTitle: {
    fontFamily: fontFamily.bold,
    fontSize: typography.label.fontSize,
    letterSpacing: 1,
    color: darkColors.cyan,
  },
  logBody: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 19,
    color: darkColors.muted,
    fontStyle: 'italic',
  },

  footer: {
    padding: spacing.lg,
    backgroundColor: darkColors.surface,
    borderTopWidth: 1,
    borderTopColor: darkColors.border,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    height: touchTarget.primaryButton + 8,
    borderRadius: 12,
    backgroundColor: darkColors.primary,
  },
  primaryText: {
    fontFamily: fontFamily.bold,
    fontSize: typography.label.fontSize,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: darkColors.onPrimary,
  },
});

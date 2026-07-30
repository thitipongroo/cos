// Reset-password success (mockup 04_tenant_admin/02_users/02_user_management/07_temp_password_success;
// §32.7 dark). Terminal screen shown after Reset-password's CONFIRM succeeds — reached via router.replace
// with the target user's id/name + the one-time temporary password. No top bar of its own (global TopBar
// shows the wordmark, no Back).
//
// Honest data (informed by NIST 800-63B Rev.4 / OWASP Forgot-Password / Okta — see the reset-password
// memory):
//  • The mockup's "This password will expire in 60 minutes" is NOT achievable with Keycloak temporary=true
//    (it has no timed expiry — it stays valid until the user signs in and changes it). PO chose the honest
//    no-expiry copy, so the CORE_AI card states exactly that.
//  • The password is the real value the backend returned — shown MASKED (Reveal to read for hand-off) so a
//    live credential is never left on screen or committed into a screenshot; it is never persisted.
//  • Delivery model = HYBRID (PO decision): the admin hand-off is the working path; the "send" buttons send
//    a secure reset LINK (a token, per OWASP — never the plaintext password). Neither channel is wired yet
//    (no realm SMTP; no SMS-token pipeline), so both are honest-DISABLED with a truthful note.
//  • The mockup's fabricated TICKET ID / TERMINAL ID footer is dropped; the audit fact
//    (identity.user.password_reset.v1) is kept.

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
            <MaterialIcons name="check-circle" size={44} color={darkColors.success} />
          </View>
          <Text style={styles.heading}>{t('resetSuccess.heading')}</Text>
          {name !== '' && <Text style={styles.forUser}>{t('resetSuccess.forUser', { name })}</Text>}
        </View>

        {/* One-time temporary password — masked until revealed for hand-off. */}
        <View style={styles.pwCard}>
          <View style={styles.pwHead}>
            <Text style={styles.pwLabel}>{t('resetSuccess.tempLabel')}</Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{t('resetSuccess.badge')}</Text>
            </View>
          </View>
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

        {/* CORE_AI insight — honest shell (no fabricated 60-minute expiry). */}
        <View style={styles.aiCard}>
          <View style={styles.aiHead}>
            <MaterialIcons name="auto-awesome" size={18} color={darkColors.cyan} />
            <Text style={styles.aiTitle}>{t('resetSuccess.aiTitle')}</Text>
          </View>
          <Text style={styles.aiBody}>{t('resetSuccess.aiBody')}</Text>
        </View>

        {/* System security log — honest audit fact. */}
        <View style={styles.logCard}>
          <View style={styles.logHead}>
            <MaterialIcons name="terminal" size={16} color={darkColors.cyan} />
            <Text style={styles.logTitle}>{t('resetSuccess.logTitle')}</Text>
          </View>
          <Text style={styles.logBody}>{t('resetSuccess.logBody')}</Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          style={styles.primaryBtn}
          onPress={() => router.replace('/users')}
          testID="reset-success-done"
          accessibilityRole="button"
        >
          <Text style={styles.primaryText}>{t('resetSuccess.done')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: darkColors.bg },
  scroll: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.md, gap: spacing.sm },

  hero: { alignItems: 'center', marginTop: spacing.xs, marginBottom: spacing.xs, gap: spacing.xs },
  checkCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: `${darkColors.success}1A`,
    borderWidth: 1,
    borderColor: `${darkColors.success}4D`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heading: {
    fontFamily: fontFamily.bold,
    fontSize: typography.hero.fontSize,
    color: darkColors.text,
    textAlign: 'center',
  },
  forUser: {
    fontFamily: fontFamily.regular,
    fontSize: typography.body.fontSize,
    color: darkColors.muted,
    textAlign: 'center',
  },

  pwCard: {
    backgroundColor: darkColors.surface,
    borderLeftWidth: 4,
    borderLeftColor: darkColors.success,
    borderRadius: 12,
    padding: spacing.md,
    gap: spacing.sm,
  },
  pwHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pwLabel: {
    fontFamily: fontFamily.bold,
    fontSize: typography.label.fontSize,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: darkColors.muted,
  },
  badge: {
    backgroundColor: `${darkColors.success}1A`,
    borderRadius: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  badgeText: {
    fontFamily: fontFamily.bold,
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: darkColors.success,
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
    fontSize: 22,
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

  aiCard: {
    backgroundColor: `${darkColors.cyan}0D`,
    borderLeftWidth: 4,
    borderLeftColor: darkColors.cyan,
    borderRadius: 8,
    padding: spacing.md,
    gap: spacing.xs,
  },
  aiHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  aiTitle: {
    fontFamily: fontFamily.bold,
    fontSize: typography.label.fontSize,
    letterSpacing: 1,
    color: darkColors.cyan,
  },
  aiBody: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 19,
    color: darkColors.muted,
  },

  logCard: {
    backgroundColor: `${darkColors.cyan}0D`,
    borderLeftWidth: 4,
    borderLeftColor: darkColors.cyan,
    borderRadius: 8,
    padding: spacing.md,
    gap: spacing.xs,
    marginTop: spacing.xs,
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

// Reset-link-sent success (mockup 04_tenant_admin/02_users/02_user_management/06_reset_password_success;
// §32.7 dark). Terminal screen shown after Reset-password's CONFIRM succeeds with the EMAIL method — the
// standards-compliant path (NIST 800-63B Rev.4): Keycloak emailed the user a single-use, 15-minute
// UPDATE_PASSWORD action-token link and they set their own password (no plaintext handled by COS).
// Reached via router.replace with the target's name + email. No top bar of its own (global TopBar shows
// the wordmark, no Back).
//
// Honest data: the mockup's "link valid 24 hours" is replaced with the real token lifespan (15 minutes);
// the fabricated SYSTEM SECURITY LOG UIDs are replaced with the truthful audit fact
// (identity.user.password_reset.v1, method=email_link).

import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useT } from '../../i18n';
import { darkScreen } from '../../theme/screenStyles';
import { darkColors, radius, spacing } from '../../theme/tokens';

export default function ResetPasswordEmailSuccessScreen(): React.JSX.Element {
  const t = useT();
  const router = useRouter();
  const params = useLocalSearchParams<{ display_name: string; email: string }>();
  const str = (v: string | string[] | undefined): string =>
    typeof v === 'string' ? v : Array.isArray(v) ? (v[0] ?? '') : '';
  const email = str(params.email);

  return (
    <View style={darkScreen.root} testID="reset-password-email-success">
      <ScrollView style={darkScreen.fill} contentContainerStyle={darkScreen.content}>
        <View style={styles.hero}>
          <View style={darkScreen.checkCircle}>
            <MaterialIcons name="mark-email-read" size={44} color={darkColors.success} />
          </View>
          <Text style={darkScreen.heading}>{t('resetLinkSent.heading')}</Text>
          <View style={darkScreen.accentLine} />
          <Text style={darkScreen.bodyCentered}>
            {t('resetLinkSent.body', { email: email || '—' })}
          </Text>
        </View>

        <View style={styles.logCard}>
          <View style={darkScreen.iconRow}>
            <MaterialIcons name="terminal" size={16} color={darkColors.cyan} />
            <Text style={darkScreen.logTitle}>{t('resetLinkSent.logTitle')}</Text>
          </View>
          <Text style={darkScreen.logBody}>{t('resetLinkSent.logBody')}</Text>
        </View>
      </ScrollView>

      <View style={darkScreen.footerFlush}>
        <Pressable
          style={darkScreen.primaryBtn}
          onPress={() => router.replace('/users')}
          testID="reset-link-done"
          accessibilityRole="button"
        >
          <Text style={darkScreen.primaryText}>{t('resetLinkSent.returnToUsers')}</Text>
          <MaterialIcons name="arrow-forward" size={20} color={darkColors.onPrimary} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', marginTop: spacing.sm, marginBottom: spacing.sm },

  logCard: {
    backgroundColor: `${darkColors.cyan}0D`,
    borderLeftWidth: 4,
    borderLeftColor: darkColors.cyan,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
});

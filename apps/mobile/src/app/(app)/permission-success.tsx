// Permission-saved success (mockup 04_tenant_admin/02_users/02_user_management/04_success_permission;
// §32.7 dark). Terminal screen shown after the Edit-permissions editor's SAVE succeeds — Edit-permission
// router.replace()s here with the target user's id + name. No top bar of its own; the global TopBar shows
// the CONSTRUCTION OS wordmark with no Back (terminal, reached via router.replace — nothing to go back to).
//
// Honest data: the mockup's "AI SYNC LOG … 99% confidence" is fabricated, so the card is kept as a shell
// with a truthful line (the change applies to the account's effective permissions and is recorded in the
// audit log via identity.user.role_changed.v1). The mockup's "syncs to every site tablet immediately" is
// also dropped — the stateless JWT means a role change takes effect on the target's next sign-in.

import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useT } from '../../i18n';
import { darkScreen } from '../../theme/screenStyles';
import {
  darkColors,
  fontFamily,
  radius,
  spacing,
  touchTarget,
  typography,
} from '../../theme/tokens';

export default function PermissionSuccessScreen(): React.JSX.Element {
  const t = useT();
  const router = useRouter();
  const params = useLocalSearchParams<{ user_id: string; display_name: string }>();
  const userId = typeof params.user_id === 'string' ? params.user_id : '';
  const name = typeof params.display_name === 'string' ? params.display_name : '';

  return (
    <View style={darkScreen.root} testID="permission-success">
      <ScrollView style={darkScreen.fill} contentContainerStyle={darkScreen.content}>
        <View style={styles.hero}>
          <View style={darkScreen.checkCircle}>
            <MaterialIcons name="check-circle" size={48} color={darkColors.success} />
          </View>
          <Text style={darkScreen.heading}>{t('permissionSuccess.heading')}</Text>
          <View style={styles.accentLine} />
          <Text style={styles.body}>
            {name !== ''
              ? t('permissionSuccess.body', { name })
              : t('permissionSuccess.bodyGeneric')}
          </Text>
        </View>

        {/* AI Sync Log — honest shell (no fabricated confidence score). */}
        <View style={styles.aiPanel}>
          <View style={styles.aiHeaderRow}>
            <MaterialIcons name="psychology" size={18} color={darkColors.cyan} />
            <Text style={styles.aiTitle}>{t('permissionSuccess.aiTitle')}</Text>
          </View>
          <Text style={darkScreen.aiBody}>{t('permissionSuccess.aiBody')}</Text>
        </View>
      </ScrollView>

      <View style={darkScreen.footer}>
        <Pressable
          style={darkScreen.primaryBtn}
          onPress={() => router.replace('/users')}
          testID="perm-success-users"
          accessibilityRole="button"
        >
          <Text style={darkScreen.primaryText}>{t('permissionSuccess.backToUsers')}</Text>
          <MaterialIcons name="arrow-forward" size={20} color={darkColors.onPrimary} />
        </Pressable>
        <Pressable
          style={styles.secondaryBtn}
          onPress={() =>
            router.replace({
              pathname: '/user-profile',
              params: { user_id: userId, display_name: name },
            })
          }
          testID="perm-success-profile"
          accessibilityRole="button"
        >
          <MaterialIcons name="person" size={20} color={darkColors.text} />
          <Text style={darkScreen.secondaryText}>{t('permissionSuccess.viewProfile')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', marginTop: spacing.sm, marginBottom: spacing.md },
  accentLine: {
    width: 48,
    height: 4,
    borderRadius: radius.sm,
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

  aiPanel: {
    backgroundColor: `${darkColors.cyan}0D`,
    borderLeftWidth: 4,
    borderLeftColor: darkColors.cyan,
    borderRadius: radius.xl,
    padding: spacing.md,
    gap: spacing.xs,
  },
  aiHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  aiTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 11,
    letterSpacing: 1.5,
    color: darkColors.cyan,
  },

  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    height: touchTarget.primaryButton + 8,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: darkColors.border,
  },
});

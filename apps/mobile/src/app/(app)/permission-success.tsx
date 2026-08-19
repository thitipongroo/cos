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
import { darkColors, radius, spacing, touchTarget } from '../../theme/tokens';

export default function PermissionSuccessScreen(): React.JSX.Element {
  const t = useT();
  const router = useRouter();
  const params = useLocalSearchParams<{ user_id: string; display_name: string }>();
  const userId = typeof params.user_id === 'string' ? params.user_id : '';
  const name = typeof params.display_name === 'string' ? params.display_name : '';

  return (
    <View style={darkScreen.root} testID="permission-success">
      <ScrollView style={darkScreen.fill} contentContainerStyle={darkScreen.content}>
        <View style={darkScreen.hero}>
          <View style={darkScreen.checkCircle}>
            <MaterialIcons name="check-circle" size={48} color={darkColors.success} />
          </View>
          <Text style={darkScreen.heading}>{t('permissionSuccess.heading')}</Text>
          <View style={darkScreen.accentLine} />
          <Text style={darkScreen.bodyCentered}>
            {name !== ''
              ? t('permissionSuccess.body', { name })
              : t('permissionSuccess.bodyGeneric')}
          </Text>
        </View>

        {/* AI Sync Log — honest shell (no fabricated confidence score). */}
        <View style={darkScreen.aiPanel}>
          <View style={styles.aiHeaderRow}>
            <MaterialIcons name="psychology" size={18} color={darkColors.cyan} />
            <Text style={darkScreen.aiTitleCompact}>{t('permissionSuccess.aiTitle')}</Text>
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
  aiHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },

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

// Reset password (mockup 04_tenant_admin/02_users/02_user_management/05_reset_password; §32.7 dark).
// Reached from a user's profile "Reset password" button or the Users list ⋮ sheet — pushed here with the
// target user's row as params. NO top bar of its own; the global TopBar shows the title + a Back arrow.
//
// Honest data:
//  • The mockup's "AI SECURITY CHECK — 99% Confidence … No suspicious activity detected" is fabricated;
//    the card is kept as a shell stating the real truth (the reset is recorded in the audit log via
//    identity.user.password_reset.v1).
//  • SEND RESET LINK (EMAIL) needs a configured Keycloak SMTP server — this deployment has none
//    (realm smtpServer is empty) — so it is shown but DISABLED with a truthful note, never selectable.
//  • GENERATE TEMPORARY PASSWORD is the real, working method: POST /users/:id/reset-password sets a
//    temporary password on Keycloak (the user must choose a new one at next sign-in) and returns it once.
//    The mockup's "expires in 1hr" is dropped — Keycloak's temporary flag forces a change at next
//    sign-in, it is not a timed expiry.
//  • The mockup footer "REQUEST ORIGIN: TERMINAL 04-HQ" is fabricated (no terminal concept) and dropped;
//    "AUTH LEVEL: TENANT ADMIN" is real (only a TENANT_ADMIN can reach this endpoint) and kept.

import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { resetUserPassword } from '../../api/users';
import { useT } from '../../i18n';
import { darkColors, fontFamily, spacing, touchTarget, typography } from '../../theme/tokens';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}
function formatRole(role: string): string {
  return role
    .split('_')
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ');
}

export default function ResetPasswordScreen(): React.JSX.Element {
  const t = useT();
  const router = useRouter();
  const params = useLocalSearchParams<{
    user_id: string;
    display_name: string;
    email: string;
    role: string;
    photo_url: string;
    is_active: string;
  }>();
  const str = (v: string | string[] | undefined): string =>
    typeof v === 'string' ? v : Array.isArray(v) ? (v[0] ?? '') : '';

  const userId = str(params.user_id);
  const name = str(params.display_name);
  const email = str(params.email);
  const role = str(params.role);
  const photo = str(params.photo_url);
  const active = str(params.is_active) !== '' ? str(params.is_active) === 'true' : true;

  const [busy, setBusy] = useState(false);

  const onConfirm = async (): Promise<void> => {
    if (userId === '' || busy) return;
    setBusy(true);
    try {
      const res = await resetUserPassword(userId);
      router.replace({
        pathname: '/reset-password-success',
        params: {
          user_id: userId,
          display_name: res.display_name || name,
          temp_password: res.temporary_password,
        },
      });
    } catch {
      setBusy(false);
      Alert.alert(t('resetPassword.errorTitle'), t('resetPassword.errorBody'));
    }
  };

  return (
    <View style={styles.root} testID="reset-password">
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* Target user card (compact, horizontal) */}
        <View style={styles.userCard}>
          <View style={styles.avatarWrap}>
            {photo !== '' ? (
              <Image source={{ uri: photo }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarText}>{initials(name)}</Text>
              </View>
            )}
            <View
              style={[
                styles.statusDot,
                { backgroundColor: active ? darkColors.success : darkColors.muted },
              ]}
            />
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.userName} numberOfLines={1}>
              {name}
            </Text>
            <View style={styles.pill}>
              <Text style={styles.pillText}>
                {t('adminUsers.uid')}: {userId.slice(0, 8).toUpperCase()}
              </Text>
            </View>
            <View style={styles.rolePill}>
              <Text style={styles.rolePillText}>{formatRole(role).toUpperCase()}</Text>
            </View>
          </View>
        </View>

        {/* AI Security Check — honest shell (no fabricated confidence score). */}
        <View style={styles.aiCard}>
          <View style={styles.aiHead}>
            <MaterialIcons name="verified-user" size={18} color={darkColors.cyan} />
            <Text style={styles.aiTitle}>{t('resetPassword.aiTitle')}</Text>
          </View>
          <Text style={styles.aiBody}>{t('resetPassword.aiBody')}</Text>
        </View>

        {/* Delivery method */}
        <Text style={styles.sectionLabel}>{t('resetPassword.deliveryMethod')}</Text>

        {/* Email reset link — DISABLED: no SMTP configured in this deployment. */}
        <View style={[styles.methodCard, styles.methodDisabled]} testID="method-email">
          <View style={styles.methodIcon}>
            <MaterialIcons name="mail-outline" size={22} color={darkColors.muted} />
          </View>
          <View style={styles.methodBody}>
            <Text style={[styles.methodTitle, { color: darkColors.muted }]}>
              {t('resetPassword.emailTitle')}
            </Text>
            <Text style={styles.methodSub} numberOfLines={1}>
              {email !== '' ? email : t('resetPassword.emailNone')}
            </Text>
            <Text style={styles.methodUnavailable}>{t('resetPassword.emailUnavailable')}</Text>
          </View>
          <MaterialIcons name="block" size={22} color={darkColors.muted} />
        </View>

        {/* Temporary password — the real, working method (always selected). */}
        <View style={[styles.methodCard, styles.methodSelected]} testID="method-temp">
          <View style={[styles.methodIcon, styles.methodIconActive]}>
            <MaterialIcons name="vpn-key" size={22} color={darkColors.cyan} />
          </View>
          <View style={styles.methodBody}>
            <Text style={styles.methodTitle}>{t('resetPassword.tempTitle')}</Text>
            <Text style={styles.methodSub}>{t('resetPassword.tempSub')}</Text>
          </View>
          <View style={styles.radioOn}>
            <View style={styles.radioDot} />
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.meta}>
          <Text style={styles.metaLabel}>{t('resetPassword.authLevel')}</Text>
          <Text style={styles.metaValue}>{t('resetPassword.authTenantAdmin')}</Text>
        </View>
        <Pressable
          style={[styles.primaryBtn, busy && styles.btnBusy]}
          onPress={onConfirm}
          disabled={busy}
          testID="reset-confirm"
          accessibilityRole="button"
        >
          {busy ? (
            <ActivityIndicator color={darkColors.onPrimary} />
          ) : (
            <>
              <MaterialIcons name="lock-reset" size={20} color={darkColors.onPrimary} />
              <Text style={styles.primaryText}>{t('resetPassword.confirm')}</Text>
            </>
          )}
        </Pressable>
        <Pressable
          style={styles.secondaryBtn}
          onPress={() => router.back()}
          disabled={busy}
          testID="reset-cancel"
          accessibilityRole="button"
        >
          <Text style={styles.secondaryText}>{t('resetPassword.cancel')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: darkColors.bg },
  scroll: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md },

  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: darkColors.surface,
    borderLeftWidth: 4,
    borderLeftColor: darkColors.primary,
    borderRadius: 12,
    padding: spacing.md,
  },
  avatarWrap: { width: 64, height: 64 },
  avatar: { width: 64, height: 64, borderRadius: 10, borderWidth: 2, borderColor: darkColors.cyan },
  avatarFallback: {
    backgroundColor: darkColors.elevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: darkColors.text, fontFamily: fontFamily.bold, fontSize: 22 },
  statusDot: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 3,
    borderColor: darkColors.surface,
  },
  userInfo: { flex: 1, minWidth: 0, gap: spacing.xs, alignItems: 'flex-start' },
  userName: {
    fontFamily: fontFamily.bold,
    fontSize: typography.title.fontSize,
    color: darkColors.text,
  },
  pill: {
    backgroundColor: darkColors.elevated,
    borderRadius: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  pillText: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    letterSpacing: 0.5,
    color: darkColors.muted,
  },
  rolePill: {
    backgroundColor: darkColors.elevated,
    borderRadius: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  rolePillText: {
    fontFamily: fontFamily.bold,
    fontSize: 11,
    letterSpacing: 0.8,
    color: darkColors.cyan,
  },

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
    letterSpacing: 0.8,
    color: darkColors.cyan,
  },
  aiBody: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 19,
    color: darkColors.muted,
  },

  sectionLabel: {
    fontFamily: fontFamily.bold,
    fontSize: typography.label.fontSize,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: darkColors.muted,
    marginTop: spacing.xs,
  },

  methodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: darkColors.surface,
    borderWidth: 2,
    borderColor: darkColors.border,
    borderRadius: 12,
    padding: spacing.md,
  },
  methodDisabled: { opacity: 0.55 },
  methodSelected: { borderColor: darkColors.primary },
  methodIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: darkColors.elevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  methodIconActive: { backgroundColor: `${darkColors.cyan}1A` },
  methodBody: { flex: 1, minWidth: 0, gap: 2 },
  methodTitle: {
    fontFamily: fontFamily.bold,
    fontSize: typography.body.fontSize,
    color: darkColors.text,
  },
  methodSub: { fontFamily: fontFamily.regular, fontSize: 12, color: darkColors.muted },
  methodUnavailable: {
    fontFamily: fontFamily.semibold,
    fontSize: 11,
    color: darkColors.warning,
    marginTop: 2,
  },
  radioOn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: darkColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: darkColors.primary },

  footer: {
    padding: spacing.lg,
    gap: spacing.sm,
    backgroundColor: darkColors.surface,
    borderTopWidth: 1,
    borderTopColor: darkColors.border,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  metaLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: darkColors.muted,
  },
  metaValue: {
    fontFamily: fontFamily.bold,
    fontSize: 11,
    letterSpacing: 0.8,
    color: darkColors.warning,
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
  btnBusy: { opacity: 0.7 },
  primaryText: {
    fontFamily: fontFamily.bold,
    fontSize: typography.label.fontSize,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: darkColors.onPrimary,
  },
  secondaryBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    height: touchTarget.primaryButton + 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: darkColors.border,
  },
  secondaryText: {
    fontFamily: fontFamily.bold,
    fontSize: typography.label.fontSize,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: darkColors.text,
  },
});

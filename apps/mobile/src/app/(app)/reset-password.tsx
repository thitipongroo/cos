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

import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, Image, StyleSheet, Alert } from 'react-native';
import { LoadingState } from '../../components/LoadingState';
import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { resetUserPassword, sendResetLinkEmail } from '../../api/users';
import { useT } from '../../i18n';
import {
  darkColors,
  fontFamily,
  plateRadius,
  radius,
  spacing,
  touchTarget,
  typography,
} from '../../theme/tokens';
import { formatRole } from '../../lib/formatRole';
import { shortId } from '../../lib/shortId';
import { darkScreen } from '../../theme/screenStyles';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
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

  // Email reset link (Keycloak action token) is the standards-compliant primary method (NIST 800-63B
  // Rev.4) and is preselected when the user has an email; the temporary password is the fallback for
  // phone-only (Path A) users with no email on file.
  const hasEmail = email !== '';
  const [method, setMethod] = useState<'email' | 'temp'>(hasEmail ? 'email' : 'temp');
  const [busy, setBusy] = useState(false);
  // This route is kept mounted by the Tabs navigator, so it is reused when the admin opens Reset-password
  // for a different user. Re-seed the selected method (and clear any stale busy state) whenever the target
  // changes, so a no-email user never inherits the previous target's "email" selection.
  useEffect(() => {
    setMethod(hasEmail ? 'email' : 'temp');
    setBusy(false);
  }, [userId, hasEmail]);

  const onConfirm = async (): Promise<void> => {
    if (userId === '' || busy) return;
    setBusy(true);
    try {
      if (method === 'email') {
        const res = await sendResetLinkEmail(userId);
        router.replace({
          pathname: '/reset-password-email-success',
          params: { display_name: name, email: res.email },
        });
      } else {
        const res = await resetUserPassword(userId);
        router.replace({
          pathname: '/reset-password-success',
          params: {
            user_id: userId,
            display_name: res.display_name || name,
            temp_password: res.temporary_password,
          },
        });
      }
    } catch {
      setBusy(false);
      Alert.alert(t('resetPassword.errorTitle'), t('resetPassword.errorBody'));
    }
  };

  return (
    <View style={darkScreen.root} testID="reset-password">
      <ScrollView style={darkScreen.fill} contentContainerStyle={styles.content}>
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
                {t('adminUsers.uid')}: {shortId(userId)}
              </Text>
            </View>
            <View style={styles.rolePill}>
              <Text style={styles.rolePillText}>{formatRole(role).toUpperCase()}</Text>
            </View>
          </View>
        </View>

        {/* AI Security Check — honest shell (no fabricated confidence score). */}
        <View style={styles.aiCard}>
          <View style={darkScreen.aiHead}>
            <MaterialIcons name="verified-user" size={18} color={darkColors.cyan} />
            <Text style={styles.aiTitle}>{t('resetPassword.aiTitle')}</Text>
          </View>
          <Text style={darkScreen.aiBody}>{t('resetPassword.aiBody')}</Text>
        </View>

        {/* Delivery method */}
        <Text style={styles.sectionLabel}>{t('resetPassword.deliveryMethod')}</Text>

        {/* Email reset link — the standards-compliant primary method; selectable when the user has an
            email, else disabled (no email on file — a phone-only Path A account). */}
        {hasEmail ? (
          <Pressable
            style={[styles.methodCard, method === 'email' && styles.methodSelected]}
            onPress={() => setMethod('email')}
            testID="method-email"
            accessibilityRole="radio"
            accessibilityState={{ selected: method === 'email' }}
          >
            <View style={[styles.methodIcon, method === 'email' && styles.methodIconActive]}>
              <MaterialIcons
                name="mail-outline"
                size={22}
                color={method === 'email' ? darkColors.cyan : darkColors.muted}
              />
            </View>
            <View style={styles.methodBody}>
              <View style={styles.methodTitleRow}>
                <Text style={styles.methodTitle}>{t('resetPassword.emailTitle')}</Text>
                <View style={styles.recommendBadge}>
                  <Text style={styles.recommendText}>{t('resetPassword.recommended')}</Text>
                </View>
              </View>
              <Text style={styles.methodSub} numberOfLines={1}>
                {email}
              </Text>
              <Text style={styles.methodSub}>{t('resetPassword.emailLinkNote')}</Text>
            </View>
            {method === 'email' ? (
              <View style={styles.radioOn}>
                <View style={styles.radioDot} />
              </View>
            ) : (
              <View style={styles.radioOff} />
            )}
          </Pressable>
        ) : (
          <View style={[styles.methodCard, styles.methodDisabled]} testID="method-email">
            <View style={styles.methodIcon}>
              <MaterialIcons name="mail-outline" size={22} color={darkColors.muted} />
            </View>
            <View style={styles.methodBody}>
              <Text style={[styles.methodTitle, { color: darkColors.muted }]}>
                {t('resetPassword.emailTitle')}
              </Text>
              <Text style={styles.methodUnavailable}>{t('resetPassword.emailNone')}</Text>
            </View>
            <MaterialIcons name="block" size={22} color={darkColors.muted} />
          </View>
        )}

        {/* Temporary password — the fallback for phone-only accounts / immediate offline hand-off. */}
        <Pressable
          style={[styles.methodCard, method === 'temp' && styles.methodSelected]}
          onPress={() => setMethod('temp')}
          testID="method-temp"
          accessibilityRole="radio"
          accessibilityState={{ selected: method === 'temp' }}
        >
          <View style={[styles.methodIcon, method === 'temp' && styles.methodIconActive]}>
            <MaterialIcons
              name="vpn-key"
              size={22}
              color={method === 'temp' ? darkColors.cyan : darkColors.muted}
            />
          </View>
          <View style={styles.methodBody}>
            <Text style={styles.methodTitle}>{t('resetPassword.tempTitle')}</Text>
            <Text style={styles.methodSub}>{t('resetPassword.tempSub')}</Text>
          </View>
          {method === 'temp' ? (
            <View style={styles.radioOn}>
              <View style={styles.radioDot} />
            </View>
          ) : (
            <View style={styles.radioOff} />
          )}
        </Pressable>

        {/* Auth-level meta sits at the end of the scroll content (a buffer above the fixed footer, so the
            Confirm button is never crowded against the last method card). */}
        <View style={styles.meta}>
          <Text style={styles.metaLabel}>{t('resetPassword.authLevel')}</Text>
          <Text style={styles.metaValue}>{t('resetPassword.authTenantAdmin')}</Text>
        </View>
      </ScrollView>

      <View style={darkScreen.footer}>
        <Pressable
          style={[darkScreen.primaryBtn, busy && styles.btnBusy]}
          onPress={onConfirm}
          disabled={busy}
          testID="reset-confirm"
          accessibilityRole="button"
        >
          {busy ? (
            <LoadingState variant="micro" theme="dark" tone="onPrimary" />
          ) : (
            <>
              <MaterialIcons name="lock-reset" size={20} color={darkColors.onPrimary} />
              <Text style={darkScreen.primaryText}>{t('resetPassword.confirm')}</Text>
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
          <Text style={darkScreen.secondaryText}>{t('resetPassword.cancel')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.md, gap: spacing.sm },

  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: darkColors.surface,
    borderLeftWidth: 4,
    borderLeftColor: darkColors.primary,
    borderRadius: radius.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  avatarWrap: { width: 64, height: 64 },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: plateRadius(64),
    borderWidth: 2,
    borderColor: darkColors.cyan,
  },
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
    borderRadius: radius.lg,
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
    borderRadius: radius.xl,
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
    borderRadius: radius.xl,
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
    borderRadius: radius.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
  },
  aiTitle: {
    fontFamily: fontFamily.bold,
    fontSize: typography.label.fontSize,
    letterSpacing: 0.8,
    color: darkColors.cyan,
  },

  sectionLabel: {
    fontFamily: fontFamily.bold,
    fontSize: typography.label.fontSize,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: darkColors.muted,
    marginTop: 2,
  },

  methodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: darkColors.surface,
    borderWidth: 2,
    borderColor: darkColors.border,
    borderRadius: radius.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  methodDisabled: { opacity: 0.55 },
  methodSelected: { borderColor: darkColors.primary },
  methodIcon: {
    width: 44,
    height: 44,
    borderRadius: plateRadius(44),
    backgroundColor: darkColors.elevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  methodIconActive: { backgroundColor: `${darkColors.cyan}1A` },
  methodBody: { flex: 1, minWidth: 0, gap: 2 },
  methodTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' },
  methodTitle: {
    fontFamily: fontFamily.bold,
    fontSize: typography.body.fontSize,
    color: darkColors.text,
  },
  recommendBadge: {
    backgroundColor: `${darkColors.cyan}1A`,
    borderRadius: radius.md,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  recommendText: {
    fontFamily: fontFamily.bold,
    fontSize: 9,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: darkColors.cyan,
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
    borderRadius: radius.xl,
    borderWidth: 2,
    borderColor: darkColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: darkColors.primary },
  radioOff: {
    width: 24,
    height: 24,
    borderRadius: radius.xl,
    borderWidth: 2,
    borderColor: darkColors.border,
  },

  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: darkColors.border,
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
  btnBusy: { opacity: 0.7 },
  secondaryBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    height: touchTarget.primaryButton + 8,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: darkColors.border,
  },
});

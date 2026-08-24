// MFA Enrollment (mockup/mobile/04_tenant_admin 03 enroll + 05 success + 07 backup-codes downloaded) —
// TENANT_ADMIN / FINANCE.
//
// Per the world-class-pattern research (2026-07-26), decision H4 and ADR-074, MFA/TOTP and the backup
// (recovery) codes are owned by Keycloak, NOT reimplemented in-app. So this screen is **native chrome
// around a Keycloak-driven flow**:
//   - The intro launches a Keycloak Application-Initiated Action through the same Authorization-Code +
//     PKCE flow the office login uses (login.tsx). Keycloak renders the QR / secret / verify pages (03)
//     and the recovery-codes page (06) in a Custom Tab, themed to match the mockups; we own only the
//     native intro + success chrome.
//   - `?action=recovery` drives `kc_action=CONFIGURE_RECOVERY_AUTHN_CODES` and, on return, shows the
//     native "Backup Codes Downloaded" success (mockup 07). The default drives `CONFIGURE_TOTP` and shows
//     the native "Enrollment Successful" screen (mockup 05).
//   - The mockups' backup-codes bento / audit trail (03) and the "142 KB PDF" file card (07) are NOT
//     reproduced with fabricated data — the real codes/download live in the Keycloak page; the native
//     success screens report only what the app actually knows.
//   - The authoritative second-factor check stays server-side (shared/guards/mfa-enforcement.ts, acr gate).
//
// QM-15: gated by `s1.auth.mfa-enrollment` (build-time EXPO_PUBLIC flag on the drawer entry; ADR-074).

import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { LoadingState } from '../../components/LoadingState';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { useI18n } from '../../i18n';
import { darkScreen } from '../../theme/screenStyles';
import {
  darkColors,
  fontFamily,
  plateRadius,
  radius,
  spacing,
  touchTarget,
  typography,
} from '../../theme/tokens';

WebBrowser.maybeCompleteAuthSession();

const KEYCLOAK_ISSUER =
  process.env.EXPO_PUBLIC_KEYCLOAK_ISSUER ?? 'http://localhost:8090/realms/construction-os';
const KEYCLOAK_CLIENT_ID = process.env.EXPO_PUBLIC_KEYCLOAK_CLIENT_ID ?? 'cos-mobile';

type Phase = 'intro' | 'success' | 'downloaded';

export default function MfaEnrollmentScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useI18n();

  // `?action=recovery` sets up Keycloak backup (recovery) codes and returns to the mockup-07 screen;
  // the default sets up the authenticator (TOTP) and returns to the mockup-05 screen.
  const { action } = useLocalSearchParams<{ action?: string }>();
  const isRecovery = action === 'recovery';

  const [phase, setPhase] = useState<Phase>('intro');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const discovery = AuthSession.useAutoDiscovery(KEYCLOAK_ISSUER);
  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'cos', path: 'oauth2redirect' });
  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: KEYCLOAK_CLIENT_ID,
      redirectUri,
      scopes: ['openid'],
      usePKCE: true,
      extraParams: {
        kc_action: isRecovery ? 'CONFIGURE_RECOVERY_AUTHN_CODES' : 'CONFIGURE_TOTP',
      },
    },
    discovery,
  );

  useEffect(() => {
    if (!response) return;
    setBusy(false);
    if (response.type === 'success') {
      const status = response.params['kc_action_status'];
      if (status === 'cancelled' || status === 'error') {
        setError(t('mfa.enroll.cancelled'));
        return;
      }
      setPhase(isRecovery ? 'downloaded' : 'success');
    } else if (response.type === 'error') {
      setError(t('mfa.enroll.error'));
    }
  }, [response, t, isRecovery]);

  const onEnroll = (): void => {
    setError(null);
    setBusy(true);
    void promptAsync();
  };

  // ── Mockup 05: Enrollment Successful ──────────────────────────────────────────────────────────────
  if (phase === 'success') {
    return (
      <View
        style={[
          darkScreen.root,
          styles.center,
          { paddingTop: insets.top, paddingBottom: insets.bottom },
        ]}
      >
        <View style={styles.iconWrap}>
          <View style={styles.successGlow} />
          <View style={styles.successRing}>
            <MaterialIcons name="check-circle" size={64} color={darkColors.success} />
          </View>
        </View>
        <Text style={styles.title}>{t('mfa.success.title')}</Text>
        <Text style={styles.body}>{t('mfa.success.body')}</Text>

        <View style={styles.auditCard}>
          <View style={styles.auditHeaderRow}>
            <Text style={styles.auditHeader}>{t('mfa.success.summary')}</Text>
          </View>
          <View style={styles.auditBody}>
            <View style={styles.auditRow}>
              <Text style={styles.auditLabel}>{t('mfa.success.status')}</Text>
              <View style={styles.activeBadge}>
                <View style={styles.activeDot} />
                <Text style={styles.activeText}>{t('mfa.success.active')}</Text>
              </View>
            </View>
            <View style={styles.auditRow}>
              <Text style={styles.auditLabel}>{t('mfa.success.method')}</Text>
              <Text style={styles.auditValue}>{t('mfa.success.methodValue')}</Text>
            </View>
            <View style={styles.auditRow}>
              <Text style={styles.auditLabel}>{t('mfa.success.backupCodes')}</Text>
              <View style={styles.savedRow}>
                <MaterialIcons name="verified" size={18} color={darkColors.success} />
                <Text style={styles.auditValue}>{t('mfa.success.saved')}</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.actions}>
          <Pressable
            testID="mfa-success-dashboard"
            style={styles.primaryButton}
            onPress={() => router.replace('/dashboard')}
            accessibilityRole="button"
            accessibilityLabel={t('mfa.success.done')}
          >
            <Text style={styles.primaryButtonText}>{t('mfa.success.done')}</Text>
            <MaterialIcons name="arrow-forward" size={20} color={darkColors.onPrimary} />
          </Pressable>
          <Pressable
            testID="mfa-success-security"
            style={styles.secondaryButton}
            onPress={() => router.push('/mfa-enrollment?action=recovery')}
            accessibilityRole="button"
            accessibilityLabel={t('mfa.success.viewSecurity')}
          >
            <Text style={styles.secondaryButtonText}>{t('mfa.success.viewSecurity')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ── Mockup 07: Backup Codes Downloaded ────────────────────────────────────────────────────────────
  if (phase === 'downloaded') {
    return (
      <View
        style={[
          darkScreen.root,
          styles.center,
          { paddingTop: insets.top, paddingBottom: insets.bottom },
        ]}
      >
        <View style={styles.iconWrap}>
          <View style={styles.pingRing} />
          <View style={styles.successRing}>
            <MaterialIcons name="check-circle" size={48} color={darkColors.success} />
          </View>
        </View>
        <Text style={styles.title}>{t('mfa.downloaded.title')}</Text>
        <Text style={styles.body}>{t('mfa.downloaded.body')}</Text>

        <View style={styles.fileCard}>
          <View style={styles.fileRow}>
            <View style={styles.fileLeft}>
              <View style={styles.pdfPlate}>
                <MaterialIcons name="description" size={22} color={darkColors.primary} />
              </View>
              <View style={darkScreen.fill}>
                <Text style={styles.fileName} numberOfLines={1}>
                  {t('mfa.downloaded.fileName')}
                </Text>
                <Text style={styles.fileMeta}>{t('mfa.downloaded.fileMeta')}</Text>
              </View>
            </View>
            <View style={styles.savedBadge}>
              <Text style={styles.savedBadgeText}>{t('mfa.downloaded.savedBadge')}</Text>
            </View>
          </View>
          <View style={styles.fileDivider} />
          <View style={styles.fileFooter}>
            <View style={styles.savedRow}>
              <MaterialIcons name="verified-user" size={16} color={darkColors.muted} />
              <Text style={styles.encryptedText}>{t('mfa.downloaded.encrypted')}</Text>
            </View>
          </View>
        </View>

        <View style={styles.actions}>
          <Pressable
            testID="mfa-downloaded-back"
            style={styles.primaryButton}
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel={t('mfa.downloaded.returnSecurity')}
          >
            <Text style={styles.primaryButtonText}>{t('mfa.downloaded.returnSecurity')}</Text>
            <MaterialIcons name="arrow-forward" size={20} color={darkColors.onPrimary} />
          </Pressable>
          <Pressable
            testID="mfa-downloaded-dashboard"
            style={styles.secondaryButton}
            onPress={() => router.replace('/dashboard')}
            accessibilityRole="button"
            accessibilityLabel={t('mfa.downloaded.goDashboard')}
          >
            <Text style={styles.secondaryButtonText}>{t('mfa.downloaded.goDashboard')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ── Intro (native chrome; launches the Keycloak AIA) ──────────────────────────────────────────────
  const introBody = isRecovery ? t('mfa.recovery.body') : t('mfa.enroll.body');
  const introCta = isRecovery ? t('mfa.recovery.cta') : t('mfa.enroll.cta');

  return (
    <View style={[darkScreen.root, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={styles.content} testID="mfa-enrollment">
        <View style={styles.shieldPlate}>
          <MaterialIcons
            name={isRecovery ? 'vpn-key' : 'security'}
            size={48}
            color={darkColors.primary}
          />
        </View>
        <Text style={styles.body}>{introBody}</Text>

        {!isRecovery ? (
          <View style={styles.stepsCard}>
            {[1, 2, 3].map((n) => (
              <View key={n} style={styles.stepRow}>
                <View style={styles.stepNum}>
                  <Text style={styles.stepNumText}>{n}</Text>
                </View>
                <Text style={styles.stepText}>{t(`mfa.enroll.step${n}`)}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {error ? (
          <View style={styles.errorRow}>
            <MaterialIcons name="error-outline" size={18} color={darkColors.danger} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <Pressable
          testID="mfa-enroll-start"
          style={[styles.primaryButton, (!request || busy) && styles.buttonDisabled]}
          disabled={!request || busy}
          onPress={onEnroll}
          accessibilityRole="button"
          accessibilityLabel={introCta}
          // Off until the enrolment request has arrived, and while one is in flight — the button
          // shows a micro loader then, which is a picture a screen reader cannot read.
          accessibilityState={{ disabled: !request || busy, busy }}
        >
          {busy ? (
            <LoadingState variant="micro" theme="dark" tone="onPrimary" />
          ) : (
            <>
              <MaterialIcons
                name={isRecovery ? 'vpn-key' : 'qr-code-2'}
                size={20}
                color={darkColors.onPrimary}
              />
              <Text style={styles.primaryButtonText}>{introCta}</Text>
            </>
          )}
        </Pressable>
        <Text style={styles.hint}>{t('mfa.enroll.hint')}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  content: { padding: spacing.lg, alignItems: 'center', gap: spacing.md },
  shieldPlate: {
    width: 96,
    height: 96,
    borderRadius: plateRadius(96),
    backgroundColor: darkColors.surface,
    borderWidth: 1,
    borderColor: darkColors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  // Success / downloaded icon with ambient glow (mockup 05 blur glow, mockup 07 ping ring).
  iconWrap: { alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg },
  successGlow: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: `${darkColors.success}22`,
  },
  pingRing: {
    position: 'absolute',
    width: 128,
    height: 128,
    borderRadius: 64,
    borderWidth: 4,
    borderColor: `${darkColors.success}33`,
  },
  successRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 4,
    borderColor: `${darkColors.success}4D`,
    backgroundColor: darkColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: typography.hero.fontSize,
    lineHeight: typography.hero.lineHeight,
    color: darkColors.text,
    textAlign: 'center',
  },
  body: {
    fontFamily: fontFamily.regular,
    fontSize: typography.body.fontSize,
    lineHeight: typography.body.lineHeight,
    color: darkColors.muted,
    textAlign: 'center',
  },
  stepsCard: {
    alignSelf: 'stretch',
    backgroundColor: darkColors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: darkColors.border,
    padding: spacing.md,
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stepNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: `${darkColors.primary}22`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumText: { fontFamily: fontFamily.bold, fontSize: 13, color: darkColors.primary },
  stepText: {
    flex: 1,
    fontFamily: fontFamily.medium,
    fontSize: typography.caption.fontSize,
    lineHeight: typography.caption.lineHeight,
    color: darkColors.text,
  },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, alignSelf: 'stretch' },
  errorText: {
    flex: 1,
    fontFamily: fontFamily.medium,
    fontSize: typography.label.fontSize,
    color: darkColors.danger,
  },
  // Actions column (mockup 05 & 07 both use a two-button stack).
  actions: { alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.lg },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    alignSelf: 'stretch',
    minHeight: touchTarget.primaryButton + 8,
    backgroundColor: darkColors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
  },
  buttonDisabled: { opacity: 0.6 },
  primaryButtonText: {
    fontFamily: fontFamily.bold,
    fontSize: typography.body.fontSize,
    color: darkColors.onPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    minHeight: touchTarget.primaryButton + 8,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: darkColors.muted,
    paddingHorizontal: spacing.lg,
  },
  secondaryButtonText: {
    fontFamily: fontFamily.bold,
    fontSize: typography.body.fontSize,
    color: darkColors.text,
    textTransform: 'uppercase',
  },
  hint: {
    fontFamily: fontFamily.regular,
    fontSize: typography.label.fontSize,
    color: darkColors.muted,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  // Security Audit Summary (mockup 05).
  auditCard: {
    alignSelf: 'stretch',
    backgroundColor: darkColors.surface,
    borderRadius: radius.lg,
    borderLeftWidth: 4,
    borderLeftColor: darkColors.success,
    overflow: 'hidden',
    marginTop: spacing.lg,
  },
  auditHeaderRow: {
    padding: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: darkColors.border,
  },
  auditHeader: {
    fontFamily: fontFamily.bold,
    fontSize: 11,
    letterSpacing: 1.5,
    color: darkColors.muted,
    textTransform: 'uppercase',
  },
  auditBody: { padding: spacing.md, gap: spacing.md },
  auditRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  auditLabel: {
    fontFamily: fontFamily.medium,
    fontSize: typography.body.fontSize,
    color: darkColors.muted,
  },
  auditValue: {
    fontFamily: fontFamily.semibold,
    fontSize: typography.body.fontSize,
    color: darkColors.text,
  },
  savedRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: `${darkColors.success}66`,
    borderRadius: 20,
    backgroundColor: `${darkColors.success}1A`,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  activeDot: { width: 8, height: 8, borderRadius: radius.md, backgroundColor: darkColors.success },
  activeText: {
    fontFamily: fontFamily.bold,
    fontSize: typography.label.fontSize,
    color: darkColors.success,
  },
  // File detail card (mockup 07).
  fileCard: {
    alignSelf: 'stretch',
    backgroundColor: darkColors.surface,
    borderRadius: radius.lg,
    borderLeftWidth: 4,
    borderLeftColor: darkColors.primary,
    overflow: 'hidden',
    marginTop: spacing.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  fileLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
  pdfPlate: {
    width: 40,
    height: 40,
    borderRadius: radius.lg,
    backgroundColor: `${darkColors.primary}1A`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileName: { fontFamily: fontFamily.semibold, fontSize: 14, color: darkColors.text },
  fileMeta: { fontFamily: fontFamily.regular, fontSize: 11, color: darkColors.muted, marginTop: 2 },
  savedBadge: {
    backgroundColor: `${darkColors.success}1A`,
    borderWidth: 1,
    borderColor: `${darkColors.success}4D`,
    borderRadius: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  savedBadgeText: {
    fontFamily: fontFamily.bold,
    fontSize: 10,
    color: darkColors.success,
    textTransform: 'uppercase',
  },
  fileDivider: { height: StyleSheet.hairlineWidth, backgroundColor: darkColors.border },
  fileFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  encryptedText: { fontFamily: fontFamily.regular, fontSize: 11, color: darkColors.muted },
});

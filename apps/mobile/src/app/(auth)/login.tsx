// Login screen — TWO paths (§20.6.1, G-M6 / ADR-050):
//   Path A — phone + SMS OTP (field roles): authStore.requestOtp/verifyOtp.
//   Path B — email/password via Keycloak OIDC (office/management): Authorization Code + PKCE opened in
//     the system browser (expo-auth-session/expo-web-browser). The Keycloak-hosted page handles
//     email+password AND the MFA (TOTP) step for TENANT_ADMIN/FINANCE — no custom email/password on the
//     device (QM-4). The returned code is exchanged for the same RS256 JWT the OTP path yields; tokens
//     are persisted via authStore.setTokens. No new auth mechanism vs §5.4.
//
// Visual design adapts mockup/00_login_flow/mobile/01 + /02 to the §32.7 --mobile-* LIGHT tokens
// (theme/tokens.ts). The Path-A OTP field stays a single input (not a 6-box grid) so the Detox login
// flow — field-login-link → phone-input → request-otp-button → otp-input (typeText) → verify-otp-button
// — keeps working unchanged. Icons are inline SVG (react-native-svg); no external icon font.
//
// expo-auth-session API verified against installed build types (~56.0.14): useAutoDiscovery /
// makeRedirectUri / useAuthRequest / exchangeCodeAsync.

import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
  Modal,
  FlatList,
  Pressable,
  ScrollView,
} from 'react-native';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { SvgXml } from 'react-native-svg';
import { getLocales } from 'expo-localization';
import { CosRole } from '@cos/types';
import { useAuthStore } from '../../store/authStore';
import { decodeJwtPayload } from '../../lib/jwt';
import { useT } from '../../i18n';
import { colors, fontFamily, spacing, typography } from '../../theme/tokens';
import { VerifyingOverlay } from '../../components/VerifyingOverlay';
import {
  COUNTRIES,
  DEFAULT_COUNTRY_ISO2,
  FLAG_SVG,
  countryFromRegion,
  findCountry,
  toE164,
} from '../../lib/countries';
import logoDark from '../../../assets/logo-dark.png';

WebBrowser.maybeCompleteAuthSession();

// Keycloak OIDC config (injected via env; the mobile public client must be provisioned in Keycloak
// with the `cos://oauth2redirect` redirect URI — ADR-050). Defaults target the local dev realm.
const KEYCLOAK_ISSUER =
  process.env['EXPO_PUBLIC_KEYCLOAK_ISSUER'] ?? 'http://localhost:8090/realms/construction-os';
const KEYCLOAK_CLIENT_ID = process.env['EXPO_PUBLIC_KEYCLOAK_CLIENT_ID'] ?? 'cos-mobile';

type Step = 'phone' | 'otp';
type Mode = 'select' | 'field';

const ARROW_XML = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 12h14M13 6l6 6-6 6" stroke="${colors.bg}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export default function LoginScreen() {
  const requestOtp = useAuthStore((s) => s.requestOtp);
  const verifyOtp = useAuthStore((s) => s.verifyOtp);
  const setTokens = useAuthStore((s) => s.setTokens);
  const t = useT();

  const [mode, setMode] = useState<Mode>('select');
  const [step, setStep] = useState<Step>('phone');
  const [countryIso2, setCountryIso2] = useState(DEFAULT_COUNTRY_ISO2);
  const [nationalNumber, setNationalNumber] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Default the country to the device region (e.g. locale "th-TH" → Thailand); fall back to the home
  // market when the device region isn't one of the supported markets.
  useEffect(() => {
    setCountryIso2(countryFromRegion(getLocales()[0]?.regionCode));
  }, []);

  const country = findCountry(countryIso2);
  const maskedPhone = `${country.dialCode} •••• ${nationalNumber.slice(-4)}`;

  // ── Path B — Keycloak OIDC (Authorization Code + PKCE) ──
  const discovery = AuthSession.useAutoDiscovery(KEYCLOAK_ISSUER);
  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'cos', path: 'oauth2redirect' });
  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    { clientId: KEYCLOAK_CLIENT_ID, redirectUri, scopes: ['openid', 'profile'], usePKCE: true },
    discovery,
  );
  const [oidcBusy, setOidcBusy] = useState(false);

  useEffect(() => {
    if (!response) return;
    if (response.type === 'error') {
      setError(t('auth.login.oidcError'));
      return;
    }
    if (response.type !== 'success' || !discovery || !request) return;
    const code = response.params['code'];
    if (!code) return;

    setOidcBusy(true);
    setError(null);
    AuthSession.exchangeCodeAsync(
      {
        clientId: KEYCLOAK_CLIENT_ID,
        code,
        redirectUri,
        extraParams: request.codeVerifier ? { code_verifier: request.codeVerifier } : undefined,
      },
      discovery,
    )
      .then(async (token) => {
        const claims = decodeJwtPayload(token.accessToken);
        const userId = typeof claims['user_id'] === 'string' ? claims['user_id'] : '';
        const role = claims['role'] as CosRole;
        await setTokens({
          accessToken: token.accessToken,
          refreshToken: token.refreshToken ?? '',
          userId,
          role,
        });
        // AuthGate (root _layout) redirects to /(app)/home once isAuthenticated flips.
      })
      .catch(() => setError(t('auth.login.oidcError')))
      .finally(() => setOidcBusy(false));
  }, [response]);

  const onOfficeLogin = (): void => {
    setError(null);
    void promptAsync();
  };

  const e164Phone = (): string => toE164(country.dialCode, nationalNumber);

  const onRequestOtp = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await requestOtp(e164Phone());
      setStep('otp');
    } catch {
      setError(t('auth.login.otpSendError'));
    } finally {
      setBusy(false);
    }
  };

  const onVerifyOtp = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await verifyOtp(e164Phone(), otp.trim());
    } catch {
      setError(t('auth.login.otpVerifyError'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Top app bar */}
      <View style={styles.header}>
        <Image
          testID="brand-logo"
          source={logoDark}
          style={styles.headerLogo}
          resizeMode="contain"
          accessibilityLabel={t('common.appName')}
        />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {mode === 'select' ? (
          <>
            {/* Hero */}
            <View style={styles.hero}>
              <View style={styles.heroMark}>
                <Image source={logoDark} style={styles.heroLogo} resizeMode="contain" />
              </View>
              <Text style={styles.heroTitle}>{t('auth.login.heroTitle')}</Text>
              <Text style={styles.heroSubtitle}>{t('auth.login.heroSubtitle')}</Text>
            </View>

            {/* Auth card */}
            <View style={styles.card}>
              {/* Path A — field roles (phone + OTP) */}
              <TouchableOpacity
                testID="field-login-link"
                style={styles.button}
                onPress={() => setMode('field')}
              >
                <Text style={styles.buttonText}>{t('auth.login.fieldWorkerAccess')}</Text>
                <SvgXml xml={ARROW_XML} width={20} height={20} />
              </TouchableOpacity>

              <View style={styles.dividerRow}>
                <View style={styles.divider} />
                <Text style={styles.dividerText}>{t('auth.login.or')}</Text>
                <View style={styles.divider} />
              </View>

              {/* Path B — office/management (email/password via Keycloak) */}
              <TouchableOpacity
                testID="office-login-button"
                style={[styles.buttonOutline, (!request || oidcBusy) && styles.buttonDisabled]}
                onPress={onOfficeLogin}
                disabled={!request || oidcBusy}
              >
                {oidcBusy ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Text style={styles.buttonOutlineText}>{t('auth.login.loginEmail')}</Text>
                )}
              </TouchableOpacity>
              <Text style={styles.helper}>{t('auth.login.officeHelper')}</Text>
            </View>

            <Text style={styles.footerNote}>{t('auth.login.systemOperational')}</Text>
          </>
        ) : step === 'phone' ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('auth.login.fieldWorkerAccess')}</Text>
            <View style={styles.phoneRow}>
              {/* Country code — flag (bundled SVG) + E.164 dial code; opens the country picker. */}
              <TouchableOpacity
                testID="country-picker"
                style={styles.countryButton}
                onPress={() => setPickerOpen(true)}
                disabled={busy}
                accessibilityLabel={t('auth.login.countryLabel')}
              >
                <SvgXml xml={FLAG_SVG[country.iso2] ?? ''} width={24} height={16} />
                <Text style={styles.dialCode}>{country.dialCode}</Text>
              </TouchableOpacity>
              <TextInput
                testID="phone-input"
                style={[styles.input, styles.phoneInput]}
                placeholder={t('auth.login.phonePlaceholder')}
                placeholderTextColor={colors.textSecondary}
                keyboardType="phone-pad"
                autoCapitalize="none"
                value={nationalNumber}
                onChangeText={setNationalNumber}
                editable={!busy}
              />
            </View>
            <TouchableOpacity
              testID="request-otp-button"
              style={[styles.button, busy && styles.buttonDisabled]}
              onPress={onRequestOtp}
              disabled={busy || nationalNumber.trim().length === 0}
            >
              {busy ? (
                <ActivityIndicator color={colors.bg} />
              ) : (
                <>
                  <Text style={styles.buttonText}>{t('auth.login.sendOtp')}</Text>
                  <SvgXml xml={ARROW_XML} width={20} height={20} />
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity testID="back-to-office-link" onPress={() => setMode('select')}>
              <Text style={styles.link}>{t('auth.login.backToOffice')}</Text>
            </TouchableOpacity>

            <Modal
              visible={pickerOpen}
              transparent
              animationType="fade"
              onRequestClose={() => setPickerOpen(false)}
            >
              <Pressable style={styles.modalBackdrop} onPress={() => setPickerOpen(false)}>
                <View style={styles.modalCard}>
                  <FlatList
                    data={COUNTRIES}
                    keyExtractor={(c) => c.iso2}
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        testID={`country-option-${item.iso2}`}
                        style={styles.countryRow}
                        onPress={() => {
                          setCountryIso2(item.iso2);
                          setPickerOpen(false);
                        }}
                      >
                        <SvgXml xml={FLAG_SVG[item.iso2] ?? ''} width={28} height={19} />
                        <Text style={styles.countryName}>{item.nameEn}</Text>
                        <Text style={styles.countryDial}>{item.dialCode}</Text>
                      </TouchableOpacity>
                    )}
                  />
                </View>
              </Pressable>
            </Modal>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('auth.login.verifyTitle')}</Text>
            <Text style={styles.cardSubtitle}>
              {t('auth.login.verifySubtitle')} <Text style={styles.maskedPhone}>{maskedPhone}</Text>
            </Text>
            <TextInput
              testID="otp-input"
              style={styles.otpInput}
              placeholder={t('auth.login.otpPlaceholder')}
              placeholderTextColor={colors.textSecondary}
              keyboardType="number-pad"
              maxLength={6}
              value={otp}
              onChangeText={setOtp}
              editable={!busy}
            />
            <TouchableOpacity
              testID="verify-otp-button"
              style={[styles.button, busy && styles.buttonDisabled]}
              onPress={onVerifyOtp}
              disabled={busy || otp.trim().length !== 6}
            >
              {busy ? (
                <ActivityIndicator color={colors.bg} />
              ) : (
                <>
                  <Text style={styles.buttonText}>{t('auth.login.verifyContinue')}</Text>
                  <SvgXml xml={ARROW_XML} width={20} height={20} />
                </>
              )}
            </TouchableOpacity>
            <View style={styles.resendRow}>
              <Text style={styles.helper}>{t('auth.login.resendPrompt')}</Text>
              <TouchableOpacity onPress={onRequestOtp} disabled={busy}>
                <Text style={styles.link}>{t('auth.login.resendCode')}</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.securityBanner}>
              <Text style={styles.securityLabel}>{t('auth.login.securityProtocol')}</Text>
              <Text style={styles.securityNote}>{t('auth.login.securityNote')}</Text>
            </View>
          </View>
        )}

        {error ? (
          <Text testID="login-error" style={styles.error}>
            {error}
          </Text>
        ) : null}
      </ScrollView>

      {oidcBusy ? <VerifyingOverlay /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    height: 56,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.surface,
  },
  headerLogo: {
    width: 160,
    height: 28,
  },
  scroll: {
    padding: spacing.lg,
    gap: spacing.md,
    flexGrow: 1,
  },
  hero: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  heroMark: {
    width: 88,
    height: 88,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  heroLogo: {
    width: 56,
    height: 56,
  },
  heroTitle: {
    fontSize: typography.hero.fontSize,
    fontFamily: fontFamily.bold,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  heroSubtitle: {
    fontSize: typography.caption.fontSize,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: typography.caption.lineHeight,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    gap: spacing.md,
  },
  cardTitle: {
    fontSize: typography.title.fontSize,
    fontFamily: fontFamily.semibold,
    color: colors.textPrimary,
  },
  cardSubtitle: {
    fontSize: typography.caption.fontSize,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
    lineHeight: typography.caption.lineHeight,
  },
  maskedPhone: {
    fontFamily: fontFamily.semibold,
    color: colors.primary,
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.textSecondary,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    fontSize: typography.body.fontSize,
    fontFamily: fontFamily.regular,
    color: colors.textPrimary,
  },
  otpInput: {
    minHeight: 60,
    borderWidth: 1,
    borderColor: colors.textSecondary,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    fontSize: typography.hero.fontSize,
    fontFamily: fontFamily.bold,
    color: colors.textPrimary,
    textAlign: 'center',
    letterSpacing: 8,
  },
  button: {
    minHeight: 52,
    flexDirection: 'row',
    gap: spacing.xs,
    backgroundColor: colors.primary,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonOutline: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.textSecondary,
    backgroundColor: colors.bg,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: {
    color: colors.bg,
    fontSize: typography.body.fontSize,
    fontFamily: fontFamily.semibold,
  },
  buttonOutlineText: {
    color: colors.textPrimary,
    fontSize: typography.body.fontSize,
    fontFamily: fontFamily.semibold,
  },
  helper: {
    color: colors.textSecondary,
    fontFamily: fontFamily.regular,
    fontSize: typography.label.fontSize,
    textAlign: 'center',
  },
  link: {
    color: colors.primary,
    fontFamily: fontFamily.medium,
    fontSize: typography.body.fontSize,
    textAlign: 'center',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: colors.textSecondary,
    opacity: 0.3,
  },
  dividerText: {
    fontSize: typography.label.fontSize,
    fontFamily: fontFamily.medium,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  footerNote: {
    color: colors.synced,
    fontFamily: fontFamily.medium,
    fontSize: typography.label.fontSize,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginTop: 'auto',
    paddingTop: spacing.md,
  },
  error: {
    color: colors.danger,
    fontFamily: fontFamily.regular,
    fontSize: typography.caption.fontSize,
    textAlign: 'center',
  },
  resendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  securityBanner: {
    backgroundColor: colors.bg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.surface,
    padding: spacing.sm,
    gap: 2,
  },
  securityLabel: {
    fontSize: typography.label.fontSize,
    fontFamily: fontFamily.semibold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  securityNote: {
    fontSize: typography.label.fontSize,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
    lineHeight: typography.label.lineHeight,
  },
  phoneRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  countryButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.textSecondary,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
  },
  dialCode: {
    fontSize: typography.body.fontSize,
    fontFamily: fontFamily.regular,
    color: colors.textPrimary,
  },
  phoneInput: {
    flex: 1,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    backgroundColor: colors.bg,
    borderRadius: 12,
    maxHeight: '70%',
    overflow: 'hidden',
  },
  countryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.surface,
  },
  countryName: {
    flex: 1,
    fontSize: typography.body.fontSize,
    fontFamily: fontFamily.regular,
    color: colors.textPrimary,
  },
  countryDial: {
    fontSize: typography.body.fontSize,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
  },
});

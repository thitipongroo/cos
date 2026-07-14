// Login screen — TWO paths (§20.6.1, G-M6 / ADR-050):
//   Path A — phone + SMS OTP (field roles): authStore.requestOtp/verifyOtp.
//   Path B — email/password via Keycloak OIDC (office/management): Authorization Code + PKCE opened in
//     the system browser (expo-auth-session/expo-web-browser). The Keycloak-hosted page handles
//     email+password AND the MFA (TOTP) step for TENANT_ADMIN/FINANCE — no custom email/password on the
//     device (QM-4). The returned code is exchanged for the same RS256 JWT the OTP path yields; tokens
//     are persisted via authStore.setTokens. No new auth mechanism vs §5.4.
//
// Flow mirrors the web login (mockup/00_login_flow): the landing carries the phone form (Path A) as the
// primary action with "Login with Email" (Path B) secondary; sending the passcode advances straight to
// the OTP-verify step — there is no separate phone-entry screen. testIDs kept for Detox
// (country-picker / phone-input / request-otp-button / otp-input / verify-otp-button /
// office-login-button); `field-login-link` is gone with the select step it toggled.
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CosRole } from '@cos/types';
import { useAuthStore } from '../../store/authStore';
import { decodeJwtPayload } from '../../lib/jwt';
import { useT } from '../../i18n';
import { authColors, fontFamily, spacing, typography } from '../../theme/tokens';
import { LanguageSwitcher } from '../../components/LanguageSwitcher';
import { VerifyingOverlay } from '../../components/VerifyingOverlay';
import {
  COUNTRIES,
  DEFAULT_COUNTRY_ISO2,
  FLAG_SVG,
  countryFromRegion,
  findCountry,
  toE164,
} from '../../lib/countries';
import appIcon from '../../../assets/icon.png';

WebBrowser.maybeCompleteAuthSession();

const KEYCLOAK_ISSUER =
  process.env['EXPO_PUBLIC_KEYCLOAK_ISSUER'] ?? 'http://localhost:8090/realms/construction-os';
const KEYCLOAK_CLIENT_ID = process.env['EXPO_PUBLIC_KEYCLOAK_CLIENT_ID'] ?? 'cos-mobile';

type Step = 'phone' | 'otp';

const ARROW_XML = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 12h14M13 6l6 6-6 6" stroke="${authColors.onPrimary}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export default function LoginScreen() {
  // The auth stack has no navigator chrome of its own, so the header must clear the status bar
  // itself — same pattern as (app)/_layout.tsx.
  const insets = useSafeAreaInsets();
  const requestOtp = useAuthStore((s) => s.requestOtp);
  const verifyOtp = useAuthStore((s) => s.verifyOtp);
  const setTokens = useAuthStore((s) => s.setTokens);
  const t = useT();

  const [step, setStep] = useState<Step>('phone');
  const [countryIso2, setCountryIso2] = useState(DEFAULT_COUNTRY_ISO2);
  const [nationalNumber, setNationalNumber] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setOtp('');
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
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Top app bar — icon + wordtext left, language switcher right (mockup 01: the header carries
          the icon mark next to a CONSTRUCTION OS heading, not the wordmark image). */}
      <View style={styles.header}>
        <View style={styles.headerBrand}>
          <Image
            testID="brand-logo"
            source={appIcon}
            style={styles.headerIcon}
            resizeMode="contain"
            accessibilityLabel={t('common.appName')}
          />
          <Text style={styles.headerWordtext}>{t('auth.login.appName')}</Text>
        </View>
        <LanguageSwitcher />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {step === 'phone' ? (
          <>
            {/* Hero — icon mark, then the tagline split over two lines (mockup 01). */}
            <View style={styles.hero}>
              <View style={styles.logoBox}>
                <Image source={appIcon} style={styles.logoBoxImg} resizeMode="contain" />
              </View>
              <Text style={styles.heroTitle}>{t('auth.login.heroTitle')}</Text>
              <Text style={styles.heroTitle}>{t('auth.login.heroTitle2')}</Text>
              <Text style={styles.heroSubtitle}>{t('auth.login.heroSubtitle')}</Text>
            </View>

            {/* Auth card — Path A primary, Path B secondary */}
            <View style={styles.card}>
              <Text style={styles.label}>{t('auth.login.fieldWorkerAccess')}</Text>
              <View style={styles.phoneRow}>
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
                  placeholderTextColor={authColors.muted}
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
                  <ActivityIndicator color={authColors.onPrimary} />
                ) : (
                  <>
                    <Text style={styles.buttonText}>{t('auth.login.sendOtp')}</Text>
                    <SvgXml xml={ARROW_XML} width={20} height={20} />
                  </>
                )}
              </TouchableOpacity>

              <View style={styles.dividerRow}>
                <View style={styles.divider} />
                <Text style={styles.dividerText}>{t('auth.login.or')}</Text>
                <View style={styles.divider} />
              </View>

              <TouchableOpacity
                testID="office-login-button"
                style={[styles.buttonOutline, (!request || oidcBusy) && styles.buttonDisabled]}
                onPress={onOfficeLogin}
                disabled={!request || oidcBusy}
              >
                {oidcBusy ? (
                  <ActivityIndicator color={authColors.primary} />
                ) : (
                  <Text style={styles.buttonOutlineText}>{t('auth.login.loginEmail')}</Text>
                )}
              </TouchableOpacity>
              <Text style={styles.helper}>{t('auth.login.officeHelper')}</Text>
            </View>

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

            {/* Footer (mockup 01) */}
            <View style={styles.footer}>
              <View style={styles.footerRow}>
                <View style={styles.statusDot} />
                <Text style={styles.footerText}>{t('auth.login.siteVersion')}</Text>
              </View>
              <View style={styles.footerLinks}>
                <Text style={styles.footerLink}>{t('auth.login.privacyPolicy')}</Text>
                <Text style={styles.footerDivider}>·</Text>
                <Text style={styles.footerLink}>{t('auth.login.termsOfUse')}</Text>
              </View>
              <Text style={styles.footerFine}>{t('auth.login.copyright')}</Text>
            </View>
          </>
        ) : (
          <View style={styles.card}>
            {/* Icon mark (mockup 02 — the hero is the icon, not the wordmark) */}
            <View style={styles.logoBoxWhite}>
              <Image source={appIcon} style={styles.logoBoxImg} resizeMode="contain" />
            </View>
            <Text style={styles.cardTitle}>{t('auth.login.verifyTitle')}</Text>
            <Text style={styles.cardSubtitle}>
              {t('auth.login.verifySubtitle')} <Text style={styles.maskedPhone}>{maskedPhone}</Text>
            </Text>
            <TextInput
              testID="otp-input"
              style={styles.otpInput}
              placeholder={t('auth.login.otpPlaceholder')}
              placeholderTextColor={authColors.muted}
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
                <ActivityIndicator color={authColors.onPrimary} />
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
            <TouchableOpacity onPress={() => setStep('phone')}>
              <Text style={styles.link}>{t('auth.login.backToOffice')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {step === 'otp' ? (
          /* Footer (mockup 02) */
          <View style={styles.footerLinks}>
            <Text style={styles.footerLink}>{t('auth.login.getSupport')}</Text>
            <Text style={styles.footerDivider}>·</Text>
            <Text style={styles.footerLink}>{t('auth.login.privacyData')}</Text>
          </View>
        ) : null}

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
  container: { flex: 1, backgroundColor: authColors.bg },
  header: {
    height: 56,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: authColors.border,
  },
  headerBrand: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  headerIcon: { width: 32, height: 32 },
  headerWordtext: {
    fontSize: typography.title.fontSize,
    fontFamily: fontFamily.bold,
    color: authColors.primary,
    letterSpacing: -0.5,
  },
  scroll: { padding: spacing.lg, gap: spacing.md, flexGrow: 1 },
  hero: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg },
  logoBox: {
    width: 88,
    height: 88,
    borderRadius: 20,
    backgroundColor: authColors.elevated,
    borderWidth: 1,
    borderColor: authColors.border,
    overflow: 'hidden',
    marginBottom: spacing.xs,
  },
  logoBoxWhite: {
    width: 72,
    height: 72,
    borderRadius: 16,
    backgroundColor: authColors.elevated,
    borderWidth: 1,
    borderColor: authColors.border,
    overflow: 'hidden',
    alignSelf: 'center',
    marginBottom: spacing.sm,
  },
  logoBoxImg: { width: '100%', height: '100%' },
  heroTitle: {
    fontSize: typography.hero.fontSize,
    fontFamily: fontFamily.bold,
    color: authColors.text,
    textAlign: 'center',
  },
  heroSubtitle: {
    fontSize: typography.caption.fontSize,
    fontFamily: fontFamily.regular,
    color: authColors.muted,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: typography.caption.lineHeight,
  },
  card: {
    backgroundColor: authColors.surface,
    borderRadius: 12,
    padding: spacing.md,
    gap: spacing.md,
  },
  cardTitle: {
    fontSize: typography.title.fontSize,
    fontFamily: fontFamily.semibold,
    color: authColors.text,
    textAlign: 'center',
  },
  cardSubtitle: {
    fontSize: typography.caption.fontSize,
    fontFamily: fontFamily.regular,
    color: authColors.muted,
    textAlign: 'center',
    lineHeight: typography.caption.lineHeight,
  },
  maskedPhone: { fontFamily: fontFamily.semibold, color: authColors.primary },
  label: {
    fontSize: typography.label.fontSize,
    fontFamily: fontFamily.semibold,
    color: authColors.muted,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: authColors.border,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    fontSize: typography.body.fontSize,
    fontFamily: fontFamily.regular,
    color: authColors.text,
  },
  otpInput: {
    minHeight: 60,
    borderWidth: 1,
    borderColor: authColors.border,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    fontSize: typography.hero.fontSize,
    fontFamily: fontFamily.bold,
    color: authColors.text,
    textAlign: 'center',
    letterSpacing: 8,
  },
  button: {
    minHeight: 52,
    flexDirection: 'row',
    gap: spacing.xs,
    backgroundColor: authColors.primary,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonOutline: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: authColors.border,
    backgroundColor: 'transparent',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: {
    color: authColors.onPrimary,
    fontSize: typography.body.fontSize,
    fontFamily: fontFamily.semibold,
  },
  buttonOutlineText: {
    color: authColors.text,
    fontSize: typography.body.fontSize,
    fontFamily: fontFamily.semibold,
  },
  helper: {
    color: authColors.muted,
    fontFamily: fontFamily.regular,
    fontSize: typography.label.fontSize,
    textAlign: 'center',
  },
  link: {
    color: authColors.primary,
    fontFamily: fontFamily.medium,
    fontSize: typography.body.fontSize,
    textAlign: 'center',
  },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  divider: { flex: 1, height: 1, backgroundColor: authColors.muted, opacity: 0.3 },
  dividerText: {
    fontSize: typography.label.fontSize,
    fontFamily: fontFamily.medium,
    color: authColors.muted,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  error: {
    color: authColors.danger,
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
    backgroundColor: authColors.elevated,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: authColors.border,
    padding: spacing.sm,
    gap: 2,
  },
  securityLabel: {
    fontSize: typography.label.fontSize,
    fontFamily: fontFamily.semibold,
    color: authColors.muted,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  securityNote: {
    fontSize: typography.label.fontSize,
    fontFamily: fontFamily.regular,
    color: authColors.muted,
    lineHeight: typography.label.lineHeight,
  },
  phoneRow: { flexDirection: 'row', gap: spacing.sm },
  countryButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: authColors.border,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
  },
  dialCode: {
    fontSize: typography.body.fontSize,
    fontFamily: fontFamily.regular,
    color: authColors.text,
  },
  phoneInput: { flex: 1 },
  footer: { alignItems: 'center', gap: spacing.xs, paddingTop: spacing.lg },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: authColors.success },
  footerLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingTop: spacing.md,
  },
  footerText: {
    fontSize: typography.label.fontSize,
    fontFamily: fontFamily.regular,
    color: authColors.muted,
  },
  footerLink: {
    fontSize: typography.label.fontSize,
    fontFamily: fontFamily.medium,
    color: authColors.muted,
    letterSpacing: 0.8,
  },
  footerDivider: { color: authColors.muted, fontSize: typography.label.fontSize },
  footerFine: {
    fontSize: typography.label.fontSize,
    fontFamily: fontFamily.regular,
    color: authColors.muted,
    opacity: 0.7,
    textAlign: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    backgroundColor: authColors.bg,
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
    borderBottomColor: authColors.border,
  },
  countryName: {
    flex: 1,
    fontSize: typography.body.fontSize,
    fontFamily: fontFamily.regular,
    color: authColors.text,
  },
  countryDial: {
    fontSize: typography.body.fontSize,
    fontFamily: fontFamily.regular,
    color: authColors.muted,
  },
});

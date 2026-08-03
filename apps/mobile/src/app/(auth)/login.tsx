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

import { useEffect, useRef, useState } from 'react';
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
import { MaterialIcons } from '@expo/vector-icons';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { SvgXml } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { getLocales } from 'expo-localization';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CosRole } from '@cos/types';
import { useAuthStore } from '../../store/authStore';
import { decodeJwtPayload } from '../../lib/jwt';
import Constants from 'expo-constants';
import { useT } from '../../i18n';
import { darkColors, fontFamily, spacing, typography } from '../../theme/tokens';
import { LanguageSwitcher } from '../../components/LanguageSwitcher';
import { VerifyingOverlay } from '../../components/VerifyingOverlay';
import { checkBackendHealth } from '../../api/health';
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

const ARROW_XML = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 12h14M13 6l6 6-6 6" stroke="${darkColors.onPrimary}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export default function LoginScreen() {
  // The auth stack has no navigator chrome of its own, so the header must clear the status bar
  // itself — same pattern as (app)/_layout.tsx.
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const requestOtp = useAuthStore((s) => s.requestOtp);
  const verifyOtp = useAuthStore((s) => s.verifyOtp);
  const setTokens = useAuthStore((s) => s.setTokens);
  const deviceTrusted = useAuthStore((s) => s.deviceTrusted);
  const t = useT();

  const [step, setStep] = useState<Step>('phone');
  const [countryIso2, setCountryIso2] = useState(DEFAULT_COUNTRY_ISO2);
  const [nationalNumber, setNationalNumber] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [otp, setOtp] = useState('');
  const otpRef = useRef<TextInput>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // null = not yet checked; true/false = last liveness result for the footer status dot.
  const [healthy, setHealthy] = useState<boolean | null>(null);
  // Seconds left before "resend" is allowed again (§5.5 send-rate cap). >0 disables the control.
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    setCountryIso2(countryFromRegion(getLocales()[0]?.regionCode));
  }, []);

  // Tick the resend cooldown down to zero.
  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setInterval(() => setResendIn((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(id);
  }, [resendIn]);

  // Poll backend liveness so the footer reflects real connectivity, not a static "operational".
  useEffect(() => {
    let active = true;
    const ping = (): void => {
      void checkBackendHealth().then((ok) => {
        if (active) setHealthy(ok);
      });
    };
    ping();
    const id = setInterval(ping, 15_000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  const appVersion = Constants.expoConfig?.version ?? '0.1.0';

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
      const { resendCooldownSeconds } = await requestOtp(e164Phone());
      setResendIn(resendCooldownSeconds); // start the resend cooldown countdown
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

      <ScrollView
        contentContainerStyle={[styles.scroll, step === 'otp' && styles.scrollCentered]}
        keyboardShouldPersistTaps="handled"
      >
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
              {/* Phone-step error sits directly above the phone field it refers to (PO decision
                  2026-07-29), mirroring the OTP-step error shown above the code boxes. The card's
                  `gap` spaces it from the label and the input. */}
              {error && step === 'phone' ? (
                <Text testID="login-error" style={styles.error}>
                  {error}
                </Text>
              ) : null}
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
                  placeholderTextColor={darkColors.muted}
                  keyboardType="phone-pad"
                  autoCapitalize="none"
                  maxLength={country.nationalDigits}
                  value={nationalNumber}
                  onChangeText={(v) =>
                    setNationalNumber(v.replace(/\D/g, '').slice(0, country.nationalDigits))
                  }
                  editable={!busy}
                />
              </View>
              <TouchableOpacity
                testID="request-otp-button"
                style={[
                  styles.button,
                  (busy || nationalNumber.length !== country.nationalDigits) &&
                    styles.buttonDisabled,
                ]}
                onPress={onRequestOtp}
                disabled={busy || nationalNumber.length !== country.nationalDigits}
              >
                {busy ? (
                  <ActivityIndicator color={darkColors.onPrimary} />
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
                  <ActivityIndicator color={darkColors.primary} />
                ) : (
                  <>
                    <MaterialIcons name="corporate-fare" size={20} color={darkColors.primary} />
                    <Text style={styles.buttonOutlineText}>{t('auth.login.loginEmail')}</Text>
                  </>
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
                          // Trim a number that no longer fits the newly-selected country's format.
                          setNationalNumber((n) => n.slice(0, item.nationalDigits));
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
                {/* Green when the backend answers /health/live, red when it does not. Grey until the
                    first probe returns, so it never flashes a wrong state on launch. */}
                <View
                  testID="health-dot"
                  style={[
                    styles.statusDot,
                    {
                      backgroundColor:
                        healthy === null
                          ? darkColors.muted
                          : healthy
                            ? darkColors.success
                            : darkColors.danger,
                    },
                  ]}
                />
                <Text style={styles.footerText}>
                  {t('auth.login.footerStatus', {
                    status: t(healthy === false ? 'auth.login.statusError' : 'auth.login.statusOk'),
                    version: appVersion,
                  })}
                </Text>
              </View>
              <View style={styles.footerLinks}>
                <TouchableOpacity
                  testID="privacy-policy-link"
                  accessibilityRole="link"
                  accessibilityLabel={t('auth.login.privacyPolicy')}
                  onPress={() => router.push('/(auth)/privacy-policy')}
                  // hitSlop, not padding: the footer row is a small text link in the mockup, and
                  // growing it would push the layout. This keeps the visual size while giving the
                  // 44px effective target §32.7 requires.
                  hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
                  style={styles.footerLinkItem}
                >
                  <MaterialIcons name="policy" size={16} color={darkColors.muted} />
                  <Text style={styles.footerLink}>{t('auth.login.privacyPolicy')}</Text>
                </TouchableOpacity>
                <Text style={styles.footerDivider}>·</Text>
                <View style={styles.footerLinkItem}>
                  <MaterialIcons name="gavel" size={16} color={darkColors.muted} />
                  <Text style={styles.footerLink}>{t('auth.login.termsOfUse')}</Text>
                </View>
              </View>
              <Text style={styles.footerFine}>
                {t('auth.login.copyright', { year: new Date().getFullYear() })}
              </Text>
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
            {/* Verify error sits directly above the code boxes it refers to. */}
            {error ? (
              <Text testID="login-error" style={styles.error}>
                {error}
              </Text>
            ) : null}
            {/* Six-box OTP (mockup 02). RN-Android New Arch ignores a transparent/alpha-0 text colour
                (facebook/react-native#53343), so the input's glyphs can't be hidden by colour. Instead
                the row has a uniform fill, the input's text is coloured to match it (invisible), and the
                boxes + digits are painted in a pointer-events-none overlay ON TOP. The input keeps
                testID="otp-input" + value={otp} and stays visible, so Detox tap/typeText are unaffected. */}
            <Pressable style={styles.otpRow} onPress={() => otpRef.current?.focus()}>
              <TextInput
                testID="otp-input"
                ref={otpRef}
                style={styles.otpMaskInput}
                keyboardType="number-pad"
                maxLength={6}
                value={otp}
                onChangeText={(v) => setOtp(v.replace(/\D/g, '').slice(0, 6))}
                editable={!busy}
                autoFocus
                caretHidden
              />
              <View style={styles.otpBoxesOverlay} pointerEvents="none">
                {Array.from({ length: 6 }).map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.otpCell,
                      (i === otp.length || (otp.length === 6 && i === 5)) && styles.otpCellActive,
                    ]}
                  >
                    <Text style={styles.otpCellText}>{otp[i] ?? ''}</Text>
                  </View>
                ))}
              </View>
            </Pressable>
            <TouchableOpacity
              testID="verify-otp-button"
              style={[styles.button, busy && styles.buttonDisabled]}
              onPress={onVerifyOtp}
              disabled={busy || otp.trim().length !== 6}
            >
              {busy ? (
                <ActivityIndicator color={darkColors.onPrimary} />
              ) : (
                <>
                  <Text style={styles.buttonText}>{t('auth.login.verifyContinue')}</Text>
                  <SvgXml xml={ARROW_XML} width={20} height={20} />
                </>
              )}
            </TouchableOpacity>
            <View style={styles.resendRow}>
              <Text style={styles.helper}>{t('auth.login.resendPrompt')}</Text>
              <TouchableOpacity onPress={onRequestOtp} disabled={busy || resendIn > 0}>
                <Text style={[styles.link, resendIn > 0 && styles.linkDisabled]}>
                  {resendIn > 0
                    ? t('auth.login.resendCodeIn', { seconds: resendIn })
                    : t('auth.login.resendCode')}
                </Text>
              </TouchableOpacity>
            </View>
            {/* Device-trust banner (§20.6.1) — green shield when trusted, red when not, neutral while
                the attest check is in flight. Driven by the server verdict, never a client claim. */}
            <View style={styles.securityBanner}>
              <MaterialIcons
                name={
                  deviceTrusted === true
                    ? 'verified-user'
                    : deviceTrusted === false
                      ? 'gpp-bad'
                      : 'shield'
                }
                size={18}
                color={
                  deviceTrusted === true
                    ? darkColors.success
                    : deviceTrusted === false
                      ? darkColors.danger
                      : darkColors.muted
                }
                style={styles.securityIcon}
              />
              <Text style={styles.securityNote}>
                {t(
                  deviceTrusted === true
                    ? 'auth.login.securityNoteTrusted'
                    : deviceTrusted === false
                      ? 'auth.login.securityNoteUntrusted'
                      : 'auth.login.securityNoteChecking',
                )}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setStep('phone')}>
              <Text style={styles.link}>{t('auth.login.backToOffice')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {step === 'otp' ? (
          /* Footer (mockup 02) — icon + label links */
          <View style={styles.otpFooterLinks}>
            <View style={styles.footerLinkItem}>
              <MaterialIcons name="help-center" size={18} color={darkColors.muted} />
              <Text style={styles.footerLink}>{t('auth.login.getSupport')}</Text>
            </View>
            <TouchableOpacity
              testID="privacy-data-link"
              accessibilityRole="link"
              accessibilityLabel={t('auth.login.privacyData')}
              onPress={() => router.push('/(auth)/privacy-policy')}
              hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
              style={styles.footerLinkItem}
            >
              <MaterialIcons name="privacy-tip" size={18} color={darkColors.muted} />
              <Text style={styles.footerLink}>{t('auth.login.privacyData')}</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </ScrollView>

      {oidcBusy ? <VerifyingOverlay /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: darkColors.bg },
  header: {
    height: 56,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: darkColors.border,
  },
  headerBrand: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  headerIcon: { width: 32, height: 32 },
  headerWordtext: {
    fontSize: typography.title.fontSize,
    fontFamily: fontFamily.bold,
    color: darkColors.primary,
    letterSpacing: -0.5,
  },
  scroll: { padding: spacing.lg, gap: spacing.md, flexGrow: 1 },
  // OTP step has only the verify card — centre it vertically instead of pinning it to the top.
  scrollCentered: { justifyContent: 'center' },
  hero: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg },
  logoBox: {
    width: 88,
    height: 88,
    borderRadius: 20,
    backgroundColor: darkColors.elevated,
    borderWidth: 1,
    borderColor: darkColors.border,
    overflow: 'hidden',
    marginBottom: spacing.xs,
  },
  logoBoxWhite: {
    width: 72,
    height: 72,
    borderRadius: 16,
    backgroundColor: darkColors.elevated,
    borderWidth: 1,
    borderColor: darkColors.border,
    overflow: 'hidden',
    alignSelf: 'center',
    marginBottom: spacing.sm,
  },
  logoBoxImg: { width: '100%', height: '100%' },
  heroTitle: {
    fontSize: typography.hero.fontSize,
    fontFamily: fontFamily.bold,
    color: darkColors.text,
    textAlign: 'center',
  },
  heroSubtitle: {
    fontSize: typography.caption.fontSize,
    fontFamily: fontFamily.regular,
    color: darkColors.muted,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: typography.caption.lineHeight,
  },
  card: {
    backgroundColor: darkColors.surface,
    borderRadius: 12,
    padding: spacing.md,
    gap: spacing.md,
  },
  cardTitle: {
    fontSize: typography.title.fontSize,
    fontFamily: fontFamily.semibold,
    color: darkColors.text,
    textAlign: 'center',
  },
  cardSubtitle: {
    fontSize: typography.caption.fontSize,
    fontFamily: fontFamily.regular,
    color: darkColors.muted,
    textAlign: 'center',
    lineHeight: typography.caption.lineHeight,
  },
  maskedPhone: { fontFamily: fontFamily.semibold, color: darkColors.primary },
  label: {
    fontSize: typography.label.fontSize,
    fontFamily: fontFamily.semibold,
    color: darkColors.muted,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: darkColors.border,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    fontSize: typography.body.fontSize,
    fontFamily: fontFamily.regular,
    color: darkColors.text,
  },
  // Uniform fill for the whole row so the capture input's (unhideable) glyphs, coloured to match,
  // are invisible against it — the boxes + digits are drawn by the overlay on top.
  otpRow: {
    position: 'relative',
    height: 60,
    backgroundColor: darkColors.elevated,
    borderRadius: 8,
    overflow: 'hidden',
  },
  // The capture field: fills the row, its text coloured to the row fill (so glyphs never show) and
  // caret hidden. Stays visible + focusable for Detox; value lives in `otp`.
  otpMaskInput: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    color: darkColors.elevated,
    fontSize: typography.title.fontSize,
    textAlign: 'center',
  },
  otpBoxesOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: spacing.xs,
  },
  otpCell: {
    flex: 1,
    height: 60,
    borderWidth: 1,
    borderColor: darkColors.border,
    borderRadius: 8,
    backgroundColor: darkColors.elevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpCellActive: { borderColor: darkColors.primary },
  otpCellText: {
    fontSize: typography.title.fontSize,
    fontFamily: fontFamily.bold,
    color: darkColors.text,
  },
  button: {
    minHeight: 52,
    flexDirection: 'row',
    gap: spacing.xs,
    backgroundColor: darkColors.primary,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonOutline: {
    minHeight: 52,
    flexDirection: 'row',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: darkColors.border,
    backgroundColor: 'transparent',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: {
    color: darkColors.onPrimary,
    fontSize: typography.body.fontSize,
    fontFamily: fontFamily.semibold,
    textTransform: 'uppercase',
  },
  buttonOutlineText: {
    color: darkColors.text,
    fontSize: typography.body.fontSize,
    fontFamily: fontFamily.semibold,
    textTransform: 'uppercase',
  },
  helper: {
    color: darkColors.muted,
    fontFamily: fontFamily.regular,
    fontSize: typography.label.fontSize,
    textAlign: 'center',
  },
  link: {
    color: darkColors.primary,
    fontFamily: fontFamily.medium,
    fontSize: typography.body.fontSize,
    textAlign: 'center',
  },
  linkDisabled: { color: darkColors.muted, opacity: 0.7 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  divider: { flex: 1, height: 1, backgroundColor: darkColors.muted, opacity: 0.3 },
  dividerText: {
    fontSize: typography.label.fontSize,
    fontFamily: fontFamily.medium,
    color: darkColors.muted,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  error: {
    color: darkColors.danger,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: darkColors.elevated,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: darkColors.border,
    padding: spacing.sm,
  },
  securityIcon: {},
  securityNote: {
    flexShrink: 1,
    fontSize: typography.label.fontSize,
    fontFamily: fontFamily.regular,
    color: darkColors.muted,
    lineHeight: typography.label.lineHeight,
    textAlign: 'center',
  },
  phoneRow: { flexDirection: 'row', gap: spacing.sm },
  countryButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: darkColors.border,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
  },
  dialCode: {
    fontSize: typography.body.fontSize,
    fontFamily: fontFamily.regular,
    color: darkColors.text,
  },
  phoneInput: { flex: 1 },
  footer: { alignItems: 'center', gap: spacing.xs, paddingTop: spacing.lg },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: darkColors.success },
  footerLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingTop: spacing.md,
  },
  otpFooterLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  footerLinkItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  footerText: {
    fontSize: typography.label.fontSize,
    fontFamily: fontFamily.regular,
    color: darkColors.muted,
  },
  footerLink: {
    fontSize: typography.label.fontSize,
    fontFamily: fontFamily.medium,
    color: darkColors.muted,
    letterSpacing: 0.8,
  },
  footerDivider: { color: darkColors.muted, fontSize: typography.label.fontSize },
  footerFine: {
    fontSize: typography.label.fontSize,
    fontFamily: fontFamily.regular,
    color: darkColors.muted,
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
    backgroundColor: darkColors.bg,
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
    borderBottomColor: darkColors.border,
  },
  countryName: {
    flex: 1,
    fontSize: typography.body.fontSize,
    fontFamily: fontFamily.regular,
    color: darkColors.text,
  },
  countryDial: {
    fontSize: typography.body.fontSize,
    fontFamily: fontFamily.regular,
    color: darkColors.muted,
  },
});

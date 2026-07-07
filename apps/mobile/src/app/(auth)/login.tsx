// Login screen — TWO paths (§20.6.1, G-M6 / ADR-050):
//   Path A — phone + SMS OTP (field roles): authStore.requestOtp/verifyOtp.
//   Path B — email/password via Keycloak OIDC (office/management): Authorization Code + PKCE opened in
//     the system browser (expo-auth-session/expo-web-browser). The Keycloak-hosted page handles
//     email+password AND the MFA (TOTP) step for TENANT_ADMIN/FINANCE — no custom email/password on the
//     device (QM-4). The returned code is exchanged for the same RS256 JWT the OTP path yields; tokens
//     are persisted via authStore.setTokens. No new auth mechanism vs §5.4.
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
} from 'react-native';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { CosRole } from '@cos/types';
import { useAuthStore } from '../../store/authStore';
import { decodeJwtPayload } from '../../lib/jwt';
import { useT } from '../../i18n';
import { colors, fontFamily, spacing, typography } from '../../theme/tokens';
import logoDark from '../../../assets/logo-dark.png';

WebBrowser.maybeCompleteAuthSession();

// Keycloak OIDC config (injected via env; the mobile public client must be provisioned in Keycloak
// with the `cos://oauth2redirect` redirect URI — ADR-050). Defaults target the local dev realm.
const KEYCLOAK_ISSUER =
  process.env['EXPO_PUBLIC_KEYCLOAK_ISSUER'] ?? 'http://localhost:8090/realms/construction-os';
const KEYCLOAK_CLIENT_ID = process.env['EXPO_PUBLIC_KEYCLOAK_CLIENT_ID'] ?? 'cos-mobile';

type Step = 'phone' | 'otp';
type Mode = 'select' | 'field';

export default function LoginScreen() {
  const requestOtp = useAuthStore((s) => s.requestOtp);
  const verifyOtp = useAuthStore((s) => s.verifyOtp);
  const setTokens = useAuthStore((s) => s.setTokens);
  const t = useT();

  const [mode, setMode] = useState<Mode>('select');
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const onRequestOtp = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await requestOtp(phone.trim());
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
      await verifyOtp(phone.trim(), otp.trim());
    } catch {
      setError(t('auth.login.otpVerifyError'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <Image
        testID="brand-logo"
        source={logoDark}
        style={styles.logo}
        resizeMode="contain"
        accessibilityLabel={t('common.appName')}
      />

      {mode === 'select' ? (
        <>
          {/* Path B — office/management (email/password via Keycloak) */}
          <TouchableOpacity
            testID="office-login-button"
            style={[styles.button, (!request || oidcBusy) && styles.buttonDisabled]}
            onPress={onOfficeLogin}
            disabled={!request || oidcBusy}
          >
            {oidcBusy ? (
              <ActivityIndicator color={colors.bg} />
            ) : (
              <Text style={styles.buttonText}>{t('auth.login.office')}</Text>
            )}
          </TouchableOpacity>

          {/* Path A — field roles (phone + OTP) */}
          <TouchableOpacity testID="field-login-link" onPress={() => setMode('field')}>
            <Text style={styles.link}>{t('auth.login.fieldWorker')}</Text>
          </TouchableOpacity>
        </>
      ) : step === 'phone' ? (
        <>
          <TextInput
            testID="phone-input"
            style={styles.input}
            placeholder={t('auth.login.phonePlaceholder')}
            placeholderTextColor={colors.textSecondary}
            keyboardType="phone-pad"
            autoCapitalize="none"
            value={phone}
            onChangeText={setPhone}
            editable={!busy}
          />
          <TouchableOpacity
            testID="request-otp-button"
            style={[styles.button, busy && styles.buttonDisabled]}
            onPress={onRequestOtp}
            disabled={busy || phone.trim().length === 0}
          >
            {busy ? (
              <ActivityIndicator color={colors.bg} />
            ) : (
              <Text style={styles.buttonText}>{t('auth.login.sendOtp')}</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity testID="back-to-office-link" onPress={() => setMode('select')}>
            <Text style={styles.link}>{t('auth.login.backToOffice')}</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <TextInput
            testID="otp-input"
            style={styles.input}
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
              <Text style={styles.buttonText}>{t('auth.login.verify')}</Text>
            )}
          </TouchableOpacity>
        </>
      )}

      {error ? (
        <Text testID="login-error" style={styles.error}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: colors.bg,
    gap: spacing.md,
  },
  logo: {
    width: 280,
    height: 48,
    alignSelf: 'center',
    marginBottom: spacing.lg,
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
  button: {
    minHeight: 52,
    backgroundColor: colors.primary,
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
  link: {
    color: colors.primary,
    fontFamily: fontFamily.medium,
    fontSize: typography.body.fontSize,
    textAlign: 'center',
  },
  error: {
    color: colors.danger,
    fontFamily: fontFamily.regular,
    fontSize: typography.caption.fontSize,
    textAlign: 'center',
  },
});

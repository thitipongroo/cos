// Login screen — Path A phone + OTP (spec §20.6, Phase 10).
// Two steps: enter phone → request OTP → enter 6-digit OTP → verify → session persisted.
// On success the root AuthGate redirects to /(app)/home (role-based nav takes over).

import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useAuthStore } from '../../store/authStore';
import { colors, fontFamily, spacing, typography } from '../../theme/tokens';
import logoDark from '../../../assets/logo-dark.png';

type Step = 'phone' | 'otp';

export default function LoginScreen() {
  const requestOtp = useAuthStore((s) => s.requestOtp);
  const verifyOtp = useAuthStore((s) => s.verifyOtp);

  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onRequestOtp = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await requestOtp(phone.trim());
      setStep('otp');
    } catch {
      setError('Could not send OTP. Check the phone number and try again.');
    } finally {
      setBusy(false);
    }
  };

  const onVerifyOtp = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await verifyOtp(phone.trim(), otp.trim());
      // AuthGate (root _layout) redirects to /(app)/home once isAuthenticated flips.
    } catch {
      setError('Invalid or expired OTP. Please try again.');
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
        accessibilityLabel="Construction OS"
      />

      {step === 'phone' ? (
        <>
          <TextInput
            testID="phone-input"
            style={styles.input}
            placeholder="+66812345678"
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
              <Text style={styles.buttonText}>Send OTP</Text>
            )}
          </TouchableOpacity>
        </>
      ) : (
        <>
          <TextInput
            testID="otp-input"
            style={styles.input}
            placeholder="6-digit code"
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
              <Text style={styles.buttonText}>Verify</Text>
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
    // COS wordmark + mark, transparent PNG (~876×150, ~5.8:1). Dark-text variant for the white
    // login background; resizeMode="contain" preserves the aspect ratio within this box.
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
  error: {
    color: colors.danger,
    fontFamily: fontFamily.regular,
    fontSize: typography.caption.fontSize,
    textAlign: 'center',
  },
});

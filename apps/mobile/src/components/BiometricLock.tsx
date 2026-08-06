// Biometric app lock — the gate raised over the authenticated app when the user has turned
// "Biometric Unlock" on (mockup 03_04_manage_account_access → Security Settings).
//
// Renders null unless locked, so it costs nothing for the users who never enable it.
//
// TWO WAYS OUT, ALWAYS. The prompt can be retried, and "Sign out instead" is always offered. A lock
// with only one exit is a lock that can trap someone: a cracked sensor or a wet glove on a site is
// enough to make the prompt unwinnable, and a worker in that state must still be able to hand the
// handset to a colleague who can sign in. Signing out clears the session — it does not bypass it.

import { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useBiometricStore } from '../store/biometricStore';
import { useAuthStore } from '../store/authStore';
import { useT } from '../i18n';
import { usePalette } from '../theme/usePalette';
import { fontFamily, radius, spacing, typography } from '../theme/tokens';

export function BiometricLock() {
  const locked = useBiometricStore((s) => s.locked);
  const unlock = useBiometricStore((s) => s.unlock);
  const logout = useAuthStore((s) => s.logout);
  const t = useT();
  const p = usePalette();
  const [busy, setBusy] = useState(false);

  const prompt = useCallback(async () => {
    // Guarded so a double tap cannot stack two OS prompts — on Android the second is dismissed
    // immediately by the first, which reads to the user as the unlock having failed.
    if (busy) return;
    setBusy(true);
    try {
      await unlock(t('profile.biometric.lockPrompt'));
    } finally {
      setBusy(false);
    }
  }, [busy, unlock, t]);

  // Prompt as soon as the gate goes up, rather than making the user tap once to see it. The lock is
  // not a screen anyone wants to read; it is an obstacle, and the fastest path through it is the
  // right default.
  //
  // `prompt` is deliberately NOT in the dependency array: it changes identity on every `busy` flip,
  // so including it would re-fire the OS prompt the instant the first one settles — an unclosable
  // loop of system dialogs. The effect should run when the GATE opens, and `locked` is that event.
  useEffect(() => {
    if (locked) void prompt();
  }, [locked]);

  if (!locked) return null;

  return (
    <View testID="biometric-lock" style={[styles.overlay, { backgroundColor: p.bg }]}>
      <Text style={[styles.title, { color: p.text }]}>{t('profile.biometric.lockTitle')}</Text>
      <Text style={[styles.body, { color: p.muted }]}>{t('profile.biometric.lockBody')}</Text>

      <TouchableOpacity
        testID="biometric-lock-unlock"
        style={[styles.primary, { backgroundColor: p.primary }]}
        disabled={busy}
        onPress={() => void prompt()}
      >
        <Text style={[styles.primaryText, { color: p.onPrimary }]}>
          {t('profile.biometric.unlockAction')}
        </Text>
      </TouchableOpacity>

      {/* The escape hatch. Always present, never disabled — see the file header. */}
      <TouchableOpacity
        testID="biometric-lock-signout"
        style={styles.secondary}
        onPress={() => void logout()}
      >
        <Text style={[styles.secondaryText, { color: p.muted }]}>
          {t('profile.biometric.signOut')}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  // Covers the app absolutely rather than replacing the tree: the screen underneath keeps its state,
  // so unlocking returns the user exactly where they were instead of remounting the shell.
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    zIndex: 100,
  },
  title: {
    fontFamily: fontFamily.semibold,
    ...typography.title,
    marginBottom: spacing.sm,
  },
  body: {
    fontFamily: fontFamily.regular,
    ...typography.body,
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  primary: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
  },
  primaryText: {
    fontFamily: fontFamily.semibold,
    ...typography.body,
  },
  secondary: {
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
  },
  secondaryText: {
    fontFamily: fontFamily.regular,
    ...typography.caption,
  },
});

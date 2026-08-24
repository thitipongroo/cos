// Full-screen "verifying / securing session" overlay, shown while the Keycloak OIDC code exchange is
// in flight (Path B). Layout from mockup/mobile/01_authen/04_verification_loading_mobile.
//
// This is a pre-auth entry screen, so it uses the "technical / mission-critical" motif §32.7 permits
// there (and only there): a rotating gear, the `architecture` mark, and a cyan glow. The signed-in
// app still drops these. Dark, on the shared --cos-dark-* tokens (§32.7 Mobile Dark Surfaces).
//
// Screens/components are covered by the Detox E2E suite, not unit tests (jest.config.ts
// collectCoverageFrom excludes src/components/**).

import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useT } from '../i18n';
import { darkColors, fontFamily, spacing, typography } from '../theme/tokens';

export function VerifyingOverlay(): React.JSX.Element {
  const t = useT();
  const insets = useSafeAreaInsets();
  const spin = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Slow gear rotation (mockup: 4s/turn), a breathing pulse ring, and a progress bar that eases
    // toward ~92% — the exchange finishes and the overlay unmounts before it fills, like the mockup.
    const rotate = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 4000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    const breathe = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, useNativeDriver: true }),
      ]),
    );
    const fill = Animated.timing(progress, {
      toValue: 0.92,
      duration: 3500,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    });
    rotate.start();
    breathe.start();
    fill.start();
    return () => {
      rotate.stop();
      breathe.stop();
      fill.stop();
    };
  }, [spin, pulse, progress]);

  const spinDeg = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const pulseOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.15, 0.5] });
  const pulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.08] });
  const fillWidth = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <View testID="verifying-overlay" style={styles.overlay}>
      {/* Header wordmark (mockup) */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <MaterialIcons name="architecture" size={18} color={darkColors.cyan} />
        <Text style={styles.wordmark}>{t('common.appName')}</Text>
      </View>

      {/* Centrepiece: rotating gear behind a shield, inside a pulsing ring */}
      <View style={styles.center}>
        <View style={styles.mark}>
          <Animated.View
            style={[
              styles.pulseRing,
              { opacity: pulseOpacity, transform: [{ scale: pulseScale }] },
            ]}
          />
          <Animated.View style={{ transform: [{ rotate: spinDeg }] }}>
            <MaterialIcons name="settings" size={72} color={darkColors.cyan} style={styles.gear} />
          </Animated.View>
          <MaterialIcons
            name="verified-user"
            size={34}
            color={darkColors.cyan}
            style={styles.shield}
          />
        </View>

        <Text style={styles.title}>{t('auth.loading.title')}</Text>
        <View style={styles.statusRow}>
          <Animated.View style={[styles.statusDot, { opacity: pulseOpacity }]} />
          <Text style={styles.status}>{t('auth.loading.status')}</Text>
        </View>
      </View>

      {/* Footer: securing session + technical progress bar with a cyan glow */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.xl }]}>
        <View style={styles.securingRow}>
          <MaterialIcons name="lock" size={14} color={darkColors.cyan} />
          <Text style={styles.securing}>{t('auth.loading.securing')}</Text>
        </View>
        <View style={styles.track}>
          <Animated.View style={[styles.fill, { width: fillWidth }]} />
        </View>
      </View>
    </View>
  );
}

const RING = 128;

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: darkColors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
  },
  wordmark: {
    fontSize: typography.label.fontSize,
    fontFamily: fontFamily.semibold,
    color: darkColors.text,
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  mark: {
    width: RING,
    height: RING,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  pulseRing: {
    position: 'absolute',
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    borderWidth: 2,
    borderColor: darkColors.cyan,
  },
  // Cyan glow (§32.7 permits it on the auth entry screens). iOS renders the shadow as a glow;
  // Android shows it faintly — acceptable degradation.
  gear: {
    opacity: 0.25,
    textShadowColor: darkColors.cyan,
    textShadowRadius: 12,
  },
  shield: { position: 'absolute' },
  title: {
    fontSize: typography.body.fontSize,
    fontFamily: fontFamily.semibold,
    color: darkColors.text,
    textAlign: 'center',
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: darkColors.cyan },
  status: {
    fontSize: typography.label.fontSize,
    fontFamily: fontFamily.medium,
    color: darkColors.muted,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  footer: { alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg },
  securingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  securing: {
    fontSize: typography.label.fontSize,
    fontFamily: fontFamily.semibold,
    color: darkColors.muted,
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  track: {
    width: 192,
    height: 6,
    borderRadius: 3,
    backgroundColor: darkColors.elevated,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: darkColors.cyan,
    shadowColor: darkColors.cyan,
    shadowOpacity: 0.6,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
});

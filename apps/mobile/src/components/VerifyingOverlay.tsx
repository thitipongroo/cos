// Full-screen "securing session" overlay (mockup/00_login_flow/mobile/04), shown while the Keycloak
// OIDC code exchange is in flight (Path B). Dark, per §32.7 "Mobile Auth Screens"; the shield +
// spinner and status copy are presentational. Screens/components are covered by the Detox E2E suite,
// not unit tests (apps/mobile/jest.config.ts collectCoverageFrom).

import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { useT } from '../i18n';
import { authColors, fontFamily, spacing, typography } from '../theme/tokens';

const SHIELD_XML = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M12 3 4 6v6c0 5 3.5 7.5 8 9 4.5-1.5 8-4 8-9V6l-8-3Z" stroke="${authColors.primary}" stroke-width="1.6" stroke-linejoin="round"/>
  <path d="m9 12 2 2 4-4" stroke="${authColors.primary}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

export function VerifyingOverlay(): React.JSX.Element {
  const t = useT();
  return (
    <View testID="verifying-overlay" style={styles.overlay}>
      <View style={styles.mark}>
        <SvgXml xml={SHIELD_XML} width={44} height={44} />
      </View>
      <ActivityIndicator color={authColors.primary} style={styles.spinner} />
      <Text style={styles.title}>{t('auth.loading.title')}</Text>
      <Text style={styles.status}>{t('auth.loading.status')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: authColors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.sm,
  },
  mark: {
    width: 96,
    height: 96,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: authColors.elevated,
    borderWidth: 1,
    borderColor: authColors.border,
    marginBottom: spacing.md,
  },
  spinner: {
    marginBottom: spacing.xs,
  },
  title: {
    fontSize: typography.title.fontSize,
    fontFamily: fontFamily.bold,
    color: authColors.text,
    textAlign: 'center',
  },
  status: {
    fontSize: typography.caption.fontSize,
    fontFamily: fontFamily.medium,
    color: authColors.muted,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
});

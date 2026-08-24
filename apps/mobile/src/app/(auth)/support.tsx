// Support Center — PRE-AUTH route (mockup/mobile/01_authen/07_get_help/01_support_center, WITHDRAWN
// 2026-08-15). The screen stands (ADR-085) — it now has neither a drawing nor a screenshot, since
// docs/screens/android/01-authen/05-get-support/ was retired on 2026-08-17 and
// capture-android-support.mjs was deleted with it. That makes this header, together with
// components/SupportCenterDocument.tsx, the record of what the screen is. It is deliberately NOT
// repointed at `mockup/mobile/support_center/01_dashboard`: that drawing was added by a different,
// earlier commit with no rename record linking the two, and the files differ (329 lines against 293),
// so calling it the successor would assert something unverified (product-owner decision 2026-08-16).
//
// NO LONGER PRE-AUTH ONLY (product-owner decision 2026-08-17). This route keeps the (auth) group and
// the OTP step's "GET SUPPORT" entry, but the Support Centre now also has a POST-AUTH route at
// app/(app)/support.tsx, opened by the signed-in TopBar's "?" — which until that decision showed a
// "coming soon" note. The two are NOT the same screen: see SupportCenterDocument.tsx for what they
// share and §32.7 "Support Centre" for what each adds.
//
//   Why a second route rather than linking here: AuthGate in app/_layout.tsx redirects an
//   authenticated user out of the (auth) group (`isAuthenticated && inAuthGroup → /(app)/home`), so a
//   push from a signed-in screen to this route lands on Home. The (app) twin is the same answer
//   app/(app)/privacy-policy.tsx already gives for the same reason (PO decision 2026-08-04).
//
// The drawing's bottom nav is still absent: there is no tab bar before sign-in, and "Support" could
// not become one anyway — §32.7 fixes each role at exactly four tabs, and the drawn
// Field | Tasks | Support | Profile is not any role's set.
//
// Dark surface, pinned rather than read from the theme store: this is pushed from the dark OTP
// screen, so following a light preference would break mid-flow (§32.7 pinned pre-auth surfaces).
// `paletteFor('dark')` maps field-for-field onto the `darkColors.*` this screen used before the
// 2026-08-17 extraction, so nothing about its appearance changed.
//
// WHAT THIS ROUTE ADDS TO THE SHARED DOCUMENT: the FIELD ASSISTANT panel, and nothing else. It keeps
// its frame but NOT the drawn copy. The mockup has it assert "you're in Sector 7" and a known
// cellular-repeater outage; there is no sector, zone or outage feed anywhere in the product, so that
// text would be invented. It says what is actually knowable: the device's connectivity and whether
// the platform answered. The eyebrow reads FIELD ASSISTANT rather than the drawing's AI FIELD
// ASSISTANT for the same reason the DeviceTrustModel surface may not be called AI while a rule-based
// scorer serves it — this panel is rule-derived, and labelling rule output as AI is the misstatement
// that rule exists to prevent.

import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { useT } from '../../i18n';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { SupportCenterDocument, useBackendHealth } from '../../components/SupportCenterDocument';
import { paletteFor } from '../../theme/palette';
import { darkScreen } from '../../theme/screenStyles';
import { darkColors, fontFamily, radius, spacing, typography } from '../../theme/tokens';

const DARK = paletteFor('dark');

export default function SupportScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const t = useT();
  const { isOnline } = useNetworkStatus();

  // One probe for the whole screen — the status card inside the document and the assistant line below
  // it read the same answer. See useBackendHealth's note.
  const { health, minutesAgo } = useBackendHealth();

  const assistantText = !isOnline
    ? t('support.assistant.offline')
    : health === false
      ? t('support.assistant.unreachable')
      : t('support.assistant.online');

  return (
    <View style={[darkScreen.root, { paddingTop: insets.top }]}>
      {/* Top app bar — back + SUPPORT, with the connection mark and the build on the right. The
          version is the REAL one (app.json, the way the login footer reads it); the mockup's "v2.4.8"
          is a drawing and matches no build of this app. The (app) twin has no bar of its own —
          <TopBar /> supplies one there. */}
      <View style={darkScreen.header}>
        <Pressable
          testID="support-back"
          accessibilityRole="button"
          accessibilityLabel={t('support.back')}
          onPress={() => router.back()}
          style={darkScreen.backButton}
        >
          <MaterialIcons name="arrow-back" size={24} color={darkColors.primary} />
        </Pressable>
        <Text style={darkScreen.headerTitle} numberOfLines={1}>
          {t('support.title')}
        </Text>
        <View style={styles.headerMeta}>
          <MaterialIcons
            name={isOnline ? 'cloud-done' : 'cloud-off'}
            size={20}
            color={isOnline ? darkColors.syncing : darkColors.muted}
          />
          <Text style={styles.headerVersion}>
            {t('support.version', { version: Constants.expoConfig?.version ?? '—' })}
          </Text>
        </View>
      </View>

      <SupportCenterDocument
        testID="support"
        palette={DARK}
        health={health}
        minutesAgo={minutesAgo}
        paddingBottom={insets.bottom + spacing.xl}
        footer={
          /* Field assistant — real connectivity, no invented context. See the header note. */
          <View testID="support-assistant" style={styles.assistant}>
            <MaterialIcons
              name="psychology"
              size={80}
              color={darkColors.accent}
              style={styles.assistantGlyph}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
            <View style={styles.assistantLabelRow}>
              <View style={styles.assistantDot} />
              <Text style={styles.assistantLabel}>{t('support.assistant.label')}</Text>
            </View>
            <Text style={styles.assistantText}>{assistantText}</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // Uppercased in the style rather than in the i18n value (PO 2026-08-03), so the stored string stays
  // natural and reusable; Thai has no case, so `th` renders unchanged.
  headerMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs / 2 },
  headerVersion: {
    color: darkColors.muted,
    fontFamily: fontFamily.semibold,
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  assistant: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: darkColors.accent,
    borderRadius: radius.lg,
    backgroundColor: darkColors.surface,
    padding: spacing.md,
    gap: spacing.xs,
    overflow: 'hidden',
  },
  // The drawing's oversized watermark glyph in the top-right corner.
  assistantGlyph: { position: 'absolute', top: -spacing.xs, right: -spacing.xs, opacity: 0.1 },
  assistantLabelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  // 999 — a documented dot.
  assistantDot: { width: 8, height: 8, borderRadius: 999, backgroundColor: darkColors.accent },
  assistantLabel: {
    color: darkColors.accent,
    fontFamily: fontFamily.semibold,
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  assistantText: {
    color: darkColors.text,
    fontFamily: fontFamily.regular,
    fontSize: typography.caption.fontSize,
    lineHeight: typography.caption.lineHeight,
  },
});

// Privacy Policy — pre-auth route (mockup/mobile/02_shared/01_privacy_policy/00_policy_dashboard).
//
// The drawing has moved twice and the current location is the informative one: `00_policy_data` →
// `01_authen/05_privacy_policy/01_privacy_policy` (2026-08-15) → `02_shared/01_privacy_policy/
// 00_policy_dashboard` (2026-08-18). Filing it under 02_shared matches what the code already does —
// this document is mounted at BOTH (auth)/privacy-policy and (app)/privacy-policy through one
// <PrivacyPolicyDocument />, so it belongs to neither group alone.
//
// Route placement: this lives in the (auth) group on purpose. The root AuthGate
// (app/_layout.tsx) redirects every non-(auth) route to login while unauthenticated, and the screen
// is reached from the login footer, so an (app) route would be unreachable pre-login.
//
// PO decision 2026-08-04 added a SECOND entry for signed-in users (drawer → PRIVACY POLICY →
// app/(app)/privacy-policy.tsx). The policy text itself is NOT duplicated there: both routes mount
// <PrivacyPolicyDocument />, which is where the copy, the version, the effective date and their
// provenance now live. This file is only the pre-auth chrome — its own app bar, because there is no
// (app) shell out here, and its own safe-area insets.
//
// Dark surface + logo glow: §32.7 lists dark screens exhaustively and allows glow only on the pre-auth
// entry screens; both were ratified for this screen by PO decision 2026-08-03. The palette is pinned
// to DARK rather than read from the theme store — this screen is reached from the dark login screen,
// so following a light theme here would break mid-flow. The post-auth route is the themed one.
//
// The Data Collection card does NOT link to the Transparency Portal here (no `onDataCollection`):
// every portal screen sits behind AuthGate and one of them renders the signed-in user's own record,
// so there is nowhere for a pre-auth reader to go.
//
// It — and the other four rows — DO push a section screen (`onSection`, PO decision 2026-08-17).
// mockup/mobile/01_authen/03_privacy_policy draws 01…05 as five full screens, and this screen's own
// drawing carries EMPTY accordion bodies, so the rows were always meant to lead somewhere. The route
// name is derived from the section id through SECTION_ROUTE below rather than interpolated, so a
// renamed section fails to compile instead of pushing a route that does not exist.

import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useT } from '../../i18n';
import { darkColors, fontFamily, spacing, typography, touchTarget } from '../../theme/tokens';
import { paletteFor } from '../../theme/palette';
import { PrivacyPolicyDocument } from '../../components/PrivacyPolicyDocument';
import { downloadPolicy } from '../../lib/policyDownload';
import { API_BASE_URL } from '../../api/client';

const DARK = paletteFor('dark');

/**
 * Section id (as declared in <PrivacyPolicyDocument />'s SECTIONS) → the route that renders it.
 *
 * An explicit map, not `/(auth)/privacy-${id}`: the ids are the policy's own vocabulary
 * (`compliance`, `security`, `rights`) and the routes are named for what the mockup calls the
 * screens (`pdpa-gdpr`, `technical-security`, `user-rights`). Interpolating would silently push a
 * route that does not exist; this way a renamed section is a type error.
 */
const SECTION_ROUTE = {
  collection: '/(auth)/privacy-data-collection',
  usage: '/(auth)/privacy-data-usage',
  compliance: '/(auth)/privacy-pdpa-gdpr',
  security: '/(auth)/privacy-technical-security',
  rights: '/(auth)/privacy-user-rights',
} as const;

export default function PrivacyPolicyScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const t = useT();
  const [downloading, setDownloading] = useState(false);

  /**
   * Fetch the document, verify it, and show the receipt.
   *
   * A failure leaves the reader on the policy with the button live again rather than pushing an error
   * screen: the document they came to read is already in front of them, and the retry is one tap.
   * `verified` is passed through even when FALSE — the receipt screen states a mismatch rather than
   * hiding it, because a reader handed the wrong file needs to know.
   */
  const download = async (): Promise<void> => {
    setDownloading(true);
    try {
      const file = await downloadPolicy(API_BASE_URL);
      router.push({
        pathname: '/(auth)/privacy-policy-downloaded',
        params: {
          fileName: file.fileName,
          version: file.version,
          sizeBytes: String(file.sizeBytes),
          sha256: file.sha256,
          verified: String(file.verified),
          downloadedAt: file.downloadedAt,
        },
      });
    } catch {
      // Deliberately silent beyond restoring the button. There is no error surface on this screen and
      // adding one for a download that the reader can simply retry would be more chrome than help.
    } finally {
      setDownloading(false);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Top app bar — back, title, and the encrypted-transport marker from the mockup. */}
      <View style={styles.header}>
        <Pressable
          testID="privacy-policy-back"
          accessibilityRole="button"
          accessibilityLabel={t('privacy.policy.back')}
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <MaterialIcons name="arrow-back" size={24} color={darkColors.primary} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {t('privacy.policy.title')}
        </Text>
        <View style={styles.headerBadge}>
          <MaterialIcons name="sync-lock" size={18} color={darkColors.syncing} />
          <Text style={styles.headerBadgeText}>{t('privacy.policy.encrypted')}</Text>
        </View>
      </View>

      <PrivacyPolicyDocument
        testID="privacy-policy"
        palette={DARK}
        accent={darkColors.cyan}
        showBrandGlow
        paddingBottom={insets.bottom + spacing.xl}
        onSection={(id) => {
          const route = SECTION_ROUTE[id as keyof typeof SECTION_ROUTE];
          if (route !== undefined) router.push(route);
        }}
        onContact={() => router.push('/(auth)/privacy-contact')}
        onDownload={() => void download()}
        downloading={downloading}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: darkColors.bg },

  header: {
    height: touchTarget.listItem,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: darkColors.border,
    backgroundColor: darkColors.surface,
  },
  backButton: {
    width: touchTarget.iconButton,
    height: touchTarget.iconButton,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Uppercased here rather than in the i18n value (PO 2026-08-03) so the stored string stays natural
  // and reusable. Safe for both shipped locales: Thai has no case, so `th` renders unchanged.
  headerTitle: {
    flex: 1,
    color: darkColors.text,
    fontFamily: fontFamily.semibold,
    fontSize: typography.title.fontSize,
    lineHeight: typography.title.lineHeight,
    textTransform: 'uppercase',
  },
  headerBadge: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs / 2 },
  headerBadgeText: {
    color: darkColors.muted,
    fontFamily: fontFamily.semibold,
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});

// Privacy Policy → Download complete
// (mockup/mobile/01_authen/03_privacy_policy/08_privacy_download_success).
//
// Reached with router.replace after the file is on disk, carrying what was actually written: the file
// name the server published, the size measured on disk, and the SHA-256 computed over the bytes that
// landed. Nothing is illustrative.
//
// THE DIGEST HERE IS A REAL CHECK, unlike the one dropped from the inquiry receipt. The server
// publishes the document's digest through /privacy/policy/metadata BEFORE the transfer, and
// lib/legalDownload.ts recomputes it over the downloaded bytes — so `verified` answers "is this the
// policy the platform published", which a reader can act on. A hash of something the device itself
// produced would have answered nothing, which is why the receipt screen has none.
//
// WHAT THE DRAWING SHOWS THAT THIS DOES NOT:
//   - "v2.4.0" and "COS_Privacy_Policy_Oct2023.pdf". The version is 1.0.0 and the file is named for
//     it; the drawing's figures belong to no edition of this document.
//   - "Source: Secure Vault". There is no vault; the file came from this platform's own endpoint.
//   - "VIEW DATA PORTAL". Every Transparency Portal screen is behind AuthGate and one of them renders
//     the signed-in reader's own record — there is nowhere for a pre-auth reader to go. The second
//     action returns to the policy instead.
//
// OPEN PDF uses expo-web-browser, which is already a dependency: it hands the SERVER url to the
// system browser, which has a PDF viewer. Opening the local file would need a content:// provider on
// Android and a share sheet on iOS — neither is installed, and adding one to open a document the
// browser already renders is a dependency for nothing.

import { View, Text, ScrollView, Pressable, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { useRouter } from 'expo-router';
import { useI18n } from '../../i18n';
import {
  fontFamily,
  plateRadius,
  radius,
  spacing,
  touchTarget,
  typography,
} from '../../theme/tokens';
import { paletteFor } from '../../theme/palette';
import { policyPdfUrl } from '../../lib/legalDownload';
import { formatBytes } from '../../lib/formatBytes';
import { API_BASE_URL } from '../../api/client';
import { darkScreen } from '../../theme/screenStyles';
import { useLegalReceipt } from '../../hooks/useLegalDownload';

const DARK = paletteFor('dark');

export default function PrivacyPolicyDownloadedScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t, formatDate } = useI18n();
  const { fileName, version, sizeBytes, sha256, verified, downloadedAt } = useLegalReceipt();

  return (
    <View style={[darkScreen.root, { paddingTop: insets.top }]}>
      <View style={darkScreen.headerCentered}>
        <Text style={darkScreen.headerTitleCentered} numberOfLines={1}>
          {t('privacy.downloaded.title')}
        </Text>
      </View>

      <ScrollView
        testID="privacy-policy-downloaded"
        style={darkScreen.fill}
        contentContainerStyle={[
          darkScreen.contentSafeBottom,
          { paddingBottom: insets.bottom + spacing.xl },
        ]}
      >
        <View style={[styles.ring, verified ? styles.ringOk : styles.ringWarn]}>
          <MaterialIcons
            name={verified ? 'check-circle' : 'error-outline'}
            size={64}
            color={verified ? DARK.success : DARK.warning}
          />
        </View>

        <Text style={darkScreen.headline}>{t('privacy.downloaded.headline')}</Text>
        <Text style={darkScreen.lede}>{t('privacy.downloaded.lede', { version })}</Text>

        {/* File card */}
        <View style={darkScreen.card}>
          <View style={styles.fileRow}>
            <View style={styles.filePlate}>
              <MaterialIcons name="description" size={24} color={DARK.accent} />
            </View>
            <View style={styles.fileMeta}>
              <Text style={styles.fileName} numberOfLines={1}>
                {fileName}
              </Text>
              <Text style={styles.fileSub}>
                {t('privacy.downloaded.format')} · {formatBytes(sizeBytes)}
              </Text>
            </View>
          </View>
        </View>

        {/* Integrity — the one place a hash on this flow earns its space. */}
        <View style={darkScreen.card}>
          <View style={darkScreen.iconRow}>
            <MaterialIcons
              name={verified ? 'verified-user' : 'gpp-maybe'}
              size={20}
              color={verified ? DARK.success : DARK.warning}
            />
            <Text style={darkScreen.cardCaption}>{t('privacy.downloaded.integrityTitle')}</Text>
          </View>
          <Text style={darkScreen.cardBody}>
            {verified
              ? t('privacy.downloaded.integrityOk')
              : t('privacy.downloaded.integrityMismatch')}
          </Text>
          <Text testID="privacy-downloaded-sha" style={styles.hash} selectable>
            {sha256}
          </Text>
          {downloadedAt !== '' ? (
            <>
              <View style={darkScreen.dividerSpaced} />
              <Text style={darkScreen.cardBody}>
                {t('privacy.downloaded.at', { date: formatDate(downloadedAt) })}
              </Text>
            </>
          ) : null}
        </View>

        <Pressable
          testID="privacy-downloaded-open"
          accessibilityRole="button"
          accessibilityLabel={t('privacy.downloaded.open')}
          onPress={() => void WebBrowser.openBrowserAsync(policyPdfUrl(API_BASE_URL))}
          style={styles.primaryButton}
        >
          <MaterialIcons name="open-in-new" size={20} color={DARK.onPrimary} />
          <Text style={darkScreen.primaryTextCompact}>{t('privacy.downloaded.open')}</Text>
        </Pressable>

        <Pressable
          testID="privacy-downloaded-back"
          accessibilityRole="button"
          accessibilityLabel={t('privacy.downloaded.backToPolicy')}
          onPress={() => router.back()}
          style={styles.secondaryButton}
        >
          <Text style={styles.secondaryText}>{t('privacy.downloaded.backToPolicy')}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

/** Side of the document-icon plate beside the file name. */
const FILE_PLATE = 48;

const styles = StyleSheet.create({
  ring: {
    alignSelf: 'center',
    width: 96,
    height: 96,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: DARK.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringOk: { borderColor: DARK.success },
  ringWarn: { borderColor: DARK.warning },

  fileRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  filePlate: {
    width: FILE_PLATE,
    height: FILE_PLATE,
    // plateRadius(), not the number it happens to return: §32.7 makes a square icon plate's corner a
    // RULE — a quarter of the side — so the radius follows if the plate is ever resized, and
    // theme/__tests__/radiusRatchet.spec.ts counts a literal here as one more magic number.
    borderRadius: plateRadius(FILE_PLATE),
    backgroundColor: DARK.elevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileMeta: { flex: 1, gap: 2 },
  fileName: {
    color: DARK.text,
    fontFamily: fontFamily.semibold,
    fontSize: typography.caption.fontSize,
    lineHeight: typography.caption.lineHeight,
  },
  fileSub: {
    color: DARK.muted,
    fontFamily: fontFamily.regular,
    fontSize: typography.label.fontSize,
  },

  // Wraps rather than truncating: a digest with an ellipsis in the middle cannot be compared against
  // anything, which is the only thing a reader would want it for.
  hash: {
    color: DARK.accent,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    fontSize: 11,
    lineHeight: 17,
  },

  primaryButton: {
    marginTop: spacing.md,
    minHeight: touchTarget.primaryButton,
    borderRadius: radius.md,
    backgroundColor: DARK.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  secondaryButton: {
    minHeight: touchTarget.secondaryButton,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: DARK.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
  secondaryText: {
    color: DARK.accent,
    fontFamily: fontFamily.semibold,
    fontSize: typography.caption.fontSize,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});

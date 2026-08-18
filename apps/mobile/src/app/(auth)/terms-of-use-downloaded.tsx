// Terms of Use → download complete
// (mockup/mobile/01_authen/04_terms_of_use/02_terms_of_use_download).
//
// Reached with router.push after the file is on disk, carrying what was actually written: the file
// name the server published, the size measured on disk, and the SHA-256 computed over the bytes that
// landed. Nothing on this screen is illustrative.
//
// THE DIGEST IS A REAL CHECK, exactly as on the policy receipt next door: the server publishes the
// document's digest through `GET /terms/metadata` BEFORE the transfer, and lib/legalDownload.ts
// recomputes it over the downloaded bytes — so the card answers "is this the edition the platform
// published", which a reader can act on. The drawing prints a hash and no verdict; a hash with
// nothing to compare it against is decoration, so the verdict line is added under it. That is the one
// place this screen says MORE than the drawing.
//
// WHAT THE DRAWING SHOWS THAT THIS DOES NOT:
//   - "v4.2.0-STABLE", "COS_TERMS_STABLE.pdf", "1.2 MB", "SHA-256: 8a7f…e210" and
//     "June 10, 2024, 14:32". Every one of those is a drawn figure: the version is 1.0.0, the file is
//     named for it, and the other three are measured at download time. The same call was made on the
//     policy receipt (ADR-091).
//   - a bottom nav. There is none pre-auth, and the drawing's own comment says the shell is
//     suppressed on a linear/transactional screen.
//
// BOTH ACTIONS ARE DRAWN AS FILLED PRIMARY BUTTONS and are built that way, unlike the policy
// receipt's primary + outlined pair. This is a dead end with two equally safe exits — open the file,
// or go back to the document — so the drawing's flat hierarchy is not hiding a wrong default.
//
// OPEN PDF uses expo-web-browser, already a dependency: it hands the SERVER url to the system
// browser, which has a PDF viewer. Opening the local file would need a content:// provider on Android
// and a share sheet on iOS — neither is installed, and adding one to open a document the browser
// already renders is a dependency for nothing.
//
// Dark surface, pinned rather than themed: this is pre-auth (§32.7 pinned surfaces), reached from the
// dark Terms of Use screen.

import { View, Text, ScrollView, Pressable, StyleSheet, Platform } from 'react-native';
import Svg, { Polygon } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useI18n } from '../../i18n';
import {
  darkColors,
  fontFamily,
  radius,
  spacing,
  touchTarget,
  typography,
} from '../../theme/tokens';
import { termsPdfUrl } from '../../lib/legalDownload';
import { formatBytes } from '../../lib/formatBytes';
import { abbreviateDigest } from '../../lib/abbreviateDigest';
import { API_BASE_URL } from '../../api/client';

/** The drawing's `w-32 h-32` badge, and the inset of its inner plate (`inset-2`). */
const HEX = 128;
const HEX_INSET = 8;

/**
 * The mockup's `clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)`, as SVG
 * points on a 0–100 viewBox so the same numbers appear here as in the drawing.
 */
const HEXAGON = '50,0 100,25 100,75 50,100 0,75 0,25';

export default function TermsOfUseDownloadedScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t, formatDate, formatTime } = useI18n();
  const params = useLocalSearchParams<{
    fileName?: string;
    version?: string;
    sizeBytes?: string;
    sha256?: string;
    verified?: string;
    downloadedAt?: string;
  }>();

  const fileName = params.fileName ?? '';
  const version = params.version ?? '';
  const sizeBytes = Number(params.sizeBytes ?? '0');
  const sha256 = params.sha256 ?? '';
  const verified = params.verified === 'true';
  const downloadedAt = params.downloadedAt ?? '';

  // The badge and the verdict share one colour: a green hexagon over a mismatch warning would be the
  // screen contradicting itself.
  const tone = verified ? darkColors.cyan : darkColors.warning;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable
          testID="terms-downloaded-back-nav"
          accessibilityRole="button"
          accessibilityLabel={t('terms.back')}
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <MaterialIcons name="arrow-back" size={24} color={darkColors.primary} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {t('terms.downloaded.title')}
        </Text>
      </View>

      <ScrollView
        testID="terms-of-use-downloaded"
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
      >
        <View style={styles.badge}>
          <Svg width={HEX} height={HEX} viewBox="0 0 100 100">
            <Polygon points={HEXAGON} fill={tone} fillOpacity={0.2} />
          </Svg>
          <View style={styles.badgeInner}>
            <Svg width={HEX - HEX_INSET * 2} height={HEX - HEX_INSET * 2} viewBox="0 0 100 100">
              <Polygon points={HEXAGON} fill={tone} fillOpacity={0.4} />
            </Svg>
          </View>
          <View style={styles.badgeGlyph}>
            <MaterialIcons
              name={verified ? 'check-circle' : 'error-outline'}
              size={64}
              color={tone}
            />
          </View>
        </View>

        <Text style={styles.headline}>{t('terms.downloaded.headline')}</Text>
        <Text style={styles.lede}>{t('terms.downloaded.lede', { version })}</Text>

        {/* File metadata — the drawing's four rows, in its order, with hairlines between them. */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('terms.downloaded.metadataTitle')}</Text>

          <View style={styles.row}>
            <Text style={styles.rowLabel}>{t('terms.downloaded.file')}</Text>
            <Text style={[styles.rowValue, styles.mono]}>{fileName}</Text>
          </View>
          <View style={styles.divider} />

          <View style={styles.row}>
            <Text style={styles.rowLabel}>{t('terms.downloaded.size')}</Text>
            <Text style={styles.rowValue}>{formatBytes(sizeBytes)}</Text>
          </View>
          <View style={styles.divider} />

          <View style={styles.row}>
            <Text style={styles.rowLabel}>{t('terms.downloaded.hash')}</Text>
            {/* ABBREVIATED, and named by algorithm, as the drawing has it: `SHA-256: 8a7f...e210`
                (product-owner decision 2026-08-18). This row printed the whole 64-character digest
                until then, on the argument that a digest a reader cannot compare is decoration; the
                ruling is for the drawing, so the FULL value moves to the row's accessibility label
                rather than being dropped — it is still recoverable, and the verdict line below still
                says whether it matched. */}
            <Text
              testID="terms-downloaded-sha"
              accessibilityLabel={`${t('terms.downloaded.hash')}: ${t('terms.downloaded.hashValue', { digest: sha256 })}`}
              style={[styles.rowValue, styles.hash]}
              selectable
            >
              {t('terms.downloaded.hashValue', { digest: abbreviateDigest(sha256) })}
            </Text>
          </View>
          <View style={styles.divider} />

          <View style={styles.row}>
            <Text style={styles.rowLabel}>{t('terms.downloaded.timestamp')}</Text>
            <Text style={styles.rowValue}>
              {downloadedAt === ''
                ? '—'
                : `${formatDate(downloadedAt)}, ${formatTime(downloadedAt)}`}
            </Text>
          </View>

          <View style={styles.verdict}>
            <MaterialIcons
              name={verified ? 'verified-user' : 'gpp-maybe'}
              size={18}
              color={verified ? darkColors.success : darkColors.warning}
            />
            <Text style={styles.verdictText}>
              {verified
                ? t('terms.downloaded.integrityOk')
                : t('terms.downloaded.integrityMismatch')}
            </Text>
          </View>
        </View>

        <Pressable
          testID="terms-downloaded-open"
          accessibilityRole="button"
          accessibilityLabel={t('terms.downloaded.open')}
          onPress={() => void WebBrowser.openBrowserAsync(termsPdfUrl(API_BASE_URL))}
          style={styles.primaryButton}
        >
          <MaterialIcons name="open-in-new" size={20} color={darkColors.onPrimary} />
          <Text style={styles.primaryText}>{t('terms.downloaded.open')}</Text>
        </Pressable>

        <Pressable
          testID="terms-downloaded-back"
          accessibilityRole="button"
          accessibilityLabel={t('terms.downloaded.backToTerms')}
          onPress={() => router.back()}
          style={styles.primaryButton}
        >
          <MaterialIcons name="arrow-back" size={20} color={darkColors.onPrimary} />
          <Text style={styles.primaryText}>{t('terms.downloaded.backToTerms')}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: darkColors.bg },
  flex: { flex: 1 },

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
  // Uppercased here rather than in the i18n value, as on every other pre-auth bar: the stored string
  // stays natural, and Thai has no case so `th` renders unchanged.
  headerTitle: {
    flex: 1,
    color: darkColors.text,
    fontFamily: fontFamily.semibold,
    fontSize: typography.title.fontSize,
    lineHeight: typography.title.lineHeight,
    textTransform: 'uppercase',
  },

  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl, gap: spacing.md },

  badge: {
    alignSelf: 'center',
    width: HEX,
    height: HEX,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The three layers stack in place: outer plate, inner plate, glyph. Written out rather than
  // spread from StyleSheet.absoluteFillObject, which this project's react-native types do not carry.
  badgeInner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeGlyph: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },

  headline: {
    textAlign: 'center',
    color: darkColors.text,
    fontFamily: fontFamily.semibold,
    fontSize: typography.hero.fontSize,
    lineHeight: typography.hero.lineHeight,
  },
  lede: {
    textAlign: 'center',
    alignSelf: 'center',
    maxWidth: 300,
    color: darkColors.muted,
    fontFamily: fontFamily.regular,
    fontSize: typography.caption.fontSize,
    lineHeight: typography.caption.lineHeight,
  },

  card: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: darkColors.border,
    borderRadius: radius.lg,
    backgroundColor: darkColors.surface,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardTitle: {
    color: darkColors.accent,
    fontFamily: fontFamily.semibold,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  rowLabel: {
    color: darkColors.muted,
    fontFamily: fontFamily.regular,
    fontSize: typography.label.fontSize,
    lineHeight: typography.label.lineHeight,
  },
  rowValue: {
    flex: 1,
    textAlign: 'right',
    color: darkColors.text,
    fontFamily: fontFamily.medium,
    fontSize: typography.label.fontSize,
    lineHeight: typography.label.lineHeight,
  },
  mono: {
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
  hash: {
    color: darkColors.accent,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    fontSize: 11,
    lineHeight: 17,
  },
  divider: { height: 1, backgroundColor: darkColors.border },

  verdict: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
  },
  verdictText: {
    flex: 1,
    color: darkColors.muted,
    fontFamily: fontFamily.regular,
    fontSize: typography.label.fontSize,
    lineHeight: typography.label.lineHeight * 1.15,
  },

  primaryButton: {
    minHeight: touchTarget.primaryButton,
    borderRadius: radius.md,
    backgroundColor: darkColors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  primaryText: {
    color: darkColors.onPrimary,
    fontFamily: fontFamily.semibold,
    fontSize: typography.caption.fontSize,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});

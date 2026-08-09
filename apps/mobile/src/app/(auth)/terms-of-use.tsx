// Terms of Use — pre-auth route (mockup/mobile/01_authen/06_terms_of_use/01_dashboard).
//
// Route placement: the (auth) group, for the same reason the Privacy Policy is there — the root
// AuthGate (app/_layout.tsx) redirects every non-(auth) route to login while unauthenticated, and
// this is reached from the login footer, where the TERMS OF USE label had been inert text since the
// footer was built. PRE-AUTH ONLY (PO decision 2026-08-09): the mockup lives under 01_authen and the
// screen is a document, so unlike the Privacy Policy it gets no second post-auth entry. That is also
// why the body is in this file rather than in a <TermsOfUseDocument /> component: one route, one
// reader — the Privacy Policy was extracted because two routes had to show the same text.
//
// Dark surface: reached from the dark login screen, so the palette is pinned rather than read from
// the theme store, exactly as (auth)/privacy-policy.tsx pins it. No logo glow — §32.7 allows it on
// the auth ENTRY screens and this is a document opened from one.
//
// Two departures from the drawing, both forced by what exists rather than chosen:
//   - the top bar's SYNC button is not drawn. Pre-auth there is no session and no sync engine
//     running, so the control would report on nothing. The back control and the wordmark stay.
//   - "I AGREE TO ALL TERMS" closes the screen and records nothing (PO decision 2026-08-09).
//     Nothing in the repo can accept the acceptance: the consent module covers PDPA processing
//     purposes only (location / financial / operational) and there is no terms-acceptance column or
//     endpoint anywhere. Pre-auth there is not even a user_id to attach one to.

import { useState } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  Pressable,
  StyleSheet,
  Vibration,
  useWindowDimensions,
} from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { BrandLogo } from '../../components/BrandLogo';
import { useI18n } from '../../i18n';
import {
  darkColors,
  fontFamily,
  radius,
  spacing,
  touchTarget,
  typography,
} from '../../theme/tokens';
import safetyPhoto from '../../../assets/terms-safety.jpg';

// Effective version + date of the terms below (PO decision 2026-08-09: first published edition).
// Bump BOTH whenever the copy in i18n changes — they are the document's identity, not decoration.
// The mockup prints "4.2.0-STABLE / June 2024"; that is a drawing, and it matches neither the app
// version nor any edition of this text. Rendered through formatDate() so Thai shows the Buddhist era.
export const TERMS_VERSION = '1.0.0';
export const TERMS_EFFECTIVE_DATE = '2026-08-09';

const K = 'terms.sections';

/**
 * The six clauses, in the mockup's order. `highlight` marks the one the drawing singles out with a
 * border and a coloured numeral — Site Safety, which is the clause a field worker is actually bound
 * by day to day.
 */
const SECTIONS: readonly { id: string; highlight?: true }[] = [
  { id: 'acceptance' },
  { id: 'license' },
  { id: 'responsibilities', highlight: true },
  { id: 'ownership' },
  { id: 'liability' },
  { id: 'termination' },
];

/** The two summary tiles. `tone` names a palette key so no hex reaches the call site (§32.7). */
const SUMMARY: readonly {
  id: 'status' | 'aiUsage';
  icon: keyof typeof MaterialIcons.glyphMap;
  tone: 'cyan' | 'warning';
}[] = [
  { id: 'status', icon: 'verified-user', tone: 'cyan' },
  { id: 'aiUsage', icon: 'analytics', tone: 'warning' },
];

export default function TermsOfUseScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t, formatDate } = useI18n();
  const { width } = useWindowDimensions();

  // The mockup opens on the first clause (its DOMContentLoaded handler adds `active` to it) rather
  // than fully collapsed, so a reader lands on prose instead of six closed bars.
  const [openId, setOpenId] = useState<string | null>(SECTIONS[0]!.id);

  const toggle = (id: string): void => {
    setOpenId((current) => (current === id ? null : id));
    // Mockup calls navigator.vibrate(10) on toggle; Android already declares VIBRATE in the manifest
    // and iOS ignores the duration and plays its standard tap, which is the intended feel.
    Vibration.vibrate(10);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Top app bar — back + the wordmark. The mockup puts the screen's title in the CONTENT, not
          in the bar, so the bar carries the brand exactly as the drawing does. */}
      <View style={styles.header}>
        <Pressable
          testID="terms-of-use-back"
          accessibilityRole="button"
          accessibilityLabel={t('terms.back')}
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <MaterialIcons name="arrow-back" size={24} color={darkColors.primary} />
        </Pressable>
        <BrandLogo variant="dark" height={26} showTagline={false} />
      </View>

      <ScrollView
        testID="terms-of-use"
        style={styles.scroll}
        contentContainerStyle={styles.content}
      >
        <Text style={styles.title}>{t('terms.title')}</Text>
        <Text style={styles.intro}>{t('terms.intro')}</Text>

        {/* Summary tiles — two cards, each with a thick coloured rule down its leading edge. */}
        <View style={styles.summaryRow}>
          {SUMMARY.map(({ id, icon, tone }) => (
            <View
              key={id}
              testID={`terms-summary-${id}`}
              style={[styles.summaryCard, { borderLeftColor: darkColors[tone] }]}
            >
              <MaterialIcons name={icon} size={22} color={darkColors[tone]} />
              <Text style={styles.summaryLabel}>{t(`terms.summary.${id}.label`)}</Text>
              <Text style={styles.summaryValue}>{t(`terms.summary.${id}.value`)}</Text>
            </View>
          ))}
        </View>

        {/* Clauses — one open at a time, the mockup's exclusive accordion. */}
        <View style={styles.accordion}>
          {SECTIONS.map((section, index) => {
            const open = openId === section.id;
            const titleKey = `${K}.${section.id}.title`;
            return (
              <View
                key={section.id}
                style={[styles.card, section.highlight === true && styles.cardHighlight]}
              >
                <Pressable
                  testID={`terms-section-${section.id}`}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: open }}
                  accessibilityLabel={t(titleKey)}
                  onPress={() => toggle(section.id)}
                  style={styles.cardHeader}
                >
                  {/* The clause number, drawn large and faded — the mockup's `opacity-50`. It is
                      decoration over a title that already reads, so it is hidden from screen
                      readers rather than announced as a bare digit before every heading. */}
                  <Text
                    accessibilityElementsHidden
                    importantForAccessibility="no"
                    style={[
                      styles.cardNumber,
                      section.highlight === true && styles.cardNumberHighlight,
                    ]}
                  >
                    {String(index + 1).padStart(2, '0')}
                  </Text>
                  <Text style={styles.cardTitle}>{t(titleKey)}</Text>
                  <MaterialIcons
                    name={open ? 'expand-less' : 'expand-more'}
                    size={24}
                    color={darkColors.muted}
                  />
                </Pressable>

                {open ? (
                  <View testID={`terms-section-${section.id}-body`} style={styles.cardBody}>
                    <Text style={styles.bodyText}>{t(`${K}.${section.id}.body`)}</Text>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>

        {/* Closing image band. The photograph is the mockup's own asset, downloaded into
            assets/ (PO decision 2026-08-09) rather than linked — nothing else in this app loads an
            image over the network, and a field app that cannot draw its own screen offline is not
            one. `cover` reproduces the drawing's `object-cover` crop. The gradient above it is
            drawn with react-native-svg, which the app already carries, so the fade is built from
            palette tokens instead of an rgba literal at the call site (§32.7). */}
        <View style={styles.banner}>
          <Image
            source={safetyPhoto}
            style={styles.bannerImage}
            resizeMode="cover"
            accessibilityLabel={t('terms.safety.headline')}
          />
          <Svg style={StyleSheet.absoluteFill} width={width} height={BANNER_HEIGHT}>
            <Defs>
              <LinearGradient id="termsBannerFade" x1="0" y1="1" x2="0" y2="0">
                <Stop offset="0" stopColor={darkColors.bg} stopOpacity={1} />
                <Stop offset="1" stopColor={darkColors.bg} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#termsBannerFade)" />
          </Svg>
          <View style={styles.bannerCaption}>
            <Text style={styles.bannerEyebrow}>{t('terms.safety.eyebrow')}</Text>
            <Text style={styles.bannerHeadline}>{t('terms.safety.headline')}</Text>
          </View>
        </View>
      </ScrollView>

      {/* Action bar — pinned, as in the mockup, so the primary action is reachable without scrolling
          to the end of six clauses. */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <View style={styles.footerRow}>
          <View style={styles.footerMeta}>
            <Text style={styles.footerVersion}>
              {t('terms.version', { version: TERMS_VERSION })}
            </Text>
            <Text style={styles.footerDate}>
              {t('terms.lastUpdated', { date: formatDate(TERMS_EFFECTIVE_DATE) })}
            </Text>
          </View>

          {/* Rendered disabled: there is no terms PDF asset and no endpoint to serve one — the same
              call the PO made for the Privacy Policy's download on 2026-08-03. The affordance stays
              so the drawing is honoured.
              NO "COMING SOON" CHIP, unlike the Privacy Policy's download. That button is full-width
              with room to spare; this one shares a row with the version block, and the chip cost
              ~110px of it — enough that "Last updated: Aug 9, 2026" wrapped onto a third line and
              collided with the button (seen in the first capture). The state is carried by the
              muted fill and by the label a screen reader announces. */}
          <Pressable
            testID="terms-download-pdf"
            accessibilityRole="button"
            accessibilityState={{ disabled: true }}
            accessibilityLabel={`${t('terms.downloadPdf')} — ${t('terms.comingSoon')}`}
            disabled
            style={styles.downloadButton}
          >
            <MaterialIcons name="download" size={18} color={darkColors.muted} />
            <Text style={styles.downloadText}>{t('terms.downloadPdf')}</Text>
          </Pressable>
        </View>

        <Pressable
          testID="terms-agree"
          accessibilityRole="button"
          accessibilityLabel={t('terms.agree')}
          onPress={() => router.back()}
          style={styles.agreeButton}
        >
          <Text style={styles.agreeText}>{t('terms.agree')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** Height of the closing image band — the mockup's `h-40`. */
const BANNER_HEIGHT = 160;

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

  scroll: { flex: 1 },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xl },

  title: {
    color: darkColors.text,
    fontFamily: fontFamily.semibold,
    fontSize: typography.hero.fontSize,
    lineHeight: typography.hero.lineHeight,
  },
  intro: {
    marginTop: spacing.xs,
    color: darkColors.muted,
    fontFamily: fontFamily.regular,
    fontSize: typography.body.fontSize,
    lineHeight: typography.body.lineHeight,
  },

  summaryRow: { marginTop: spacing.xl, flexDirection: 'row', gap: spacing.sm },
  summaryCard: {
    flex: 1,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: darkColors.surface,
    // The leading rule is the tile's whole identity in the drawing — a thick coloured edge on an
    // otherwise plain card, which is why it is a border rather than an inner stripe.
    borderLeftWidth: 4,
    gap: spacing.xs,
  },
  summaryLabel: {
    color: darkColors.muted,
    fontFamily: fontFamily.semibold,
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  summaryValue: {
    color: darkColors.text,
    fontFamily: fontFamily.semibold,
    fontSize: typography.caption.fontSize,
    lineHeight: typography.caption.lineHeight,
    textTransform: 'uppercase',
  },

  accordion: { marginTop: spacing.xl, gap: spacing.sm },
  card: { borderRadius: radius.lg, backgroundColor: darkColors.surface, overflow: 'hidden' },
  // Site Safety carries an edge the other five do not. The mockup draws it at 20% opacity, which is
  // no edge at all on a phone — the same failure the dark border token was replaced to fix — so it
  // is the full accent here, which is what the rendered mockup actually shows.
  cardHighlight: { borderWidth: 1, borderColor: darkColors.cyan },
  cardHeader: {
    minHeight: touchTarget.listItem,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  cardNumber: {
    color: darkColors.primary,
    opacity: 0.5,
    fontFamily: fontFamily.semibold,
    fontSize: typography.title.fontSize,
    lineHeight: typography.title.lineHeight,
  },
  cardNumberHighlight: { color: darkColors.cyan },
  cardTitle: {
    flex: 1,
    color: darkColors.text,
    fontFamily: fontFamily.semibold,
    fontSize: typography.caption.fontSize,
    lineHeight: typography.caption.lineHeight,
  },
  cardBody: { paddingHorizontal: spacing.md, paddingBottom: spacing.md },
  bodyText: {
    color: darkColors.muted,
    fontFamily: fontFamily.regular,
    fontSize: typography.label.fontSize,
    lineHeight: typography.label.lineHeight * 1.15,
  },

  banner: {
    marginTop: spacing.xl,
    height: BANNER_HEIGHT,
    borderRadius: radius.xxl,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  bannerImage: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
  bannerCaption: { padding: spacing.md },
  bannerEyebrow: {
    color: darkColors.accent,
    fontFamily: fontFamily.semibold,
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  bannerHeadline: {
    marginTop: spacing.xs / 2,
    color: darkColors.text,
    fontFamily: fontFamily.semibold,
    fontSize: typography.title.fontSize,
    lineHeight: typography.title.lineHeight,
    textTransform: 'uppercase',
  },

  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: darkColors.border,
    backgroundColor: darkColors.surface,
  },
  footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  footerMeta: { flex: 1 },
  footerVersion: {
    color: darkColors.muted,
    fontFamily: fontFamily.regular,
    fontSize: typography.label.fontSize,
    lineHeight: typography.label.lineHeight,
  },
  footerDate: {
    color: darkColors.text,
    fontFamily: fontFamily.medium,
    fontSize: typography.label.fontSize,
    lineHeight: typography.label.lineHeight,
  },
  downloadButton: {
    minHeight: touchTarget.secondaryButton,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: darkColors.border,
    backgroundColor: darkColors.elevated,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  downloadText: {
    color: darkColors.muted,
    fontFamily: fontFamily.medium,
    fontSize: typography.label.fontSize,
  },
  agreeButton: {
    minHeight: touchTarget.primaryButton,
    borderRadius: radius.lg,
    backgroundColor: darkColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
  agreeText: {
    color: darkColors.onPrimary,
    fontFamily: fontFamily.semibold,
    fontSize: typography.caption.fontSize,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});

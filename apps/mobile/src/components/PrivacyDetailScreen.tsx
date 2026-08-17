// The shell every Privacy Policy DETAIL screen is drawn with.
//
// Why it exists: product-owner decision 2026-08-17 split the policy's five sections out of the
// accordion in <PrivacyPolicyDocument /> into five pushed routes, matching
// mockup/mobile/01_authen/03_privacy_policy/01_data_collection … 05_user_rights, each of which is
// drawn as a full screen with its own app bar. The five drawings share one layout — an intro
// paragraph over groups of icon-and-prose cards — so they share one component and differ only in the
// data passed to it. Five copies of this file would be the largest clone in the app and would fail
// the jscpd ratchet (1.3%, .jscpd.json), the same reason PrivacyPolicyDocument was extracted.
//
// PRE-AUTH ONLY, and the palette is pinned dark for it. These screens are pushed from
// (auth)/privacy-policy, which is itself pushed from the dark login screen; §32.7 pins every pre-auth
// screen dark because the theme preference is per-user and there is no user yet. The post-auth policy
// route keeps its accordion — it already has the Transparency Portal for depth, and that portal shows
// the signed-in reader their OWN record, which is a different thing from this general notice.
//
// NO LOGO GLOW. §32.7 Exception 1 allows it on the auth ENTRY screens; these are documents opened
// from one, which is the same line (auth)/terms-of-use.tsx draws.
//
// `status: 'comingSoon'` on a card is load-bearing, not decoration — see the note on it below.

import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useT } from '../i18n';
import {
  darkColors,
  fontFamily,
  plateRadius,
  radius,
  spacing,
  touchTarget,
  typography,
} from '../theme/tokens';
import { paletteFor } from '../theme/palette';

const DARK = paletteFor('dark');

/** Palette role a card's glyph takes. `accent` is the default — see Palette.accent on why not `primary`. */
type Tone = 'accent' | 'primary' | 'success' | 'warning';

export interface PrivacyDetailCard {
  /** i18n segment under `<ns>.cards.` — also the testID suffix. */
  id: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  tone?: Tone;
  /**
   * Marks a card describing something the platform does NOT do yet (product-owner decision
   * 2026-08-17: keep the mockup's content, and label whatever has no code behind it).
   *
   * This is a factual qualifier on a PDPA notice, not a style: a reader must be able to tell what is
   * collected from them today apart from what is planned. Every card carrying it is grouped under a
   * section whose label says so as well, so the distinction survives even if the chip is missed.
   */
  status?: 'comingSoon';
  /** Uppercase technical tags under the body (Technical Security draws them). */
  tags?: readonly string[];
}

export interface PrivacyDetailSection {
  /** i18n segment under `<ns>.sections.` — its `.label` heads the group. */
  id: string;
  cards: readonly PrivacyDetailCard[];
}

export function PrivacyDetailScreen({
  screen,
  heroIcon,
  sections,
  footnote,
  cta,
  testID,
}: {
  /** i18n namespace segment: keys resolve under `privacy.detail.<screen>.`. */
  screen: string;
  /** Round hero glyph above the intro (User Rights draws one). */
  heroIcon?: keyof typeof MaterialIcons.glyphMap;
  sections: readonly PrivacyDetailSection[];
  /** Renders `<ns>.footnote` under the last group. */
  footnote?: boolean;
  /** Primary action pinned after the content (User Rights' "Authenticate"). */
  cta?: { icon: keyof typeof MaterialIcons.glyphMap; onPress: () => void };
  testID: string;
}): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const t = useT();

  const ns = `privacy.detail.${screen}`;
  const tintOf = (tone: Tone | undefined): string =>
    tone === undefined || tone === 'accent' ? DARK.accent : DARK[tone];

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Top app bar. The drawings centre the title; it is left-aligned next to Back here, the way
          every other pushed screen in this app titles itself, so the pre-auth documents read as one
          stack rather than three different bars. */}
      <View style={styles.header}>
        <Pressable
          testID={`${testID}-back`}
          accessibilityRole="button"
          accessibilityLabel={t('privacy.policy.back')}
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <MaterialIcons name="arrow-back" size={24} color={darkColors.primary} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {t(`${ns}.title`)}
        </Text>
      </View>

      <ScrollView
        testID={testID}
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
      >
        {heroIcon !== undefined ? (
          <View style={styles.hero}>
            <MaterialIcons name={heroIcon} size={40} color={DARK.accent} />
          </View>
        ) : null}

        <Text style={[styles.intro, heroIcon !== undefined && styles.introCentred]}>
          {t(`${ns}.intro`)}
        </Text>

        {sections.map((section) => (
          <View key={section.id} style={styles.section}>
            <Text style={styles.sectionLabel}>{t(`${ns}.sections.${section.id}.label`)}</Text>

            {section.cards.map((card) => (
              <View key={card.id} testID={`${testID}-card-${card.id}`} style={styles.card}>
                <View style={styles.cardHead}>
                  <View style={styles.iconPlate}>
                    <MaterialIcons name={card.icon} size={22} color={tintOf(card.tone)} />
                  </View>
                  <Text style={styles.cardTitle}>{t(`${ns}.cards.${card.id}.title`)}</Text>
                  {card.status === 'comingSoon' ? (
                    <View style={styles.comingSoonChip}>
                      <Text style={styles.comingSoonText}>{t('privacy.policy.comingSoon')}</Text>
                    </View>
                  ) : null}
                </View>

                <Text style={styles.cardBody}>{t(`${ns}.cards.${card.id}.body`)}</Text>

                {card.tags !== undefined ? (
                  <View style={styles.tagRow}>
                    {card.tags.map((tag) => (
                      <View key={tag} style={styles.tag}>
                        <Text style={styles.tagText}>{t(`${ns}.tags.${tag}`)}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        ))}

        {footnote === true ? <Text style={styles.footnote}>{t(`${ns}.footnote`)}</Text> : null}

        {cta !== undefined ? (
          <Pressable
            testID={`${testID}-cta`}
            accessibilityRole="button"
            accessibilityLabel={t(`${ns}.cta`)}
            onPress={cta.onPress}
            style={styles.ctaButton}
          >
            <MaterialIcons name={cta.icon} size={20} color={DARK.onPrimary} />
            <Text style={styles.ctaText}>{t(`${ns}.cta`)}</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}

/** Side of the tinted glyph tile — the drawings' `w-10 h-10`. */
const PLATE = 40;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: DARK.bg },

  header: {
    height: touchTarget.listItem,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: DARK.border,
    backgroundColor: DARK.surface,
  },
  backButton: {
    width: touchTarget.iconButton,
    height: touchTarget.iconButton,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Uppercased here rather than in the i18n value, so the stored string stays natural and reusable —
  // the same call (auth)/privacy-policy.tsx makes. Thai has no case, so `th` renders unchanged.
  headerTitle: {
    flex: 1,
    color: DARK.text,
    fontFamily: fontFamily.semibold,
    fontSize: typography.title.fontSize,
    lineHeight: typography.title.lineHeight,
    textTransform: 'uppercase',
  },

  scroll: { flex: 1 },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },

  hero: {
    alignSelf: 'center',
    width: 80,
    height: 80,
    // 999, not 40. §32.7 reserves 999 as the "make this a capsule/circle" marker for elements whose
    // radius is half their width — writing the half directly is a literal that stops being a circle
    // the moment the size changes, and theme/__tests__/radiusRatchet.spec.ts counts it as one.
    borderRadius: 999,
    borderWidth: 1,
    borderColor: DARK.border,
    backgroundColor: DARK.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },

  intro: {
    color: DARK.muted,
    fontFamily: fontFamily.regular,
    fontSize: typography.body.fontSize,
    lineHeight: typography.body.lineHeight,
  },
  introCentred: { textAlign: 'center' },

  section: { marginTop: spacing.xl, gap: spacing.sm },
  sectionLabel: {
    color: DARK.accent,
    fontFamily: fontFamily.semibold,
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },

  card: {
    borderWidth: 1,
    borderColor: DARK.border,
    borderRadius: radius.lg,
    backgroundColor: DARK.surface,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  iconPlate: {
    width: PLATE,
    height: PLATE,
    borderRadius: plateRadius(PLATE),
    // `elevated`, not `bg`: this plate sits ON a `surface` card, so it steps UP away from the page.
    backgroundColor: DARK.elevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    flex: 1,
    color: DARK.text,
    fontFamily: fontFamily.semibold,
    fontSize: typography.caption.fontSize,
    lineHeight: typography.caption.lineHeight,
  },
  cardBody: {
    color: DARK.muted,
    fontFamily: fontFamily.regular,
    fontSize: typography.label.fontSize,
    lineHeight: typography.label.lineHeight * 1.15,
  },

  // Outlined, not filled. The fill alone does not carry it: on a `surface` card the chip's own
  // `elevated` is two-per-channel away, which is no chip at all — the same defect that left
  // TransparencyKit's twin rendering as bare text until its border went back on.
  comingSoonChip: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: DARK.border,
    backgroundColor: DARK.elevated,
  },
  comingSoonText: {
    color: DARK.muted,
    fontFamily: fontFamily.medium,
    fontSize: 10,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  // radius.xl like every other pill in the app — §32.7's one-token ruling for badges, held by
  // theme/__tests__/badgeRadius.spec.ts. The drawing squares these off at Tailwind's `rounded`, but
  // that ruling is a platform decision taken across the whole mockup set, not per screen.
  tag: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: DARK.border,
    backgroundColor: DARK.elevated,
  },
  tagText: {
    color: DARK.accent,
    fontFamily: fontFamily.medium,
    fontSize: 10,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  footnote: {
    marginTop: spacing.xl,
    color: DARK.muted,
    fontFamily: fontFamily.regular,
    fontSize: typography.label.fontSize,
    lineHeight: typography.label.lineHeight * 1.15,
  },

  ctaButton: {
    marginTop: spacing.xl,
    minHeight: touchTarget.primaryButton,
    borderRadius: radius.md,
    backgroundColor: DARK.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  ctaText: {
    color: DARK.onPrimary,
    fontFamily: fontFamily.semibold,
    fontSize: typography.caption.fontSize,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});

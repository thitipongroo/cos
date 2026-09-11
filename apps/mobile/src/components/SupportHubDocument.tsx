// Support Hub — the POST-AUTH Support screen, and the redrawn Stitch drawing it is built from.
//
// DRAWING: mockup/mobile/support_center/01_dashboard (Stitch screen "ศูนย์ช่วยเหลือและสนับสนุน -
// Construction OS (Support Center)"), redrawn and named by the product owner on 2026-09-11. The
// repo copy is sha256-identical to what Stitch serves.
//
// ── WHY THIS IS A SECOND SCREEN AND NOT A SECOND RENDERING ──────────────────────────────────────
//
// From 2026-08-17 the Support Centre was ONE document rendered at both routes, with each side
// adding a header and a footer — the shape `PrivacyPolicyDocument` uses. On 2026-09-11 the four
// sections this drawing adds were put into that shared document, and the first Android capture is
// what ended the arrangement: the PRE-AUTH screen came out 5,556px tall and mixed "I cannot sign
// in" help with "how do I use this" help, on a surface reached by someone who by definition cannot
// do the second.
//
// The product owner split them the same day. THE TWO SCREENS NOW DO DIFFERENT JOBS:
//
//   (auth)/support  — `01_authen/05_get_help/01_home_support`. Someone who cannot get IN: system
//                     status, the emergency numbers, field troubleshooting, FIELD ASSISTANT.
//   (app)/support   — THIS FILE. Someone already WORKING: the eight help categories, the FAQs and
//                     the featured article. NOTHING ELSE — the route is a frame and adds no cards.
//
// It briefly added three, all of them real: YOUR SESSION (identity + active project), DEVICE
// DIAGNOSTICS and WHAT YOUR ROLE CAN OPEN. The product owner removed all three on 2026-09-11, and
// `(app)/support.tsx`'s header records why: a diagnostics dump belongs to the conversation about
// not being able to get IN, which is the pre-auth screen's job now.
//
// What genuinely overlaps — the status card and the search row, which both drawings carry and both
// mean the same thing by — is in `SupportPrimitives.tsx`, so neither screen copies the other.
//
// ── WHAT IS REAL AND WHAT IS DRAWN ──────────────────────────────────────────────────────────────
//
// REAL: the system status (`checkBackendHealth()` pings the public `GET /health/live`), and LIVE
// CHAT in the footer — `/help-chat` exists on both sides of login (ADR-093 decision 3). EMAIL
// SUPPORT reads `EXPO_PUBLIC_SUPPORT_EMAIL` on the terms the priority line's phone number has had
// since 2026-08-09: unset ⇒ it says so on a press, and the page carries no standing note about it.
//
// DRAWN: the eight categories, the four FAQs and the featured article — SUPPORT_HELP_CATEGORIES,
// SUPPORT_TOP_FAQS, SUPPORT_FEATURED_ARTICLE under ADR-099. Measured 2026-09-11: no `help_article`,
// `faq` or `article` model in the schema, no `backend/src/modules/support/`, and no controller
// prefix for support, chat, ticket, help or faq. The four support TABLES that do exist are about
// the desk and about tickets; none holds an article or an FAQ.
//
// ── WHAT THE DRAWING ASKED FOR AND DID NOT GET, EACH WITH ITS REASON (ADR-085) ───────────────────
//
//   · NO BACKGROUND GLOW. The drawing fixes two `blur-[120px]` colour blobs behind the page. §32.7's
//     brand rule forbids glow and its exception list names this very screen: "the Terms of Use and
//     Support Centre routes … ship with NO glow — they are opened FROM an entry screen rather than
//     being one."
//   · NO `glass-card`. `rgba(16,32,52,0.8)` + `backdrop-filter: blur(12px)` — React Native has no
//     backdrop-filter, and #102034 is `--cos-dark-surface-container` already. Solid token instead.
//   · NO FLAT "24/7" CLAIM. The drawing writes "Technical Support available 24/7" unconditionally.
//     Operating hours are desk data (`support_desk_default.operating_hours`), nothing here asserts
//     24/7, and §32.7 already rules for the hotline screen that an unset block does not render.
//   · THE FAQ ROWS DO NOT EXPAND. The drawing puts `expand_more` on each of the four and gives none
//     of them a body. A disclosure that opens onto nothing is the drawn dead control this project
//     refused on 2026-09-11; each row says so on the press instead.
//   · NO OWN APP BAR. The drawing draws a back-and-title header. <TopBar /> and Breadcrumb supply
//     both here, and a screen is named ONCE (§32.7). The drawing's 40px avatar is the signed-in
//     user, which <TopBar /> already draws.
//   · THE FOOTER IS PINNED TO THIS DOCUMENT'S FRAME, not the viewport as the drawing fixes it. This
//     route sits inside <Tabs>, so a viewport-fixed bar would land on top of <MobileNav />.
//
// NO EMERGENCY ASSISTANCE PAIR, and that is the split rather than an omission: the drawing has none
// and the product owner put the emergency numbers on the pre-auth side. The consequence was stated
// when the split was taken — the IT Hotline screen loses its signed-in entry, while Help Chat keeps
// one through the footer's LIVE CHAT.

import { useMemo, useState } from 'react';
import { View, Text, Image, ScrollView, Pressable, StyleSheet, Linking } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useT } from '../i18n';
import { useComingSoon } from './useComingSoon';
import { SupportSearchRow, SupportStatusCard, type Health } from './SupportPrimitives';
import articleImage from '../../assets/crm/construction-site-2.jpg';
import {
  SUPPORT_FEATURED_ARTICLE,
  SUPPORT_HELP_CATEGORIES,
  SUPPORT_TOP_FAQS,
} from '../lib/mockupFigures';
import { fontFamily, plateRadius, radius, spacing, touchTarget, typography } from '../theme/tokens';
import type { Palette } from '../theme/palette';

// The address the footer's EMAIL SUPPORT button writes to. `|| null` rather than `?? null` — a
// whitespace-only value is "not set", which is what a half-filled .env actually produces.
const SUPPORT_EMAIL: string | null = process.env['EXPO_PUBLIC_SUPPORT_EMAIL']?.trim() || null;

/** The glyph plate on each Quick Help tile, and the article card's height — both the drawing's. */
const CATEGORY_PLATE = 36;
const ARTICLE_HEIGHT = 192;

/**
 * NO `header` OR `footer` SLOT, unlike its pre-auth counterpart.
 *
 * It had both until 2026-09-11, and `(app)/support.tsx` filled them with YOUR SESSION, DEVICE
 * DIAGNOSTICS and WHAT YOUR ROLE CAN OPEN. The product owner removed all three that day, which left
 * two props nothing passed and two JSDoc lines describing cards that no longer exist. Declaring a
 * slot nobody fills is an invitation to fill it, and this screen is meant to BE the drawing — so
 * the slots are gone rather than left empty.
 */
export function SupportHubDocument({
  palette,
  onOpenChat,
  health,
  minutesAgo,
  paddingBottom,
  testID,
}: {
  palette: Palette;
  /** Open the Help Chat screen — the caller supplies its own group-qualified push. */
  onOpenChat: () => void;
  health: Health;
  minutesAgo: number;
  paddingBottom: number;
  testID: string;
}): React.JSX.Element {
  const t = useT();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const soon = useComingSoon();

  // How tall the pinned footer actually is, measured rather than guessed. The first capture of the
  // redraw showed why: the footer sits over the scroll area, so without its height added to the
  // content's bottom padding the last section sits UNDER it and cannot be scrolled clear. A
  // constant would go stale the moment the availability line renders or the copy wraps.
  const [footerHeight, setFooterHeight] = useState(0);

  /** The drawing's per-tile accent, resolved against the live palette rather than a hex. */
  const toneColor = (tone: (typeof SUPPORT_HELP_CATEGORIES.value)[number]['tone']): string =>
    tone === 'primary'
      ? palette.primary
      : tone === 'danger'
        ? palette.danger
        : tone === 'success'
          ? palette.success
          : tone === 'warning'
            ? palette.warning
            : tone === 'accent'
              ? palette.accent
              : palette.muted;

  return (
    <View style={styles.frame}>
      <ScrollView
        testID={testID}
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: paddingBottom + footerHeight }]}
      >
        <SupportStatusCard
          palette={palette}
          health={health}
          minutesAgo={minutesAgo}
          onPress={() => soon('support.status.heading')}
        />

        <SupportSearchRow
          palette={palette}
          placeholder={t('support.search.hubPlaceholder')}
          onPress={() => soon('support.search.hubPlaceholder')}
        />

        {/* ── QUICK HELP CATEGORIES ──────────────────────────────────────────────────────────────
            Eight tiles in the drawing's two-column bento. DRAWN — SUPPORT_HELP_CATEGORIES.
            Deliberately NOT `drawerLinksFor(role)`: that list is real, but it answers "what may I
            open?", and this grid answers "where do I read about X?". The role's own module list is
            still rendered, in this screen's footer, where it belongs. */}
        <View style={styles.categoryGrid}>
          {SUPPORT_HELP_CATEGORIES.value.map((category) => {
            const tone = toneColor(category.tone);
            return (
              <Pressable
                key={category.key}
                testID={`support-category-${category.key}`}
                accessibilityRole="button"
                accessibilityLabel={t(`support.categories.${category.key}.title`)}
                onPress={() => soon(`support.categories.${category.key}.title`)}
                style={[styles.categoryTile, { borderLeftColor: tone }]}
              >
                <View style={styles.categoryHead}>
                  <View style={[styles.categoryPlate, { backgroundColor: palette.surfaceBright }]}>
                    <MaterialIcons name={category.icon} size={20} color={tone} />
                  </View>
                  <MaterialIcons name="chevron-right" size={18} color={palette.muted} />
                </View>
                <Text style={styles.categoryRole} numberOfLines={1}>
                  {t(`support.categories.${category.key}.role`)}
                </Text>
                <Text style={styles.categoryTitle} numberOfLines={1} ellipsizeMode="tail">
                  {t(`support.categories.${category.key}.title`)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* ── TOP FAQs ───────────────────────────────────────────────────────────────────────────
            DRAWN — SUPPORT_TOP_FAQS. The rows do not expand; see the header note. */}
        <View style={styles.faqHead}>
          <Text style={styles.sectionHeading}>{t('support.faq.heading')}</Text>
          <Pressable
            testID="support-faq-view-all"
            accessibilityRole="button"
            accessibilityLabel={t('support.faq.viewAll')}
            onPress={() => soon('support.faq.viewAll')}
            hitSlop={8}
          >
            <Text style={styles.faqViewAll}>{t('support.faq.viewAll')}</Text>
          </Pressable>
        </View>

        {SUPPORT_TOP_FAQS.value.map((id) => (
          <Pressable
            key={id}
            testID={`support-faq-${id}`}
            accessibilityRole="button"
            accessibilityLabel={t(`support.faq.${id}`)}
            onPress={() => soon(`support.faq.${id}`)}
            style={styles.faqRow}
          >
            <Text style={styles.faqQuestion} numberOfLines={2}>
              {t(`support.faq.${id}`)}
            </Text>
            {/* CHEVRON RIGHT, not the drawing's `expand_more` (product-owner decision 2026-09-11).
                A downward chevron promises a disclosure, and these rows have nothing to disclose —
                the drawing gives none of them a body. Pointing right says what the row actually
                does. It is also the treatment the pre-auth troubleshooting list already had, for
                the same reason and by the same decision a day earlier (2026-09-10): right while
                closed, and it turns down only onto an answer it really revealed. */}
            <MaterialIcons name="chevron-right" size={24} color={palette.muted} />
          </Pressable>
        ))}

        {/* ── FEATURED ARTICLE ───────────────────────────────────────────────────────────────────
            DRAWN — SUPPORT_FEATURED_ARTICLE. The image is a file this repository already bundles;
            the drawing loads it from `lh3.googleusercontent.com`, which is not shippable here. It
            was `digital_archectural_blueprint.jpg` for one build, chosen off its FILENAME and never
            opened — that file is a rendered mockup of a Tenant Admin screen, Thai menu labels
            included. Open the asset before naming it. */}
        <Pressable
          testID="support-article"
          accessibilityRole="button"
          accessibilityLabel={t('support.article.title')}
          onPress={() => soon('support.article.heading')}
          style={styles.articleCard}
        >
          <Image
            source={articleImage}
            style={styles.articleImage}
            resizeMode="cover"
            accessible={false}
          />
          <View style={styles.articleScrim} />
          <View style={styles.articleBody}>
            <View style={styles.articleTag}>
              <Text style={styles.articleTagText}>{t('support.article.tag')}</Text>
            </View>
            <Text style={styles.articleTitle} numberOfLines={2}>
              {t('support.article.title')}
            </Text>
            <Text style={styles.articleMeta} numberOfLines={1}>
              {t('support.article.meta', {
                minutes: SUPPORT_FEATURED_ARTICLE.value.readMinutes,
                author: t('support.article.byline'),
              })}
            </Text>
          </View>
        </Pressable>
      </ScrollView>

      {/* ── SUPPORT FOOTER ─────────────────────────────────────────────────────────────────────── */}
      <View
        style={styles.stickyFooter}
        onLayout={(event) => setFooterHeight(event.nativeEvent.layout.height)}
      >
        <View style={styles.footerRow}>
          <Pressable
            testID="support-live-chat"
            accessibilityRole="button"
            accessibilityLabel={t('support.footer.liveChat')}
            onPress={onOpenChat}
            style={styles.footerPrimary}
          >
            <MaterialIcons name="chat-bubble" size={18} color={palette.onPrimary} />
            <Text style={styles.footerPrimaryText}>{t('support.footer.liveChat')}</Text>
          </Pressable>

          <Pressable
            testID="support-email"
            accessibilityRole="button"
            accessibilityLabel={t('support.footer.emailSupport')}
            onPress={() =>
              SUPPORT_EMAIL === null
                ? soon('support.footer.emailSupport')
                : void Linking.openURL(`mailto:${SUPPORT_EMAIL}`)
            }
            style={styles.footerSecondary}
          >
            <MaterialIcons name="mail" size={18} color={palette.text} />
            <Text style={styles.footerSecondaryText}>{t('support.footer.emailSupport')}</Text>
          </Pressable>
        </View>

        {SUPPORT_EMAIL === null ? null : (
          <Text style={styles.footerNote}>{t('support.footer.available')}</Text>
        )}
      </View>
    </View>
  );
}

function makeStyles(palette: Palette) {
  return StyleSheet.create({
    frame: { flex: 1 },
    scroll: { flex: 1 },
    content: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.md },

    sectionHeading: {
      color: palette.muted,
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
    },

    // ── Quick Help categories — the drawing's two-column bento ────────────────────────────────
    categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    categoryTile: {
      flexBasis: '48%',
      flexGrow: 1,
      gap: spacing.xs / 2,
      padding: spacing.sm,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderLeftWidth: 4,
      borderColor: palette.border,
      backgroundColor: palette.surface,
    },
    categoryHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    categoryPlate: {
      width: CATEGORY_PLATE,
      height: CATEGORY_PLATE,
      borderRadius: plateRadius(CATEGORY_PLATE),
      alignItems: 'center',
      justifyContent: 'center',
    },
    categoryRole: {
      color: palette.muted,
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    categoryTitle: {
      color: palette.text,
      fontFamily: fontFamily.semibold,
      fontSize: typography.body.fontSize,
    },

    // ── Top FAQs ──────────────────────────────────────────────────────────────────────────────
    faqHead: {
      marginTop: spacing.sm,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    faqViewAll: {
      color: palette.primary,
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
    },
    faqRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
      minHeight: touchTarget.listItem,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.surface,
    },
    faqQuestion: {
      flex: 1,
      color: palette.text,
      fontFamily: fontFamily.regular,
      fontSize: typography.body.fontSize,
    },

    // ── Featured article ──────────────────────────────────────────────────────────────────────
    articleCard: {
      height: ARTICLE_HEIGHT,
      borderRadius: radius.xl,
      overflow: 'hidden',
      justifyContent: 'flex-end',
    },
    articleImage: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    // A flat scrim, not the drawing's gradient: §32.7's brand rule forbids gradients where the
    // signed-in app shows data, and this screen is as signed-in as they come.
    articleScrim: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(2, 6, 23, 0.55)',
    },
    articleBody: { padding: spacing.md, gap: spacing.xs / 2 },
    articleTag: {
      alignSelf: 'flex-start',
      paddingHorizontal: spacing.xs,
      paddingVertical: 2,
      borderRadius: radius.xl,
      backgroundColor: palette.primary,
    },
    articleTagText: {
      color: palette.onPrimary,
      fontFamily: fontFamily.bold,
      fontSize: typography.label.fontSize,
      letterSpacing: 0.5,
    },
    // Fixed inks, not palette: this text sits on a PHOTOGRAPH behind a dark scrim in both themes,
    // so it must stay light even when the rest of the screen is on a white surface.
    articleTitle: {
      color: '#F8FAFC',
      fontFamily: fontFamily.semibold,
      fontSize: typography.title.fontSize,
    },
    articleMeta: {
      color: '#CBD5E1',
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
    },

    // ── Pinned footer ─────────────────────────────────────────────────────────────────────────
    stickyFooter: {
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      paddingBottom: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: palette.border,
      backgroundColor: palette.surface,
    },
    footerRow: { flexDirection: 'row', gap: spacing.sm },
    footerPrimary: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      minHeight: touchTarget.primaryButton,
      borderRadius: radius.xl,
      backgroundColor: palette.primary,
    },
    footerPrimaryText: {
      color: palette.onPrimary,
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
    },
    footerSecondary: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      minHeight: touchTarget.secondaryButton,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.surfaceBright,
    },
    footerSecondaryText: {
      color: palette.text,
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
    },
    footerNote: {
      textAlign: 'center',
      color: palette.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
    },
  });
}

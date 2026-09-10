// Support Center — the content BOTH Support routes render, extracted 2026-08-17.
//
// WHY THIS EXISTS. The Support Centre used to be pre-auth only, entered from the OTP step's
// GET SUPPORT item. Product-owner decision 2026-08-17 gave it a second, post-auth entry — the
// signed-in TopBar's "?", which until then opened a "coming soon" note — and ruled that the two
// screens must NOT be identical: a signed-in user has an identity, a project and a real device
// state, and a support screen that ignores all three is asking them to type back what the app
// already knows. So the shared parts live here and each route supplies its own `header`/`footer`.
// This is the shape `PrivacyPolicyDocument` already uses for the same pre-auth/post-auth pair
// (PO decision 2026-08-04) — one copy of the content, two frames around it.
//
// WHAT IS SHARED (this file): system status · search · emergency contacts · troubleshooting.
// WHAT IS NOT:
//   pre-auth  → FIELD ASSISTANT panel (footer). It is the only thing a screen with no user can add.
//   post-auth → identity + active project (header); sync/connection diagnostics and the role's own
//               module list (footer). See app/(app)/support.tsx.
//
// PALETTE. Taken as a prop, not read from the store: the pre-auth route is pinned dark because it is
// pushed from the dark OTP screen (§32.7 pinned pre-auth surfaces), while the post-auth route follows
// the user's theme like every other (app) screen. `paletteFor('dark')` maps field-for-field onto the
// `darkColors.*` this file used before the extraction, so the pre-auth screen is unchanged.
//
// WHAT IS REAL HERE, AND WHAT THE WITHDRAWN DRAWING ASKED FOR THAT IS NOT
// (carried over verbatim from app/(auth)/support.tsx, which was the record before the split —
//  mockup/mobile/01_authen/07_get_help/01_support_center, WITHDRAWN 2026-08-15, ADR-085):
//   - System status IS real — checkBackendHealth() pings the public GET /health/live, the same probe
//     behind the login footer's status dot. Nothing here is a decorative "operational".
//   - The two phone numbers are DEPLOYMENT CONFIG (PO decision 2026-08-09), the same treatment as
//     EXPO_PUBLIC_DPO_EMAIL. The priority line calls the SUPPORT CENTRE, not a named person (PO
//     decision 2026-08-09, renaming the drawing's "Call Site Supervisor"). Unset ⇒ that control
//     renders disabled and says so, rather than dialling nothing.
//
//     THIS PARAGRAPH USED TO ASSERT THAT NO SUPPORT-DESK, EMERGENCY-CONTACT OR HOTLINE COLUMN
//     EXISTED ANYWHERE IN THE SCHEMA, "verified again on 2026-08-17". It stopped being true on
//     2026-08-18 and stayed on the page for three weeks. Migration
//     `20260818000001_support_desk_and_help_chat` added `platform.support_desk_default` and
//     `platform.tenant_support_desks` — `it_hotline_phone`, `it_hotline_label`,
//     `it_hotline_description`, `operating_hours`, `regional_hotlines` — plus
//     `platform.support_tickets` and `platform.support_messages`. What is still absent is the API:
//     there is no `backend/src/modules/support/`, and none of the backend's 25 controller prefixes
//     is support, chat or ticket (measured 2026-09-10). So the env vars remain what the app reads,
//     but because nothing can read the columns yet — not because the columns do not exist.
//   - Search is drawn DISABLED (PO decision 2026-08-09, re-affirmed for the post-auth route
//     2026-08-17). There is no help-article corpus, no search endpoint and no `help_article`/`faq`
//     table — an input that silently matches nothing is worse than one that admits it.
//   - Quick Help Chat NAVIGATES to the Help Chat screen as of 2026-09-10, and so does the IT
//     Hotline card. Both gained the `chevron_right` the 2026-08-17 drawing puts on them, and the
//     hotline card stopped dialling in place — `CALL NOW` on the detail screen is the dial (ADR-093
//     decision 4). The chat card's "coming soon" note is gone with it: the screen exists; what is
//     unbuilt is the ticket endpoint behind it, and that is stated on a press by
//     `HelpChatDocument`, not as standing text here (PO decision 2026-09-10).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Linking, Vibration } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useT } from '../i18n';
import { useComingSoon } from './useComingSoon';
import { checkBackendHealth } from '../api/health';
import { fontFamily, radius, spacing, touchTarget, typography } from '../theme/tokens';
import type { Palette } from '../theme/palette';

type IconName = keyof typeof MaterialIcons.glyphMap;

// Emergency numbers, supplied by configuration rather than hardcoded — see the header note.
// `|| null` rather than `?? null` on purpose: an empty or whitespace-only value is "not configured",
// which is what a half-filled .env actually produces.
const SUPPORT_CENTER_PHONE: string | null =
  process.env['EXPO_PUBLIC_SUPPORT_CENTER_PHONE']?.trim() || null;
// `EXPO_PUBLIC_SUPPORT_IT_HOTLINE` moved to `SupportHotlineDocument` on 2026-09-10 with the card
// that read it: this screen navigates to the hotline now rather than dialling it, so the number
// belongs to the screen that places the call.

/** The four troubleshooting entries, in the mockup's order. */
const TOPICS: readonly { id: string; icon: IconName }[] = [
  { id: 'login', icon: 'login' },
  { id: 'photos', icon: 'sync-problem' },
  { id: 'gps', icon: 'location-disabled' },
  { id: 'permit', icon: 'assignment-late' },
];

/** Backend liveness, as this screen knows it. `null` while the first probe is in flight. */
export type Health = boolean | null;

/**
 * Backend liveness plus how stale the answer is.
 *
 * OWNED BY THE SCREEN, NOT BY THIS DOCUMENT, and passed back in as props. Both routes need the same
 * answer twice over — the status card here, and the caller's own footer (the pre-auth FIELD ASSISTANT
 * line, the post-auth diagnostics block) — so holding it in the document would force each screen to
 * run a SECOND probe for its footer and ping /health/live twice per open.
 */
export function useBackendHealth(): { health: Health; minutesAgo: number } {
  const [health, setHealth] = useState<Health>(null);
  // Minutes since the probe answered. The drawing prints "Last checked: 2m ago", so the number has to
  // age — a stamp that never moves would claim the check is always fresh.
  const [minutesAgo, setMinutesAgo] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void checkBackendHealth().then((ok) => {
      if (cancelled) return;
      setHealth(ok);
      setMinutesAgo(0);
    });
    const tick = setInterval(() => setMinutesAgo((m) => m + 1), 60_000);
    return () => {
      cancelled = true;
      clearInterval(tick);
    };
  }, []);

  return { health, minutesAgo };
}

export function SupportCenterDocument({
  palette,
  onOpenHotline,
  onOpenChat,
  health,
  minutesAgo,
  paddingBottom,
  testID,
  header,
  footer,
}: {
  palette: Palette;
  /** Open the hotline detail screen. Each route supplies its own group-qualified push. */
  onOpenHotline: () => void;
  /** Open the Help Chat screen. Same reason. */
  onOpenChat: () => void;
  /** From the caller's `useBackendHealth()` — see the note on that hook for why it is not held here. */
  health: Health;
  minutesAgo: number;
  paddingBottom: number;
  testID: string;
  /** Rendered above the system-status card — the post-auth route's identity + project block. */
  header?: React.ReactNode;
  /** Rendered below the troubleshooting list — FIELD ASSISTANT pre-auth, diagnostics post-auth. */
  footer?: React.ReactNode;
}): React.JSX.Element {
  const t = useT();
  const styles = useMemo(() => makeStyles(palette), [palette]);

  // Independent disclosures, not an exclusive accordion: the mockup builds these from <details>, each
  // of which opens on its own. (The Terms of Use accordion is exclusive because its mockup ships JS
  // that closes the others.)
  const [openIds, setOpenIds] = useState<readonly string[]>([]);

  const call = useCallback((phone: string) => {
    void Linking.openURL(`tel:${phone}`);
  }, []);

  const toggle = (id: string): void => {
    setOpenIds((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );
    Vibration.vibrate(5);
  };

  // The two controls on this screen with nothing behind them — search, and the priority line when
  // no number is configured. They say so ON A PRESS; the page says nothing (PO 2026-09-10).
  const soon = useComingSoon();

  const statusLabel =
    health === null
      ? t('support.status.checking')
      : health
        ? t('support.status.operational')
        : t('support.status.unreachable');
  const statusColor = health === null ? palette.muted : health ? palette.success : palette.danger;

  return (
    <ScrollView
      testID={testID}
      style={styles.scroll}
      contentContainerStyle={[styles.content, { paddingBottom }]}
    >
      {header}

      {/* System status — a real probe, not a badge. */}
      <View testID="support-status" style={[styles.statusCard, { borderColor: statusColor }]}>
        <View style={styles.statusLeft}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusLabel, { color: statusColor }]}>{statusLabel}</Text>
        </View>
        {health !== null ? (
          <Text style={styles.statusTime}>
            {t('support.status.lastChecked', {
              when:
                minutesAgo === 0
                  ? t('support.status.justNow')
                  : t('support.status.minutesAgo', { minutes: minutesAgo }),
            })}
          </Text>
        ) : null}
      </View>

      {/* Search — drawn exactly as the mockup draws it: a glyph and a placeholder, nothing else.
          It carried a `COMING SOON` chip until 2026-09-10; the drawing has no such chip, and a
          standing note about what is unbuilt is what the product owner ruled out. There is still no
          `help_article`/`faq` table and no search endpoint, so the field is not editable and a tap
          says so — on the tap, not on the page. */}
      <Pressable
        testID="support-search"
        accessibilityRole="search"
        accessibilityLabel={t('support.search.placeholder')}
        onPress={() => soon('support.search.placeholder')}
        style={styles.searchRow}
      >
        <MaterialIcons name="search" size={22} color={palette.muted} />
        <Text style={styles.searchPlaceholder}>{t('support.search.placeholder')}</Text>
      </Pressable>

      <Text style={styles.sectionHeading}>{t('support.emergency.heading')}</Text>

      {/* Priority line — the drawing's tall filled button. */}
      {/* ALWAYS THE DRAWING'S FILLED BUTTON. It rendered grey with "No number set for this site"
          under the title whenever `EXPO_PUBLIC_SUPPORT_CENTER_PHONE` was unset — copy that appears
          nowhere in the mockup, and a standing note about what is unconfigured. Both are gone
          (product-owner decision 2026-09-10). The button dials where a deployment set a number and
          says so on a tap where it did not. */}
      <Pressable
        testID="support-call-center"
        accessibilityRole="button"
        accessibilityLabel={t('support.emergency.supportCenter')}
        onPress={() =>
          SUPPORT_CENTER_PHONE === null
            ? soon('support.emergency.supportCenter')
            : call(SUPPORT_CENTER_PHONE)
        }
        style={styles.priorityButton}
      >
        <View style={styles.priorityText}>
          <Text style={styles.priorityEyebrow}>{t('support.emergency.priorityLine')}</Text>
          <Text style={styles.priorityTitle}>{t('support.emergency.supportCenter')}</Text>
        </View>
        <View style={styles.priorityGlyph}>
          <MaterialIcons name="phone-in-talk" size={24} color={palette.onPrimary} />
        </View>
      </Pressable>

      {/* The pair below it. */}
      <View style={styles.pairRow}>
        {/* BOTH CARDS NAVIGATE as of 2026-09-10 — the 2026-08-17 drawing puts a `chevron_right` on
            each, and the detail screens they point at now exist. The IT Hotline card no longer
            dials in place (ADR-093 decision 4): `CALL NOW` on the hotline screen is the dial, so
            the same call is placed one way rather than two. */}
        <Pressable
          testID="support-it-hotline"
          accessibilityRole="link"
          accessibilityLabel={t('support.emergency.itHotline')}
          onPress={onOpenHotline}
          style={styles.pairCard}
        >
          <View style={styles.pairHead}>
            <MaterialIcons name="shield" size={22} color={palette.danger} />
            <MaterialIcons name="chevron-right" size={18} color={palette.muted} />
          </View>
          <Text style={styles.pairTitle}>{t('support.emergency.itHotline')}</Text>
        </Pressable>

        {/* Its "coming soon" note is GONE. The chat screen exists; what is not built is the ticket
            endpoint behind it, and `HelpChatDocument` states that on a press rather than here. */}
        <Pressable
          testID="support-quick-chat"
          accessibilityRole="link"
          accessibilityLabel={t('support.emergency.quickChat')}
          onPress={onOpenChat}
          style={styles.pairCard}
        >
          <View style={styles.pairHead}>
            <MaterialIcons name="chat-bubble" size={22} color={palette.accent} />
            <MaterialIcons name="chevron-right" size={18} color={palette.muted} />
          </View>
          <Text style={styles.pairTitle}>{t('support.emergency.quickChat')}</Text>
        </Pressable>
      </View>

      <Text style={styles.sectionHeading}>{t('support.troubleshooting.heading')}</Text>

      {/* One bordered container, hairline-separated rows — the drawing's `gap-px` list. */}
      <View style={styles.topicList}>
        {TOPICS.map((topic, index) => {
          const open = openIds.includes(topic.id);
          const titleKey = `support.troubleshooting.${topic.id}.title`;
          return (
            <View key={topic.id} style={index > 0 ? styles.topicDivider : undefined}>
              <Pressable
                testID={`support-topic-${topic.id}`}
                accessibilityRole="button"
                accessibilityState={{ expanded: open }}
                accessibilityLabel={t(titleKey)}
                onPress={() => toggle(topic.id)}
                style={styles.topicHeader}
              >
                <MaterialIcons name={topic.icon} size={22} color={palette.muted} />
                <Text style={styles.topicTitle}>{t(titleKey)}</Text>
                {/* CHEVRON RIGHT when the row is closed (product-owner decision 2026-09-10), not
                    the drawing's `expand_more`. Open, it turns down onto the answer it revealed. */}
                <MaterialIcons
                  name={open ? 'expand-more' : 'chevron-right'}
                  size={24}
                  color={palette.muted}
                />
              </Pressable>
              {open ? (
                <Text testID={`support-topic-${topic.id}-answer`} style={styles.topicAnswer}>
                  {t(`support.troubleshooting.${topic.id}.answer`)}
                </Text>
              ) : null}
            </View>
          );
        })}
      </View>

      {footer}
    </ScrollView>
  );
}

function makeStyles(palette: Palette) {
  return StyleSheet.create({
    scroll: { flex: 1 },
    content: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.md },

    statusCard: {
      borderWidth: 1,
      borderRadius: radius.lg,
      backgroundColor: palette.surface,
      padding: spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    statusLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    // 999 — a documented circle, not a radius on the scale (§32.7).
    statusDot: { width: 10, height: 10, borderRadius: 999 },
    statusLabel: {
      fontFamily: fontFamily.semibold,
      fontSize: 11,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
    },
    statusTime: {
      color: palette.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
    },

    searchRow: {
      minHeight: touchTarget.formInput,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: radius.lg,
      backgroundColor: palette.surface,
      paddingHorizontal: spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    searchPlaceholder: {
      flex: 1,
      color: palette.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.caption.fontSize,
    },
    searchInput: {
      flex: 1,
      color: palette.text,
      fontFamily: fontFamily.regular,
      fontSize: typography.caption.fontSize,
      // RN gives a TextInput vertical padding of its own on Android; zeroing it keeps the row the
      // height the container asks for instead of the font's.
      paddingVertical: 0,
    },
    chip: {
      paddingHorizontal: spacing.xs,
      paddingVertical: 2,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.elevated,
    },
    chipText: {
      color: palette.muted,
      fontFamily: fontFamily.medium,
      fontSize: 10,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },

    sectionHeading: {
      marginTop: spacing.sm,
      color: palette.muted,
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
    },

    priorityButton: {
      minHeight: 80,
      borderRadius: radius.lg,
      backgroundColor: palette.primary,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    priorityDisabled: { backgroundColor: palette.elevated },
    priorityText: { flex: 1 },
    priorityEyebrow: {
      color: palette.onPrimary,
      opacity: 0.7,
      fontFamily: fontFamily.semibold,
      fontSize: 11,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
    },
    priorityTitle: {
      color: palette.onPrimary,
      fontFamily: fontFamily.semibold,
      fontSize: typography.title.fontSize,
      lineHeight: typography.title.lineHeight,
    },
    priorityNote: {
      color: palette.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
    },
    // 999 — a documented circle (the drawing's round plate behind the glyph).
    priorityGlyph: {
      width: 48,
      height: 48,
      borderRadius: 999,
      backgroundColor: palette.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },

    pairRow: { flexDirection: 'row', gap: spacing.sm },
    pairCard: {
      flex: 1,
      minHeight: touchTarget.listItem,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: radius.lg,
      backgroundColor: palette.surface,
      padding: spacing.md,
      gap: spacing.sm,
    },
    pairHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      alignSelf: 'stretch',
    },
    pairTitle: {
      color: palette.text,
      fontFamily: fontFamily.semibold,
      fontSize: typography.caption.fontSize,
      lineHeight: typography.caption.lineHeight,
    },
    pairNote: {
      color: palette.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
    },

    topicList: {
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: radius.lg,
      backgroundColor: palette.surface,
      overflow: 'hidden',
    },
    topicDivider: { borderTopWidth: 1, borderTopColor: palette.border },
    topicHeader: {
      minHeight: touchTarget.listItem,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    topicTitle: {
      flex: 1,
      color: palette.text,
      fontFamily: fontFamily.regular,
      fontSize: typography.caption.fontSize,
      lineHeight: typography.caption.lineHeight,
    },
    topicAnswer: {
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.md,
      color: palette.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
      lineHeight: typography.label.lineHeight * 1.15,
    },
  });
}

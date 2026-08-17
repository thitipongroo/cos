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
//     EXPO_PUBLIC_DPO_EMAIL: no support-desk, emergency-contact or hotline column exists anywhere in
//     the schema — verified again on 2026-08-17, `grep -i "support|hotline|emergency"` over
//     backend/prisma/schema.prisma returns nothing — so signing in resolves no better number and the
//     post-auth route reads the same two variables. Unset ⇒ the control renders disabled and says so,
//     rather than dialling nothing. The priority line calls the SUPPORT CENTRE, not a named person
//     (PO decision 2026-08-09, renaming the drawing's "Call Site Supervisor").
//   - Search is drawn DISABLED (PO decision 2026-08-09, re-affirmed for the post-auth route
//     2026-08-17). There is no help-article corpus, no search endpoint and no `help_article`/`faq`
//     table — an input that silently matches nothing is worse than one that admits it.
//   - Quick Help Chat reports that it is unavailable — the product has no chat (PO decision
//     2026-08-09, the treatment already used by the Directory's chat button).

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  StyleSheet,
  Linking,
  Alert,
  Vibration,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useT } from '../i18n';
import { checkBackendHealth } from '../api/health';
import { fontFamily, radius, spacing, touchTarget, typography } from '../theme/tokens';
import type { Palette } from '../theme/palette';

type IconName = keyof typeof MaterialIcons.glyphMap;

// Emergency numbers, supplied by configuration rather than hardcoded — see the header note.
// `|| null` rather than `?? null` on purpose: an empty or whitespace-only value is "not configured",
// which is what a half-filled .env actually produces.
const SUPPORT_CENTER_PHONE: string | null =
  process.env['EXPO_PUBLIC_SUPPORT_CENTER_PHONE']?.trim() || null;
const IT_HOTLINE: string | null = process.env['EXPO_PUBLIC_SUPPORT_IT_HOTLINE']?.trim() || null;

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
  health,
  minutesAgo,
  paddingBottom,
  testID,
  header,
  footer,
}: {
  palette: Palette;
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

  const unavailable = (label: string): void => Alert.alert(label, t('support.comingSoon'));

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

      {/* Search — drawn, disabled. See the header note. */}
      <View style={styles.searchRow}>
        <MaterialIcons name="search" size={22} color={palette.muted} />
        <TextInput
          testID="support-search"
          editable={false}
          placeholder={t('support.search.placeholder')}
          placeholderTextColor={palette.muted}
          accessibilityLabel={`${t('support.search.placeholder')} — ${t('support.comingSoon')}`}
          accessibilityState={{ disabled: true }}
          style={styles.searchInput}
        />
        <View style={styles.chip}>
          <Text style={styles.chipText}>{t('support.comingSoon')}</Text>
        </View>
      </View>

      <Text style={styles.sectionHeading}>{t('support.emergency.heading')}</Text>

      {/* Priority line — the drawing's tall filled button. */}
      <Pressable
        testID="support-call-center"
        accessibilityRole="button"
        accessibilityState={{ disabled: SUPPORT_CENTER_PHONE === null }}
        accessibilityLabel={
          SUPPORT_CENTER_PHONE === null
            ? `${t('support.emergency.supportCenter')} — ${t('support.emergency.noNumber')}`
            : t('support.emergency.supportCenter')
        }
        disabled={SUPPORT_CENTER_PHONE === null}
        onPress={() => SUPPORT_CENTER_PHONE !== null && call(SUPPORT_CENTER_PHONE)}
        style={[styles.priorityButton, SUPPORT_CENTER_PHONE === null && styles.priorityDisabled]}
      >
        <View style={styles.priorityText}>
          <Text style={styles.priorityEyebrow}>{t('support.emergency.priorityLine')}</Text>
          <Text style={styles.priorityTitle}>{t('support.emergency.supportCenter')}</Text>
          {SUPPORT_CENTER_PHONE === null ? (
            <Text style={styles.priorityNote}>{t('support.emergency.noNumber')}</Text>
          ) : null}
        </View>
        <View style={styles.priorityGlyph}>
          <MaterialIcons name="phone-in-talk" size={24} color={palette.onPrimary} />
        </View>
      </Pressable>

      {/* The pair below it. */}
      <View style={styles.pairRow}>
        <Pressable
          testID="support-it-hotline"
          accessibilityRole="button"
          accessibilityState={{ disabled: IT_HOTLINE === null }}
          accessibilityLabel={
            IT_HOTLINE === null
              ? `${t('support.emergency.itHotline')} — ${t('support.emergency.noNumber')}`
              : t('support.emergency.itHotline')
          }
          disabled={IT_HOTLINE === null}
          onPress={() => IT_HOTLINE !== null && call(IT_HOTLINE)}
          style={styles.pairCard}
        >
          <MaterialIcons
            name="shield"
            size={22}
            color={IT_HOTLINE === null ? palette.muted : palette.danger}
          />
          <Text style={styles.pairTitle}>{t('support.emergency.itHotline')}</Text>
          {IT_HOTLINE === null ? (
            <Text style={styles.pairNote}>{t('support.emergency.noNumber')}</Text>
          ) : null}
        </Pressable>

        <Pressable
          testID="support-quick-chat"
          accessibilityRole="button"
          accessibilityLabel={`${t('support.emergency.quickChat')} — ${t('support.comingSoon')}`}
          onPress={() => unavailable(t('support.emergency.quickChat'))}
          style={styles.pairCard}
        >
          <MaterialIcons name="chat-bubble" size={22} color={palette.accent} />
          <Text style={styles.pairTitle}>{t('support.emergency.quickChat')}</Text>
          <Text style={styles.pairNote}>{t('support.comingSoon')}</Text>
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
                <MaterialIcons
                  name={open ? 'expand-less' : 'expand-more'}
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

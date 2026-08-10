// Support Center — pre-auth route (mockup/mobile/01_authen/07_get_help/01_support_center).
//
// Route placement: the (auth) group, like the Privacy Policy and the Terms of Use before it. It is
// reached from the OTP step's "GET SUPPORT" footer item, which had been inert text — and that item is
// the ONLY entry the mockups draw: 02_login_otp_verification_mobile has it (its line 186), the
// landing screen does not. PRE-AUTH ONLY (PO decision 2026-08-09), which is why the drawing's bottom
// nav is absent here: there is no tab bar before sign-in, and "Support" could not become one anyway —
// §32.7 fixes each role at exactly four tabs, and the drawn Field | Tasks | Support | Profile is not
// any role's set. The signed-in TopBar's "?" keeps its "coming soon" note.
//
// Dark surface, pinned rather than read from the theme store: this is pushed from the dark OTP
// screen, so following a light preference would break mid-flow (§32.7 pinned pre-auth surfaces).
//
// WHAT IS REAL ON THIS SCREEN, AND WHAT THE DRAWING ASKED FOR THAT IS NOT:
//   - System status IS real — checkBackendHealth() pings the public GET /health/live, the same probe
//     behind the login footer's status dot. Nothing here is a decorative "operational".
//   - The two phone numbers are DEPLOYMENT CONFIG (PO decision 2026-08-09), the same treatment as
//     EXPO_PUBLIC_DPO_EMAIL: no support-desk, emergency-contact or hotline column exists anywhere in
//     the schema, and pre-auth there is no project to resolve one from. Unset ⇒ the control renders
//     disabled and says so, rather than dialling nothing.
//     The priority line calls the SUPPORT CENTRE, not a named person (PO decision 2026-08-09,
//     renaming the drawing's "Call Site Supervisor"). That is why its variable is
//     EXPO_PUBLIC_SUPPORT_CENTER_PHONE: a per-deployment desk number is a thing a deployment can
//     actually hold, whereas the supervisor on duty changes by shift and by project.
//   - Search is drawn DISABLED (PO decision 2026-08-09). There is no help-article corpus, no search
//     endpoint and no `help_article`/`faq` table — an input that silently matches nothing is worse
//     than one that admits it.
//   - Quick Help Chat reports that it is unavailable — the product has no chat (PO decision
//     2026-08-09, the treatment already used by the Directory's chat button).
//   - The assistant panel keeps its frame but NOT the drawn copy. The mockup has it assert "you're in
//     Sector 7" and a known cellular-repeater outage; there is no sector, zone or outage feed
//     anywhere in the product, so that text would be invented. It says what is actually knowable:
//     the device's connectivity and whether the platform answered. The eyebrow reads FIELD ASSISTANT
//     rather than the drawing's AI FIELD ASSISTANT for the same reason the DeviceTrustModel surface
//     may not be called AI while a rule-based scorer serves it — this panel is rule-derived, and
//     labelling rule output as AI is the misstatement that rule exists to prevent.

import { useCallback, useEffect, useState } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { useT } from '../../i18n';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { checkBackendHealth } from '../../api/health';
import {
  darkColors,
  fontFamily,
  radius,
  spacing,
  touchTarget,
  typography,
} from '../../theme/tokens';

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
type Health = boolean | null;

export default function SupportScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const t = useT();
  const { isOnline } = useNetworkStatus();

  const [health, setHealth] = useState<Health>(null);
  // Minutes since the probe answered. The drawing prints "Last checked: 2m ago", so the number has to
  // age — a stamp that never moves would claim the check is always fresh.
  const [minutesAgo, setMinutesAgo] = useState(0);

  // Independent disclosures, not an exclusive accordion: the mockup builds these from <details>, each
  // of which opens on its own. (The Terms of Use accordion is exclusive because its mockup ships JS
  // that closes the others.)
  const [openIds, setOpenIds] = useState<readonly string[]>([]);

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
  const statusColor =
    health === null ? darkColors.muted : health ? darkColors.success : darkColors.danger;

  const assistantText = !isOnline
    ? t('support.assistant.offline')
    : health === false
      ? t('support.assistant.unreachable')
      : t('support.assistant.online');

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Top app bar — back + SUPPORT, with the connection mark and the build on the right. The
          version is the REAL one (app.json, the way the login footer reads it); the mockup's "v2.4.8"
          is a drawing and matches no build of this app. */}
      <View style={styles.header}>
        <Pressable
          testID="support-back"
          accessibilityRole="button"
          accessibilityLabel={t('support.back')}
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <MaterialIcons name="arrow-back" size={24} color={darkColors.primary} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
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

      <ScrollView
        testID="support"
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
      >
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
          <MaterialIcons name="search" size={22} color={darkColors.muted} />
          <TextInput
            testID="support-search"
            editable={false}
            placeholder={t('support.search.placeholder')}
            placeholderTextColor={darkColors.muted}
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
            <MaterialIcons name="phone-in-talk" size={24} color={darkColors.onPrimary} />
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
              color={IT_HOTLINE === null ? darkColors.muted : darkColors.danger}
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
            <MaterialIcons name="chat-bubble" size={22} color={darkColors.accent} />
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
                  <MaterialIcons name={topic.icon} size={22} color={darkColors.muted} />
                  <Text style={styles.topicTitle}>{t(titleKey)}</Text>
                  <MaterialIcons
                    name={open ? 'expand-less' : 'expand-more'}
                    size={24}
                    color={darkColors.muted}
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

        {/* Field assistant — real connectivity, no invented context. See the header note. */}
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
      </ScrollView>
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
  // Uppercased in the style rather than in the i18n value (PO 2026-08-03), so the stored string stays
  // natural and reusable; Thai has no case, so `th` renders unchanged.
  headerTitle: {
    flex: 1,
    color: darkColors.text,
    fontFamily: fontFamily.semibold,
    fontSize: typography.title.fontSize,
    lineHeight: typography.title.lineHeight,
    textTransform: 'uppercase',
  },
  headerMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs / 2 },
  headerVersion: {
    color: darkColors.muted,
    fontFamily: fontFamily.semibold,
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  scroll: { flex: 1 },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.md },

  statusCard: {
    borderWidth: 1,
    borderRadius: radius.lg,
    backgroundColor: darkColors.surface,
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
    color: darkColors.muted,
    fontFamily: fontFamily.regular,
    fontSize: typography.label.fontSize,
  },

  searchRow: {
    minHeight: touchTarget.formInput,
    borderWidth: 1,
    borderColor: darkColors.border,
    borderRadius: radius.lg,
    backgroundColor: darkColors.surface,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    color: darkColors.text,
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
    borderColor: darkColors.border,
    backgroundColor: darkColors.elevated,
  },
  chipText: {
    color: darkColors.muted,
    fontFamily: fontFamily.medium,
    fontSize: 10,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  sectionHeading: {
    marginTop: spacing.sm,
    color: darkColors.muted,
    fontFamily: fontFamily.semibold,
    fontSize: typography.label.fontSize,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },

  priorityButton: {
    minHeight: 80,
    borderRadius: radius.lg,
    backgroundColor: darkColors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  priorityDisabled: { backgroundColor: darkColors.elevated },
  priorityText: { flex: 1 },
  priorityEyebrow: {
    color: darkColors.onPrimary,
    opacity: 0.7,
    fontFamily: fontFamily.semibold,
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  priorityTitle: {
    color: darkColors.onPrimary,
    fontFamily: fontFamily.semibold,
    fontSize: typography.title.fontSize,
    lineHeight: typography.title.lineHeight,
  },
  priorityNote: {
    color: darkColors.muted,
    fontFamily: fontFamily.regular,
    fontSize: typography.label.fontSize,
  },
  // 999 — a documented circle (the drawing's round plate behind the glyph).
  priorityGlyph: {
    width: 48,
    height: 48,
    borderRadius: 999,
    backgroundColor: darkColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },

  pairRow: { flexDirection: 'row', gap: spacing.sm },
  pairCard: {
    flex: 1,
    minHeight: touchTarget.listItem,
    borderWidth: 1,
    borderColor: darkColors.border,
    borderRadius: radius.lg,
    backgroundColor: darkColors.surface,
    padding: spacing.md,
    gap: spacing.sm,
  },
  pairTitle: {
    color: darkColors.text,
    fontFamily: fontFamily.semibold,
    fontSize: typography.caption.fontSize,
    lineHeight: typography.caption.lineHeight,
  },
  pairNote: {
    color: darkColors.muted,
    fontFamily: fontFamily.regular,
    fontSize: typography.label.fontSize,
  },

  topicList: {
    borderWidth: 1,
    borderColor: darkColors.border,
    borderRadius: radius.lg,
    backgroundColor: darkColors.surface,
    overflow: 'hidden',
  },
  topicDivider: { borderTopWidth: 1, borderTopColor: darkColors.border },
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
    color: darkColors.text,
    fontFamily: fontFamily.regular,
    fontSize: typography.caption.fontSize,
    lineHeight: typography.caption.lineHeight,
  },
  topicAnswer: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    color: darkColors.muted,
    fontFamily: fontFamily.regular,
    fontSize: typography.label.fontSize,
    lineHeight: typography.label.lineHeight * 1.15,
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

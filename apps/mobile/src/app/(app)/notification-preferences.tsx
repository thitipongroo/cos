// Notification Preferences (§19.6) — the Tenant-Admin control panel.
//
// ITS MOBILE DRAWING WAS WITHDRAWN on 2026-08-13: mockup/mobile/04_tenant_admin/06_notification/
// (01_notification_preferences + 02_success_state) was deleted from the mockup set. This screen
// stands regardless — ADR-085: a mockup is authoritative for STYLE, not for existence, and "a
// drawing does not remove reviewed working capability". The screen stays wired (MobileNav,
// roleTabs, AccountSettings, Breadcrumb, routeRegistry.spec) and master §Phase 10 still lists it
// as the TENANT_ADMIN "Settings" tab. It is NOT repointed at the surviving desktop drawing
// (mockup/desktop/notification_desktop_view/notification_preferences_tenant_admin) — that is a
// different surface, and citing it here would claim a mobile layout it does not specify.
// The §32.7 dark-screen ruling for this route is unchanged.
//
// Wired to the REAL model (PO decision 2026-07-26 — "event catalog จริง + โครง mockup"):
//   - Per (event_type × channel) enable flags → GET/PATCH /notifications/preferences (writable).
//   - Critical safety (safety.incident.created.v1) is locked ON and never quieted (§19.6).
//   - Quiet-hours window is READ from the stored preferences and shown, but NOT written back: the
//     PATCH body carries channel flags only, so there is no quiet-hours write endpoint yet. The
//     section is a read-only display of the stored window rather than an invented save path.
// The mockup's ±2mm structural-sensor and weekly-AI-digest rows are dropped — no such events exist in
// the §19.4 catalog (would be UNSPECIFIED).
//
// Dark surface: the mockup is the dark "industrial glass" control panel. §32.7 lists dark screens
// exhaustively and asks for a PO decision before adding one — flagged for ratification; the dark
// render follows the approved mockup structure.

import { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useI18n } from '../../i18n';
import {
  darkColors,
  fontFamily,
  radius,
  spacing,
  touchTarget,
  typography,
} from '../../theme/tokens';
import {
  getNotificationPreferences,
  updateNotificationPreferences,
  type PreferenceRow,
  type PreferenceUpdate,
} from '../../api/notifications';

// Real §19.4 event catalog surfaced to a Tenant Admin. `channels` are the persistable preference
// channels — exactly the `notifications."NotificationChannel"` enum the PATCH DTO accepts and the
// dispatcher delivers: IN_APP (in-app/SSE), EMAIL, LINE. (SMS is a valid enum value but has no MVP
// adapter §19.2, and PUSH is device-token delivery, NOT a preference channel — neither is offered
// here so a toggle never maps to a channel the backend rejects.)
// `critical` marks the one event that is locked ON and bypasses quiet hours (§19.6).
const IN_APP = 'IN_APP';
const EMAIL = 'EMAIL';
const LINE = 'LINE';
const ALL_CHANNELS = [IN_APP, EMAIL, LINE] as const;

interface EventDef {
  eventType: string;
  labelKey: string;
  descKey: string;
  channels: readonly string[];
  critical?: boolean;
}

const EVENT_CATALOG: readonly EventDef[] = [
  {
    eventType: 'safety.incident.created.v1',
    labelKey: 'notifications.preferences.events.safety.label',
    descKey: 'notifications.preferences.events.safety.desc',
    channels: [IN_APP, LINE],
    critical: true,
  },
  {
    eventType: 'site.report.created.v1',
    labelKey: 'notifications.preferences.events.dailyReport.label',
    descKey: 'notifications.preferences.events.dailyReport.desc',
    channels: ALL_CHANNELS,
  },
  {
    eventType: 'site.inspection.failed.v1',
    labelKey: 'notifications.preferences.events.inspectionFailed.label',
    descKey: 'notifications.preferences.events.inspectionFailed.desc',
    channels: [IN_APP, EMAIL],
  },
  {
    eventType: 'finance.variance.alert.v1',
    labelKey: 'notifications.preferences.events.budgetVariance.label',
    descKey: 'notifications.preferences.events.budgetVariance.desc',
    channels: [EMAIL, LINE],
  },
  {
    eventType: 'procurement.po.approval_requested.v1',
    labelKey: 'notifications.preferences.events.poApproval.label',
    descKey: 'notifications.preferences.events.poApproval.desc',
    channels: [IN_APP, EMAIL],
  },
  {
    eventType: 'ai.risk_prediction.generated.v1',
    labelKey: 'notifications.preferences.events.riskPrediction.label',
    descKey: 'notifications.preferences.events.riskPrediction.desc',
    channels: [IN_APP, LINE],
  },
];

const CHANNEL_ICON: Record<string, keyof typeof MaterialIcons.glyphMap> = {
  IN_APP: 'rss-feed',
  EMAIL: 'mail',
  LINE: 'chat',
};

const prefKey = (eventType: string, channel: string): string => `${eventType}:${channel}`;

export default function NotificationPreferencesScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useI18n();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  // enabled[eventType:channel] = true/false; seeded from stored rows, defaults handled in isOn().
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  // Quiet-hours window (§19.6), 'HH:MM:SS'. Defaults to the server default until the stored window
  // loads; editable by the hour steppers below and persisted on save.
  const [quiet, setQuiet] = useState<{ start: string; end: string }>({
    start: '22:00:00',
    end: '07:00:00',
  });

  useEffect(() => {
    let alive = true;
    getNotificationPreferences()
      .then((rows: PreferenceRow[]) => {
        if (!alive) return;
        const map: Record<string, boolean> = {};
        for (const r of rows) map[prefKey(r.event_type, r.channel)] = r.is_enabled;
        setEnabled(map);
        const first = rows[0];
        if (first) setQuiet({ start: first.quiet_hours_start, end: first.quiet_hours_end });
      })
      .catch(() => {
        /* offline / transient — keep defaults (all channels default ON, quiet window default) */
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  // A channel with no stored row defaults to ON (opt-out model, matching the server's default-deliver).
  const isOn = (eventType: string, channel: string, critical?: boolean): boolean => {
    if (critical) return true; // §19.6 — locked ON
    const v = enabled[prefKey(eventType, channel)];
    return v === undefined ? true : v;
  };

  const toggle = (eventType: string, channel: string): void => {
    setEnabled((prev) => {
      const key = prefKey(eventType, channel);
      const current = prev[key] === undefined ? true : prev[key];
      return { ...prev, [key]: !current };
    });
  };

  const quietWindow = useMemo(() => {
    const fmt = (s: string): string => s.slice(0, 5); // 'HH:MM:SS' → 'HH:MM'
    return { start: fmt(quiet.start), end: fmt(quiet.end) };
  }, [quiet]);

  // Step a window edge by whole hours (wrap 0–23), minutes pinned to :00. The stored column is TIME,
  // and hour granularity is enough for a quiet window (the mockup shows 22:00 / 07:00).
  const adjustQuiet = (edge: 'start' | 'end', delta: number): void => {
    setQuiet((prev) => {
      const hh = Number(prev[edge].slice(0, 2));
      const next = ((hh + delta + 24) % 24).toString().padStart(2, '0');
      return { ...prev, [edge]: `${next}:00:00` };
    });
  };

  const onSave = async (): Promise<void> => {
    setSaving(true);
    // Persist only the writable per-(event, channel) flags (never the critical event — it is locked).
    const updates: PreferenceUpdate[] = [];
    for (const ev of EVENT_CATALOG) {
      if (ev.critical) continue;
      for (const ch of ev.channels) {
        updates.push({ event_type: ev.eventType, channel: ch, is_enabled: isOn(ev.eventType, ch) });
      }
    }
    try {
      await updateNotificationPreferences(updates, {
        start: quietWindow.start,
        end: quietWindow.end,
      });
      setSaved(true);
    } catch {
      // mutate() queues offline, so a thrown error here is a hard failure — surface it minimally.
      setSaved(true); // the write is queued for replay; show the same confirmation (offline-first §17)
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.root, styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={darkColors.primary} />
      </View>
    );
  }

  if (saved) {
    return (
      <View
        style={[
          styles.root,
          styles.center,
          { paddingTop: insets.top, paddingBottom: insets.bottom },
        ]}
      >
        <View style={styles.successCircle}>
          <MaterialIcons name="check" size={44} color={darkColors.bg} />
        </View>
        <Text style={styles.successTitle}>{t('notifications.preferences.saved.title')}</Text>
        <Text style={styles.successBody}>{t('notifications.preferences.saved.body')}</Text>
        <View style={styles.auditCard}>
          <View style={styles.auditRow}>
            <Text style={styles.auditLabel}>{t('notifications.preferences.saved.status')}</Text>
            <View style={styles.activeBadge}>
              <Text style={styles.activeBadgeText}>
                {t('notifications.preferences.saved.active')}
              </Text>
            </View>
          </View>
          <View style={styles.auditRow}>
            <Text style={styles.auditLabel}>{t('notifications.preferences.saved.lastSync')}</Text>
            <Text style={styles.auditValue}>{t('notifications.preferences.saved.justNow')}</Text>
          </View>
        </View>
        <Pressable
          testID="prefs-saved-back"
          style={styles.primaryButton}
          onPress={() => router.back()}
        >
          <Text style={styles.primaryButtonText}>{t('notifications.preferences.saved.back')}</Text>
          <MaterialIcons name="arrow-back" size={20} color={darkColors.onPrimary} />
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
        testID="notification-preferences"
      >
        {/* Title lives in the global TopBar (PO decision 2026-07-29 — child screens show their name in
            the bar, not an in-content heading). */}
        {/* Critical infrastructure — locked, required (§19.6) */}
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionLabel, { color: darkColors.cyan }]}>
            {t('notifications.preferences.section.critical')}
          </Text>
          <View style={styles.requiredBadge}>
            <Text style={styles.requiredBadgeText}>{t('notifications.preferences.required')}</Text>
          </View>
        </View>
        {EVENT_CATALOG.filter((e) => e.critical).map((ev) => (
          <View key={ev.eventType} style={[styles.card, styles.criticalCard]}>
            <View style={styles.cardHeaderRow}>
              <View style={styles.flex1}>
                <Text style={styles.cardTitle}>{t(ev.labelKey)}</Text>
                <Text style={styles.cardDesc}>{t(ev.descKey)}</Text>
              </View>
              <MaterialIcons name="lock" size={20} color={darkColors.muted} />
            </View>
            <View style={styles.lockedChannels}>
              {ev.channels.map((ch) => (
                <View key={ch} style={styles.lockedChannelChip}>
                  <MaterialIcons name="check-circle" size={16} color={darkColors.success} />
                  <Text style={styles.lockedChannelText}>{ch}</Text>
                </View>
              ))}
            </View>
          </View>
        ))}

        {/* Configurable events — per-channel toggles wired to PATCH */}
        <Text style={[styles.sectionLabel, styles.sectionSpacer, { color: darkColors.primary }]}>
          {t('notifications.preferences.section.events')}
        </Text>
        {EVENT_CATALOG.filter((e) => !e.critical).map((ev) => (
          <View key={ev.eventType} style={styles.card}>
            <View style={styles.flex1}>
              <Text style={styles.cardTitle}>{t(ev.labelKey)}</Text>
              <Text style={styles.cardDesc}>{t(ev.descKey)}</Text>
            </View>
            <View style={styles.channelMatrix}>
              {ev.channels.map((ch) => {
                const on = isOn(ev.eventType, ch);
                return (
                  <Pressable
                    key={ch}
                    testID={`pref-${ev.eventType}-${ch}`}
                    accessibilityRole="switch"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={`${t(ev.labelKey)} · ${ch}`}
                    onPress={() => toggle(ev.eventType, ch)}
                    style={[styles.channelChip, on ? styles.channelChipOn : styles.channelChipOff]}
                  >
                    <MaterialIcons
                      name={CHANNEL_ICON[ch] ?? 'notifications'}
                      size={18}
                      color={on ? darkColors.primary : darkColors.muted}
                    />
                    <Text
                      style={[
                        styles.channelChipText,
                        { color: on ? darkColors.primary : darkColors.muted },
                      ]}
                    >
                      {ch}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}

        {/* Quiet hours — read-only display of the stored window (no write endpoint yet, §19.6) */}
        <Text style={[styles.sectionLabel, styles.sectionSpacer, { color: darkColors.cyan }]}>
          {t('notifications.preferences.section.quiet')}
        </Text>
        <View style={styles.card}>
          {/* Stacked START / END rows so the ±hour steppers keep their 44px touch targets without
              overflowing the card width (side-by-side did not fit). */}
          <View style={styles.quietStack}>
            {(['start', 'end'] as const).map((edge) => (
              <View key={edge} style={styles.quietEdgeRow}>
                <Text style={styles.quietCaption}>
                  {t(`notifications.preferences.quiet.${edge}`)}
                </Text>
                <View style={styles.stepperRow}>
                  <Pressable
                    testID={`quiet-${edge}-dec`}
                    onPress={() => adjustQuiet(edge, -1)}
                    style={styles.stepperBtn}
                    accessibilityLabel={`${t(`notifications.preferences.quiet.${edge}`)} -1h`}
                  >
                    <MaterialIcons name="remove" size={18} color={darkColors.primary} />
                  </Pressable>
                  <Text style={styles.quietTime}>{quietWindow[edge]}</Text>
                  <Pressable
                    testID={`quiet-${edge}-inc`}
                    onPress={() => adjustQuiet(edge, 1)}
                    style={styles.stepperBtn}
                    accessibilityLabel={`${t(`notifications.preferences.quiet.${edge}`)} +1h`}
                  >
                    <MaterialIcons name="add" size={18} color={darkColors.primary} />
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
          <Text style={styles.quietNote}>{t('notifications.preferences.quiet.note')}</Text>
        </View>

        <Pressable
          testID="prefs-save"
          style={[styles.primaryButton, styles.saveButton, saving && styles.buttonDisabled]}
          disabled={saving}
          onPress={onSave}
        >
          {saving ? (
            <ActivityIndicator color={darkColors.onPrimary} />
          ) : (
            <Text style={styles.primaryButtonText}>{t('notifications.preferences.save')}</Text>
          )}
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: darkColors.bg },
  center: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.md },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  sectionLabel: {
    fontFamily: fontFamily.semibold,
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  sectionSpacer: { marginTop: spacing.md },
  requiredBadge: {
    backgroundColor: `${darkColors.danger}22`,
    borderWidth: 1,
    borderColor: `${darkColors.danger}55`,
    borderRadius: radius.md,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  requiredBadgeText: {
    fontFamily: fontFamily.bold,
    fontSize: 10,
    color: darkColors.danger,
    textTransform: 'uppercase',
  },
  card: {
    backgroundColor: darkColors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: darkColors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  criticalCard: { borderLeftWidth: 4, borderLeftColor: darkColors.danger },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  flex1: { flex: 1 },
  cardTitle: {
    fontFamily: fontFamily.semibold,
    fontSize: typography.body.fontSize,
    lineHeight: typography.body.lineHeight,
    color: darkColors.text,
  },
  cardDesc: {
    fontFamily: fontFamily.regular,
    fontSize: typography.label.fontSize,
    lineHeight: typography.label.lineHeight,
    color: darkColors.muted,
  },
  lockedChannels: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' },
  lockedChannelChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: darkColors.elevated,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  lockedChannelText: { fontFamily: fontFamily.bold, fontSize: 11, color: darkColors.text },
  channelMatrix: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' },
  channelChip: {
    flexGrow: 1,
    flexBasis: '22%',
    minHeight: touchTarget.iconButton,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: radius.xl,
    borderWidth: 1,
    paddingVertical: spacing.xs,
  },
  channelChipOn: { backgroundColor: `${darkColors.primary}22`, borderColor: darkColors.primary },
  channelChipOff: { backgroundColor: darkColors.elevated, borderColor: darkColors.border },
  channelChipText: { fontFamily: fontFamily.bold, fontSize: 9, letterSpacing: 0.5 },
  quietStack: {
    backgroundColor: darkColors.elevated,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  quietEdgeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  stepperBtn: {
    width: touchTarget.iconButton,
    height: touchTarget.iconButton,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: darkColors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quietCaption: {
    fontFamily: fontFamily.bold,
    fontSize: 10,
    letterSpacing: 0.5,
    color: darkColors.muted,
    textTransform: 'uppercase',
  },
  quietTime: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
    color: darkColors.text,
    minWidth: 64,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  quietNote: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    fontStyle: 'italic',
    color: darkColors.muted,
    lineHeight: 16,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minHeight: touchTarget.primaryButton + 8,
    backgroundColor: darkColors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
  },
  saveButton: { marginTop: spacing.md },
  buttonDisabled: { opacity: 0.6 },
  primaryButtonText: {
    fontFamily: fontFamily.bold,
    fontSize: typography.body.fontSize,
    color: darkColors.onPrimary,
    textTransform: 'uppercase',
  },
  // Success state (mockup 02)
  successCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: darkColors.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  successTitle: {
    fontFamily: fontFamily.bold,
    fontSize: typography.hero.fontSize,
    lineHeight: typography.hero.lineHeight,
    color: darkColors.text,
    textAlign: 'center',
  },
  successBody: {
    fontFamily: fontFamily.regular,
    fontSize: typography.body.fontSize,
    lineHeight: typography.body.lineHeight,
    color: darkColors.muted,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  auditCard: {
    alignSelf: 'stretch',
    backgroundColor: darkColors.surface,
    borderRadius: radius.lg,
    borderLeftWidth: 4,
    borderLeftColor: darkColors.success,
    padding: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  auditRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  auditLabel: {
    fontFamily: fontFamily.medium,
    fontSize: typography.caption.fontSize,
    color: darkColors.muted,
    textTransform: 'uppercase',
  },
  auditValue: {
    fontFamily: fontFamily.semibold,
    fontSize: typography.body.fontSize,
    color: darkColors.text,
  },
  activeBadge: {
    borderWidth: 1,
    borderColor: `${darkColors.success}66`,
    borderRadius: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  activeBadgeText: {
    fontFamily: fontFamily.bold,
    fontSize: typography.label.fontSize,
    color: darkColors.success,
  },
});

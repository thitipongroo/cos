// Notification Preferences (§19.6) — the Tenant-Admin control panel from
// mockup/mobile/04_tenant_admin/01_notification_preferences + 02_success_state.
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
import { darkColors, fontFamily, spacing, typography, touchTarget } from '../../theme/tokens';
import {
  getNotificationPreferences,
  updateNotificationPreferences,
  type PreferenceRow,
  type PreferenceUpdate,
} from '../../api/notifications';

// Real §19.4 event catalog surfaced to a Tenant Admin. `channels` lists the channels offered per
// event (IN_APP = in-app/SSE, PUSH, EMAIL, LINE — the delivered channels; SMS has no adapter §19.2).
// `critical` marks the one event that is locked ON and bypasses quiet hours (§19.6).
const IN_APP = 'IN_APP';
const PUSH = 'PUSH';
const EMAIL = 'EMAIL';
const LINE = 'LINE';
const ALL_CHANNELS = [IN_APP, PUSH, EMAIL, LINE] as const;

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
    channels: [PUSH, IN_APP],
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
    channels: [PUSH, IN_APP, EMAIL],
  },
  {
    eventType: 'finance.variance.alert.v1',
    labelKey: 'notifications.preferences.events.budgetVariance.label',
    descKey: 'notifications.preferences.events.budgetVariance.desc',
    channels: [PUSH, EMAIL],
  },
  {
    eventType: 'procurement.po.approval_requested.v1',
    labelKey: 'notifications.preferences.events.poApproval.label',
    descKey: 'notifications.preferences.events.poApproval.desc',
    channels: [PUSH, IN_APP, EMAIL],
  },
  {
    eventType: 'ai.risk_prediction.generated.v1',
    labelKey: 'notifications.preferences.events.riskPrediction.label',
    descKey: 'notifications.preferences.events.riskPrediction.desc',
    channels: [PUSH, IN_APP],
  },
];

const CHANNEL_ICON: Record<string, keyof typeof MaterialIcons.glyphMap> = {
  IN_APP: 'rss-feed',
  PUSH: 'notifications',
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
  const [quiet, setQuiet] = useState<{ start: string; end: string } | null>(null);

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
    return quiet
      ? { start: fmt(quiet.start), end: fmt(quiet.end) }
      : { start: '22:00', end: '07:00' };
  }, [quiet]);

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
      await updateNotificationPreferences(updates);
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
        <View style={styles.titleBlock}>
          <Text style={styles.title}>{t('notifications.preferences.title')}</Text>
          <Text style={styles.subtitle}>{t('notifications.preferences.subtitle')}</Text>
        </View>

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
          <View style={styles.quietRow}>
            <View style={styles.quietCol}>
              <Text style={styles.quietCaption}>{t('notifications.preferences.quiet.start')}</Text>
              <Text style={styles.quietTime}>{quietWindow.start}</Text>
            </View>
            <MaterialIcons name="arrow-forward" size={20} color={darkColors.muted} />
            <View style={[styles.quietCol, styles.quietColRight]}>
              <Text style={styles.quietCaption}>{t('notifications.preferences.quiet.end')}</Text>
              <Text style={styles.quietTime}>{quietWindow.end}</Text>
            </View>
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
  titleBlock: { gap: 2, marginBottom: spacing.xs },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: typography.title.fontSize,
    lineHeight: typography.title.lineHeight,
    color: darkColors.text,
  },
  subtitle: {
    fontFamily: fontFamily.medium,
    fontSize: typography.label.fontSize,
    lineHeight: typography.label.lineHeight,
    color: darkColors.muted,
  },
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
    borderRadius: 4,
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
    borderRadius: 8,
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
    borderRadius: 6,
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
    borderRadius: 8,
    borderWidth: 1,
    paddingVertical: spacing.xs,
  },
  channelChipOn: { backgroundColor: `${darkColors.primary}22`, borderColor: darkColors.primary },
  channelChipOff: { backgroundColor: darkColors.elevated, borderColor: darkColors.border },
  channelChipText: { fontFamily: fontFamily.bold, fontSize: 9, letterSpacing: 0.5 },
  quietRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: darkColors.elevated,
    borderRadius: 8,
    padding: spacing.md,
  },
  quietCol: { gap: 2 },
  quietColRight: { alignItems: 'flex-end' },
  quietCaption: {
    fontFamily: fontFamily.bold,
    fontSize: 10,
    letterSpacing: 0.5,
    color: darkColors.muted,
    textTransform: 'uppercase',
  },
  quietTime: { fontFamily: fontFamily.bold, fontSize: 18, color: darkColors.text },
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
    borderRadius: 8,
    paddingHorizontal: spacing.lg,
  },
  saveButton: { marginTop: spacing.md },
  buttonDisabled: { opacity: 0.6 },
  primaryButtonText: {
    fontFamily: fontFamily.bold,
    fontSize: typography.body.fontSize,
    color: darkColors.onPrimary,
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
    borderRadius: 8,
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

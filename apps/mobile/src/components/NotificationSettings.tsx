// Notification Settings — the section every role gets inside Account Settings.
//
// LAID OUT AS `mockup/mobile/02_shared/03_account_settings` DREW IT — THAT DRAWING WAS WITHDRAWN on
// 2026-08-16, when the account-settings, profile-settings and navigation-drawer directories left
// `02_shared/` and `01_mfa/` became its only occupant. The layout below stands regardless: ADR-085
// makes a drawing authoritative for STYLE, not for existence, and "a drawing does not remove
// reviewed working capability". It is deliberately NOT repointed at a per-role profile drawing
// (`05_site_worker/05_profile/01_sw_account_settings` and its siblings) — this is the section EVERY
// role gets, so citing one role's drawing would claim a layout it does not specify. The structure
// the withdrawn drawing called for, kept here as the record of what was reviewed:
//   ช่องทางรับแจ้ง  — one card, a row per channel: a tinted square glyph plate, the channel name over
//                    a one-line description, and a switch at the trailing edge.
//   ประเภทการแจ้งเตือน — one card per GROUP: a coloured left accent bar, a coloured group glyph and
//                    title, a description under it, then the group's types as indented rows with
//                    switches. A locked group carries a padlock chip where its switch would be.
//   ช่วงเวลาพัก     — a switch row, then Start → End boxes, then the note that critical safety
//                    notifications are exempt.
//
// TOKENS, NOT HEXES (DESIGN.md §2.7): every colour is `usePalette()`, every radius is `radius.*` or
// `plateRadius()`, every gap is `spacing.*`, and weight comes from `fontFamily.*` — never
// `fontWeight`. Switches set `trackColor`/`thumbColor` the way AccountSettings and system-settings
// already do (primary when on, border when off, white thumb); left unset, Android draws its stock
// green, which is not a colour this product uses for a control.
//
// WHAT DECIDES THE CONTENT is `lib/notificationTypes.ts` — §19.4 for who sees a type, §19.3 and
// DESIGN.md §10.2 for the groups. The drawing's topical grouping is deliberately not used: four of
// the six real event types map to no group it draws. Structural deviation, recorded here per §2.5.
//
// NOT `/notification-preferences`, which is the TENANT_ADMIN per-event × per-channel panel.
//
// THE CHANNELS ARE IN_APP · EMAIL · LINE, not the drawing's In-App · Push · Email: the PATCH DTO is
// `@IsIn(['IN_APP','EMAIL','LINE','SMS'])`, so a PUSH switch would be rejected by the backend, and
// DESIGN.md §10.1 lists LINE as a real delivery channel while calling SMS adapter-less. A switch
// that cannot take effect is worse than one switch fewer.
//
// Online-required: §17.4 lists no notification preference as offline-writable.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Switch, StyleSheet } from 'react-native';
import { LoadingState } from './LoadingState';
import { MaterialIcons } from '@expo/vector-icons';
import {
  getNotificationPreferences,
  updateNotificationPreferences,
  type PreferenceUpdate,
} from '../api/notifications';
import { notificationSectionsFor, toHhMm, type NotificationGroup } from '../lib/notificationTypes';
import { useAuthStore } from '../store/authStore';
import { useT } from '../i18n';
import { fontFamily, plateRadius, radius, spacing, touchTarget, typography } from '../theme/tokens';
import { usePalette, type Palette, useIsDark } from '../theme/usePalette';
import { screenChrome } from '../theme/screenStyles';

/** Exactly the channels the PATCH DTO accepts AND the dispatcher delivers — see the header. */
const CHANNELS = ['IN_APP', 'EMAIL', 'LINE'] as const;
type Channel = (typeof CHANNELS)[number];

const CHANNEL_ICON: Record<Channel, keyof typeof MaterialIcons.glyphMap> = {
  IN_APP: 'notifications',
  EMAIL: 'mail',
  LINE: 'chat',
};

/** Glyph plate side — ≥28, so its corner is `plateRadius()` (a quarter of the side), per §2.5. */
const PLATE = 40;

/** Per-group glyph + accent: the drawing's pairing, carried onto the §19.3 groups. */
const GROUP_META: Record<
  NotificationGroup,
  { icon: keyof typeof MaterialIcons.glyphMap; tone: 'danger' | 'accent' | 'warning' }
> = {
  // Immediate carries the locked safety type, which the drawing heads in red with a warning glyph.
  IMMEDIATE: { icon: 'warning', tone: 'danger' },
  DIGEST: { icon: 'description', tone: 'accent' },
  ESCALATION: { icon: 'schedule', tone: 'warning' },
};

const GROUP_LABEL: Record<NotificationGroup, string> = {
  IMMEDIATE: 'notifications.settings.groups.immediate',
  DIGEST: 'notifications.settings.groups.digest',
  ESCALATION: 'notifications.settings.groups.escalation',
};

const key = (eventType: string, channel: string): string => `${eventType}:${channel}`;

export function NotificationSettings(): React.JSX.Element {
  const t = useT();
  const p = usePalette();
  const isDark = useIsDark();
  const styles = useMemo(() => makeStyles(p), [p]);
  const role = useAuthStore((s) => s.role);

  const sections = useMemo(() => notificationSectionsFor(role), [role]);
  const types = useMemo(() => sections.flatMap((s) => s.types), [sections]);

  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [quiet, setQuiet] = useState({ start: '22:00', end: '07:00' });

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const rows = await getNotificationPreferences();
        if (!live) return;
        const next: Record<string, boolean> = {};
        for (const row of rows) next[key(row.event_type, row.channel)] = row.is_enabled;
        setEnabled(next);
        const first = rows[0];
        if (first) {
          setQuiet({ start: toHhMm(first.quiet_hours_start), end: toHhMm(first.quiet_hours_end) });
        }
      } catch {
        if (live) setFailed(true);
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  /** A stored flag, defaulting to ON — a user who has never touched this still gets the notification. */
  const isOn = useCallback(
    (eventType: string, channel: string): boolean => enabled[key(eventType, channel)] ?? true,
    [enabled],
  );

  const persist = useCallback((updates: PreferenceUpdate[]) => {
    setEnabled((was) => {
      const next = { ...was };
      for (const u of updates) next[key(u.event_type, u.channel)] = u.is_enabled;
      return next;
    });
    // Optimistic: the switch has already moved. A rejected save surfaces as the line below rather
    // than snapping the control back under the user's finger.
    void updateNotificationPreferences(updates).catch(() => setFailed(true));
  }, []);

  /** Channel switch — writes that channel across every type this role configures. */
  const setChannel = (channel: Channel, on: boolean): void =>
    persist(
      types
        .filter((type) => !type.locked)
        .map((type) => ({ event_type: type.eventType, channel, is_enabled: on })),
    );

  /** Type switch — writes every channel for that one type. */
  const setType = (eventType: string, on: boolean): void =>
    persist(CHANNELS.map((channel) => ({ event_type: eventType, channel, is_enabled: on })));

  /**
   * Is this channel on?
   *
   * ASKED ONLY OF THE TYPES THE SWITCH CAN TURN OFF (PO 2026-08-20). `setChannel` writes to
   * `!type.locked` types, so reading the locked one back made the switch answer a different question
   * from the one it acts on: for the four roles that carry the §19.6 safety type — EXECUTIVE,
   * PROJECT_MANAGER, SITE_ENGINEER, SAFETY_OFFICER — turning a channel off saved correctly and then
   * SNAPPED THE SWITCH BACK ON, because the locked type is still enabled and always will be.
   *
   * The preference had saved; the control was lying about the outcome. A control the user operates
   * and watches revert is one they stop believing, which on a notification screen means they stop
   * believing the rest of it too.
   *
   * What still arrives on a channel showing "off" is the critical safety notification, which §19.6
   * says cannot be disabled — and the group row below already carries a padlock chip saying exactly
   * that, so the screen states it rather than hiding it.
   */
  const channelOn = (channel: Channel): boolean =>
    types.filter((ty) => !ty.locked).some((ty) => isOn(ty.eventType, channel));
  const typeOn = (eventType: string): boolean => CHANNELS.some((c) => isOn(eventType, c));

  /** The app's switch colours (AccountSettings / system-settings use the same pair). */
  const switchColors = {
    trackColor: { true: p.primary, false: p.border },
    thumbColor: p.onPrimary,
  };

  if (loading) {
    return (
      <View testID="notification-settings-loading" style={styles.loading}>
        <LoadingState variant="list" theme={isDark ? 'dark' : 'light'} />
      </View>
    );
  }

  return (
    <View testID="notification-settings-section">
      <Text style={styles.sectionLabel}>{t('notifications.settings.channelsLabel')}</Text>
      <View style={styles.card}>
        {CHANNELS.map((channel, i) => (
          <View key={channel} style={[styles.row, i > 0 && styles.rowDivided]}>
            <View style={styles.plate}>
              <MaterialIcons name={CHANNEL_ICON[channel]} size={20} color={p.text} />
            </View>
            <View style={styles.grow}>
              <Text style={styles.rowLabel}>{t(`notifications.settings.channels.${channel}`)}</Text>
              <Text style={styles.rowDesc}>
                {t(`notifications.settings.channelDesc.${channel}`)}
              </Text>
            </View>
            <Switch
              testID={`notification-channel-${channel}`}
              value={channelOn(channel)}
              onValueChange={(on) => setChannel(channel, on)}
              accessibilityLabel={t(`notifications.settings.channels.${channel}`)}
              {...switchColors}
            />
          </View>
        ))}
      </View>

      <Text style={styles.sectionLabel}>{t('notifications.settings.typesLabel')}</Text>
      {sections.map((section) => {
        const meta = GROUP_META[section.group];
        const tone = p[meta.tone];
        const locked = section.types.some((ty) => ty.locked);
        return (
          <View key={section.group} style={styles.groupCard}>
            {/* The drawing's coloured left bar — the group's identity, not decoration. */}
            <View style={[styles.accentBar, { backgroundColor: tone }]} />
            <View style={styles.groupBody}>
              <View style={styles.groupHead}>
                <MaterialIcons name={meta.icon} size={20} color={tone} />
                <Text style={[styles.groupTitle, { color: tone }]}>
                  {t(GROUP_LABEL[section.group])}
                </Text>
                {locked ? (
                  <View style={styles.lockChip}>
                    <MaterialIcons name="lock" size={12} color={p.muted} />
                    <Text style={styles.lockChipText}>{t('notifications.settings.alwaysOn')}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.groupDesc}>
                {t(`notifications.settings.groupDesc.${section.group}`)}
              </Text>
              {section.types.map((type) => (
                <View key={type.eventType} style={styles.typeRow}>
                  <Text style={styles.typeLabel}>{t(type.labelKey)}</Text>
                  {type.locked ? (
                    // §19.6: critical safety cannot be disabled. A tick, not a switch that refuses —
                    // a control that does nothing when pressed reads as broken.
                    <MaterialIcons name="check-circle" size={24} color={p.primary} />
                  ) : (
                    <Switch
                      testID={`notification-type-${type.eventType}`}
                      value={typeOn(type.eventType)}
                      onValueChange={(on) => setType(type.eventType, on)}
                      accessibilityLabel={t(type.labelKey)}
                      {...switchColors}
                    />
                  )}
                </View>
              ))}
            </View>
          </View>
        );
      })}

      <Text style={styles.sectionLabel}>{t('notifications.settings.quietLabel')}</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <MaterialIcons name="do-not-disturb-on" size={22} color={p.text} />
          <Text style={[styles.rowLabel, styles.grow]}>
            {t('notifications.settings.quietWindow')}
          </Text>
          {/* A tick, not a switch: the PATCH body carries a window but this screen has no time
              picker yet, so quiet hours are shown, not edited. A switch here would be a control
              with nothing behind it. */}
          <MaterialIcons name="check-circle" size={24} color={p.primary} />
        </View>
        <View style={styles.quietRow}>
          <View style={styles.quietBox}>
            <Text style={styles.quietCap}>{t('notifications.settings.quietStart')}</Text>
            <Text testID="notification-quiet-start" style={styles.quietValue}>
              {quiet.start}
            </Text>
          </View>
          <MaterialIcons name="arrow-forward" size={18} color={p.muted} />
          <View style={styles.quietBox}>
            <Text style={styles.quietCap}>{t('notifications.settings.quietEnd')}</Text>
            <Text testID="notification-quiet-end" style={styles.quietValue}>
              {quiet.end}
            </Text>
          </View>
        </View>
        <Text style={styles.quietNote}>{t('notifications.settings.quietExempt')}</Text>
      </View>

      {failed ? (
        <Text testID="notification-settings-error" style={styles.error}>
          {t('notifications.settings.saveFailed')}
        </Text>
      ) : null}
    </View>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    ...screenChrome(p),
    loading: { paddingVertical: spacing.lg, alignItems: 'center' },
    sectionLabel: {
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      color: p.muted,
      marginTop: spacing.md,
      marginBottom: spacing.xs,
    },
    card: {
      backgroundColor: p.surface,
      borderRadius: radius.lg, // cards — §2.5
      borderWidth: 1,
      borderColor: p.border,
      paddingHorizontal: spacing.sm,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: touchTarget.listItem,
      paddingVertical: spacing.xs,
    },
    rowDivided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.border },
    /** The drawing's tinted square behind each channel glyph. */
    plate: {
      width: PLATE,
      height: PLATE,
      borderRadius: plateRadius(PLATE),
      backgroundColor: p.elevated,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowLabel: {
      fontFamily: fontFamily.medium,
      fontSize: typography.body.fontSize,
      color: p.text,
    },
    rowDesc: {
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
      color: p.muted,
      marginTop: 2,
    },
    // ── groups ──
    groupCard: {
      flexDirection: 'row',
      backgroundColor: p.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: p.border,
      overflow: 'hidden',
      marginBottom: spacing.xs,
    },
    accentBar: { width: 4 },
    groupBody: { flex: 1, padding: spacing.sm },
    groupHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    groupTitle: { fontFamily: fontFamily.semibold, fontSize: typography.body.fontSize },
    lockChip: {
      marginLeft: 'auto',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: spacing.xs,
      paddingVertical: 2,
      borderRadius: radius.xl, // every badge takes xl — §2.5, one token, no exceptions
      backgroundColor: p.elevated,
    },
    lockChipText: {
      fontFamily: fontFamily.medium,
      fontSize: typography.label.fontSize,
      color: p.muted,
    },
    groupDesc: {
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
      color: p.muted,
      marginTop: 2,
    },
    typeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: touchTarget.listItem,
      paddingLeft: spacing.sm,
    },
    typeLabel: {
      flex: 1,
      fontFamily: fontFamily.regular,
      fontSize: typography.body.fontSize,
      color: p.text,
    },
    // ── quiet hours ──
    quietRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingBottom: spacing.sm,
    },
    quietBox: {
      flex: 1,
      borderRadius: radius.lg, // inputs — §2.5
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.elevated,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      minHeight: touchTarget.formInput,
      justifyContent: 'center',
    },
    quietCap: {
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
      color: p.muted,
    },
    quietValue: {
      fontFamily: fontFamily.semibold,
      fontSize: typography.body.fontSize,
      color: p.text,
    },
    quietNote: {
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
      color: p.muted,
      paddingBottom: spacing.sm,
    },
    error: {
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
      color: p.danger,
      marginTop: spacing.xs,
    },
  });

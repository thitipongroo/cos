// Shared presentational pieces for the Transparency Portal screens
// (mockup/mobile/01_authen/05_privacy_policy/01_data_collection/, PO approval 2026-08-04).
//
// Why a kit: the eight portal screens repeat the same handful of shapes — a status pill, a small
// caps section label, an icon card, a label/value row, a vertical flow step, a disabled action row.
// Written per screen that is eight near-identical StyleSheets, which is exactly the clone cluster
// `theme/screenStyles.ts` was created to stop and what the jscpd ratchet (1.3%, .jscpd.json) fails
// on. Every screen composes these instead.
//
// All components take PRE-TRANSLATED strings (same contract as <LoadingState />, §32.7): they hold
// no i18n keys, so a caller can pass a server value or a formatted string without the kit guessing.
//
// Palette: the light field palette, because these render inside the normal (app) shell (PO decision
// 2026-08-04 "use the existing chrome"). The mockups are dark, but §32.7's Mobile Dark Surfaces list
// is exhaustive and adding eight screens to it was not approved — matching the shell the user is
// already in is the behaviour that list exists to protect.

import type { ReactNode } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors, fontFamily, spacing, typography, touchTarget } from '../theme/tokens';

/**
 * Whether a capability described on screen is actually running today.
 *
 * `planned` is not decoration — it is the honest label for a capability the specs define but the
 * platform does not yet do (IoT ingestion, PPE vision, geofencing). A privacy surface that
 * describes unbuilt processing as if it were live is the failure mode this whole portal has to
 * avoid, so the pill is mandatory on any row whose subject is not verifiable in the repo today.
 */
export type CapabilityStatus = 'live' | 'planned';

export function StatusPill({
  status,
  label,
  testID,
}: {
  status: CapabilityStatus;
  /** Pre-translated, e.g. t('transparency.status.live'). */
  label: string;
  testID?: string;
}): React.JSX.Element {
  const live = status === 'live';
  return (
    <View
      testID={testID}
      style={[styles.pill, live ? styles.pillLive : styles.pillPlanned]}
      accessibilityRole="text"
    >
      <Text style={[styles.pillText, { color: live ? colors.success : colors.textSecondary }]}>
        {label}
      </Text>
    </View>
  );
}

/** Small uppercase caption that opens a section ("Compliance breakdown", "Active inputs"). */
export function SectionLabel({ children }: { children: string }): React.JSX.Element {
  return (
    <Text accessibilityRole="header" style={styles.sectionLabel}>
      {children}
    </Text>
  );
}

/** Lead-in paragraph under a screen title. */
export function Lede({ children }: { children: string }): React.JSX.Element {
  return <Text style={styles.lede}>{children}</Text>;
}

/**
 * Icon + title + body card, optionally carrying a capability pill. The portal's default row: used
 * for data categories, collection methods and safeguards alike.
 */
export function InfoCard({
  icon,
  tint,
  title,
  body,
  status,
  statusLabel,
  testID,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  tint?: string;
  title: string;
  body: string;
  status?: CapabilityStatus;
  statusLabel?: string;
  testID?: string;
}): React.JSX.Element {
  return (
    <View testID={testID} style={styles.card}>
      <View style={[styles.cardIcon, { backgroundColor: (tint ?? colors.primary) + '14' }]}>
        <MaterialIcons name={icon} size={22} color={tint ?? colors.primary} />
      </View>
      <View style={styles.cardBody}>
        <View style={styles.cardTitleRow}>
          <Text style={styles.cardTitle}>{title}</Text>
          {status && statusLabel ? <StatusPill status={status} label={statusLabel} /> : null}
        </View>
        <Text style={styles.cardText}>{body}</Text>
      </View>
    </View>
  );
}

/**
 * Label-over-value row for a concrete stored field. `note` carries provenance ("from your account"),
 * which matters on a transparency screen: the user should be able to tell a real stored value from
 * an explanation of one.
 */
export function FieldRow({
  label,
  value,
  note,
  testID,
}: {
  label: string;
  value: string;
  note?: string;
  testID?: string;
}): React.JSX.Element {
  return (
    <View testID={testID} style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value}</Text>
      {note ? <Text style={styles.fieldNote}>{note}</Text> : null}
    </View>
  );
}

/** One node of a vertical pipeline diagram; `last` drops the trailing connector. */
export function FlowStep({
  icon,
  title,
  caption,
  last,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  title: string;
  caption: string;
  last?: boolean;
}): React.JSX.Element {
  return (
    <View style={styles.flowRow}>
      <View style={styles.flowRail}>
        <View style={styles.flowNode}>
          <MaterialIcons name={icon} size={18} color={colors.primary} />
        </View>
        {last ? null : <View style={styles.flowConnector} />}
      </View>
      <View style={styles.flowBody}>
        <Text style={styles.flowTitle}>{title}</Text>
        <Text style={styles.flowCaption}>{caption}</Text>
      </View>
    </View>
  );
}

/**
 * An action the portal shows but cannot perform yet — data export, erasure, preference changes.
 *
 * Rendered disabled with a "coming soon" chip rather than hidden (PO decision 2026-08-04). It is
 * deliberately NOT a Pressable: there is no endpoint behind any of these (PDPA-10/11/13/14 are all
 * OPEN in docs/compliance/pdpa-controls.md), and a control that looks tappable but silently does
 * nothing is worse than one that states its status.
 */
export function DisabledAction({
  icon,
  label,
  comingSoon,
  testID,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  /** Pre-translated chip text. */
  comingSoon: string;
  testID: string;
}): React.JSX.Element {
  return (
    <View
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: true }}
      accessibilityLabel={`${label} — ${comingSoon}`}
      style={styles.action}
    >
      <MaterialIcons name={icon} size={20} color={colors.textSecondary} />
      <Text style={styles.actionLabel}>{label}</Text>
      <View style={styles.comingSoonChip}>
        <Text style={styles.comingSoonText}>{comingSoon}</Text>
      </View>
    </View>
  );
}

/** Same shape as <InfoCard /> but tappable — the hub's rows into each category screen. */
export function NavCard({
  icon,
  tint,
  title,
  body,
  onPress,
  status,
  statusLabel,
  testID,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  tint?: string;
  title: string;
  body: string;
  onPress: () => void;
  status?: CapabilityStatus;
  statusLabel?: string;
  testID: string;
}): React.JSX.Element {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={statusLabel ? `${title} — ${statusLabel}` : title}
      onPress={onPress}
      style={styles.card}
    >
      <View style={[styles.cardIcon, { backgroundColor: (tint ?? colors.primary) + '14' }]}>
        <MaterialIcons name={icon} size={22} color={tint ?? colors.primary} />
      </View>
      <View style={styles.cardBody}>
        <View style={styles.cardTitleRow}>
          <Text style={styles.cardTitle}>{title}</Text>
          {status && statusLabel ? <StatusPill status={status} label={statusLabel} /> : null}
        </View>
        <Text style={styles.cardText}>{body}</Text>
      </View>
      <MaterialIcons name="chevron-right" size={22} color={colors.textSecondary} />
    </Pressable>
  );
}

/** Card wrapper used for the screen-opening summary tile. */
export function SummaryTile({ children }: { children: ReactNode }): React.JSX.Element {
  return <View style={styles.summary}>{children}</View>;
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillLive: { backgroundColor: colors.success + '14', borderColor: colors.success + '55' },
  pillPlanned: { backgroundColor: colors.surface, borderColor: colors.offline + '55' },
  pillText: {
    fontFamily: fontFamily.semibold,
    fontSize: 10,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  sectionLabel: {
    marginTop: spacing.md,
    color: colors.textSecondary,
    fontFamily: fontFamily.semibold,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  lede: {
    color: colors.textSecondary,
    fontFamily: fontFamily.regular,
    fontSize: typography.label.fontSize,
    lineHeight: typography.label.lineHeight * 1.15,
  },

  summary: {
    borderWidth: 1,
    borderColor: colors.surface,
    borderRadius: 12,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.xs,
  },

  card: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.surface,
    backgroundColor: colors.bg,
  },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: { flex: 1, gap: 2 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  cardTitle: {
    flex: 1,
    color: colors.textPrimary,
    fontFamily: fontFamily.medium,
    fontSize: typography.caption.fontSize,
  },
  cardText: {
    color: colors.textSecondary,
    fontFamily: fontFamily.regular,
    fontSize: typography.label.fontSize,
    lineHeight: typography.label.lineHeight * 1.15,
  },

  field: {
    padding: spacing.sm,
    borderRadius: 10,
    backgroundColor: colors.surface,
    gap: 2,
  },
  fieldLabel: {
    color: colors.textSecondary,
    fontFamily: fontFamily.semibold,
    fontSize: 10,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  fieldValue: {
    color: colors.textPrimary,
    fontFamily: fontFamily.medium,
    fontSize: typography.caption.fontSize,
  },
  fieldNote: {
    color: colors.textSecondary,
    fontFamily: fontFamily.regular,
    fontSize: typography.label.fontSize,
  },

  flowRow: { flexDirection: 'row', gap: spacing.sm },
  flowRail: { alignItems: 'center', width: 36 },
  flowNode: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.surface,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flowConnector: { flex: 1, width: 2, backgroundColor: colors.surface, minHeight: spacing.md },
  flowBody: { flex: 1, paddingBottom: spacing.md, gap: 2 },
  flowTitle: {
    color: colors.textPrimary,
    fontFamily: fontFamily.medium,
    fontSize: typography.caption.fontSize,
  },
  flowCaption: {
    color: colors.textSecondary,
    fontFamily: fontFamily.regular,
    fontSize: typography.label.fontSize,
  },

  action: {
    minHeight: touchTarget.formInput,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.surface,
    backgroundColor: colors.surface,
  },
  actionLabel: {
    flex: 1,
    color: colors.textSecondary,
    fontFamily: fontFamily.medium,
    fontSize: typography.caption.fontSize,
  },
  comingSoonChip: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: colors.bg,
  },
  comingSoonText: {
    color: colors.textSecondary,
    fontFamily: fontFamily.medium,
    fontSize: 10,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});

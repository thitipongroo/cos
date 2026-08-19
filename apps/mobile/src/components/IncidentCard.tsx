// One safety incident, as both SAFETY_OFFICER screens draw it.
//
// TWO VARIANTS, ONE COMPONENT. `mockup/mobile/07_safety_officer/01_home/01_sa_home_dashboard` and
// `.../02_incidents/01_sa_incident_dashboard` draw the same card at two densities: the Home feed is
// title + location + footer, the Incidents feed adds a severity eyebrow, a photo plate and the
// acknowledge action. They are one component because they are one card — two files would drift, and
// the duplication ratchet (`.jscpd.json`) counts it either way.
//
// WHAT THE DRAWINGS SHOW THAT THE DATA DOES NOT HAVE, and how each is handled (PO decision
// 2026-08-13 — draw the zone, say plainly it is not ready; never invent a value):
//
//   - THE LOCATION LINE ("Reported in North Wing - Sector 4"). `site_ops.incidents` has `latitude`
//     and `longitude` and no place name at all — no zone, no level, no sector. The line is drawn
//     with its pin glyph and says no location is recorded.
//   - THE PHOTO THUMBNAIL. Incidents carry no attachment: there is no `file_id` on the row and
//     `POST /safety/incidents` accepts none. The plate is drawn in the mockup's OWN empty form —
//     card 3 of the incidents drawing is exactly this, an `image` glyph on `surface-container-
//     highest` — so this is the drawing's vocabulary, not an invention.
//   - THE REPORTER AVATAR is NOT drawn, and that is the one omission here. `reported_by` is a UUID;
//     there is no name and no photo on the row, and <Avatar /> falls back to initials, which needs a
//     name. A grey circle standing for a person nobody can identify states less than nothing. Card 3
//     of the same drawing has no avatar either, so the card is still within its own vocabulary.
//   - THE "AI: 94%" style chips are not on this card in either drawing, and nothing is added.
//
// WHAT IS REAL AND IS DRAWN BECAUSE IT IS: the severity accent and eyebrow, the incident type, the
// status, the age to the minute, and the §19.3 acknowledgement deadline — an OPEN incident
// unacknowledged for 30 minutes escalates to the PM, which is the only clock this record really has.

import { useMemo } from 'react';
import { View, Text, Pressable, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import type { IncidentRow } from '../api/safety';
import {
  acknowledgementOverdue,
  incidentAge,
  incidentAgeKey,
  incidentStatusTone,
  severityTone,
  type Tone,
} from '../lib/safetyOfficer';
import { useT } from '../i18n';
import { fontFamily, plateRadius, radius, spacing, touchTarget, typography } from '../theme/tokens';
import { usePalette, type Palette } from '../theme/usePalette';

/** The photo plate's side, from the drawing's `w-32`. Named so its radius cannot drift from it. */
const PHOTO_PLATE = 96;

export interface IncidentCardProps {
  incident: IncidentRow;
  /** Passed in rather than read from the clock, so the age a test asserts is the age it set. */
  now: Date;
  variant: 'compact' | 'feed';
  onPress?: () => void;
  /** Feed only. Absent → no acknowledge control (e.g. the Home summary). */
  onAcknowledge?: (incident: IncidentRow) => void;
  testID?: string;
}

function toneColour(p: Palette, tone: Tone): string {
  if (tone === 'danger') return p.danger;
  if (tone === 'warning') return p.warning;
  if (tone === 'success') return p.success;
  return p.muted;
}

export function IncidentCard({
  incident,
  now,
  variant,
  onPress,
  onAcknowledge,
  testID,
}: IncidentCardProps): React.JSX.Element {
  const p = usePalette();
  const t = useT();
  const styles = useMemo(() => makeStyles(p), [p]);

  const accent = toneColour(p, severityTone(incident.severity));
  const statusColour = toneColour(p, incidentStatusTone(incident.status));
  const age = incidentAge(incident.created_at, now);
  const overdue = acknowledgementOverdue(incident, now);
  const isFeed = variant === 'feed';

  return (
    <Pressable
      testID={testID}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={incident.incident_type}
      onPress={onPress}
      style={[styles.card, { borderLeftColor: accent }]}
    >
      <View style={styles.body}>
        {/* The feed's "CRITICAL SEVERITY" eyebrow. The Home card omits it — its accent strip and
            status pill already carry the same verdict in a card half the height. */}
        {isFeed ? (
          <Text style={[styles.eyebrow, { color: accent }]}>
            {t('safety.incidents.severityEyebrow', { severity: incident.severity })}
          </Text>
        ) : null}

        <Text style={styles.title} numberOfLines={2}>
          {incident.incident_type}
        </Text>

        {/* The drawing's location line. There is no place name on the row — see the header. */}
        <View style={styles.metaRow}>
          <MaterialIcons name="location-on" size={16} color={p.muted} />
          <Text style={styles.meta} numberOfLines={1}>
            {t('safety.incidents.locationUnavailable')}
          </Text>
        </View>

        <View style={styles.footRow}>
          <View style={styles.metaRow}>
            <MaterialIcons name="schedule" size={14} color={p.muted} />
            <Text style={styles.meta}>
              {age === null
                ? t('safety.age.unknown')
                : t(incidentAgeKey(age), { value: String(age.value) })}
            </Text>
          </View>
          <View style={[styles.pill, { borderColor: statusColour }]}>
            <Text style={[styles.pillText, { color: statusColour }]}>{incident.status}</Text>
          </View>
        </View>

        {/* §19.3: unacknowledged 30 minutes → escalate to PM. The one real deadline on this record,
            so it is stated rather than left to the reader to subtract. */}
        {overdue ? (
          <View testID={`${testID ?? 'incident'}-overdue`} style={styles.metaRow}>
            <MaterialIcons name="priority-high" size={14} color={p.danger} />
            <Text style={[styles.meta, { color: p.danger }]} numberOfLines={2}>
              {t('safety.incidents.overdue')}
            </Text>
          </View>
        ) : null}

        {isFeed && onAcknowledge && incident.status === 'OPEN' ? (
          <TouchableOpacity
            testID={`${testID ?? 'incident'}-acknowledge`}
            accessibilityRole="button"
            accessibilityLabel={t('safety.incidents.acknowledge')}
            onPress={() => onAcknowledge(incident)}
            style={[styles.action, { borderColor: p.accent }]}
          >
            <MaterialIcons name="task-alt" size={16} color={p.accent} />
            <Text style={[styles.actionText, { color: p.accent }]}>
              {t('safety.incidents.acknowledge')}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* The feed's photo plate, in the mockup's own empty form (its third card draws exactly this). */}
      {isFeed ? (
        <View
          testID={`${testID ?? 'incident'}-photo`}
          accessibilityLabel={t('safety.incidents.photoUnavailable')}
          style={styles.photo}
        >
          <MaterialIcons name="image" size={28} color={p.muted} />
        </View>
      ) : null}
    </Pressable>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    card: {
      flexDirection: 'row',
      gap: spacing.sm,
      backgroundColor: p.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: p.border,
      // The drawings' `w-1.5` severity strip — the thing that makes a feed readable before any word
      // of it is.
      borderLeftWidth: 4,
      padding: spacing.sm,
    },
    body: { flex: 1, gap: spacing.xs / 2 },
    eyebrow: {
      fontSize: 10,
      fontFamily: fontFamily.bold,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
    },
    title: {
      color: p.text,
      fontSize: typography.caption.fontSize,
      fontFamily: fontFamily.semibold,
    },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs / 2 },
    meta: {
      flexShrink: 1,
      color: p.muted,
      fontSize: typography.label.fontSize,
      fontFamily: fontFamily.regular,
    },
    footRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.xs,
      marginTop: spacing.xs / 2,
    },
    // Outlined rather than filled: the card already carries the severity as a solid strip, and two
    // solid blocks of colour on one small card fight each other.
    pill: {
      borderWidth: 1,
      borderRadius: radius.xl,
      paddingHorizontal: spacing.xs,
      paddingVertical: 1,
    },
    pillText: { fontSize: 10, fontFamily: fontFamily.bold, letterSpacing: 0.5 },
    action: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs / 2,
      minHeight: touchTarget.secondaryButton,
      paddingHorizontal: spacing.sm,
      marginTop: spacing.xs,
      borderRadius: radius.md,
      borderWidth: 1,
    },
    actionText: {
      fontSize: typography.label.fontSize,
      fontFamily: fontFamily.semibold,
      textTransform: 'uppercase',
    },
    photo: {
      width: PHOTO_PLATE,
      alignSelf: 'stretch',
      minHeight: PHOTO_PLATE,
      // §32.7's square-plate rule — a quarter of the side, as a rule rather than a literal, which is
      // what `radiusRatchet.spec.ts` counts.
      borderRadius: plateRadius(PHOTO_PLATE),
      backgroundColor: p.elevated,
      borderWidth: 1,
      borderColor: p.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });

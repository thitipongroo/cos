// One safety incident, as both SAFETY_OFFICER screens draw it.
//
// TWO VARIANTS, ONE COMPONENT. `mockup/mobile/07_safety_officer/01_home/01_sa_home_dashboard` and
// `.../02_incidents/01_sa_incident_dashboard` draw the same card at two densities: the Home feed is
// title + location + footer, the Incidents feed adds a severity eyebrow, a photograph and the
// acknowledge action. They are one card, so they are one component.
//
// REDRAWN 2026-09-17 (R23) to the Stitch screens "Safety Officer Dashboard - Refined with Active
// Project Bar" and "รายการเหตุการณ์ความปลอดภัย - Refined Modern Industrial (Mobile)". The 2026-08-13
// build drew each unbacked zone as a "not available yet" note; the product owner reversed that for
// this set (D40), so everything the drawings draw is drawn and what has no source is registered.
//
// WHAT IS REAL: the severity accent and eyebrow, the incident type, the status, the age to the
// minute, the §19.3 acknowledgement deadline (an OPEN incident unacknowledged for 30 minutes
// escalates to the PM), and THE SYNC CHIP — a row still in `local_incidents` awaiting `/sync/push`
// is `pending`, a row the server has returned is `synced`. The screen passes which it is.
//
// WHAT IS DRAWN (lib/mockupFigures.ts, ADR-099) — COMING SOON:
//   · the LOCATION line (`INCIDENT_LOCATIONS`). The row carries latitude and longitude and no zone,
//     level or sector.
//   · the PHOTOGRAPH and the REPORTER portrait (`INCIDENT_MEDIA`, D44 — the drawings' own images,
//     bundled under `assets/safety/`). An incident takes no attachment and `reported_by` is a UUID.
//   · the TAG chip and the OBSERVATION line (`INCIDENT_DETAIL`). `incident_type` is free text and
//     the row has no description column.
// Each is cycled BY POSITION, the way every other drawn list in this app is, so two cards never
// read as the same incident.

import { useMemo } from 'react';
import { View, Text, Image, Pressable, TouchableOpacity, StyleSheet } from 'react-native';
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
import { INCIDENT_DETAIL, INCIDENT_LOCATIONS } from '../lib/mockupFigures';
import { useT } from '../i18n';
import { fontFamily, plateRadius, radius, spacing, touchTarget, typography } from '../theme/tokens';
import { usePalette, type Palette } from '../theme/usePalette';
import cablePhoto from '../../assets/safety/incident-cable.jpg';
import helmetPhoto from '../../assets/safety/incident-helmet.jpg';
import inspectorFemale from '../../assets/safety/inspector-female.jpg';
import inspectorMale from '../../assets/safety/inspector-male.jpg';

/** The photograph's width in the feed card, from the drawing's right-hand column. */
const PHOTO_WIDTH = 116;

/** The reporter portrait's side — the drawing's `w-6` on Home, `w-8` in the feed. */
const AVATAR = 28;

/** The drawings' own photographs, bundled under `assets/safety/` — `INCIDENT_MEDIA` names them. */
const PHOTOS = [cablePhoto, helmetPhoto];
const REPORTERS = [inspectorFemale, inspectorMale];

export interface IncidentCardProps {
  incident: IncidentRow;
  /** Passed in rather than read from the clock, so the age a test asserts is the age it set. */
  now: Date;
  variant: 'compact' | 'feed';
  /** Position in the list — what the drawn location, photograph and portrait are cycled by. */
  index?: number;
  /** REAL: `pending` while the row is still in the local queue, `synced` once the server has it. */
  sync?: 'synced' | 'pending';
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
  index = 0,
  sync = 'synced',
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
  const resolved = incident.status === 'RESOLVED' || incident.status === 'CLOSED';
  // DRAWN, cycled by position — see the header.
  const place = INCIDENT_LOCATIONS.value[index % INCIDENT_LOCATIONS.value.length];
  const photo = PHOTOS[index % PHOTOS.length];
  const reporter = REPORTERS[index % REPORTERS.length];
  const ageText =
    age === null ? t('safety.age.unknown') : t(incidentAgeKey(age), { value: String(age.value) });

  return (
    <Pressable
      testID={testID}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={incident.incident_type}
      onPress={onPress}
      style={[styles.card, { borderLeftColor: accent }, resolved && styles.faded]}
    >
      <View style={styles.body}>
        <View style={styles.headRow}>
          {/* The feed's "CRITICAL SEVERITY" eyebrow. The Home card omits it — its accent strip and
              status pill already carry the same verdict in a card half the height. */}
          {isFeed ? (
            <Text style={[styles.eyebrow, { color: accent }]} numberOfLines={1}>
              {t('safety.incidents.severityEyebrow', { severity: incident.severity })}
            </Text>
          ) : (
            <Text style={styles.title} numberOfLines={1}>
              {incident.incident_type}
            </Text>
          )}
          {isFeed ? (
            // REAL: a row still awaiting `/sync/push` says so.
            <View testID={`${testID ?? 'incident'}-sync`} style={styles.syncChip}>
              <MaterialIcons
                name={sync === 'pending' ? 'sync' : 'cloud-done'}
                size={13}
                color={sync === 'pending' ? p.warning : p.success}
              />
              <Text
                style={[styles.syncText, { color: sync === 'pending' ? p.warning : p.success }]}
              >
                {t(
                  sync === 'pending'
                    ? 'safety.incidents.syncPending'
                    : 'safety.incidents.syncSynced',
                )}
              </Text>
            </View>
          ) : (
            <View style={[styles.statusPill, { backgroundColor: statusColour }]}>
              <Text style={styles.statusPillText} numberOfLines={1}>
                {incident.status}
              </Text>
            </View>
          )}
        </View>

        {isFeed ? (
          <Text style={styles.feedTitle} numberOfLines={2}>
            {incident.incident_type}
          </Text>
        ) : null}

        {/* DRAWN — the row has coordinates and no place name. */}
        <View style={styles.metaRow}>
          <MaterialIcons name="location-on" size={16} color={p.muted} />
          <Text style={styles.meta} numberOfLines={1}>
            {place}
          </Text>
        </View>

        {/* DRAWN — the drawing tags its second card and writes an observation under its third. */}
        {isFeed && index % 3 === 1 ? (
          <View style={styles.tagChip}>
            <Text style={styles.tagText} numberOfLines={1}>
              {INCIDENT_DETAIL.value.tag}
            </Text>
          </View>
        ) : null}
        {isFeed && index % 3 === 2 ? (
          <Text style={styles.observation} numberOfLines={2}>
            {INCIDENT_DETAIL.value.observation}
          </Text>
        ) : null}

        <View style={styles.footRow}>
          <View style={styles.metaRow}>
            <MaterialIcons
              name={resolved ? 'check-circle' : 'schedule'}
              size={14}
              color={resolved ? p.success : p.muted}
            />
            <Text style={[styles.meta, resolved && { color: p.success }]} numberOfLines={1}>
              {isFeed ? t('safety.incidents.reported', { age: ageText }) : ageText}
            </Text>
          </View>
          <View style={styles.footRight}>
            {/* DRAWN — `reported_by` is a UUID with no name or portrait behind it. */}
            <Image
              testID={`${testID ?? 'incident'}-reporter`}
              source={reporter}
              style={styles.avatar}
              accessibilityIgnoresInvertColors
            />
            {isFeed ? null : <MaterialIcons name="chevron-right" size={20} color={p.muted} />}
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

      {/* DRAWN — the drawings fill the feed card's right half with a photograph of the scene. */}
      {isFeed ? (
        <Image
          testID={`${testID ?? 'incident'}-photo`}
          source={photo}
          style={styles.photo}
          accessibilityIgnoresInvertColors
        />
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
      borderLeftWidth: 6,
      padding: spacing.sm,
      overflow: 'hidden',
    },
    // The drawing dims a resolved card rather than removing it.
    faded: { opacity: 0.75 },
    body: { flex: 1, gap: spacing.xs / 2 },
    headRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.xs,
    },
    eyebrow: {
      flexShrink: 1,
      fontSize: 10,
      fontFamily: fontFamily.bold,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
    },
    title: {
      flexShrink: 1,
      color: p.text,
      fontSize: typography.caption.fontSize,
      fontFamily: fontFamily.semibold,
    },
    feedTitle: {
      color: p.text,
      fontSize: typography.title.fontSize,
      lineHeight: typography.title.fontSize * 1.2,
      fontFamily: fontFamily.bold,
    },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs / 2 },
    meta: {
      flexShrink: 1,
      color: p.muted,
      fontSize: typography.label.fontSize,
      fontFamily: fontFamily.regular,
    },
    observation: {
      color: p.muted,
      fontSize: typography.label.fontSize,
      fontFamily: fontFamily.regular,
      fontStyle: 'italic',
    },
    tagChip: {
      alignSelf: 'flex-start',
      backgroundColor: p.surfaceBright,
      borderRadius: radius.xl,
      paddingHorizontal: spacing.xs,
      paddingVertical: 2,
    },
    tagText: { color: p.muted, fontSize: 10, fontFamily: fontFamily.medium },
    footRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.xs,
      marginTop: spacing.xs / 2,
    },
    footRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs / 2 },
    avatar: {
      width: AVATAR,
      height: AVATAR,
      // A portrait is a circle, which is half the width — off the radius scale by design (§32.7).
      borderRadius: 999,
      borderWidth: 2,
      borderColor: p.surface,
    },
    // The drawings fill the status pill on the dashboard card, where it is the only mark of state.
    statusPill: {
      borderRadius: radius.xl,
      paddingHorizontal: spacing.xs,
      paddingVertical: 2,
    },
    statusPillText: {
      color: p.onPrimary,
      fontSize: 10,
      fontFamily: fontFamily.bold,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    syncChip: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    syncText: { fontSize: 10, fontFamily: fontFamily.semibold, letterSpacing: 0.5 },
    action: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs / 2,
      minHeight: touchTarget.secondaryButton,
      paddingHorizontal: spacing.sm,
      borderWidth: 1,
      borderRadius: radius.md,
      marginTop: spacing.xs / 2,
    },
    actionText: { fontSize: typography.label.fontSize, fontFamily: fontFamily.semibold },
    photo: {
      width: PHOTO_WIDTH,
      alignSelf: 'stretch',
      borderRadius: plateRadius(PHOTO_WIDTH),
      // The drawing runs the photograph to the card's own edge; the margin cancels the card padding.
      marginVertical: -spacing.sm,
      marginRight: -spacing.sm,
    },
  });

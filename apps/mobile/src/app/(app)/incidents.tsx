// Incidents — the SAFETY_OFFICER's incident feed and the form that reports one.
//
// Reference mockup: `mockup/mobile/07_safety_officer/02_incidents/01_sa_incident_dashboard/`.
// Rebuilt from it on 2026-08-13. It was a bare form over a FlatList on the LIGHT token set
// (`colors.*` / `screen.*`), which rendered a white page under this app's dark top bar and dark
// bottom nav — the same defect `home.tsx` was fixed for on 2026-08-08.
//
// READ IS OFFLINE-FIRST, WRITE IS OFFLINE-QUEUED, and the two use different sources on purpose:
//   - The FEED prefers `GET /safety/incidents` and falls back to the `local_incidents` rows delta
//     sync already streams down (§17.4 lists safety incidents as offline read/write), so the screen
//     still lists work with no signal.
//   - REPORTING one writes a `local_incidents` row (PENDING, so it appears instantly) AND enqueues a
//     `safety` item for `/sync/push` → `SafetyService.createIncident`. §17.6 flushes safety
//     incidents FIRST on reconnect, ahead of every other entity.
//   - ACKNOWLEDGING one is online-only (`api/safety.ts` uses `patch()`, which never enqueues): a
//     replay hours later would act on a state the officer did not see, and the server rejects the
//     second attempt anyway.
//
// THE DRAWING'S FOUR FILTER PILLS, AND WHY TWO OF THEM DO NOT FILTER. `All Active` and `Critical`
// are real queries — `status` and `severity` are enums the endpoint filters on. `Near Miss` and
// `PPE Violation` are incident TYPES, and `incident_type` is a free-text column with no enum
// anywhere in `docs/specifications/`; matching those two English strings would return nothing for a
// Thai-language tenant while looking like a working control. They are drawn and marked, per the
// product owner's 2026-08-13 ruling for every unbacked zone on these screens. See
// `lib/safetyOfficer.ts` → INCIDENT_FILTERS.
//
// THE "AI PREDICTED RISK" CARD is drawn for the same reason and filled the same way. There is no
// safety AI surface in this platform: `/ai/reports/*` covers site, procurement, executive and
// delay-risk, and SafetyVisionModel is Phase 23 and untrained (§22.6 — 10,000+ labelled photos).
// §22.3 is explicit that a surface must not be described as AI-derived while a placeholder serves
// it, so the card says what it is instead of printing the drawing's 94 %.
//
// NO IN-CONTENT PAGE TITLE — §32.7, held by `theme/__tests__/pageTitle.spec.ts`: a tab screen is
// named by its tab.

import { useCallback, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Pressable,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { db, newLocalId } from '../../db/database';
import type { Incident } from '../../db/database';
import { localIncidents } from '../../db/schema';
import { enqueue } from '../../db/sync-queue';
import { useCollection } from '../../hooks/useCollection';
import {
  acknowledgeIncident,
  listIncidents,
  type IncidentRow,
  type IncidentSeverity,
} from '../../api/safety';
import {
  applyIncidentFilter,
  sortIncidents,
  INCIDENT_FILTERS,
  type IncidentFilter,
} from '../../lib/safetyOfficer';
import { IncidentCard } from '../../components/IncidentCard';
import { LoadingBoundary } from '../../components/LoadingBoundary';
import { ProjectContextBar } from '../../components/ProjectContextBar';
import { UnavailableNote } from '../../components/UnavailableNote';
import { useProjectStore } from '../../store/projectStore';
import { useT } from '../../i18n';
import { fontFamily, radius, spacing, touchTarget, typography } from '../../theme/tokens';
import { usePalette, useIsDark, type Palette } from '../../theme/usePalette';

const SEVERITIES: readonly IncidentSeverity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

/**
 * A locally-cached row rendered through the same card as a server row.
 *
 * The card reads `IncidentRow`, so the two shapes are reconciled HERE rather than by widening the
 * card's contract with fields the local table does not have. `local_incidents` carries no
 * `reported_by` / `task_id` / acknowledgement columns — they are null, which is what they are.
 */
function fromLocal(row: Incident): IncidentRow {
  return {
    incident_id: row.incidentId === '' ? row.id : row.incidentId,
    project_id: row.projectId,
    task_id: null,
    incident_type: row.incidentType,
    severity: row.severity as IncidentSeverity,
    reported_by: '',
    status: row.status as IncidentRow['status'],
    acknowledged_by: null,
    acknowledged_at: null,
    created_at: row.createdAt ?? '',
  };
}

export default function IncidentsScreen(): React.JSX.Element {
  const local = useCollection<Incident>('local_incidents');
  const projectId = useProjectStore((s) => s.active?.projectId ?? '');
  const t = useT();
  const p = usePalette();
  const isDark = useIsDark();
  const styles = makeStyles(p);

  const [remote, setRemote] = useState<IncidentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterId, setFilterId] = useState<IncidentFilter['id']>('all');

  // The composer, revealed by the drawing's FAB. An inline section rather than a route or a second
  // overlay: §32.7 caps navigation at three levels and prohibits modal-on-modal, and this screen is
  // already reached under one.
  const [composing, setComposing] = useState(false);
  const [incidentType, setIncidentType] = useState('');
  const [severity, setSeverity] = useState<IncidentSeverity>('MEDIUM');

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    listIncidents(projectId ? { projectId } : undefined)
      .then((rows) => {
        if (!cancelled) setRemote(rows);
      })
      .catch(() => {
        /* offline — the local cache below stands in */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useFocusEffect(load);

  // Server rows when the fetch answered; the offline cache when it did not. Never both — a merged
  // list would show a just-created row twice, once from each source, until the next delta pull.
  const source: IncidentRow[] =
    remote.length > 0
      ? remote
      : local.filter((row) => projectId === '' || row.projectId === projectId).map(fromLocal);

  const visible = sortIncidents(applyIncidentFilter(source, filterId));
  const now = new Date();
  const canSubmit = projectId !== '' && incidentType.trim() !== '';

  const onCreate = async (): Promise<void> => {
    const payload = {
      project_id: projectId,
      incident_type: incidentType.trim(),
      severity,
    };
    await db.insert(localIncidents).values({
      id: newLocalId(),
      incidentId: '',
      projectId: payload.project_id,
      incidentType: payload.incident_type,
      severity: payload.severity,
      status: 'OPEN',
      createdAt: new Date().toISOString(),
      offlineSyncStatus: 'PENDING',
    });
    // SyncManager → /sync/push (entity_type 'safety'); §17.6 flushes these first on reconnect.
    enqueue('safety', payload.project_id, 'CREATE', payload);
    setIncidentType('');
    setComposing(false);
  };

  const onAcknowledge = (incident: IncidentRow): void => {
    void acknowledgeIncident(incident.incident_id)
      .then(() => load())
      .catch(() => {
        // Online-only by design — say so rather than queueing a decision for later.
        Alert.alert(t('safety.incidents.acknowledge'), t('safety.incidents.acknowledgeOffline'));
      });
  };

  return (
    <View testID="incidents-screen" style={styles.root}>
      <ScrollView contentContainerStyle={styles.page}>
        <ProjectContextBar />

        {/* The drawing's pill row. Two filter; two say why they cannot. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {INCIDENT_FILTERS.map((filter) => {
            const active = filter.available && filter.id === filterId;
            return (
              <Pressable
                key={filter.id}
                testID={`incident-filter-${filter.id}`}
                accessibilityRole="radio"
                accessibilityState={{ selected: active, disabled: !filter.available }}
                onPress={() =>
                  filter.available
                    ? setFilterId(filter.id)
                    : Alert.alert(t(filter.labelKey), t('safety.incidents.filterUnavailable'))
                }
                style={[
                  styles.filterButton,
                  {
                    backgroundColor: active ? p.primary : p.surface,
                    borderColor: active ? p.primary : p.border,
                  },
                  !filter.available && styles.filterButtonOff,
                ]}
              >
                <Text style={[styles.filterLabel, { color: active ? p.onPrimary : p.muted }]}>
                  {t(filter.labelKey)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* The composer, revealed by the FAB. */}
        {composing ? (
          <View testID="incident-composer" style={styles.composer}>
            <TextInput
              testID="incident-type-input"
              style={styles.input}
              placeholder={t('safety.incidents.typePlaceholder')}
              placeholderTextColor={p.muted}
              value={incidentType}
              onChangeText={setIncidentType}
            />
            <Text style={styles.fieldLabel}>{t('safety.incidents.severityLabel')}</Text>
            <View testID="severity-picker" style={styles.severityRow}>
              {SEVERITIES.map((level) => {
                const on = severity === level;
                return (
                  <TouchableOpacity
                    key={level}
                    testID={`severity-${level}`}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    onPress={() => setSeverity(level)}
                    style={[
                      styles.severityChip,
                      {
                        borderColor: on ? p.primary : p.border,
                        backgroundColor: on ? p.primary : p.surface,
                      },
                    ]}
                  >
                    <Text style={[styles.severityText, { color: on ? p.onPrimary : p.muted }]}>
                      {t(`status.${level}`)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {/* A site must be chosen before an incident can be filed against one — the bar at the top
                is where that happens, and the button says so rather than failing on submit. */}
            {projectId === '' ? (
              <Text testID="incident-needs-project" style={styles.muted}>
                {t('safety.incidents.needsProject')}
              </Text>
            ) : null}
            <TouchableOpacity
              testID="create-incident-button"
              accessibilityRole="button"
              accessibilityLabel={t('safety.incidents.submit')}
              onPress={() => void onCreate()}
              disabled={!canSubmit}
              style={[styles.primaryButton, !canSubmit && styles.disabled]}
            >
              <Text style={styles.primaryButtonText}>{t('safety.incidents.submit')}</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <LoadingBoundary loading={loading} variant="list" theme={isDark ? 'dark' : 'light'}>
          <View testID="incident-list" style={styles.feed}>
            {visible.length === 0 ? (
              <Text style={styles.muted}>{t('safety.incidents.empty')}</Text>
            ) : (
              visible.map((incident) => (
                <IncidentCard
                  key={incident.incident_id}
                  testID="incident-item"
                  incident={incident}
                  now={now}
                  variant="feed"
                  onAcknowledge={onAcknowledge}
                />
              ))
            )}
          </View>
        </LoadingBoundary>

        {/* AI PREDICTED RISK — the drawing's cyan-accented card, with no score to put in it. */}
        <View testID="incident-ai-risk" style={[styles.aiCard, { borderLeftColor: p.accent }]}>
          <View style={styles.aiHead}>
            <MaterialIcons name="auto-awesome" size={18} color={p.accent} />
            <Text style={[styles.aiTitle, { color: p.accent }]}>
              {t('safety.incidents.aiRiskTitle')}
            </Text>
          </View>
          <UnavailableNote
            testID="incident-ai-risk-unavailable"
            variant="inline"
            reason={t('safety.incidents.aiRiskBody')}
          />
        </View>
      </ScrollView>

      <TouchableOpacity
        testID="incident-fab"
        accessibilityRole="button"
        accessibilityLabel={t(composing ? 'common.back' : 'safety.incidents.submit')}
        onPress={() => setComposing((open) => !open)}
        style={[styles.fab, { backgroundColor: p.primary }]}
      >
        <MaterialIcons name={composing ? 'close' : 'add'} size={28} color={p.onPrimary} />
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: p.bg },
    page: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl * 3 },
    filterRow: { gap: spacing.xs, paddingVertical: spacing.xs / 2 },
    // A BUTTON, not a badge — named so `theme/__tests__/badgeRadius.spec.ts` does not read it as a
    // status pill and hold it to `radius.xl`. It takes the button radius the drawing gives it, like
    // every other segmented control in the app.
    filterButton: {
      minHeight: touchTarget.secondaryButton,
      justifyContent: 'center',
      paddingHorizontal: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1,
    },
    // Dimmed, and it says why on tap — the drawing shows four pills and two of them have no query
    // behind them.
    filterButtonOff: { opacity: 0.45 },
    filterLabel: { fontSize: typography.label.fontSize, fontFamily: fontFamily.semibold },
    composer: {
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
    },
    input: {
      minHeight: touchTarget.formInput,
      borderWidth: 1,
      borderColor: p.border,
      borderRadius: radius.lg,
      paddingHorizontal: spacing.md,
      backgroundColor: p.elevated,
      color: p.text,
      fontSize: typography.body.fontSize,
      fontFamily: fontFamily.regular,
    },
    fieldLabel: {
      color: p.muted,
      fontSize: typography.label.fontSize,
      fontFamily: fontFamily.semibold,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    severityRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
    severityChip: {
      minHeight: touchTarget.secondaryButton,
      justifyContent: 'center',
      paddingHorizontal: spacing.md,
      borderRadius: radius.xl,
      borderWidth: 1,
    },
    severityText: { fontSize: typography.label.fontSize, fontFamily: fontFamily.medium },
    primaryButton: {
      minHeight: touchTarget.primaryButton + 4,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.md,
      backgroundColor: p.primary,
    },
    primaryButtonText: {
      color: p.onPrimary,
      fontSize: typography.body.fontSize,
      fontFamily: fontFamily.semibold,
      textTransform: 'uppercase',
    },
    disabled: { opacity: 0.5 },
    feed: { gap: spacing.sm },
    aiCard: {
      gap: spacing.xs,
      padding: spacing.md,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: p.border,
      borderLeftWidth: 4,
      backgroundColor: p.surface,
    },
    aiHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    aiTitle: {
      fontSize: 11,
      fontFamily: fontFamily.bold,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
    },
    muted: { color: p.muted, fontSize: typography.label.fontSize, fontFamily: fontFamily.regular },
    fab: {
      position: 'absolute',
      right: spacing.md,
      bottom: spacing.xl,
      width: 56,
      height: 56,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.45,
      shadowRadius: 12,
      elevation: 8,
    },
  });

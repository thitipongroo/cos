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

import { useCallback, useMemo, useState } from 'react';
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
import * as Crypto from 'expo-crypto';
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
import { screenChrome } from '../../theme/screenStyles';
import { SeverityPicker, SEVERITIES } from '../../components/SeverityPicker';
import { Fab } from '../../components/Fab';

/**
 * A locally-cached row rendered through the same card as a server row.
 *
 * The card reads `IncidentRow`, so the two shapes are reconciled HERE rather than by widening the
 * card's contract with fields the local table does not have. `local_incidents` carries no
 * `reported_by` / `task_id` / acknowledgement columns — they are null, which is what they are.
 */
function fromLocal(row: Incident): IncidentRow {
  return {
    // `incidentId` is the client UUID for an offline create and the server's id once the delta pull
    // has replaced the row. The `|| row.id` fallback covers rows written before 2026-08-19, which
    // were stored with an empty incidentId.
    incident_id: row.incidentId || row.id,
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
  const projectId = useProjectStore((s) => s.active?.projectId ?? '');
  // Scoped in SQL rather than pulled whole and filtered in JS — see hooks/useCollection.
  const local = useCollection<Incident>('local_incidents', {
    equals: { column: 'projectId', value: projectId },
  });
  const t = useT();
  const p = usePalette();
  const isDark = useIsDark();
  const styles = useMemo(() => makeStyles(p), [p]);

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

  // Server rows, PLUS any local row the server has not sent back yet.
  //
  // This used to be either/or — `remote.length > 0 ? remote : local` — which avoided showing a row
  // twice by making it disappear instead: file an incident with no signal, regain signal, and the
  // fetch returns the server's list (which cannot contain the unpushed row), so the thing the
  // officer had just filed vanished from the feed until a push AND a delta pull had both run.
  //
  // Merging by id gives the same no-duplicates guarantee without that: a local row is shown only
  // while nothing with its id has come back from the server, and the moment the delta pull brings the
  // real row down it takes over. Rows still awaiting push are `sync_status = 'PENDING'` — see
  // `IncidentCard`, which is what marks them as not-yet-sent.
  const remoteIds = new Set(remote.map((r) => r.incident_id));
  const source: IncidentRow[] = [
    ...remote,
    ...local.filter((row) => !remoteIds.has(row.incidentId)).map(fromLocal),
  ];

  const visible = sortIncidents(applyIncidentFilter(source, filterId));
  const now = new Date();
  const canSubmit = projectId !== '' && incidentType.trim() !== '';

  const onCreate = async (): Promise<void> => {
    // ONE CLIENT ID, SHARED BY THE ROW AND ITS QUEUE ITEM — the pattern every other offline create in
    // this app already uses (issues.tsx draftId → issueId, report.tsx clientId → reportId; ADR-051).
    //
    // This screen was the exception, and it cost two things. It enqueued under the PROJECT id, so two
    // incidents filed offline on the same site were two queue rows with one identity, and it wrote
    // `incidentId: ''`, so the local row could never be matched to anything — not to its queue item,
    // not to the server's answer, and not to the copy the next delta pull brings down, which
    // therefore arrived as a SECOND row for the same incident.
    //
    // SENT TO THE SERVER TOO, as `client_id` (added to CreateIncidentDto 2026-08-19, mirroring
    // CreateIssueDto's G-M11 field). It becomes the server's `incident_id`, and SafetyService inserts
    // ON CONFLICT DO NOTHING — so a replay of this queued mutation, which /sync/push will attempt
    // after a timeout or any retry, resolves to the incident that already exists instead of filing a
    // second one and re-arming the §19.3 escalation timer. It is therefore both the local identity
    // AND the idempotency key, which is why one value serves the row, the queue and the payload.
    const clientId = Crypto.randomUUID();
    const payload = {
      client_id: clientId,
      project_id: projectId,
      incident_type: incidentType.trim(),
      severity,
    };
    await db.insert(localIncidents).values({
      id: newLocalId(),
      incidentId: clientId,
      projectId: payload.project_id,
      incidentType: payload.incident_type,
      severity: payload.severity,
      status: 'OPEN',
      createdAt: new Date().toISOString(),
      offlineSyncStatus: 'PENDING',
    });
    // SyncManager → /sync/push (entity_type 'safety'); §17.6 flushes these first on reconnect.
    // `clientId` as the queue key is what lets runPushSync write the server's verdict back onto the
    // row above (sync/resolutionTargets.ts).
    enqueue('safety', clientId, 'CREATE', payload);
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
            <SeverityPicker
              value={severity}
              onChange={setSeverity}
              palette={p}
              accent={p.primary}
              restBackground={p.surface}
              levels={SEVERITIES}
            />
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

      <Fab
        testID="incident-fab"
        accessibilityLabel={t(composing ? 'common.back' : 'safety.incidents.submit')}
        onPress={() => setComposing((open) => !open)}
        icon={composing ? 'close' : 'add'}
      />
    </View>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    ...screenChrome(p),
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
    feed: { gap: spacing.sm },
  });

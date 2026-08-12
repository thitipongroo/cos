// Checklists — the SAFETY_OFFICER's inspection list and the checklist it fills.
//
// Reference mockup: `mockup/mobile/07_safety_officer/03_checklists/01_sa_safety_checklist/`.
// Rebuilt from it on 2026-08-13. THE ROUTE IS UNCHANGED and deliberately so (PO decision
// 2026-08-13): `/inspections` was already this role's screen and already does what the drawing
// shows — pick a template, mark each item, sign, submit — so it is relabelled "Checklists" on the
// bar (roleTabs.ts) rather than duplicated into a new route. `/safety-checklist` stays the SITE
// WORKER's own screen, built from a different drawing (05_site_worker/03_safety).
//
// TWO PHASES, because the Detox scenario walks them: the LIST (`inspection-list`) → tap a row
// (`inspection-item`) → the CHECKLIST (`inspection-checklist`). Those testIDs, plus
// `checklist-item` / `checklist-pass-button`, are contracts with `e2e/offline-inspection.spec.ts`
// and must not be renamed.
//
// WHAT THE DRAWING SHOWS THAT THE DATA DOES NOT HAVE. Each is DRAWN and says plainly that it is not
// ready (product-owner ruling 2026-08-13), never filled with an invented value:
//
//   - "AI HAZARD ALERT · 94% CONFIDENCE · Predicted high-wind conditions (24mph) · SOURCE: WEATHER
//     TELEMETRY". There is no weather source in this platform at all — no ingestion, no provider, no
//     column — and §22.3 forbids describing a surface as AI-derived while a placeholder serves it.
//   - THE GROUP HEADINGS "PPE & PERSONNEL" / "STRUCTURE & EQUIPMENT". A checklist item is
//     `{ item_id, description, is_required }` (§11 `site_ops.safety_checklists.items`) — there is no
//     group field, so the items cannot be sorted into the drawing's two sections.
//   - THE PER-ITEM "PHOTO" AND "NOTE" BUTTONS. Nothing stores either against an ITEM: photos attach
//     to an entity (`file_metadata.entity_type` / `entity_id`) and an inspection has one `notes`
//     column, not one per row. The zone is drawn ONCE under the list, where the photo control is
//     REAL — <PhotoCapture /> attaches to the inspection — and the note half says what it cannot do.
//   - THE MIC FAB. A voice log has nowhere to attach on an inspection; the transcription service
//     exists but no column receives its output here.
//
// WHAT IS REAL AND IS BUILT: the template and its items, PASS/FAIL per item, the derived overall
// result (FAILED if any item fails — §11 inspection result), `issue_severity` on a failure (§11,
// populated only when the result is FAILED), the photo attachment, the drawn signature (migration
// 20260808000002 added `site_ops.inspections.signature`), and offline submission through `mutate()`
// → `/sync/push` entity `inspection` (§17.4 offline read/write, §17.6 priority 3).
//
// NO IN-CONTENT PAGE TITLE. The drawing heads the screen "Safety Checklist / DAILY INSPECTION";
// §32.7 names a tab screen by its TAB and `theme/__tests__/pageTitle.spec.ts` fails a build that
// draws one. The drawing's SECOND line — the site and the date — is not a title but a status line,
// and it is kept: it says which inspection is being filled.

import { useCallback, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { get, mutate } from '../../api/client';
import type { SafetyChecklist } from '../../db/database';
import { useCollection } from '../../hooks/useCollection';
import { PhotoCapture } from '../../components/PhotoCapture';
import { SignaturePad } from '../../components/SignaturePad';
import type { AnnotationStroke } from '../../components/PhotoAnnotation';
import { LoadingBoundary } from '../../components/LoadingBoundary';
import { ProjectContextBar } from '../../components/ProjectContextBar';
import { UnavailableNote } from '../../components/UnavailableNote';
import { useAuthStore } from '../../store/authStore';
import { useProjectStore } from '../../store/projectStore';
import { useI18n } from '../../i18n';
import { fontFamily, radius, spacing, touchTarget, typography } from '../../theme/tokens';
import { usePalette, useIsDark, type Palette } from '../../theme/usePalette';

interface InspectionRow {
  inspection_id: string;
  checklist_id: string;
  project_id: string;
  status: string;
}

/** One row of `GET /safety/checklists` — the template, with its items already parsed. */
interface ChecklistRow {
  checklist_id: string;
  project_id: string;
  checklist_name: string;
  items?: unknown;
}

/** A template from either source, normalised to the shape this screen fills from. */
interface Template {
  checklistId: string;
  projectId: string;
  name: string;
  itemsJson: string;
}

interface ChecklistItem {
  item_id?: string;
  id?: string;
  description?: string;
  label?: string;
}

type ItemResult = 'PASS' | 'FAIL';
const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
type Severity = (typeof SEVERITIES)[number];

/** The template array, whether it arrived parsed (server) or as JSON text (local cache). */
function parseItems(source: string | undefined): ChecklistItem[] {
  if (source == null) return [];
  try {
    const parsed: unknown = JSON.parse(source);
    return Array.isArray(parsed) ? (parsed as ChecklistItem[]) : [];
  } catch {
    // A malformed template is a server-side data problem — render an empty checklist rather than
    // crash the screen an inspection is being recorded on.
    return [];
  }
}

function keyOf(item: ChecklistItem, index: number): string {
  return item.item_id ?? item.id ?? String(index);
}

export default function InspectionsScreen(): React.JSX.Element {
  const checklists = useCollection<SafetyChecklist>('local_safety_checklists');
  const projectId = useProjectStore((s) => s.active?.projectId ?? '');
  const displayName = useAuthStore((state) => state.displayName);
  const { t, formatDate } = useI18n();
  const p = usePalette();
  const isDark = useIsDark();
  const styles = useMemo(() => makeStyles(p), [p]);

  const [inspections, setInspections] = useState<InspectionRow[]>([]);
  const [remoteTemplates, setRemoteTemplates] = useState<ChecklistRow[]>([]);
  const [active, setActive] = useState<Template | null>(null);
  const [results, setResults] = useState<Record<string, ItemResult>>({});
  const [severity, setSeverity] = useState<Severity>('MEDIUM');
  const [signature, setSignature] = useState<AnnotationStroke[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      const scope: Record<string, string> = projectId ? { project_id: projectId } : {};

      const inspectionsFetch = get<{ items?: InspectionRow[] } | InspectionRow[]>(
        '/site/inspections',
        scope,
      )
        .then((res) => {
          if (!cancelled) setInspections(Array.isArray(res) ? res : (res.items ?? []));
        })
        .catch(() => {
          /* offline — the cached templates below are still fillable */
        });

      // THE TEMPLATES ARE FETCHED, not read from the local cache alone. The first capture of this
      // screen (2026-08-13) showed four rows all reading "Untitled checklist" with FILL CHECKLIST
      // greyed out: `local_safety_checklists` is populated by delta sync, which had not run for this
      // project, so the screen had inspections but no template to name them by — and no template to
      // fill. The Home card already fetched this endpoint; this screen now does too, and keeps the
      // cache as the offline fallback rather than as the only source.
      const templatesFetch = get<{ items?: ChecklistRow[] } | ChecklistRow[]>(
        '/safety/checklists',
        scope,
      )
        .then((res) => {
          if (!cancelled) setRemoteTemplates(Array.isArray(res) ? res : (res.items ?? []));
        })
        .catch(() => {
          /* offline — fall back to whatever delta sync cached */
        });

      void Promise.allSettled([inspectionsFetch, templatesFetch]).then(() => {
        if (!cancelled) setLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }, [projectId]),
  );

  /**
   * The templates for this project — server first, local cache when there is no signal.
   *
   * Never merged: a template present in both would otherwise appear twice in a list whose rows are
   * chosen from, and the two copies can differ (the cache is as old as the last delta pull).
   */
  const available: Template[] = useMemo(
    () =>
      remoteTemplates.length > 0
        ? remoteTemplates.map((row) => ({
            checklistId: row.checklist_id,
            projectId: row.project_id,
            name: row.checklist_name,
            itemsJson: JSON.stringify(row.items ?? []),
          }))
        : checklists
            .filter((row) => projectId === '' || row.projectId === projectId)
            .map((row) => ({
              checklistId: row.checklistId,
              projectId: row.projectId,
              name: row.checklistName,
              itemsJson: row.itemsJson,
            })),
    [remoteTemplates, checklists, projectId],
  );

  const openBlank = (): void => {
    setActive(available[0] ?? null);
    setResults({});
    setSignature([]);
    setSubmitted(false);
  };

  /** Open an existing inspection against its template, or a shell keyed to it when uncached. */
  const openInspection = (row: InspectionRow): void => {
    const known = available.find((c) => c.checklistId === row.checklist_id) ?? available[0];
    setActive(
      known ?? {
        checklistId: row.checklist_id,
        projectId: row.project_id,
        name: '',
        itemsJson: '[]',
      },
    );
    setResults({});
    setSignature([]);
    setSubmitted(false);
  };

  const submit = async (): Promise<void> => {
    if (!active) return;
    const items = parseItems(active.itemsJson);
    // §11 inspection result: FAILED if any item failed, else PASSED. A template with no items
    // submits as PASSED.
    const failed = items.some((item, index) => results[keyOf(item, index)] === 'FAIL');
    await mutate(
      'POST',
      '/site/inspections',
      {
        project_id: active.projectId,
        checklist_id: active.checklistId,
        status: failed ? 'FAILED' : 'PASSED',
        inspected_at: new Date().toISOString(),
        // §11: `issue_severity` is populated ONLY when the result is FAILED.
        ...(failed ? { issue_severity: severity } : {}),
        // The drawn attestation mark — stored since migration 20260808000002. Omitted entirely when
        // the pad is empty, so the column stays NULL rather than holding an empty array.
        ...(signature.length > 0 ? { signature } : {}),
      },
      'inspection',
      active.checklistId,
    );
    setSubmitted(true);
  };

  // ── the checklist phase ────────────────────────────────────────────────────
  if (active) {
    const items = parseItems(active.itemsJson);
    const allRated = items.every((item, index) => results[keyOf(item, index)] !== undefined);
    const failedItems = items.filter((item, index) => results[keyOf(item, index)] === 'FAIL');

    return (
      <ScrollView
        testID="inspection-checklist"
        style={styles.root}
        contentContainerStyle={styles.page}
      >
        <ProjectContextBar />

        {/* The drawing's second header line — WHICH inspection, and when. Not a page title: it names
            the record, which §32.7 explicitly allows ("a record's own name is NOT a page title"). */}
        <Text testID="checklist-subtitle" style={styles.subtitle}>
          {`${active.name || t('safety.checklist.untitled')} · ${formatDate(new Date())}`}
        </Text>

        {/* AI HAZARD ALERT — drawn; nothing feeds it. */}
        <View style={[styles.aiCard, { borderLeftColor: p.accent }]}>
          <View style={styles.aiHead}>
            <MaterialIcons name="thermostat" size={18} color={p.accent} />
            <Text style={[styles.aiTitle, { color: p.accent }]}>
              {t('safety.checklist.hazardAlertTitle')}
            </Text>
          </View>
          <UnavailableNote
            testID="checklist-hazard-unavailable"
            variant="inline"
            reason={t('safety.checklist.hazardAlertBody')}
          />
        </View>

        {/* The drawing's two group headings. Items carry no group, so the zone explains itself and
            the list below is flat. */}
        <UnavailableNote
          testID="checklist-groups-unavailable"
          reason={t('safety.checklist.groupUnavailable')}
        />

        {items.length === 0 ? (
          <Text style={styles.muted}>{t('site.inspections.noItems')}</Text>
        ) : (
          items.map((item, index) => {
            const key = keyOf(item, index);
            const result = results[key];
            return (
              <View key={key} testID="checklist-item" style={styles.itemCard}>
                <Text style={styles.itemTitle}>
                  {item.description ??
                    item.label ??
                    t('site.inspections.itemFallback', { index: index + 1 })}
                </Text>
                {/* The drawing's green/red switch, as two explicit targets. A switch has one
                    ambiguous resting state — "not yet answered" and "fail" look identical — and this
                    screen refuses to submit until every item is ANSWERED, so the two must differ. */}
                <View style={styles.resultRow}>
                  <TouchableOpacity
                    testID="checklist-pass-button"
                    accessibilityRole="radio"
                    accessibilityState={{ selected: result === 'PASS' }}
                    onPress={() => setResults((r) => ({ ...r, [key]: 'PASS' }))}
                    style={[
                      styles.resultButton,
                      {
                        borderColor: p.success,
                        backgroundColor: result === 'PASS' ? p.success : 'transparent',
                      },
                    ]}
                  >
                    <MaterialIcons
                      name="check"
                      size={18}
                      color={result === 'PASS' ? p.onPrimary : p.success}
                    />
                    <Text
                      style={[
                        styles.resultText,
                        { color: result === 'PASS' ? p.onPrimary : p.success },
                      ]}
                    >
                      {t('site.inspections.pass')}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    testID="checklist-fail-button"
                    accessibilityRole="radio"
                    accessibilityState={{ selected: result === 'FAIL' }}
                    onPress={() => setResults((r) => ({ ...r, [key]: 'FAIL' }))}
                    style={[
                      styles.resultButton,
                      {
                        borderColor: p.danger,
                        backgroundColor: result === 'FAIL' ? p.danger : 'transparent',
                      },
                    ]}
                  >
                    <MaterialIcons
                      name="close"
                      size={18}
                      color={result === 'FAIL' ? p.onPrimary : p.danger}
                    />
                    <Text
                      style={[
                        styles.resultText,
                        { color: result === 'FAIL' ? p.onPrimary : p.danger },
                      ]}
                    >
                      {t('site.inspections.fail')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}

        {/* The drawing's FLAGGED block, drawn only when something actually failed — an empty
            red-striped panel reads as an alert in its own right. */}
        {failedItems.length > 0 ? (
          <View testID="checklist-flagged" style={[styles.flagged, { borderColor: p.danger }]}>
            <View style={styles.aiHead}>
              <MaterialIcons name="report-problem" size={18} color={p.danger} />
              <Text style={[styles.aiTitle, { color: p.danger }]}>
                {t('safety.checklist.flaggedTitle')}
              </Text>
            </View>
            {failedItems.map((item, index) => (
              <Text key={keyOf(item, index)} style={styles.flaggedItem} numberOfLines={2}>
                {item.description ?? item.label ?? ''}
              </Text>
            ))}
            <Text style={styles.fieldLabel}>{t('site.inspections.severityLabel')}</Text>
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
                        borderColor: on ? p.danger : p.border,
                        backgroundColor: on ? p.danger : 'transparent',
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
          </View>
        ) : null}

        {/* PHOTO + NOTE — the drawing puts them on every item; they exist once, on the inspection. */}
        <Text style={styles.sectionLabel}>{t('safety.checklist.attachments')}</Text>
        <PhotoCapture entityType="inspection" entityId={active.checklistId} />
        <UnavailableNote
          testID="checklist-note-unavailable"
          reason={t('safety.checklist.itemExtrasUnavailable')}
        />

        <Text style={styles.sectionLabel}>{t('safety.checklist.authorization')}</Text>
        <SignaturePad
          testID="safety-signature"
          strokes={signature}
          onChange={setSignature}
          signerName={displayName}
        />

        <TouchableOpacity
          testID="submit-inspection-button"
          accessibilityRole="button"
          accessibilityLabel={t('safety.checklist.completeInspection')}
          onPress={() => void submit()}
          disabled={!allRated}
          style={[styles.primaryButton, !allRated && styles.disabled]}
        >
          <MaterialIcons name="verified-user" size={20} color={p.onPrimary} />
          <Text style={styles.primaryButtonText}>{t('safety.checklist.completeInspection')}</Text>
        </TouchableOpacity>

        {submitted ? (
          <Text testID="inspection-saved" style={[styles.muted, { color: p.success }]}>
            {t('site.inspections.saved')}
          </Text>
        ) : null}

        {/* The drawing's mic FAB — drawn, and it has nowhere to put a recording. */}
        <TouchableOpacity
          testID="checklist-voice"
          accessibilityRole="button"
          accessibilityLabel={t('safety.checklist.voiceTitle')}
          onPress={() =>
            Alert.alert(t('safety.checklist.voiceTitle'), t('safety.checklist.voiceUnavailable'))
          }
          style={[styles.voiceButton, { borderColor: p.border }]}
        >
          <MaterialIcons name="mic" size={20} color={p.muted} />
          <Text style={[styles.resultText, { color: p.muted }]}>
            {t('safety.checklist.voiceTitle')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          testID="checklist-back"
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          onPress={() => setActive(null)}
          style={styles.backRow}
        >
          <MaterialIcons name="arrow-back" size={18} color={p.accent} />
          <Text style={[styles.resultText, { color: p.accent }]}>{t('common.back')}</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // ── the list phase ─────────────────────────────────────────────────────────
  return (
    <ScrollView testID="inspection-list" style={styles.root} contentContainerStyle={styles.page}>
      <ProjectContextBar />

      <TouchableOpacity
        testID="new-inspection-button"
        accessibilityRole="button"
        accessibilityLabel={t('site.inspections.fill')}
        onPress={openBlank}
        disabled={available.length === 0}
        style={[styles.primaryButton, available.length === 0 && styles.disabled]}
      >
        <MaterialIcons name="playlist-add-check" size={20} color={p.onPrimary} />
        <Text style={styles.primaryButtonText}>{t('site.inspections.fill')}</Text>
      </TouchableOpacity>

      <LoadingBoundary loading={loading} variant="list" theme={isDark ? 'dark' : 'light'}>
        <View style={styles.feed}>
          {inspections.length === 0 ? (
            <Text style={styles.muted}>{t('site.inspections.empty')}</Text>
          ) : (
            inspections.map((row) => {
              // PASSED/FAILED/PENDING share the permit tone map only in shape, not in meaning — so
              // the colour is picked here from the inspection's own vocabulary.
              const tone =
                row.status === 'PASSED'
                  ? p.success
                  : row.status === 'FAILED'
                    ? p.danger
                    : p.warning;
              return (
                <TouchableOpacity
                  key={row.inspection_id}
                  testID="inspection-item"
                  accessibilityRole="button"
                  accessibilityLabel={row.status}
                  onPress={() => openInspection(row)}
                  style={[styles.listRow, { borderLeftColor: tone }]}
                >
                  <View style={styles.grow}>
                    <Text style={styles.itemTitle} numberOfLines={1}>
                      {available.find((c) => c.checklistId === row.checklist_id)?.name ||
                        t('safety.checklist.untitled')}
                    </Text>
                    <Text style={[styles.muted, { color: tone }]}>{row.status}</Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={20} color={p.muted} />
                </TouchableOpacity>
              );
            })
          )}
        </View>
      </LoadingBoundary>
    </ScrollView>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: p.bg },
    // `xl * 3`, not `xl * 2` — the first capture (2026-08-13) caught COMPLETE INSPECTION sitting
    // half-under the bottom nav, which is ~56px plus the gesture inset. Same clearance as every
    // other scrolling screen in the shell.
    page: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl * 3 },
    grow: { flex: 1 },
    subtitle: {
      color: p.muted,
      fontSize: typography.label.fontSize,
      fontFamily: fontFamily.medium,
    },
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
    itemCard: {
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
    },
    itemTitle: {
      color: p.text,
      fontSize: typography.caption.fontSize,
      fontFamily: fontFamily.semibold,
    },
    resultRow: { flexDirection: 'row', gap: spacing.xs },
    resultButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs / 2,
      minHeight: touchTarget.secondaryButton,
      borderRadius: radius.md,
      borderWidth: 1,
    },
    resultText: {
      fontSize: typography.label.fontSize,
      fontFamily: fontFamily.semibold,
      textTransform: 'uppercase',
    },
    flagged: {
      gap: spacing.xs,
      padding: spacing.md,
      borderRadius: radius.lg,
      borderWidth: 1,
      backgroundColor: p.surface,
    },
    flaggedItem: {
      color: p.text,
      fontSize: typography.label.fontSize,
      fontFamily: fontFamily.regular,
    },
    fieldLabel: {
      color: p.muted,
      fontSize: typography.label.fontSize,
      fontFamily: fontFamily.semibold,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      marginTop: spacing.xs,
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
    sectionLabel: {
      color: p.muted,
      fontSize: typography.label.fontSize,
      fontFamily: fontFamily.semibold,
      letterSpacing: 1,
      textTransform: 'uppercase',
      marginTop: spacing.xs,
    },
    primaryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      minHeight: touchTarget.primaryButton + 8,
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
    voiceButton: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      minHeight: touchTarget.secondaryButton,
      paddingHorizontal: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1,
    },
    backRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs / 2,
      minHeight: touchTarget.iconButton,
    },
    feed: { gap: spacing.xs },
    listRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      minHeight: touchTarget.listItem,
      padding: spacing.sm,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: p.border,
      borderLeftWidth: 4,
      backgroundColor: p.surface,
    },
    muted: { color: p.muted, fontSize: typography.label.fontSize, fontFamily: fontFamily.regular },
  });

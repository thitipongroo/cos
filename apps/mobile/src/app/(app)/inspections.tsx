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
// REDRAWN 2026-09-17 (R23) to the Stitch screen "Daily Safety Checklist - Refined with Active
// Project Bar" (fed2fd95c539…, byte-identical to the repo drawing), with the 2026-08-13 "not
// available yet" notes reversed (D40) and two structural decisions:
//
//   D41 — FOR THE SAFETY OFFICER THE TAB IS THE FORM. The drawing heads the Checklists tab with the
//     checklist itself, so this screen opens the active project's first template straight away for
//     that role. Every other role still lands on the list (the drawer route, and the Detox scenario
//     `e2e/offline-inspection.spec.ts`, are untouched — `inspection-list`, `inspection-item`,
//     `inspection-checklist`, `checklist-item`, `checklist-pass-button` all keep their ids).
//   D46 — THE SUBMITTED INSPECTIONS ARE A ROW UNDER THE FORM ("Past inspections"), which opens the
//     same list. Nothing is lost; it stops being the first thing a safety officer has to walk past.
//
// WHAT IS DRAWN (lib/mockupFigures.ts, ADR-099) — COMING SOON:
//   - the AI HAZARD ALERT, confidence and source line (`CHECKLIST_HAZARD_ALERT`). There is no
//     weather source in this platform at all — no ingestion, no provider, no column — and no safety
//     AI surface (§22.6).
//   - the GROUP HEADINGS "PPE & PERSONNEL" / "STRUCTURE & EQUIPMENT" and which item falls under
//     which (`CHECKLIST_GROUPS`). §11 gives an item an id, a description and is_required and no
//     group, so the split is BY POSITION — first half toggles, the rest checkboxes.
//   - the per-item PHOTO and NOTE buttons. Nothing stores either against an ITEM: photos attach to
//     an entity and an inspection has one `notes` column. They open the coming-soon dialog; the
//     REAL photo control (<PhotoCapture />, attached to the inspection) stays under the list.
//   - the FLAGGED row's sentence and photograph (`CHECKLIST_FLAGGED`, D44).
//   - the MIC control. A voice log has nowhere to attach on an inspection.
//
// D47 — AN ITEM IS ANSWERED BY THE DRAWING'S TOGGLE OR CHECKBOX, and its resting state is NOT
// passed. There is no third "unanswered" state any more, so the form can be submitted at any time
// and §11's rule decides the result: FAILED if any item is not passed, else PASSED.
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

import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Image, Switch, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
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
import { AiCardFooter } from '../../components/AiCardFooter';
import { useComingSoon } from '../../components/useComingSoon';
import {
  CHECKLIST_FLAGGED,
  CHECKLIST_GROUPS,
  CHECKLIST_HAZARD_ALERT,
} from '../../lib/mockupFigures';
import { useAuthStore } from '../../store/authStore';
import { CosRole } from '@cos/types';
import { useProjectStore } from '../../store/projectStore';
import { useI18n } from '../../i18n';
import { fontFamily, radius, spacing, touchTarget, typography } from '../../theme/tokens';
import { usePalette, useIsDark, type Palette } from '../../theme/usePalette';
import { screenChrome } from '../../theme/screenStyles';
import { SeverityPicker, SEVERITIES } from '../../components/SeverityPicker';
import flaggedPhoto from '../../../assets/safety/flagged-excavator.jpg';

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
  const role = useAuthStore((state) => state.role);
  const soon = useComingSoon();
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
  // D46: the safety officer reaches the submitted inspections through a row under the form. Every
  // other role opens on the list, which is what this flag starts as for them.
  const [browsingHistory, setBrowsingHistory] = useState(false);

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

  /**
   * D41: the Checklists tab IS the form for the SAFETY_OFFICER.
   *
   * Runs once the templates have landed and only while nothing else is open — a reader who has gone
   * to the history, or opened a submitted inspection from it, is not pulled back to a blank form.
   */
  const openForRole = useCallback(() => {
    if (role !== CosRole.SAFETY_OFFICER || browsingHistory || active !== null) return;
    const first = available[0];
    if (first !== undefined) setActive(first);
  }, [role, browsingHistory, active, available]);

  useEffect(() => {
    openForRole();
  }, [openForRole]);

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
    // §11 inspection result: FAILED if any item is NOT PASSED, else PASSED. A template with no
    // items submits as PASSED. Since R23 (D47) an item nobody touched counts as not passed — the
    // drawing's toggle and checkbox rest in that position and there is no third state.
    const failed = items.some((item, index) => results[keyOf(item, index)] !== 'PASS');
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
    // D47: an item nobody has answered is NOT passed. There is no third state to wait for, so the
    // form submits whenever the reader is ready and §11 decides the result from the answers.
    const passed = (item: ChecklistItem, index: number): boolean =>
      results[keyOf(item, index)] === 'PASS';
    const failedItems = items.filter((item, index) => !passed(item, index));
    // DRAWN — items carry no group, so the drawing's two sections are a split by position.
    const ppeCount = Math.ceil(items.length / 2);

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

        {/* AI HAZARD ALERT — DRAWN in full: no weather reaches this app and no model reads it. */}
        <View testID="checklist-hazard" style={[styles.aiCard, { borderLeftColor: p.accent }]}>
          <View style={styles.aiHead}>
            <MaterialIcons name="thermostat" size={18} color={p.accent} />
            <Text style={[styles.aiTitle, { color: p.accent }]}>
              {t('safety.checklist.hazardAlertTitle')}
            </Text>
          </View>
          <Text style={styles.hazardBody}>
            {t('safety.checklist.hazardAlertBody', {
              wind: String(CHECKLIST_HAZARD_ALERT.value.windMph),
              item:
                items[0]?.description ??
                items[0]?.label ??
                t('site.inspections.itemFallback', { index: 1 }),
            })}
          </Text>
          <AiCardFooter
            testID="checklist-hazard-foot"
            percent={CHECKLIST_HAZARD_ALERT.value.confidence}
            source={t('safety.checklist.hazardSource')}
            confLabel={t('insight.confShort')}
            sourceLabel={t('insight.sourceShort')}
            // The card's one way in (R22, D38) — there is no forecast screen behind it.
            onPress={() => soon('safety.checklist.hazardAlertTitle')}
            palette={p}
          />
        </View>

        {items.length === 0 ? (
          <Text style={styles.muted}>{t('site.inspections.noItems')}</Text>
        ) : (
          items.map((item, index) => {
            const key = keyOf(item, index);
            const result = results[key];
            const inPpe = index < ppeCount;
            const label =
              item.description ??
              item.label ??
              t('site.inspections.itemFallback', { index: index + 1 });
            return (
              <View key={key}>
                {/* DRAWN — the drawing's two section headings; see `CHECKLIST_GROUPS`. */}
                {index === 0 || index === ppeCount ? (
                  <Text
                    testID={`checklist-group-${inPpe ? CHECKLIST_GROUPS.value.first : CHECKLIST_GROUPS.value.second}`}
                    style={styles.sectionLabel}
                  >
                    {t(inPpe ? 'safety.checklist.groupPpe' : 'safety.checklist.groupStructure')}
                  </Text>
                ) : null}
                <View
                  testID="checklist-item"
                  style={[
                    styles.itemCard,
                    result !== 'PASS' && { borderLeftWidth: 6, borderLeftColor: p.danger },
                  ]}
                >
                  <View style={styles.itemHead}>
                    <Text style={[styles.itemTitle, styles.grow]}>{label}</Text>
                    {/* D47 — the drawing's switch in the first group, its checkbox in the second.
                        Off is "not passed"; there is no unanswered state. */}
                    {inPpe ? (
                      <Switch
                        testID="checklist-pass-button"
                        accessibilityLabel={label}
                        value={result === 'PASS'}
                        onValueChange={(on) =>
                          setResults((r) => ({ ...r, [key]: on ? 'PASS' : 'FAIL' }))
                        }
                        trackColor={{ false: p.danger, true: p.success }}
                        thumbColor={p.onPrimary}
                      />
                    ) : (
                      <TouchableOpacity
                        testID="checklist-pass-button"
                        accessibilityRole="checkbox"
                        accessibilityLabel={label}
                        accessibilityState={{ checked: result === 'PASS' }}
                        onPress={() =>
                          setResults((r) => ({
                            ...r,
                            [key]: result === 'PASS' ? 'FAIL' : 'PASS',
                          }))
                        }
                        style={[
                          styles.checkbox,
                          {
                            borderColor: result === 'PASS' ? p.success : p.border,
                            backgroundColor: result === 'PASS' ? p.success : 'transparent',
                          },
                        ]}
                      >
                        {result === 'PASS' ? (
                          <MaterialIcons name="check" size={18} color={p.onPrimary} />
                        ) : null}
                      </TouchableOpacity>
                    )}
                  </View>
                  {/* DRAWN — the drawing's per-item PHOTO and NOTE buttons, on the toggle group.
                    Neither has anywhere to write: photos attach to the inspection (below) and an
                    inspection has one note column, not one per item. */}
                  {inPpe ? (
                    <View style={styles.itemExtras}>
                      {(['photo', 'note'] as const).map((extra) => (
                        <TouchableOpacity
                          key={extra}
                          testID={`checklist-item-${extra}`}
                          accessibilityRole="button"
                          accessibilityLabel={t(`safety.checklist.${extra}`)}
                          onPress={() => soon(`safety.checklist.${extra}`)}
                          style={styles.extraButton}
                        >
                          <MaterialIcons
                            name={extra === 'photo' ? 'add-a-photo' : 'edit-note'}
                            size={16}
                            color={p.muted}
                          />
                          <Text style={[styles.resultText, { color: p.muted }]}>
                            {t(`safety.checklist.${extra}`)}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : null}

                  {/* DRAWN — the drawing flags its second row with a sentence and a photograph. */}
                  {index === CHECKLIST_FLAGGED.value.itemIndex && result !== 'PASS' ? (
                    <View testID="checklist-item-flagged" style={styles.itemFlag}>
                      <View style={styles.aiHead}>
                        <MaterialIcons name="report-problem" size={16} color={p.danger} />
                        <Text style={[styles.resultText, { color: p.danger }]} numberOfLines={2}>
                          {t('safety.checklist.flagged', {
                            text: t('safety.checklist.flaggedText'),
                          })}
                        </Text>
                      </View>
                      <View>
                        <Image
                          source={flaggedPhoto}
                          style={styles.flagPhoto}
                          accessibilityIgnoresInvertColors
                        />
                        <View style={[styles.attachedChip, { backgroundColor: p.danger }]}>
                          <Text style={styles.attachedText}>
                            {t('safety.checklist.issueAttached')}
                          </Text>
                        </View>
                      </View>
                    </View>
                  ) : null}
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
            <SeverityPicker
              value={severity}
              onChange={setSeverity}
              palette={p}
              accent={p.danger}
              restBackground="transparent"
              levels={SEVERITIES}
            />
          </View>
        ) : null}

        {/* THE REAL PHOTO CONTROL: <PhotoCapture /> attaches to the inspection. The drawing's
            per-item buttons are above, and neither of those has anywhere to write. */}
        <Text style={styles.sectionLabel}>{t('safety.checklist.attachments')}</Text>
        <PhotoCapture entityType="inspection" entityId={active.checklistId} />

        <Text style={styles.sectionLabel}>{t('safety.checklist.authorization')}</Text>
        <Text style={styles.muted}>{t('safety.checklist.signPrompt')}</Text>
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
          style={styles.primaryButton}
        >
          <MaterialIcons name="verified-user" size={20} color={p.onPrimary} />
          <Text style={styles.primaryButtonText}>{t('safety.checklist.completeInspection')}</Text>
        </TouchableOpacity>

        {submitted ? (
          <Text testID="inspection-saved" style={[styles.muted, { color: p.success }]}>
            {t('site.inspections.saved')}
          </Text>
        ) : null}

        {/* D46 — the submitted inspections, one row under the form rather than in front of it. */}
        <TouchableOpacity
          testID="checklist-history"
          accessibilityRole="button"
          accessibilityLabel={t('safety.checklist.history')}
          onPress={() => {
            setBrowsingHistory(true);
            setActive(null);
          }}
          style={styles.historyRow}
        >
          <MaterialIcons name="history" size={18} color={p.accent} />
          <Text style={[styles.resultText, styles.grow, { color: p.accent }]}>
            {t('safety.checklist.history')}
          </Text>
          <Text style={styles.muted}>
            {t('safety.checklist.historyCount', { count: inspections.length })}
          </Text>
          <MaterialIcons name="chevron-right" size={18} color={p.accent} />
        </TouchableOpacity>

        {/* The drawing's mic control — drawn, and it has nowhere to put a recording. */}
        <TouchableOpacity
          testID="checklist-voice"
          accessibilityRole="button"
          accessibilityLabel={t('safety.checklist.voiceTitle')}
          onPress={() => soon('safety.checklist.voiceTitle')}
          style={[styles.voiceButton, { borderColor: p.border }]}
        >
          <MaterialIcons name="mic" size={20} color={p.muted} />
          <Text style={[styles.resultText, { color: p.muted }]}>
            {t('safety.checklist.voiceTitle')}
          </Text>
        </TouchableOpacity>

        {role === CosRole.SAFETY_OFFICER ? null : (
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
        )}
      </ScrollView>
    );
  }

  // ── the list phase ─────────────────────────────────────────────────────────
  return (
    <ScrollView testID="inspection-list" style={styles.root} contentContainerStyle={styles.page}>
      <ProjectContextBar />

      {role === CosRole.SAFETY_OFFICER ? (
        <TouchableOpacity
          testID="checklist-back-to-form"
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          onPress={() => {
            setBrowsingHistory(false);
            openBlank();
          }}
          style={styles.backRow}
        >
          <MaterialIcons name="arrow-back" size={18} color={p.accent} />
          <Text style={[styles.resultText, { color: p.accent }]}>{t('common.back')}</Text>
        </TouchableOpacity>
      ) : null}

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
    ...screenChrome(p),
    // `xl * 3`, not `xl * 2` — the first capture (2026-08-13) caught COMPLETE INSPECTION sitting
    // half-under the bottom nav, which is ~56px plus the gesture inset. Same clearance as every
    // other scrolling screen in the shell.
    subtitle: {
      color: p.muted,
      fontSize: typography.label.fontSize,
      fontFamily: fontFamily.medium,
    },
    hazardBody: {
      color: p.text,
      fontSize: typography.label.fontSize,
      lineHeight: typography.label.fontSize * 1.5,
      fontFamily: fontFamily.regular,
    },
    itemHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    grow: { flex: 1 },
    // The drawing's checkbox in the STRUCTURE group — a square target, not a capsule.
    checkbox: {
      width: 28,
      height: 28,
      borderRadius: radius.sm,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    itemExtras: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xs },
    extraButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs / 2,
      minHeight: touchTarget.secondaryButton,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surfaceSoft,
    },
    itemFlag: {
      gap: spacing.xs,
      marginTop: spacing.sm,
      padding: spacing.sm,
      borderRadius: radius.md,
      backgroundColor: `${p.danger}1A`,
    },
    flagPhoto: { width: '100%', height: 140, borderRadius: radius.md },
    attachedChip: {
      position: 'absolute',
      right: spacing.xs,
      bottom: spacing.xs,
      paddingHorizontal: spacing.xs,
      paddingVertical: 2,
      borderRadius: radius.xl,
    },
    attachedText: {
      color: p.onPrimary,
      fontSize: 10,
      fontFamily: fontFamily.bold,
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
    historyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      minHeight: touchTarget.listItem,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
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
  });

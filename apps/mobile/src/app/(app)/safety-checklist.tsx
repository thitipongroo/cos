// Safety checklist — SITE_WORKER daily pre-shift verification (offline-first).
// Implements mockup/mobile/05_site_worker/03_safety/01_checklist ("เช็คลิสต์ความปลอดภัย").
//
// The checklist TEMPLATE comes from GET /safety/checklists (a role the SITE_WORKER has always had);
// the completed checklist is submitted to POST /safety/checklists, which the role gained on
// 2026-08-08 (ADR-089 — resolving the §6.8-vs-§14 conflict for this route only). Submission goes
// through mutate(), so offline it enqueues the 'inspection' entity to /sync/push and flushes on
// reconnect (§17.4 lists safety checklists as offline read/write; §17.6 priority 3).
//
// A completed safety checklist IS an inspection row — same service method, same SubmitInspectionDto —
// which is why the offline entity type is `inspection` and not a new one.
//
// TWO MOCKUP ZONES WERE DROPPED AND ARE NOW BACK (PO decision 2026-08-08, reversing the same day's
// earlier call):
//   - "AI Safety Scan — automated PPE detection … START SCAN" is drawn in full, mockup copy included.
//     SafetyVisionModel is Phase 23 and needs 10,000+ labelled site photos before it can be trained
//     (§22.6), so START SCAN says so plainly (`common.comingSoon`) instead of pretending to scan. It
//     is the mockup's illustration of a planned capability, and it gates nothing on this screen.
//   - The digital signature pad IS stored now. Migration 20260808000002 added
//     `site_ops.inspections.signature` (JSONB, nullable) and the strokes go up with the submission —
//     the reason it was dropped ("nothing stores a signature") no longer holds. It is an ATTESTATION
//     MARK, not a qualified e-signature: the authoritative attribution stays `inspected_by` /
//     `inspected_at`, set server-side from the session. See <SignaturePad /> and ADR-058 for the
//     separate contract e-signature mechanism this must not be confused with.

import { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { get, mutate } from '../../api/client';
import type { SafetyChecklist } from '../../db/database';
import { useCollection } from '../../hooks/useCollection';
import { ProjectPicker } from '../../components/ProjectPicker';
import { SignaturePad } from '../../components/SignaturePad';
import type { AnnotationStroke } from '../../components/PhotoAnnotation';
import { useAuthStore } from '../../store/authStore';
import { LoadingBoundary } from '../../components/LoadingBoundary';
import { useT } from '../../i18n';
import {
  fontFamily,
  plateRadius,
  radius,
  spacing,
  touchTarget,
  typography,
} from '../../theme/tokens';
import { usePalette, useIsDark } from '../../theme/usePalette';
import { makeScreenStyles } from '../../theme/screenStyles';

/** One row of a checklist template — `site_ops.safety_checklists.items` (JSONB array). */
interface ChecklistItem {
  item_id?: string;
  id?: string;
  description?: string;
  label?: string;
  is_required?: boolean;
}

interface ChecklistRow {
  checklist_id: string;
  project_id: string;
  checklist_name: string;
  items?: unknown;
}

/** Server rows and locally cached rows carry the same fields under different names — normalise. */
function itemsOf(source: unknown): ChecklistItem[] {
  const raw = typeof source === 'string' ? safeParse(source) : source;
  return Array.isArray(raw) ? (raw as ChecklistItem[]) : [];
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // A malformed template is a server-side data problem; render an empty checklist rather than
    // crashing the screen a worker needs before a shift.
    return [];
  }
}

/**
 * Drop the trailing "Inspection" from a checklist name.
 *
 * Every template on this screen IS an inspection, so the word carried no information and cost most
 * of a chip's width — "Foundation Inspection (2)" barely fits, "Foundation (2)" reads at a glance
 * (PO decision 2026-08-08). Applied at DISPLAY time only: the stored `checklist_name` is untouched,
 * so a name that does not end in the word (or is Thai) is returned unchanged.
 */
export function shortChecklistName(name: string): string {
  return name.replace(/\s+Inspection\s*$/i, '').trim() || name;
}

function keyOf(item: ChecklistItem, index: number): string {
  return item.item_id ?? item.id ?? String(index);
}

function labelOf(item: ChecklistItem, index: number): string {
  return item.description ?? item.label ?? `#${index + 1}`;
}

export default function SafetyChecklistScreen() {
  const cached = useCollection<SafetyChecklist>('local_safety_checklists');
  const [projectId, setProjectId] = useState('');
  const [remote, setRemote] = useState<ChecklistRow[]>([]);
  // Starts FALSE: nothing is fetched until a project is chosen, and a loader shown before the first
  // request would sit there forever on a device whose project cache is still empty.
  const [loading, setLoading] = useState(false);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  // The drawn confirmation. Held here rather than inside <SignaturePad /> because it is submitted
  // with the checklist and must survive the pad unmounting behind a re-render.
  const [signature, setSignature] = useState<AnnotationStroke[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const t = useT();
  const p = usePalette();
  const isDark = useIsDark();
  // Whoever is signing — the authenticated session, never typed in.
  const displayName = useAuthStore((state) => state.displayName);
  const screen = useMemo(() => makeScreenStyles(p), [p]);

  // Scoped to ONE project. Unscoped, the endpoint returns every checklist across every project the
  // worker belongs to — five projects × four templates on the demo tenant — and the picker then shows
  // "Foundation Inspection" five times with nothing to tell them apart. The project is the axis a
  // field worker actually thinks in, and it is the same ProjectPicker the tasks/report/issue screens
  // use, so the choice carries across the role's screens.
  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    void (async () => {
      try {
        const res = await get<{ items?: ChecklistRow[] } | ChecklistRow[]>(
          `/safety/checklists?project_id=${encodeURIComponent(projectId)}`,
        );
        setRemote(Array.isArray(res) ? res : (res.items ?? []));
      } catch {
        /* offline — the locally cached checklist below stands in */
      } finally {
        setLoading(false);
      }
    })();
  }, [projectId]);

  // Prefer the freshly fetched templates; fall back to whatever delta sync cached, so the screen
  // still works with no signal — the condition it is most likely to be opened in. Cached rows store
  // the template as a JSON STRING (`items` column → `itemsJson`) where the server sends it already
  // parsed; itemsOf() takes either.
  const available = useMemo(
    () =>
      remote.length > 0
        ? remote.map((row) => ({
            checklistId: row.checklist_id,
            projectId: row.project_id,
            name: row.checklist_name,
            items: itemsOf(row.items),
          }))
        : // The cache holds every project's checklists, so it is filtered here to the same project the
          // fetch above was scoped to — otherwise going offline would silently widen the list.
          cached
            .filter((row) => row.projectId === projectId)
            .map((row) => ({
              checklistId: row.checklistId,
              projectId: row.projectId,
              name: row.checklistName,
              items: itemsOf(row.itemsJson),
            })),
    [remote, cached, projectId],
  );

  // WHICH checklist is being filled — or "All", which unions every checklist for the project into
  // one pass (PO decision 2026-08-08). `null` IS the All selection, not "nothing chosen": a worker
  // arriving at the screen should see everything due today rather than one arbitrary template.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const active =
    selectedId === null ? null : (available.find((c) => c.checklistId === selectedId) ?? null);

  /**
   * The checklists currently on screen: one when a chip is picked, all of them in All mode.
   *
   * Item keys are namespaced by checklist id because two templates can legitimately share an
   * `item_id` — both a Foundation and an MEP checklist may carry `"ppe"` — and an unnamespaced key
   * would tick both at once.
   */
  const showing = active ? [active] : available;
  const rows = showing.flatMap((checklist) =>
    checklist.items.map((item, index) => ({
      checklist,
      item,
      index,
      key: `${checklist.checklistId}:${keyOf(item, index)}`,
    })),
  );

  const doneCount = rows.filter((r) => checked[r.key]).length;
  // Every item must be ticked before a worker can attest — this is a safety verification, and a
  // partially completed one asserts something untrue.
  const allChecked = rows.length > 0 && doneCount === rows.length;

  const onConfirm = async (): Promise<void> => {
    if (rows.length === 0) return;
    const at = new Date().toISOString();
    // ONE INSPECTION PER CHECKLIST, even though the worker confirmed once. site_ops.inspections is
    // keyed by checklist_id — a single row cannot represent "these four checklists passed" — so All
    // mode fans out. Sent sequentially rather than in parallel so the offline queue receives them in
    // a stable order (§17.6) and a mid-flight failure leaves a prefix, not an arbitrary subset.
    for (const checklist of showing) {
      await mutate(
        'POST',
        '/safety/checklists',
        {
          project_id: checklist.projectId,
          checklist_id: checklist.checklistId,
          // Every item ticked → PASSED. The screen refuses to submit otherwise (see `allChecked`), so
          // FAILED is not reachable from here: a worker who cannot tick an item raises an ISSUE, which
          // is a different record with a different reader.
          status: 'PASSED',
          inspected_at: at,
          // The same drawn mark is attached to each row the confirmation produced — it is one act of
          // attestation, and a row without it would read as unsigned. Omitted entirely when the pad
          // is empty, so `signature` stays NULL rather than an empty array.
          ...(signature.length > 0 ? { signature } : {}),
        },
        'inspection',
        checklist.checklistId,
      );
    }
    setSubmitted(true);
  };

  return (
    <ScrollView
      testID="safety-checklist-screen"
      style={{ backgroundColor: p.bg }}
      contentContainerStyle={styles.page}
    >
      {/* No page title (§32.7 — the "Safety" tab names this screen), and the word REQUIRED appears
          nowhere: neither the header badge nor the per-row "Required check" line survived
          2026-08-08. Both read as decoration — nothing on screen said what was required or by when,
          and `is_required` is true for every seeded item, so the line printed on all of them and
          distinguished nothing. The obligation is carried by content that states it: the
          verification counter below, and a confirm button disabled until every box is ticked.
          `is_required` is still read from the definition — it just does not get its own caption. */}
      <ProjectPicker selectedId={projectId} onSelect={setProjectId} />

      <LoadingBoundary loading={loading} variant="list" theme={isDark ? 'dark' : 'light'}>
        {rows.length > 0 ? (
          <>
            {/* "All (n)" first, then one chip per checklist with ITS item count — a worker needs to
                know how much is left before choosing, and the counts are the real array lengths. The
                trailing word "Inspection" is stripped: every one of these IS an inspection, so the
                word carried no information and cost most of the chip's width. */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.pickerRow}
            >
              {[
                {
                  id: null as string | null,
                  label: t('safety.checklist.all'),
                  count: available.reduce((n, c) => n + c.items.length, 0),
                },
                ...available.map((c) => ({
                  id: c.checklistId,
                  label: shortChecklistName(c.name),
                  count: c.items.length,
                })),
              ].map((chip) => {
                const isActive = chip.id === selectedId;
                return (
                  <TouchableOpacity
                    key={chip.id ?? 'all'}
                    testID={`checklist-pick-${chip.id ?? 'all'}`}
                    onPress={() => {
                      setSelectedId(chip.id);
                      setChecked({}); // a different selection starts unticked — never carry ticks over
                      setSubmitted(false);
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isActive }}
                    style={[
                      styles.pickerChip,
                      {
                        borderColor: isActive ? p.primary : p.border,
                        backgroundColor: isActive ? p.primary : p.surface,
                      },
                    ]}
                  >
                    <Text
                      style={[styles.pickerText, { color: isActive ? p.onPrimary : p.muted }]}
                      numberOfLines={1}
                    >
                      {`${chip.label} (${chip.count})`}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* AI SAFETY SCAN — mockup 04_safety. Drawn in full, copy and all (PO decision
                2026-08-08), the same ruling already applied to the Tenant Admin CORE_AI panels.
                SafetyVisionModel is Phase 23 and untrained (§22.6 — it needs 10,000+ labelled site
                photos), so START SCAN opens an honest "not available yet" notice rather than
                pretending to analyse the frame. */}
            <View
              style={[styles.aiCard, { backgroundColor: p.elevated, borderLeftColor: p.accent }]}
            >
              <View
                style={[styles.aiIconPlate, { backgroundColor: p.surface, borderColor: p.accent }]}
              >
                <MaterialIcons name="center-focus-strong" size={28} color={p.accent} />
              </View>
              <Text style={[styles.aiTitle, { color: p.text }]}>
                {t('safety.checklist.aiScanTitle')}
              </Text>
              <Text style={[styles.aiBody, { color: p.muted }]}>
                {t('safety.checklist.aiScanBody')}
              </Text>
              <TouchableOpacity
                testID="ai-safety-scan"
                style={[styles.aiButton, { backgroundColor: p.accent }]}
                onPress={() =>
                  Alert.alert(t('safety.checklist.aiScanTitle'), t('common.comingSoon'))
                }
              >
                <MaterialIcons name="center-focus-strong" size={20} color={p.bg} />
                <Text style={[styles.aiButtonText, { color: p.bg }]}>
                  {t('safety.checklist.aiScanStart')}
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.sectionLabel, { color: p.muted }]}>
              {t('safety.checklist.verification', { done: doneCount, total: rows.length })}
            </Text>

            {rows.map((row, i) => {
              const isChecked = Boolean(checked[row.key]);
              // In All mode the rows come from several checklists, so each group is headed once —
              // otherwise "ตรวจการวางเหล็กเสริม" and "สวมใส่หมวกนิรภัย" sit in one undifferentiated
              // list and the worker cannot tell which inspection they are completing.
              const groupChanged =
                i === 0 || rows[i - 1]!.checklist.checklistId !== row.checklist.checklistId;
              return (
                <View key={row.key}>
                  {selectedId === null && groupChanged ? (
                    <Text style={[styles.groupLabel, { color: p.accent }]}>
                      {shortChecklistName(row.checklist.name)}
                    </Text>
                  ) : null}
                  <TouchableOpacity
                    testID={`safety-item-${row.key}`}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: isChecked }}
                    onPress={() => setChecked((c) => ({ ...c, [row.key]: !c[row.key] }))}
                    style={[
                      styles.item,
                      {
                        backgroundColor: p.surface,
                        borderColor: isChecked ? p.success : p.border,
                      },
                    ]}
                  >
                    <MaterialIcons
                      name={isChecked ? 'check-box' : 'check-box-outline-blank'}
                      size={28}
                      color={isChecked ? p.success : p.muted}
                    />
                    <View style={styles.itemBody}>
                      <Text style={[styles.itemText, { color: p.text }]}>
                        {labelOf(row.item, row.index)}
                      </Text>
                    </View>
                  </TouchableOpacity>
                </View>
              );
            })}

            {/* DIGITAL AUTHORIZATION — mockup 04_safety. The drawn mark is STORED (migration
                20260808000002, PO decision 2026-08-08): it goes up with the submission and is
                attached to every inspection the confirmation creates. It is an attestation mark, not
                a qualified e-signature — see <SignaturePad />. */}
            <Text style={[styles.sectionLabel, { color: p.muted }]}>
              {t('safety.checklist.authorization')}
            </Text>
            <SignaturePad
              testID="safety-signature"
              strokes={signature}
              onChange={setSignature}
              signerName={displayName}
            />

            <TouchableOpacity
              testID="confirm-safety-button"
              style={[screen.primaryButton, styles.confirm, !allChecked && screen.buttonDisabled]}
              onPress={() => void onConfirm()}
              disabled={!allChecked}
            >
              <MaterialIcons name="verified-user" size={20} color={p.onPrimary} />
              <Text style={screen.primaryButtonText}>{t('safety.checklist.confirm')}</Text>
            </TouchableOpacity>

            {submitted ? (
              <Text testID="safety-submitted" style={[styles.saved, { color: p.success }]}>
                {t('safety.checklist.submitted')}
              </Text>
            ) : null}
          </>
        ) : (
          <Text style={screen.empty}>{t('safety.checklist.empty')}</Text>
        )}
      </LoadingBoundary>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
  subtitle: { fontSize: typography.caption.fontSize, fontFamily: fontFamily.regular },
  pickerRow: { gap: spacing.xs, paddingVertical: spacing.xs },
  pickerChip: {
    maxWidth: 220,
    minHeight: touchTarget.secondaryButton,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.xl,
    borderWidth: 1,
  },
  pickerText: { fontSize: typography.label.fontSize, fontFamily: fontFamily.medium },
  // AI Safety Scan — the mockup's left-accented panel with a centred icon plate.
  aiCard: {
    borderRadius: radius.lg,
    borderLeftWidth: 4,
    padding: spacing.md,
    alignItems: 'center',
    gap: spacing.xs,
  },
  aiIconPlate: {
    width: 56,
    height: 56,
    borderRadius: plateRadius(56),
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  aiTitle: { fontSize: typography.body.fontSize, fontFamily: fontFamily.semibold },
  aiBody: {
    fontSize: typography.label.fontSize,
    fontFamily: fontFamily.regular,
    textAlign: 'center',
    paddingHorizontal: spacing.sm,
  },
  aiButton: {
    alignSelf: 'stretch',
    minHeight: touchTarget.primaryButton,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radius.md,
    marginTop: spacing.xs,
  },
  aiButtonText: {
    fontSize: typography.body.fontSize,
    fontFamily: fontFamily.semibold,
    textTransform: 'uppercase',
  },
  // Heads each checklist's block in All mode.
  groupLabel: {
    fontSize: typography.label.fontSize,
    fontFamily: fontFamily.semibold,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  sectionLabel: {
    fontSize: typography.label.fontSize,
    fontFamily: fontFamily.semibold,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: spacing.sm,
  },
  item: {
    minHeight: touchTarget.listItem,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  itemBody: { flex: 1, gap: 2 },
  itemText: { fontSize: typography.body.fontSize, fontFamily: fontFamily.medium },
  itemMeta: { fontSize: typography.label.fontSize, fontFamily: fontFamily.regular },
  confirm: {
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: touchTarget.primaryButton + 8,
    marginTop: spacing.md,
  },
  saved: { fontFamily: fontFamily.medium, fontSize: typography.caption.fontSize },
});

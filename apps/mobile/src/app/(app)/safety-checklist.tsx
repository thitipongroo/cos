// Safety checklist — SITE_WORKER daily pre-shift verification (offline-first).
// Implements mockup/mobile/05_site_worker/04_safety/00_main ("เช็คลิสต์ความปลอดภัย").
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
// DROPPED FROM THE MOCKUP, and why:
//   - "AI Safety Scan — automated PPE detection … START SCAN". SafetyVisionModel is Phase 23 and
//     needs 10,000+ labelled site photos before it can be trained (§22.6). A button that starts
//     nothing, on the screen a worker uses to attest they are safe, is worse than its absence.
//   - The digital signature pad + "Site Operator: ID #8829-X" footer. Nothing stores a signature:
//     site_ops.inspections records `inspected_by` (the authenticated user id) and no signature
//     column exists, so the drawn strokes would be discarded on submit. The attestation is real
//     without it — the row is written under the signed-in worker's identity, which is what the
//     signature was standing in for.

import { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { get, mutate } from '../../api/client';
import type { SafetyChecklist } from '../../db/database';
import { useCollection } from '../../hooks/useCollection';
import { ProjectPicker } from '../../components/ProjectPicker';
import { LoadingBoundary } from '../../components/LoadingBoundary';
import { useT } from '../../i18n';
import { fontFamily, radius, spacing, touchTarget, typography } from '../../theme/tokens';
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
  const [submitted, setSubmitted] = useState(false);
  const t = useT();
  const p = usePalette();
  const isDark = useIsDark();
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

  // WHICH checklist is being filled. A worker on several projects gets several templates back, so
  // the screen cannot silently pick one — the mockup draws a single checklist because it was drawn
  // against a single-project fixture. Selecting by id (not index) keeps the choice stable when a
  // refetch reorders the list.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const active = available.find((c) => c.checklistId === selectedId) ?? available[0] ?? null;

  const items = active?.items ?? [];
  const doneCount = items.filter((item, i) => checked[keyOf(item, i)]).length;
  // Every item must be ticked before a worker can attest — this is a safety verification, and a
  // partially completed one asserts something untrue.
  const allChecked = items.length > 0 && doneCount === items.length;

  const onConfirm = async (): Promise<void> => {
    if (!active) return;
    await mutate(
      'POST',
      '/safety/checklists',
      {
        project_id: active.projectId,
        checklist_id: active.checklistId,
        // Every item ticked → PASSED. The screen refuses to submit otherwise (see `allChecked`), so
        // FAILED is not reachable from here: a worker who cannot tick an item raises an ISSUE, which
        // is a different record with a different reader.
        status: 'PASSED',
        inspected_at: new Date().toISOString(),
      },
      'inspection',
      active.checklistId,
    );
    setSubmitted(true);
  };

  return (
    <ScrollView
      testID="safety-checklist-screen"
      style={{ backgroundColor: p.bg }}
      contentContainerStyle={styles.page}
    >
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: p.text }]}>{t('safety.checklist.title')}</Text>
        <View style={[styles.requiredBadge, { borderColor: p.warning }]}>
          <Text style={[styles.requiredText, { color: p.warning }]}>
            {t('safety.checklist.required')}
          </Text>
        </View>
      </View>
      <ProjectPicker selectedId={projectId} onSelect={setProjectId} />

      <LoadingBoundary loading={loading} variant="list" theme={isDark ? 'dark' : 'light'}>
        {active ? (
          <>
            {/* Only shown when there IS a choice — one checklist needs no picker. */}
            {available.length > 1 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.pickerRow}
              >
                {available.map((c) => {
                  const isActive = c.checklistId === active.checklistId;
                  return (
                    <TouchableOpacity
                      key={c.checklistId}
                      testID={`checklist-pick-${c.checklistId}`}
                      onPress={() => {
                        setSelectedId(c.checklistId);
                        setChecked({}); // a different checklist starts unticked — never carry ticks over
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
                        {c.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            ) : null}

            <Text style={[styles.sectionLabel, { color: p.muted }]}>
              {t('safety.checklist.verification', { done: doneCount, total: items.length })}
            </Text>

            {items.map((item, index) => {
              const key = keyOf(item, index);
              const isChecked = Boolean(checked[key]);
              return (
                <TouchableOpacity
                  key={key}
                  testID={`safety-item-${key}`}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isChecked }}
                  onPress={() => setChecked((c) => ({ ...c, [key]: !c[key] }))}
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
                    <Text style={[styles.itemText, { color: p.text }]}>{labelOf(item, index)}</Text>
                    {item.is_required ? (
                      <Text style={[styles.itemMeta, { color: p.warning }]}>
                        {t('safety.checklist.itemRequired')}
                      </Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
              );
            })}

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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  title: { flex: 1, fontSize: typography.hero.fontSize, fontFamily: fontFamily.bold },
  requiredBadge: {
    borderWidth: 1,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  requiredText: {
    fontSize: 11,
    fontFamily: fontFamily.semibold,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
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

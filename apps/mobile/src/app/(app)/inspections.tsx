// Inspections screen — SITE_ENGINEER: review inspections + fill a checklist offline (G-M3a).
// List fetches GET /site/inspections (best-effort). Filling marks each item PASS/FAIL → the overall
// inspection status is FAILED if any item fails, else PASSED (spec §11 inspection result). Submit via
// mutate() → online POST /site/inspections, offline enqueue 'inspection' → /sync/push
// (SubmitInspectionDto: project_id, checklist_id, status, inspected_at). testIDs match the Detox
// offline-inspection scenario.

import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { get, mutate } from '../../api/client';
import type { SafetyChecklist } from '../../db/database';
import { useCollection } from '../../hooks/useCollection';
import { PhotoCapture } from '../../components/PhotoCapture';
import { StatusChip } from '../../components/StatusChip';
import { useT } from '../../i18n';
import { colors, fontFamily, spacing, typography } from '../../theme/tokens';
import { screen } from '../../theme/screenStyles';

interface InspectionRow {
  inspection_id: string;
  checklist_id: string;
  project_id: string;
  status: string;
}

interface ChecklistItem {
  id?: string;
  label?: string;
}

type ItemResult = 'PASS' | 'FAIL';
const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
type Severity = (typeof SEVERITIES)[number];

export default function InspectionsScreen() {
  const checklists = useCollection<SafetyChecklist>('local_safety_checklists');
  const [inspections, setInspections] = useState<InspectionRow[]>([]);
  const [active, setActive] = useState<SafetyChecklist | null>(null);
  const [results, setResults] = useState<Record<string, ItemResult>>({});
  const [severity, setSeverity] = useState<Severity>('MEDIUM');
  const [submitted, setSubmitted] = useState(false);
  const t = useT();

  const load = async (): Promise<void> => {
    try {
      const res = await get<{ items?: InspectionRow[] } | InspectionRow[]>('/site/inspections');
      setInspections(Array.isArray(res) ? res : (res.items ?? []));
    } catch {
      /* offline — keep cached */
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const openChecklist = (): void => {
    setActive(checklists[0] ?? null);
    setResults({});
    setSubmitted(false);
  };

  // Open an inspection's checklist for offline review/fill. Prefer a cached local checklist matching the
  // inspection; otherwise open a shell keyed to the inspection so it can still be filled and queued.
  const openInspection = (item: InspectionRow): void => {
    const cached = checklists.find((c) => c.checklistId === item.checklist_id) ?? checklists[0];
    setActive(
      cached ??
        ({
          checklistId: item.checklist_id,
          projectId: item.project_id,
          itemsJson: '[]',
        } as unknown as SafetyChecklist),
    );
    setResults({});
    setSubmitted(false);
  };

  const parseItems = (cl: SafetyChecklist): ChecklistItem[] => {
    try {
      const parsed = JSON.parse(cl.itemsJson) as ChecklistItem[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const submit = async (): Promise<void> => {
    if (!active) return;
    const items = parseItems(active);
    // Overall inspection status: FAILED if any item failed, else PASSED (spec §11 inspection result;
    // QM-1 E2E #9 records a fail result). A checklist with no items submits as PASSED.
    const failed = items.some((it, idx) => results[it.id ?? String(idx)] === 'FAIL');
    const status = failed ? 'FAILED' : 'PASSED';
    await mutate(
      'POST',
      '/site/inspections',
      {
        project_id: active.projectId,
        checklist_id: active.checklistId,
        status,
        inspected_at: new Date().toISOString(),
        // spec 11 §517 — issue_severity is populated only when the result is FAILED.
        ...(failed ? { issue_severity: severity } : {}),
      },
      'inspection',
      active.checklistId,
    );
    setSubmitted(true);
  };

  if (active) {
    const items = parseItems(active);
    const allRated = items.every((it, idx) => results[it.id ?? String(idx)] !== undefined);
    const willFail = items.some((it, idx) => results[it.id ?? String(idx)] === 'FAIL');
    return (
      <View testID="inspection-checklist" style={screen.container}>
        <Text style={screen.heading}>{active.checklistName}</Text>
        {items.length === 0 ? (
          <Text style={screen.empty}>{t('site.inspections.noItems')}</Text>
        ) : null}
        {items.map((it, idx) => {
          const key = it.id ?? String(idx);
          const result = results[key];
          return (
            <View key={key} testID="checklist-item" style={styles.checkRow}>
              <Text style={styles.itemTitle}>
                {it.label ?? t('site.inspections.itemFallback', { index: idx + 1 })}
              </Text>
              <View style={styles.resultButtons}>
                <TouchableOpacity
                  testID="checklist-pass-button"
                  style={[styles.pass, result === 'PASS' && styles.passOn]}
                  onPress={() => setResults((r) => ({ ...r, [key]: 'PASS' }))}
                >
                  <Text style={styles.passText}>
                    {result === 'PASS' ? t('site.inspections.passed') : t('site.inspections.pass')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  testID="checklist-fail-button"
                  style={[styles.fail, result === 'FAIL' && styles.failOn]}
                  onPress={() => setResults((r) => ({ ...r, [key]: 'FAIL' }))}
                >
                  <Text style={styles.failText}>
                    {result === 'FAIL' ? t('site.inspections.failed') : t('site.inspections.fail')}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}

        {willFail ? (
          <View testID="severity-picker" style={styles.severityRow}>
            <Text style={styles.severityLabel}>{t('site.inspections.severityLabel')}</Text>
            {SEVERITIES.map((s) => (
              <TouchableOpacity
                key={s}
                testID={`severity-${s}`}
                style={[styles.severityChip, severity === s && styles.severityChipOn]}
                onPress={() => setSeverity(s)}
              >
                <Text style={[styles.severityText, severity === s && styles.severityTextOn]}>
                  {t(`status.${s}`)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        <PhotoCapture entityType="inspection" entityId={active.checklistId} />

        <TouchableOpacity
          testID="submit-inspection-button"
          style={[screen.primaryButton, !allRated && screen.buttonDisabled]}
          onPress={submit}
          disabled={!allRated}
        >
          <Text style={screen.primaryButtonText}>{t('site.inspections.submit')}</Text>
        </TouchableOpacity>
        {submitted ? (
          <Text testID="inspection-saved" style={styles.saved}>
            {t('site.inspections.saved')}
          </Text>
        ) : null}
        <TouchableOpacity onPress={() => setActive(null)}>
          <Text style={styles.back}>{t('common.back')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View testID="inspection-list" style={screen.container}>
      <TouchableOpacity
        testID="new-inspection-button"
        style={[screen.primaryButton, checklists.length === 0 && screen.buttonDisabled]}
        onPress={openChecklist}
        disabled={checklists.length === 0}
      >
        <Text style={screen.primaryButtonText}>{t('site.inspections.fill')}</Text>
      </TouchableOpacity>
      <FlatList
        data={inspections}
        keyExtractor={(i) => i.inspection_id}
        ListEmptyComponent={<Text style={screen.empty}>{t('site.inspections.empty')}</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity
            testID="inspection-item"
            style={screen.item}
            onPress={() => openInspection(item)}
          >
            <Text style={styles.itemTitle}>{item.inspection_id.slice(0, 8)}</Text>
            <StatusChip label={item.status} />
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  checkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  itemTitle: {
    fontSize: typography.body.fontSize,
    fontFamily: fontFamily.medium,
    color: colors.textPrimary,
    flex: 1,
  },
  resultButtons: { flexDirection: 'row', gap: spacing.xs },
  pass: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.success,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  passOn: { backgroundColor: colors.success },
  passText: {
    color: colors.textPrimary,
    fontFamily: fontFamily.medium,
    fontSize: typography.caption.fontSize,
  },
  fail: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.danger,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  failOn: { backgroundColor: colors.danger },
  failText: {
    color: colors.textPrimary,
    fontFamily: fontFamily.medium,
    fontSize: typography.caption.fontSize,
  },
  severityRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs },
  severityLabel: {
    width: '100%',
    fontSize: typography.caption.fontSize,
    fontFamily: fontFamily.semibold,
    color: colors.textSecondary,
  },
  severityChip: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.textSecondary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  severityChipOn: { backgroundColor: colors.danger, borderColor: colors.danger },
  severityText: {
    fontSize: typography.caption.fontSize,
    fontFamily: fontFamily.medium,
    color: colors.textSecondary,
  },
  severityTextOn: { color: colors.bg },
  saved: {
    color: colors.success,
    fontFamily: fontFamily.medium,
    fontSize: typography.caption.fontSize,
  },
  back: { color: colors.primary, fontFamily: fontFamily.medium, marginTop: spacing.sm },
});

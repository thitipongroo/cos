// Inspections screen — SITE_ENGINEER: review inspections + fill a checklist offline.
// List fetches GET /site/inspections (best-effort). Filling uses a cached safety checklist
// (local_safety_checklists) → mark items → optional photo → submit via mutate() (offline-queued
// to POST /site/inspections). testIDs match the Detox offline-inspection scenario.

import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { get, mutate } from '../../api/client';
import type { SafetyChecklist } from '../../db/database';
import { useCollection } from '../../hooks/useCollection';
import { PhotoCapture } from '../../components/PhotoCapture';
import { StatusChip } from '../../components/StatusChip';
import { useT } from '../../i18n';
import { colors, fontFamily, spacing, typography } from '../../theme/tokens';

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

export default function InspectionsScreen() {
  const checklists = useCollection<SafetyChecklist>('local_safety_checklists');
  const [inspections, setInspections] = useState<InspectionRow[]>([]);
  const [active, setActive] = useState<SafetyChecklist | null>(null);
  const [passed, setPassed] = useState<Record<string, boolean>>({});
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
    setPassed({});
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
    setPassed({});
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
    await mutate(
      'POST',
      '/site/inspections',
      { checklist_id: active.checklistId, project_id: active.projectId, responses: passed },
      'inspection',
      active.checklistId,
    );
    setSubmitted(true);
  };

  if (active) {
    const items = parseItems(active);
    return (
      <View testID="inspection-checklist" style={styles.container}>
        <Text style={styles.heading}>{active.checklistName}</Text>
        {items.length === 0 ? (
          <Text style={styles.empty}>{t('site.inspections.noItems')}</Text>
        ) : null}
        {items.map((it, idx) => {
          const key = it.id ?? String(idx);
          return (
            <View key={key} testID="checklist-item" style={styles.checkRow}>
              <Text style={styles.itemTitle}>
                {it.label ?? t('site.inspections.itemFallback', { index: idx + 1 })}
              </Text>
              <TouchableOpacity
                testID="checklist-pass-button"
                style={[styles.pass, passed[key] && styles.passOn]}
                onPress={() => setPassed((p) => ({ ...p, [key]: true }))}
              >
                <Text style={styles.passText}>
                  {passed[key] ? t('site.inspections.passed') : t('site.inspections.pass')}
                </Text>
              </TouchableOpacity>
            </View>
          );
        })}

        <PhotoCapture entityType="inspection" entityId={active.checklistId} />

        <TouchableOpacity testID="submit-inspection-button" style={styles.submit} onPress={submit}>
          <Text style={styles.submitText}>{t('site.inspections.submit')}</Text>
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
    <View testID="inspection-list" style={styles.container}>
      <Text style={styles.heading}>{t('site.inspections.title')}</Text>
      <TouchableOpacity
        testID="new-inspection-button"
        style={[styles.submit, checklists.length === 0 && styles.disabled]}
        onPress={openChecklist}
        disabled={checklists.length === 0}
      >
        <Text style={styles.submitText}>{t('site.inspections.fill')}</Text>
      </TouchableOpacity>
      <FlatList
        data={inspections}
        keyExtractor={(i) => i.inspection_id}
        ListEmptyComponent={<Text style={styles.empty}>{t('site.inspections.empty')}</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity
            testID="inspection-item"
            style={styles.item}
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
  container: { flex: 1, backgroundColor: colors.bg, padding: spacing.md, gap: spacing.sm },
  heading: {
    fontSize: typography.title.fontSize,
    fontFamily: fontFamily.semibold,
    color: colors.textPrimary,
  },
  item: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.surface,
    gap: spacing.xs,
  },
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
  },
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
  submit: {
    minHeight: 48,
    backgroundColor: colors.primary,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.5 },
  submitText: {
    color: colors.bg,
    fontFamily: fontFamily.semibold,
    fontSize: typography.body.fontSize,
  },
  saved: {
    color: colors.success,
    fontFamily: fontFamily.medium,
    fontSize: typography.caption.fontSize,
  },
  back: { color: colors.primary, fontFamily: fontFamily.medium, marginTop: spacing.sm },
  empty: { color: colors.textSecondary, fontFamily: fontFamily.regular, padding: spacing.md },
});

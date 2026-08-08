// Tasks screen — SITE_WORKER task list + detail + progress update (offline-first).
// Implements mockup/mobile/05_site_worker/01_tasks/00_main.
//
// Reads local_tasks reactively (populated by delta sync). Updating progress writes locally (PENDING)
// and PATCHes the server via mutate() — offline it is queued; on sync the server applies Max-wins
// (§17.5, monotonic).
//
// WHAT THE MOCKUP DRAWS THAT THIS DOES NOT, and why (ADR-085 — mockups are authoritative for style,
// never for data that does not exist):
//   - A HIGH / MEDIUM priority badge. `projects.tasks` has no priority column, in the database or in
//     the API. The badge SLOT is kept and filled with the task's real `work_type` (the trade:
//     FOUNDATION / STRUCTURE / MEP …), which is the honest classification the row actually carries.
//   - "08:00 - 12:00". Tasks carry `planned_start` / `planned_end` as DATEs — there is no
//     time-of-day anywhere — so the chip shows the real planned window in days. The mockup's own
//     second card puts "Pending Sync" in that same chip, so a status value there is its own idiom.
//
// The "AI Insight" card IS drawn, copy and numbers included (PO decision 2026-08-08, reversing an
// earlier call to drop it — the same ruling already applied to the report's AI bar and the safety
// screen's AI Safety Scan). DelayForecastModel is Phase 23 and untrained (§22.6), so the card states
// the mockup's example rather than a computed forecast: it is static, nothing reads it, and no task
// field is derived from it. Its "ปรับตารางเวลาอัตโนมัติ" action does NOT reschedule anything — auto-schedule
// generation is post-MVP Layer B/C, and §22.3 requires it to run through Temporal WITH a
// human-in-the-loop step, so the button says the feature is not available rather than acting.
//
// The mockup's floating voice FAB is <VoiceCommandFab /> — the ADR-073 component already built for
// the Site Engineer home: hold to record → transcribe → classify intent → route to a real screen,
// and a message rather than a guessed action when the intent is unsupported. No second voice
// behaviour was invented for this screen.

import { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { db } from '../../db/database';
import type { Task } from '../../db/database';
import { localTasks } from '../../db/schema';
import { eq } from 'drizzle-orm';
import { useCollection } from '../../hooks/useCollection';
import { TaskCard } from '../../components/TaskCard';
import { VoiceCommandFab } from '../../components/VoiceCommandFab';
import { mutate } from '../../api/client';
import { useT } from '../../i18n';
import { fontFamily, radius, spacing, touchTarget, typography } from '../../theme/tokens';
import { usePalette } from '../../theme/usePalette';
import { makeScreenStyles } from '../../theme/screenStyles';

/** The filter chips across the top. `all` is first and selected on entry, as the mockup draws it. */
const FILTERS = ['all', 'pending', 'inProgress', 'done'] as const;
type Filter = (typeof FILTERS)[number];

/** A task counts as done from either side — the server status or a progress bar at 100 (§17.5). */
function isDone(t: Task): boolean {
  return t.status === 'COMPLETED' || t.progressPercent >= 100;
}

function matches(task: Task, filter: Filter): boolean {
  switch (filter) {
    case 'pending':
      return !isDone(task) && task.progressPercent <= 0;
    case 'inProgress':
      return !isDone(task) && task.progressPercent > 0;
    case 'done':
      return isDone(task);
    default:
      return true;
  }
}

export default function TasksScreen() {
  const tasks = useCollection<Task>('local_tasks');
  const t = useT();
  const p = usePalette();
  const screen = useMemo(() => makeScreenStyles(p), [p]);
  const [selected, setSelected] = useState<Task | null>(null);
  const [progress, setProgress] = useState('');
  const [savedValue, setSavedValue] = useState<number | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  const counts = useMemo(
    () =>
      Object.fromEntries(
        FILTERS.map((f) => [f, tasks.filter((task) => matches(task, f)).length]),
      ) as Record<Filter, number>,
    [tasks],
  );
  const visible = useMemo(() => tasks.filter((task) => matches(task, filter)), [tasks, filter]);
  // Index the AI Insight card follows — the mockup's third slot, or the end of a shorter list.
  const insightAfter = Math.min(1, visible.length - 1);

  const openTask = (task: Task): void => {
    setSelected(task);
    setProgress(String(task.progressPercent));
    setSavedValue(null);
  };

  const onSave = async (): Promise<void> => {
    if (!selected) return;
    const value = Math.max(0, Math.min(100, parseInt(progress, 10) || 0));
    // local optimistic write (PENDING) — server Max-wins resolves on sync (§17.5)
    await db
      .update(localTasks)
      .set({ progressPercent: value, offlineSyncStatus: 'PENDING' })
      .where(eq(localTasks.id, selected.id));
    await mutate(
      'PATCH',
      `/tasks/${selected.taskId}`,
      { progress_percent: value },
      'task',
      selected.taskId,
    );
    setSavedValue(value);
  };

  // Swipe-right on a TaskCard completes the task (progress → 100). Same offline path as onSave.
  const completeTask = async (task: Task): Promise<void> => {
    await db
      .update(localTasks)
      .set({ progressPercent: 100, offlineSyncStatus: 'PENDING' })
      .where(eq(localTasks.id, task.id));
    await mutate('PATCH', `/tasks/${task.taskId}`, { progress_percent: 100 }, 'task', task.taskId);
  };

  if (selected) {
    return (
      <View testID="task-detail-screen" style={screen.container}>
        <Text style={screen.heading}>{selected.taskName}</Text>
        <Text style={[styles.label, { color: p.muted }]}>{t('tasks.detail.progressLabel')}</Text>
        <TextInput
          testID="progress-input"
          style={screen.input}
          keyboardType="number-pad"
          maxLength={3}
          value={progress}
          onChangeText={setProgress}
        />
        <TouchableOpacity
          testID="save-progress-button"
          style={screen.primaryButton}
          onPress={onSave}
        >
          <Text style={screen.primaryButtonText}>{t('tasks.detail.save')}</Text>
        </TouchableOpacity>
        {savedValue !== null ? (
          <Text testID="progress-display" style={[styles.saved, { color: p.success }]}>
            {savedValue}
          </Text>
        ) : null}
        <TouchableOpacity testID="task-back-button" onPress={() => setSelected(null)}>
          <Text style={[styles.back, { color: p.accent }]}>{t('tasks.detail.back')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View testID="tasks-screen" style={[styles.page, { backgroundColor: p.bg }]}>
      {/* NO in-content page title, though the mockup draws "รายการงานวันนี้" (§32.7 Mobile App Shell:
          a top-level tab screen is named by its active bottom-nav tab, and repeating the name inside
          the content states it twice). This is the one place the mockup is deliberately not followed
          on this screen — PO decision 2026-08-08, after all four Site Worker screens shipped with a
          title that no other tab screen has. */}
      <View style={styles.header}>
        {/* Horizontal chip row (mockup). Counts are the real filtered lengths — never a fixed "12". */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {FILTERS.map((f) => {
            const active = f === filter;
            return (
              <TouchableOpacity
                key={f}
                testID={`task-filter-${f}`}
                onPress={() => setFilter(f)}
                style={[
                  styles.chip,
                  { borderColor: p.border, backgroundColor: active ? p.primary : p.surface },
                ]}
              >
                <Text
                  style={[styles.chipText, { color: active ? p.onPrimary : p.muted }]}
                >{`${t(`tasks.filters.${f}`)} (${counts[f]})`}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <FlatList
        testID="task-list"
        data={visible}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={screen.empty}>{t('tasks.list.empty')}</Text>}
        renderItem={({ item, index }) => (
          <>
            <TaskCard
              task={item}
              onPress={() => openTask(item)}
              onComplete={() => void completeTask(item)}
            />
            {/* The mockup slots the insight BETWEEN task cards, third in the run — not pinned to the
                top — so it reads as one more thing on the list rather than a banner over it. Anchored
                to the second card, or to the last one when the list is shorter than that. With no
                tasks at all it does not render: an insight about a list that is not there is noise. */}
            {index === insightAfter ? (
              <View
                testID="tasks-ai-insight"
                style={[styles.insight, { backgroundColor: p.elevated, borderLeftColor: p.accent }]}
              >
                <View style={styles.insightHead}>
                  <MaterialIcons name="auto-awesome" size={18} color={p.accent} />
                  <Text style={[styles.insightLabel, { color: p.accent }]}>
                    {t('tasks.aiInsight.label')}
                  </Text>
                </View>
                <Text style={[styles.insightBody, { color: p.text }]}>
                  {t('tasks.aiInsight.body')}
                </Text>
                <TouchableOpacity
                  testID="tasks-ai-insight-action"
                  onPress={() => Alert.alert(t('tasks.aiInsight.action'), t('common.comingSoon'))}
                  style={styles.insightAction}
                >
                  <Text style={[styles.insightActionText, { color: p.accent }]}>
                    {t('tasks.aiInsight.action')}
                  </Text>
                  <MaterialIcons name="chevron-right" size={16} color={p.accent} />
                </TouchableOpacity>
              </View>
            ) : null}
          </>
        )}
      />

      {/* Floating voice FAB (mockup). Sits over the list, clear of the last card via the list's own
          bottom padding. */}
      <VoiceCommandFab />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.md },
  chipRow: { gap: spacing.xs, paddingBottom: spacing.xs },
  chip: {
    minHeight: touchTarget.secondaryButton,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.xl,
    borderWidth: 1,
  },
  chipText: { fontSize: typography.label.fontSize, fontFamily: fontFamily.medium },
  // Deep enough that the floating voice FAB never covers the last card.
  list: { paddingBottom: spacing.xl * 3 },
  insight: {
    marginHorizontal: spacing.lg,
    marginVertical: spacing.xs,
    padding: spacing.md,
    borderLeftWidth: 4,
    borderTopRightRadius: radius.md,
    borderBottomRightRadius: radius.md,
    gap: spacing.xs,
  },
  insightHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  insightLabel: {
    fontSize: 11,
    fontFamily: fontFamily.bold,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  insightBody: { fontSize: typography.body.fontSize, fontFamily: fontFamily.regular },
  insightAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minHeight: touchTarget.iconButton,
  },
  insightActionText: { fontSize: typography.label.fontSize, fontFamily: fontFamily.semibold },
  label: { fontSize: typography.body.fontSize, fontFamily: fontFamily.regular },
  saved: { fontSize: typography.title.fontSize, fontFamily: fontFamily.bold },
  back: { fontFamily: fontFamily.medium, marginTop: spacing.md },
});

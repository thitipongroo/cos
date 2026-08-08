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
//   - An "AI Insight" card predicting a 15-minute delay and offering to reschedule automatically.
//     Dropped: DelayForecastModel is Phase 23 and untrained, so every number in it would be invented,
//     and §22.3 forbids autonomous rescheduling outright.

import { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { db } from '../../db/database';
import type { Task } from '../../db/database';
import { localTasks } from '../../db/schema';
import { eq } from 'drizzle-orm';
import { useCollection } from '../../hooks/useCollection';
import { TaskCard } from '../../components/TaskCard';
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
      <View style={styles.header}>
        <Text style={[styles.title, { color: p.text }]}>{t('tasks.list.title')}</Text>
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
        renderItem={({ item }) => (
          <TaskCard
            task={item}
            onPress={() => openTask(item)}
            onComplete={() => void completeTask(item)}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.md },
  title: { fontSize: typography.hero.fontSize, fontFamily: fontFamily.bold },
  chipRow: { gap: spacing.xs, paddingBottom: spacing.xs },
  chip: {
    minHeight: touchTarget.secondaryButton,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.xl,
    borderWidth: 1,
  },
  chipText: { fontSize: typography.label.fontSize, fontFamily: fontFamily.medium },
  list: { paddingBottom: spacing.xl },
  label: { fontSize: typography.body.fontSize, fontFamily: fontFamily.regular },
  saved: { fontSize: typography.title.fontSize, fontFamily: fontFamily.bold },
  back: { fontFamily: fontFamily.medium, marginTop: spacing.md },
});

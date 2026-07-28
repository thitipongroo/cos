// Tasks screen — SITE_WORKER task list + detail + progress update (offline-first).
// Reads local_tasks reactively. Updating progress writes locally (PENDING) and PATCHes the server
// via mutate() — offline it is queued; on sync the server applies Max-wins (§17.5, monotonic).
//
// NOTE: local_tasks is populated by delta sync (DeltaSyncClient must include the 'task' entity type);
// until then the list is empty for a fresh device.

import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { db } from '../../db/database';
import type { Task } from '../../db/database';
import { localTasks } from '../../db/schema';
import { eq } from 'drizzle-orm';
import { useCollection } from '../../hooks/useCollection';
import { TaskCard } from '../../components/TaskCard';
import { mutate } from '../../api/client';
import { useT } from '../../i18n';
import { colors, fontFamily, spacing, typography } from '../../theme/tokens';
import { screen } from '../../theme/screenStyles';

export default function TasksScreen() {
  const tasks = useCollection<Task>('local_tasks');
  const t = useT();
  const [selected, setSelected] = useState<Task | null>(null);
  const [progress, setProgress] = useState('');
  const [savedValue, setSavedValue] = useState<number | null>(null);

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
        <Text style={styles.label}>{t('tasks.detail.progressLabel')}</Text>
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
          <Text testID="progress-display" style={styles.saved}>
            {savedValue}
          </Text>
        ) : null}
        <TouchableOpacity testID="task-back-button" onPress={() => setSelected(null)}>
          <Text style={styles.back}>{t('tasks.detail.back')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View testID="tasks-screen" style={screen.container}>
      <FlatList
        testID="task-list"
        data={tasks}
        keyExtractor={(item) => item.id}
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
  label: {
    fontSize: typography.body.fontSize,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
  },
  saved: {
    fontSize: typography.title.fontSize,
    fontFamily: fontFamily.bold,
    color: colors.success,
  },
  back: { color: colors.primary, fontFamily: fontFamily.medium, marginTop: spacing.md },
});

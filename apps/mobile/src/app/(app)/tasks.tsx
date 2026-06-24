// Tasks screen — SITE_WORKER task list + detail + progress update (offline-first).
// Reads local_tasks reactively. Updating progress writes locally (PENDING) and PATCHes the server
// via mutate() — offline it is queued; on sync the server applies Max-wins (§17.5, monotonic).
//
// NOTE: local_tasks is populated by delta sync (DeltaSyncClient must include the 'task' entity type);
// until then the list is empty for a fresh device.

import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import Task from '../../db/models/Task';
import { useCollection } from '../../hooks/useCollection';
import { StatusChip } from '../../components/StatusChip';
import { mutate } from '../../api/client';
import { colors, fontFamily, spacing, typography } from '../../theme/tokens';

export default function TasksScreen() {
  const tasks = useCollection<Task>('local_tasks');
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
    await selected.setProgress(value); // local optimistic write (PENDING)
    await mutate(
      'PATCH',
      `/tasks/${selected.taskId}`,
      { progress_percent: value },
      'task',
      selected.taskId,
    );
    setSavedValue(value);
  };

  if (selected) {
    return (
      <View testID="task-detail-screen" style={styles.container}>
        <Text style={styles.heading}>{selected.taskName}</Text>
        <Text style={styles.label}>Progress %</Text>
        <TextInput
          testID="progress-input"
          style={styles.input}
          keyboardType="number-pad"
          maxLength={3}
          value={progress}
          onChangeText={setProgress}
        />
        <TouchableOpacity testID="save-progress-button" style={styles.button} onPress={onSave}>
          <Text style={styles.buttonText}>Save progress</Text>
        </TouchableOpacity>
        {savedValue !== null ? (
          <Text testID="progress-display" style={styles.saved}>
            {savedValue}
          </Text>
        ) : null}
        <TouchableOpacity testID="task-back-button" onPress={() => setSelected(null)}>
          <Text style={styles.back}>← Back to tasks</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View testID="tasks-screen" style={styles.container}>
      <Text style={styles.heading}>Tasks</Text>
      <FlatList
        testID="task-list"
        data={tasks}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<Text style={styles.empty}>No tasks synced yet</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity
            testID={item.taskId ? `task-${item.taskId}` : 'task-item'}
            style={styles.item}
            onPress={() => openTask(item)}
          >
            <Text style={styles.itemTitle}>{item.taskName}</Text>
            <View style={styles.chips}>
              <Text style={styles.pct}>{item.progressPercent}%</Text>
              <StatusChip label={item.status} />
              <StatusChip label={item.offlineSyncStatus} />
            </View>
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
  label: {
    fontSize: typography.body.fontSize,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.textSecondary,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    fontSize: typography.body.fontSize,
    fontFamily: fontFamily.regular,
    color: colors.textPrimary,
  },
  button: {
    minHeight: 48,
    backgroundColor: colors.primary,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: colors.bg,
    fontSize: typography.body.fontSize,
    fontFamily: fontFamily.semibold,
  },
  saved: {
    fontSize: typography.title.fontSize,
    fontFamily: fontFamily.bold,
    color: colors.success,
  },
  back: { color: colors.primary, fontFamily: fontFamily.medium, marginTop: spacing.md },
  item: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.surface,
    gap: spacing.xs,
  },
  itemTitle: {
    fontSize: typography.body.fontSize,
    fontFamily: fontFamily.medium,
    color: colors.textPrimary,
  },
  chips: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  pct: {
    fontSize: typography.caption.fontSize,
    fontFamily: fontFamily.semibold,
    color: colors.textPrimary,
  },
  empty: { color: colors.textSecondary, fontFamily: fontFamily.regular, padding: spacing.md },
});

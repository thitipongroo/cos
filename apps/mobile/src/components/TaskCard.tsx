// TaskCard (§32.7; G-M8) — a task row that is swipeable (swipe-right reveals "Done") with a status
// badge and progress. Tap opens the progress-detail view (the accessible single-tap alternative to the
// swipe, WCAG 2.5.7 / §20.8). Uses react-native-gesture-handler Swipeable (ADR-053).

import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import type { Task } from '../db/database';
import { StatusChip } from './StatusChip';
import { useT } from '../i18n';
import { colors, fontFamily, spacing, typography } from '../theme/tokens';

export function TaskCard({
  task,
  onPress,
  onComplete,
}: {
  task: Task;
  onPress: () => void;
  onComplete: () => void;
}) {
  const t = useT();
  const done = task.status === 'COMPLETED' || task.progressPercent >= 100;

  const renderLeftActions = () => (
    <View style={styles.doneAction}>
      <Text style={styles.doneText}>{t('tasks.card.done')}</Text>
    </View>
  );

  return (
    <Swipeable
      // Swipe-right reveals the left action ("Done"); already-complete tasks are not swipeable.
      renderLeftActions={done ? undefined : renderLeftActions}
      onSwipeableOpen={(direction, swipeable) => {
        if (direction === 'left' && !done) onComplete();
        swipeable.close();
      }}
    >
      <TouchableOpacity
        testID={task.taskId ? `task-${task.taskId}` : 'task-item'}
        style={styles.row}
        onPress={onPress}
      >
        <Text style={styles.title}>{task.taskName}</Text>
        <View style={styles.chips}>
          <Text style={styles.pct}>{task.progressPercent}%</Text>
          <StatusChip label={task.status} />
          <StatusChip label={task.offlineSyncStatus} />
        </View>
      </TouchableOpacity>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: colors.bg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.surface,
    gap: spacing.xs,
  },
  title: {
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
  doneAction: {
    backgroundColor: colors.success,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  doneText: {
    color: colors.bg,
    fontFamily: fontFamily.semibold,
    fontSize: typography.body.fontSize,
  },
});

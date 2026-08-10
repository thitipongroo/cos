// TaskCard (§32.7; G-M8) — a task row that is swipeable (swipe-right reveals "Done") with a status
// badge and progress. Tap opens the progress-detail view (the accessible single-tap alternative to the
// swipe, WCAG 2.5.7 / §20.8). Uses react-native-gesture-handler Swipeable (ADR-053).
//
// Card anatomy from mockup/mobile/05_site_worker/02_tasks/01_sw_daily_tasks: a coloured accent bar down the
// left edge, an ID eyebrow over the task name, a badge top-right, a status chip and an action button
// on the second row, and a thin progress bar underneath. A completed task is dimmed with its name
// struck through.
//
// Every value is real. The mockup's HIGH/MEDIUM priority badge has no column behind it — see the
// note at the top of app/(app)/tasks.tsx — so the badge shows the task's `work_type` (its trade) and
// the accent bar follows PROGRESS STATE, which is what the row can actually tell us: not started,
// under way, or done.

import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import type { Task } from '../db/database';
import { StatusChip } from './StatusChip';
import { useI18n } from '../i18n';
import { fontFamily, radius, spacing, touchTarget, typography } from '../theme/tokens';
import { usePalette } from '../theme/usePalette';

/**
 * The last block of a UUID — what the mockup styles as "ID: #C4-8820".
 *
 * A task's real id is a 36-character UUID that no card can show and no worker would read aloud. The
 * final block is the shortest slice that stays unambiguous within a project's handful of tasks, and
 * it is a REAL substring of the id, so it can be matched back to the row. Uppercased for legibility
 * at 11px; the value is not invented or hashed.
 */
export function shortTaskId(taskId: string): string {
  const tail = taskId.split('-').pop() ?? taskId;
  return tail.slice(-8).toUpperCase();
}

export function TaskCard({
  task,
  onPress,
  onComplete,
}: {
  task: Task;
  onPress: () => void;
  onComplete: () => void;
}) {
  // formatDate, not the raw column: /sync/delta sends a DATE as a full ISO timestamp, so printing it
  // verbatim gives "2026-06-02T00:00:00.000Z" on a field worker's card. QM-3 requires display through
  // Intl.DateTimeFormat in the user's locale, which is also what puts Thai into the Buddhist era.
  const { t, formatDate } = useI18n();
  const p = usePalette();
  const done = task.status === 'COMPLETED' || task.progressPercent >= 100;
  const started = !done && task.progressPercent > 0;
  // Accent bar: done → success, under way → primary, untouched → muted. Three states the row really
  // has, rather than the mockup's severity colours, which nothing on the row could decide.
  const accent = done ? p.success : started ? p.primary : p.muted;

  const renderLeftActions = () => (
    <View style={[styles.doneAction, { backgroundColor: p.success }]}>
      <Text style={[styles.doneText, { color: p.onPrimary }]}>{t('tasks.card.done')}</Text>
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
      <View style={[styles.card, { backgroundColor: p.surface, borderBottomColor: p.border }]}>
        <View style={[styles.accent, { backgroundColor: accent }]} />
        <TouchableOpacity
          testID={task.taskId ? `task-${task.taskId}` : 'task-item'}
          style={[styles.body, done && styles.bodyDone]}
          onPress={onPress}
          accessibilityRole="button"
        >
          <View style={styles.topRow}>
            <View style={styles.identity}>
              {task.taskId ? (
                <Text style={[styles.eyebrow, { color: p.muted }]}>
                  {t('tasks.card.idPrefix', { id: shortTaskId(task.taskId) })}
                </Text>
              ) : null}
              <Text
                style={[styles.title, { color: done ? p.muted : p.text }, done && styles.struck]}
              >
                {task.taskName}
              </Text>
            </View>
            {/* The task's trade — a real column (projects.tasks.work_type), cached since DDL v4. A
                task with none simply shows no badge rather than a placeholder. */}
            {task.workType ? (
              <View style={[styles.badge, { borderColor: p.border, backgroundColor: p.elevated }]}>
                <Text style={[styles.badgeText, { color: p.accent }]}>{task.workType}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.metaRow}>
            <View style={styles.chips}>
              <Text style={[styles.pct, { color: p.text }]}>{task.progressPercent}%</Text>
              <StatusChip label={task.offlineSyncStatus} />
            </View>
            {!done ? (
              <View style={[styles.action, { backgroundColor: p.primary }]}>
                <Text style={[styles.actionText, { color: p.onPrimary }]}>
                  {t('tasks.card.updateProgress')}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Planned window — real DATE columns, so it reads as days. Hidden when the task has none. */}
          {task.plannedStart && task.plannedEnd ? (
            <Text style={[styles.window, { color: p.muted }]}>
              {t('tasks.card.plannedWindow', {
                start: formatDate(task.plannedStart),
                end: formatDate(task.plannedEnd),
              })}
            </Text>
          ) : null}

          <View style={[styles.track, { backgroundColor: p.elevated }]}>
            <View
              style={[
                styles.fill,
                {
                  backgroundColor: accent,
                  width: `${Math.min(100, Math.max(0, task.progressPercent))}%`,
                },
              ]}
            />
          </View>
        </TouchableOpacity>
      </View>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', borderBottomWidth: 1 },
  accent: { width: 4 },
  body: { flex: 1, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.xs },
  bodyDone: { opacity: 0.6 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  identity: { flex: 1, gap: 2 },
  eyebrow: {
    fontSize: 11,
    fontFamily: fontFamily.medium,
    letterSpacing: 1,
  },
  title: { fontSize: typography.body.fontSize, fontFamily: fontFamily.semibold },
  struck: { textDecorationLine: 'line-through' },
  badge: {
    borderRadius: radius.xl,
    borderWidth: 1,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  badgeText: { fontSize: 11, fontFamily: fontFamily.semibold, letterSpacing: 0.5 },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  chips: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  pct: { fontSize: typography.caption.fontSize, fontFamily: fontFamily.semibold },
  // Visual affordance only — the whole card is the tap target, so this is not a nested button (which
  // would put a control inside a control for a screen reader). Height matches the card's own row.
  action: {
    minHeight: touchTarget.secondaryButton - 8,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  actionText: { fontSize: typography.label.fontSize, fontFamily: fontFamily.semibold },
  window: { fontSize: typography.label.fontSize, fontFamily: fontFamily.regular },
  track: { height: 4, borderRadius: radius.sm, overflow: 'hidden' },
  fill: { height: '100%' },
  doneAction: { justifyContent: 'center', paddingHorizontal: spacing.lg },
  doneText: { fontFamily: fontFamily.semibold, fontSize: typography.body.fontSize },
});

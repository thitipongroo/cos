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
import { MaterialIcons } from '@expo/vector-icons';
import { delaySeverity } from '../lib/delaySeverity';
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
  badge = 'status',
}: {
  task: Task;
  onPress: () => void;
  onComplete: () => void;
  /** `status` on the dashboard, `severity` on the task list — see the note beside `showSeverity`. */
  badge?: 'status' | 'severity';
}) {
  const { t, statusLabel } = useI18n();
  const p = usePalette();
  const done = task.status === 'COMPLETED' || task.progressPercent >= 100;
  const started = !done && task.progressPercent > 0;
  // Accent bar: done → success, under way → primary, untouched → muted. Three states the row really
  // has, rather than the mockup's severity colours, which nothing on the row could decide.
  // WHICH BADGE THIS CARD WEARS. The dashboard shows the task's STATE; the task list shows how late
  // it is (PO decision 2026-08-11, following DESIGN.md §15.4's delay-severity bands). One component,
  // because everything else about the card is identical and two copies would drift.
  const severity = delaySeverity(task.plannedEnd, task.status, new Date());
  const showSeverity = badge === 'severity' && severity !== 'none';
  // The card is critically overdue AND is showing that band — see the warning panel and the action
  // below, which are two halves of one decision and must never disagree about which case this is.
  const criticalWarning = showSeverity && severity === 'CRITICAL' && !done;
  // FOUR BANDS, TWO TONES. §15.4 names four, the palette carries two that mean "act": HIGH and
  // CRITICAL are far enough past the date to be a problem now (danger), MEDIUM and LOW are drifting
  // (warning). LOW used to take `muted` — which is the same grey a task nobody has touched wears, so
  // a task one day late was drawn as a task with nothing wrong with it.
  const severityTone = severity === 'CRITICAL' || severity === 'HIGH' ? p.danger : p.warning;
  // Accent bar and badge, one colour: done → success, UNDER WAY → WARNING, untouched → muted.
  //
  // In progress is YELLOW, as the drawing has it (PO decision 2026-08-11) — and it earns the colour:
  // a task started and not finished is the one with something outstanding on it. It was `primary`,
  // the app's blue, which made every running task look like a button. (This edit was reported as
  // done once before while the line still said `p.primary`; nothing tests a colour, so nothing
  // caught it. Verified in the file this time.)
  const stateAccent = done ? p.success : started ? p.warning : p.muted;
  // The badge takes the SAME colour as the accent bar, so the strip down the edge and the word at
  // the top-right are one statement about the row rather than two (PO decision 2026-08-11).
  const stateTone = stateAccent;
  // THE WHOLE CARD SAYS ONE THING. Where the badge reads CRITICAL the edge and the progress bar are
  // red with it; where it reads a softer band they are yellow (PO decision 2026-08-11). They used to
  // disagree — a card could carry a red CRITICAL badge above a yellow bar, which reads as two
  // verdicts on one row. The rule is the badge's, so it holds wherever the badge changes.
  const accent = showSeverity ? severityTone : stateAccent;

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
      <View style={[styles.card, { backgroundColor: p.surface, borderColor: p.border }]}>
        <View style={[styles.accent, { backgroundColor: accent }]} />
        <TouchableOpacity
          testID={task.taskId ? `task-${task.taskId}` : 'task-item'}
          style={[styles.body, done && styles.bodyDone]}
          onPress={onPress}
          accessibilityRole="button"
        >
          {/* THE MOCKUP'S ORDER, since 2026-08-12 (PO decision: "จัดรูปแบบการวางตำแหน่งในการ์ดให้
              เหมือนกับใน mockup"). 03_site_engineer/03_tasks/01_se_tasks lays a card out as
              chips → name → progress bar with its figure → a full-width action, with one chevron
              centred at the trailing edge. This card had grown a different order: the name sharing
              the top row with the badge, the figure and the action side by side in the middle, and
              the bar alone at the very bottom, so the number and the bar it belongs to were three
              rows apart and the action floated mid-card. Nothing was removed to reorder it. */}
          <View style={styles.topRow}>
            <View style={styles.identity}>
              {task.taskId ? (
                <Text style={[styles.eyebrow, { color: p.muted }]}>
                  {t('tasks.card.idPrefix', { id: shortTaskId(task.taskId) })}
                </Text>
              ) : null}
            </View>
            {/* THE BADGE IS THE TASK'S STATE (PO decision 2026-08-11): the two chips traded places,
                so the state a foreman is scanning for sits top-right where the eye lands, and the
                trade sits with the figures below.
                The drawing puts a HIGH/MEDIUM priority badge here. `projects.tasks` has no priority
                column — checked against the live schema, not assumed — so the state, which is real,
                stands in its place. Its colour is the state's own, from lib/projectStatusTone.ts. */}
            <View
              style={[
                styles.stateTag,
                {
                  borderColor: showSeverity ? severityTone : stateTone,
                  backgroundColor: p.elevated,
                },
              ]}
            >
              {showSeverity ? (
                <MaterialIcons name="priority-high" size={12} color={severityTone} />
              ) : null}
              <Text
                style={[styles.stateTagText, { color: showSeverity ? severityTone : stateTone }]}
              >
                {showSeverity ? severity : statusLabel(task.status)}
              </Text>
            </View>
          </View>

          {/* NO STRIKE-THROUGH ON A FINISHED TASK (PO decision 2026-08-12: "การ์ดไหนที่ complete
              ไม่ต้องขีด และยังสามารถกดได้เหมือนเดิม"). Struck text reads as cancelled or withdrawn,
              which a completed task is the opposite of — and it made the one card whose record is
              worth opening the hardest to read. The badge, the green edge and the full bar already
              say it is done. The card stays pressable; only swipe-to-complete is withheld, because
              there is nothing left to complete. */}
          <Text style={[styles.title, { color: done ? p.muted : p.text }]}>{task.taskName}</Text>

          {/* NO TRADE CHIP AND NO DATES HERE any more (PO decision 2026-08-12: "ตัดประเภท (เช่น
              FOUNDATION) กับ วันที่ ออก"). The drawing's card is a status chip, a name, a bar and an
              action — the trade and the planned window were this card's own additions, and four
              stacked facts above a bar is what made it read as a form rather than a row. Both remain
              on the task DETAIL view, which is what the card opens. */}

          {/* THE DRAWING'S RED WARNING BOX (PO decision 2026-08-12). 01_se_tasks puts one under its
              blocked card — an outlined red panel with a `warning` glyph naming the cause. The cause
              it names ("ขาดแคลนวัสดุ") would be a per-task blocker field, and `projects.tasks` has no
              such column; what this card CAN say, and what its own badge already computes, is that
              the task is CRITICALLY late by the §15.4 delay bands (lib/delaySeverity.ts). So the box
              carries that, worded as the overdue fact it is rather than as an invented cause. Shown
              only where the badge reads CRITICAL, so it never fires on a card that looks calm. */}
          {criticalWarning ? (
            <View style={[styles.warnBox, { borderColor: p.danger }]}>
              <MaterialIcons name="warning" size={16} color={p.danger} />
              <Text style={[styles.warnText, { color: p.danger }]}>
                {t('tasks.card.criticalWarning')}
              </Text>
            </View>
          ) : null}

          {/* The bar and its figure on ONE row, as the drawing has them — a percentage three rows
              above the bar it describes made the reader join them up themselves. */}
          <View style={styles.progressRow}>
            <View style={[styles.track, { backgroundColor: p.bg }]}>
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
            <Text style={[styles.pct, { color: p.muted }]}>{task.progressPercent}%</Text>
          </View>

          {/* FULL WIDTH, under the bar (the drawing's `h-[44px] w-full`). It sat inline beside the
              percentage, which made the card's one action look like a chip.
              NOTHING here on a finished card (PO decision 2026-08-11): the badge already reads
              "Completed", and the two together stated the same fact twice.
              AND NOTHING ON A CRITICAL CARD either (PO decision 2026-08-12) — the drawing's blocked
              card carries the red warning panel INSTEAD of the action, not as well as it. A task
              this far past its date is not moved on by nudging a percentage, and offering that as
              the card's one button points the reader at the smallest thing they could do. */}
          {done || criticalWarning ? null : (
            <View style={[styles.action, { backgroundColor: p.elevated, borderColor: p.border }]}>
              <MaterialIcons name="update" size={16} color={p.accent} />
              <Text style={[styles.actionText, { color: p.accent }]}>
                {t('tasks.card.updateProgress')}
              </Text>
            </View>
          )}
        </TouchableOpacity>
        {/* One chevron, centred against the whole card (the drawing's trailing column). */}
        <View style={styles.chevron}>
          <MaterialIcons name="chevron-right" size={24} color={p.muted} />
        </View>
      </View>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  // A SEPARATE PLATE, not a full-bleed band (PO decision 2026-08-12: "การ์ดแต่ละอันไม่ได้ขยายเต็ม
  // หน้าจอแบบนั้น"). The drawing's cards are inset from both edges with rounded corners and their
  // own border; this was edge-to-edge with a bottom hairline, so consecutive rows read as one long
  // striped table rather than as the individual cards the mockup draws.
  card: {
    flexDirection: 'row',
    marginHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  accent: { width: 4 },
  body: { flex: 1, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.xs },
  bodyDone: { opacity: 0.6 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  identity: { flex: 1 },
  eyebrow: {
    fontSize: 11,
    fontFamily: fontFamily.medium,
    letterSpacing: 1,
  },
  title: { fontSize: typography.body.fontSize, fontFamily: fontFamily.semibold },
  struck: { textDecorationLine: 'line-through' },
  // SQUARE, like the drawing's BLOCKED / COMPLETED chips (PO decision 2026-08-12) — `rounded` in
  // its Tailwind config is the 0.125rem DEFAULT, which is `radius.sm`. Named `stateTag` rather than
  // `badge` so the exemption in theme/__tests__/badgeRadius.spec.ts applies to THIS chip only; that
  // list is keyed by style name across the whole app, and `badge` is a name several screens use.
  stateTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  tradeChip: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 1,
    borderRadius: radius.xl,
    borderWidth: 1,
  },
  tradeText: { fontFamily: fontFamily.medium, fontSize: 10, letterSpacing: 0.5 },
  stateTagText: { fontSize: 11, fontFamily: fontFamily.semibold, letterSpacing: 0.5 },
  warnBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  warnText: { flex: 1, fontFamily: fontFamily.medium, fontSize: typography.label.fontSize },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  chevron: { justifyContent: 'center', paddingRight: spacing.sm },
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minHeight: touchTarget.secondaryButton,
    marginTop: spacing.xs,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  actionText: { fontSize: typography.label.fontSize, fontFamily: fontFamily.semibold },
  window: { fontSize: typography.label.fontSize, fontFamily: fontFamily.regular },
  // `flex: 1` — the bar shares a row with its figure, and without it the track collapses to zero
  // width and the card shows a percentage with nothing behind it. `h-2` in the drawing.
  //
  // THE EMPTY PART OF THE TUBE HAS TO BE VISIBLE (PO decision 2026-08-12). The track was painted
  // `elevated`, which on the dark palette is all but the card's own surface — so a task at 40% drew
  // a short coloured stub floating on nothing, and the reader could not see how much was left. The
  // drawing uses `bg-dark-bg`, the page colour BEHIND the card, which is exactly what `p.bg` is.
  track: { flex: 1, height: 8, borderRadius: radius.sm, overflow: 'hidden' },
  fill: { height: '100%' },
  doneAction: { justifyContent: 'center', paddingHorizontal: spacing.lg },
  doneText: { fontFamily: fontFamily.semibold, fontSize: typography.body.fontSize },
});

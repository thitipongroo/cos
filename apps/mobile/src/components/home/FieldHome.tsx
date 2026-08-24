import { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { db } from '../../db/database';
import { localTasks } from '../../db/schema';
import { eq } from 'drizzle-orm';
import { mutate } from '../../api/client';
import { useCollection } from '../../hooks/useCollection';
import type { Task, Attendance } from '../../db/database';
import { shiftProgress } from '../../lib/shiftHours';
import { TaskCard } from '../TaskCard';
import { QuickActionsMenu } from '../QuickActionsMenu';
import { MaterialIcons } from '@expo/vector-icons';
import { Alert, ScrollView } from 'react-native';
import { useT } from '../../i18n';
import { usePalette } from '../../theme/usePalette';
import { ProjectContextBar } from '../ProjectContextBar';
import { useHomeStyles, StatTile, PRIORITY_TASK_COUNT } from './HomeKit';
import { Fab } from '../Fab';

// ── SITE_WORKER — bento stats, priority tasks ────────────────────────────────
//
// Implements mockup/mobile/05_site_worker/01_home/01_sw_dashboard, added by the 2026-08-08 restructure
// (527231f) — this role had no Home drawing before it. Product-owner decision the same day: rework
// the screen to the mockup.
//
// WHAT CHANGED AND WHY:
//   - The two KPI cards (open issues, pending sync) gave way to the mockup's two stat tiles, My
//     Tasks and Shift Hours. Neither count is lost: the Issues tab still carries its own list, and
//     sync health is the TopBar's global indicator plus the Sync Queue screen.
//   - The three inline quick-action tiles moved behind the FAB, which is what the mockup's
//     `aria-label="Quick Action"` button opens (see components/QuickActionsMenu.tsx — an
//     overlay, not a route).
//   - SELF CHECK-IN IS GONE from the product (product-owner decision 2026-08-09). It was on this
//     screen, then briefly in the navigation drawer, and is now removed outright along with its
//     project picker. The Shift Hours tile SURVIVES the removal: `attendance` is one of the six
//     entity types /sync/delta streams down (runDeltaSync.ts), so the rows it reads are recorded
//     elsewhere and synced — the button was never their only source.
//
// NOT DRAWN: the mockup's "WORKER COMMAND" heading. §32.7 names a top-level tab screen by its
// active bottom-nav tab, and all four of this role's screens had their in-content titles removed on
// 2026-08-08; `theme/__tests__/pageTitle.spec.ts` holds that line.
//
// The mockup's task cards are headed by a working window, "08:00 - 12:00", and by "Sector B".
// The WINDOW is real now: migration 20260811000001 added `planned_start_time` / `planned_end_time`
// to projects.tasks after the product owner asked for it (2026-08-11), and <TaskCard /> shows it on
// this screen — a card under TODAY'S PRIORITY TASKS is read by someone standing on site now, and a
// date range cannot tell them whether this is the morning job.
//
// The ZONE is still not. `projects.tasks` has `floor_id` and `room_id` with real FKs, but the seed
// populates neither, so there is nothing to draw — the card renders what the row really has.
export default function FieldHome() {
  const styles = useHomeStyles();
  const tasks = useCollection<Task>('local_tasks');
  const attendance = useCollection<Attendance>('local_attendance');
  const router = useRouter();
  const t = useT();
  const p = usePalette();
  const [quickActionsOpen, setQuickActionsOpen] = useState(false);

  // Real counts off the local cache, so they are honest with no signal (§17.4).
  const doneTasks = tasks.filter(
    (task) => task.status === 'COMPLETED' || task.progressPercent >= 100,
  );
  const shift = shiftProgress(attendance, new Date());
  // The mockup lists three cards then "+ N More Scheduled". Unfinished first — a finished task is
  // not a priority — in the order the sync gave them, which is the server's own ordering.
  const outstanding = tasks.filter((task) => !doneTasks.includes(task));
  const priority = outstanding.slice(0, PRIORITY_TASK_COUNT);
  const moreCount = outstanding.length - priority.length;

  // Swipe-right completes, exactly as on the Tasks screen — the same card must not behave
  // differently depending on which screen it is rendered from. Offline-safe: the local write lands
  // immediately and the PATCH queues, and the server resolves with Max-wins (§17.5, monotonic).
  const completeTask = async (task: Task): Promise<void> => {
    await db
      .update(localTasks)
      .set({ progressPercent: 100, offlineSyncStatus: 'PENDING' })
      .where(eq(localTasks.id, task.id));
    await mutate('PATCH', `/tasks/${task.taskId}`, { progress_percent: 100 }, 'task', task.taskId);
  };

  return (
    <View testID="home-screen" style={styles.fieldRoot}>
      <ScrollView contentContainerStyle={styles.fieldPage}>
        {/* WHICH SITE, first thing. The corrected mockup set replaced this screen's "WORKER COMMAND"
            title with the project the worker is on (05_site_worker/01_home/01_sw_dashboard), which is
            the more useful of the two: the tab bar already says this is Home, and nothing else on the
            screen says which site its figures belong to. */}
        <ProjectContextBar />
        {/* Bento stats (mockup). Both figures are counted from the local DB, never fetched. */}
        <View style={styles.kpiRow}>
          <StatTile
            testID="stat-my-tasks"
            label={t('home.field.myTasks')}
            icon="checklist"
            value={String(doneTasks.length)}
            unit={t('home.field.ofDone', { total: tasks.length })}
            fraction={tasks.length > 0 ? doneTasks.length / tasks.length : 0}
            barColor={p.success}
          />
          <StatTile
            testID="stat-shift-hours"
            label={t('home.field.shiftHours')}
            icon="schedule"
            // A dash, not "00:00": a worker who has not checked in has done no shift, and a zero
            // would read as one that has just started.
            value={shift.elapsed ?? '—'}
            unit={shift.elapsed ? t('home.field.hoursUnit') : ''}
            fraction={shift.fraction}
            barColor={p.accent}
          />
        </View>

        {/* AI INSIGHT — mockup copy in full, confidence figure included (PO decision 2026-08-08,
            the same ruling applied to the report bar, the safety scan and the tasks insight).
            Nothing behind it: the weather projection has no source in this product, and §22.3 puts
            schedule generation behind Temporal with a human-in-the-loop step, so ADJUST SCHEDULE
            reports that it is unavailable rather than acting. Nothing on this screen reads it. */}
        <View style={[styles.insight, { backgroundColor: p.elevated, borderLeftColor: p.accent }]}>
          <View style={styles.insightHead}>
            <View style={styles.insightTitle}>
              <MaterialIcons name="psychology" size={20} color={p.accent} />
              <Text style={[styles.insightLabel, { color: p.accent }]}>
                {t('home.field.insightLabel')}
              </Text>
            </View>
            <Text style={[styles.insightConf, { color: p.muted, backgroundColor: p.surface }]}>
              {t('home.field.insightConfidence')}
            </Text>
          </View>
          <Text style={[styles.insightBody, { color: p.text }]}>{t('home.field.insightBody')}</Text>
          <TouchableOpacity
            testID="home-insight-action"
            accessibilityRole="button"
            accessibilityLabel={t('home.field.insightAction')}
            onPress={() => Alert.alert(t('home.field.insightAction'), t('common.comingSoon'))}
            style={[styles.insightButton, { borderColor: p.accent }]}
          >
            <MaterialIcons name="tune" size={18} color={p.accent} />
            <Text style={[styles.insightButtonText, { color: p.accent }]}>
              {t('home.field.insightAction')}
            </Text>
          </TouchableOpacity>
        </View>

        {/* TODAY'S PRIORITY TASKS (mockup). The same <TaskCard /> the Tasks screen renders, so the
            two cannot drift apart, and the same swipe-to-complete behaviour. */}
        {/* The heading is a LINK, not just a label. Moving the quick actions behind the FAB took the
            Tasks tile off this screen, and the mockup's only other route to the full list is
            "+ N more scheduled" — which does not render when there are no tasks at all, leaving
            /tasks unreachable in exactly the state a new worker starts in. */}
        <TouchableOpacity
          testID="home-tasks-link"
          accessibilityRole="link"
          accessibilityLabel={t('home.field.priorityTasks')}
          onPress={() => router.push('/tasks')}
          style={styles.sectionHeader}
        >
          <Text style={[styles.sectionTitle, { color: p.text }]}>
            {t('home.field.priorityTasks')}
          </Text>
          <MaterialIcons name="chevron-right" size={20} color={p.muted} />
        </TouchableOpacity>
        {priority.length === 0 ? (
          <Text testID="home-no-tasks" style={styles.message}>
            {t('tasks.list.empty')}
          </Text>
        ) : (
          priority.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onPress={() => router.push('/tasks')}
              onComplete={() => void completeTask(task)}
            />
          ))
        )}
        {moreCount > 0 ? (
          <TouchableOpacity
            testID="home-more-tasks"
            accessibilityRole="button"
            accessibilityLabel={t('home.field.moreScheduled', { count: moreCount })}
            onPress={() => router.push('/tasks')}
            style={styles.moreTasks}
          >
            <Text style={[styles.moreTasksText, { color: p.accent }]}>
              {t('home.field.moreScheduled', { count: moreCount })}
            </Text>
            <MaterialIcons name="chevron-right" size={18} color={p.accent} />
          </TouchableOpacity>
        ) : null}
      </ScrollView>

      {/* The mockup's FAB — `aria-label="Quick Action"`, a + that rotates open. It opens the
          quick-action menu as an OVERLAY (2026-08-09): the reference that menu now follows
          (04_tenant_admin/…/01_quick_action_menu) heads the surface with its own bar and a close
          button, and a pushed route gets the shared TopBar's back chevron instead. */}
      <Fab
        testID="home-quick-action-fab"
        accessibilityLabel={t('quickActions.title')}
        onPress={() => setQuickActionsOpen(true)}
      />

      <QuickActionsMenu visible={quickActionsOpen} onClose={() => setQuickActionsOpen(false)} />
    </View>
  );
}

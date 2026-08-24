// Tasks screen — SITE_WORKER task list + detail + progress update (offline-first).
// Implements mockup/mobile/05_site_worker/02_tasks/01_sw_daily_tasks.
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
//   - "08:00 - 12:00". The times exist now (migration 20260811000001), but THIS screen keeps the
//     DATES: its badge is a delay severity and its cards span weeks, so the dates are what make
//     "CRITICAL" mean anything — a red chip over a time of day says nothing about how late the work
//     is. The dashboard, which is about today, shows the window instead (PO decision 2026-08-11).
//
// THE STATIC "AI Insight" CARD IS GONE (PO decision 2026-08-12), and <ScheduleInsight /> above the
// list is what replaced it.
//
// That card was drawn here by a PO decision of 2026-08-08 — itself a reversal of an earlier call to
// drop it — on the reasoning that DelayForecastModel is Phase 23 and untrained (§22.6), so the
// screen could state the mockup's example instead of a computed forecast. What changed is that a
// forecast is now obtainable: `POST /ai/reports/delay-risk` is built and serving (ai-gateway
// main.py), it assembles real workforce, procurement, manpower and weather context (risk/context.py,
// ADR-072), and the panel renders only what that call returns with the model's own confidence band.
// With a real one on the screen the static one stopped being a placeholder for something absent and
// became a second, invented insight sitting beside a true one — which is the case §22.3 is most
// explicit about. Its "ปรับตารางเวลาอัตโนมัติ" action went with it: it never rescheduled anything
// (auto-schedule generation is post-MVP Layer B/C and §22.3 requires a human-in-the-loop step
// through Temporal), so it was a button that only ever said the feature was unavailable.
//
// The mockup's floating voice FAB is <VoiceCommandFab /> — the ADR-073 component already built for
// the Site Engineer home: hold to record → transcribe → classify intent → route to a real screen,
// and a message rather than a guessed action when the intent is unsupported. No second voice
// behaviour was invented for this screen.

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { db } from '../../db/database';
import type { Task } from '../../db/database';
import { localTasks } from '../../db/schema';
import { eq } from 'drizzle-orm';
import { useCollection } from '../../hooks/useCollection';
import { TaskCard } from '../../components/TaskCard';
import { ProjectContextBar } from '../../components/ProjectContextBar';
import { ScheduleInsight } from '../../components/ScheduleInsight';
import { useProjectStore } from '../../store/projectStore';
import { getProjectPhases } from '../../api/projects';
import { currentPhase, type ProjectPhase } from '../../lib/siteEngineerHome';
import { phaseName } from '../../lib/phaseName';
import { mutate } from '../../api/client';
import { useI18n } from '../../i18n';
import { fontFamily, radius, spacing, touchTarget, typography } from '../../theme/tokens';
import { usePalette } from '../../theme/usePalette';
import { makeScreenStyles } from '../../theme/screenStyles';

/** The filter set. `all` is first and selected on entry. */
const FILTERS = ['all', 'pending', 'inProgress', 'done'] as const;
type Filter = (typeof FILTERS)[number];

/**
 * How many cards the list opens with (PO decision 2026-08-12).
 *
 * The list is every task on the site — 25 on the seeded project — and a screen that drops the reader
 * into all of them is a scroll, not a view. Ten is what the section shows before "show more".
 */
const DEFAULT_LIMIT = 10;

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

/**
 * One task row, memoized.
 *
 * TaskCard takes zero-argument callbacks, so wiring it inline gave every card two new functions on
 * every render and nothing could bail out. This wrapper takes the task and two callbacks that are
 * built once for the whole list, and creates the per-task closures INSIDE itself — where they are
 * not props and so cannot defeat the comparison.
 */
const TaskRow = memo(function TaskRow({
  task,
  onOpen,
  onComplete,
}: {
  task: Task;
  onOpen: (task: Task) => void;
  onComplete: (task: Task) => void;
}) {
  return (
    <TaskCard
      badge="severity"
      task={task}
      onPress={() => onOpen(task)}
      onComplete={() => onComplete(task)}
    />
  );
});

export default function TasksScreen() {
  const tasks = useCollection<Task>('local_tasks');
  // The same site the bar above the list names — read from the store rather than a second chooser,
  // so the Insight card can never report on a different project than the screen says it is on.
  const insightProjectId = useProjectStore((s) => s.active?.projectId ?? '');
  // The project's NAME for the panel's "Source:" line. Without it InsightPanel falls back to the id
  // and the line reads `Source: project d0c71c19-bf77-…`, which names nothing to the person reading
  // it — the same defect issues.tsx fixed on 2026-08-12 and this screen kept until 2026-08-16, when
  // the committed capture (03-Tasks/01-se-tasks.png) put the bare uuid on the record.
  const insightProjectName = useProjectStore((s) => s.active?.projectName ?? '');
  const [phases, setPhases] = useState<ProjectPhase[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  const { t, locale } = useI18n();
  const p = usePalette();
  const screen = useMemo(() => makeScreenStyles(p), [p]);
  const [selected, setSelected] = useState<Task | null>(null);
  const [progress, setProgress] = useState('');
  const [savedValue, setSavedValue] = useState<number | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  /**
   * The project's phases (ADR-070), for the heading the drawing puts over the list — "เฟส 2: งาน
   * โครงสร้าง" (PO decision 2026-08-12). Derived, never a stored flag: `currentPhase` takes the
   * lowest-seq phase that is IN_PROGRESS, or the next one not yet COMPLETED. Not cached offline, so
   * a failure leaves the last value rather than a wrong one — and with no phase the heading falls
   * back to naming the list itself instead of inventing a phase.
   */
  useEffect(() => {
    if (insightProjectId === '') return;
    let cancelled = false;
    getProjectPhases(insightProjectId)
      .then((rows) => {
        if (!cancelled) setPhases(rows);
      })
      .catch(() => {
        /* offline — keep the last phases */
      });
    return () => {
      cancelled = true;
    };
  }, [insightProjectId]);

  const phase = currentPhase(phases);

  // SCOPED TO THE SITE THE BAR ABOVE NAMES. The heading counts this project's outstanding work, so
  // the list under it has to be the same project's — a header about one site over a list of five
  // would be two different answers on one screen. With nothing chosen yet it shows everything,
  // which is the only honest thing to show.
  const projectTasks = useMemo(
    () =>
      insightProjectId === '' ? tasks : tasks.filter((task) => task.projectId === insightProjectId),
    [tasks, insightProjectId],
  );

  const counts = useMemo(
    () =>
      Object.fromEntries(
        FILTERS.map((f) => [f, projectTasks.filter((task) => matches(task, f)).length]),
      ) as Record<Filter, number>,
    [projectTasks],
  );
  const matching = useMemo(
    () => projectTasks.filter((task) => matches(task, filter)),
    [projectTasks, filter],
  );
  const visible = useMemo(() => matching.slice(0, limit), [matching, limit]);
  /** The drawing's "3 งาน" beside the phase — what is still outstanding, not the list length. */
  const outstanding = useMemo(
    () => projectTasks.filter((task) => !isDone(task)).length,
    [projectTasks],
  );

  // Built once for the whole list, so TaskRow's props stay equal between renders.
  const openTask = useCallback((task: Task): void => {
    setSelected(task);
    setProgress(String(task.progressPercent));
    setSavedValue(null);
  }, []);

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
  const completeTask = useCallback(async (task: Task): Promise<void> => {
    await db
      .update(localTasks)
      .set({ progressPercent: 100, offlineSyncStatus: 'PENDING' })
      .where(eq(localTasks.id, task.id));
    await mutate('PATCH', `/tasks/${task.taskId}`, { progress_percent: 100 }, 'task', task.taskId);
  }, []);

  const onCompleteRow = useCallback(
    (task: Task): void => {
      void completeTask(task);
    },
    [completeTask],
  );

  const renderTask = useCallback(
    ({ item }: { item: Task }) => (
      <TaskRow task={item} onOpen={openTask} onComplete={onCompleteRow} />
    ),
    [openTask, onCompleteRow],
  );

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
          accessibilityRole="button"
          accessibilityLabel={t('tasks.detail.save')}
          onPress={onSave}
        >
          <Text style={screen.primaryButtonText}>{t('tasks.detail.save')}</Text>
        </TouchableOpacity>
        {savedValue !== null ? (
          <Text testID="progress-display" style={[styles.saved, { color: p.success }]}>
            {savedValue}
          </Text>
        ) : null}
        <TouchableOpacity
          testID="task-back-button"
          accessibilityRole="button"
          accessibilityLabel={t('tasks.detail.back')}
          onPress={() => setSelected(null)}
        >
          <Text style={[styles.back, { color: p.accent }]}>{t('tasks.detail.back')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View testID="tasks-screen" style={[styles.page, { backgroundColor: p.bg }]}>
      {/* THE BAR, THE PANEL AND THE CARDS ARE ALL ONE WIDTH (PO decision 2026-08-12). <TaskCard />
          insets itself from both edges, so these two ran edge to edge above a list of narrower
          cards — three different left margins down one screen. This inset is the cards' own. */}
      <View style={styles.headerInset}>
        <ProjectContextBar />
      </View>
      {/* The Insight card the restructured drawing opens this list with
          (03_site_engineer/03_tasks/01_se_tasks). Backed by DELAY_RISK — the only schedule report
          the gateway serves — and reading its level and risk factors rather than its first string
          field; see components/ScheduleInsight.tsx. Rendered only once a project is chosen, because
          every report endpoint is project-scoped and the bar above is where that is answered. */}
      {insightProjectId !== '' ? (
        // Its own breathing room: the panel sat flush against the Active Project bar above it, so the
        // two read as one stacked block instead of as the bar and a separate insight (PO 2026-08-12).
        <View style={[styles.insightSlot, styles.headerInset]}>
          <ScheduleInsight projectId={insightProjectId} projectLabel={insightProjectName} />
        </View>
      ) : null}
      {/* NO in-content page title, though the mockup draws "รายการงานวันนี้" (§32.7 Mobile App Shell:
          a top-level tab screen is named by its active bottom-nav tab, and repeating the name inside
          the content states it twice). This is the one place the mockup is deliberately not followed
          on this screen — PO decision 2026-08-08, after all four Site Worker screens shipped with a
          title that no other tab screen has. */}
      {/* THE DRAWING'S SECTION HEADING, NOT A CHIP ROW (PO decision 2026-08-12). 01_se_tasks heads
          its list with the project's current PHASE and how much work is still outstanding — "เฟส 2:
          งานโครงสร้าง · 3 งาน" — and puts the filtering behind an icon. The chips were four
          always-on buttons taking a whole row to say what one glyph and a sheet can, and they
          pushed the first card off the fold.
          The phase is derived (ADR-070); with none known the heading names the list instead of
          inventing a phase. The count is what is NOT done — the number a foreman is asking for —
          not the length of whatever filter happens to be on. */}
      <View style={styles.header}>
        {/* ONE LINE, IN THE DASHBOARD'S SECTION-HEADING FORM (PO decision 2026-08-12): the same
            uppercase, letter-spaced, muted label that heads "PROJECT PROGRESS" and "ACTIVE ISSUES"
            on the Site Engineer home (SiteEngineerHome's `cardLabel`/`sectionTitle`), so a heading
            reads the same wherever this role meets one. The count sits beside it rather than under
            it, as the drawing has it.
            THE COUNT IS REAL and is not the list length: it is how many of THIS project's tasks are
            not done — `!isDone`, which is `status === 'COMPLETED' || progress >= 100` (§17.5), the
            same test the Done filter uses. On the captured project that is 3 of 5. */}
        <View style={styles.headText}>
          {/* "Phase 1: งานฐานราก (Foundation)" — the drawing's "เฟส 2: งานโครงสร้าง" (PO decision
              2026-08-12). `seq` is the phase's own 1-based order from `projects.project_phases`,
              checked against the database rather than assumed: CWRD's five phases run 1..5, so the
              number shown is the column's value and not an index the screen invented. */}
          <Text style={[styles.phase, { color: p.muted }]} numberOfLines={1}>
            {phase === null
              ? t('tasks.list.heading')
              : t('tasks.list.phase', {
                  seq: String(phase.seq),
                  // ONE LANGUAGE, the reader's (PO decision 2026-08-12). The column holds both —
                  // "งานฐานราก (Foundation)" — and the bracket is the translation, not part of the
                  // name; see lib/phaseName.ts.
                  name: phaseName(phase.name, locale),
                })}
          </Text>
          <Text style={[styles.outstanding, { color: p.accent }]}>
            {t('tasks.list.outstanding', { count: outstanding })}
          </Text>
        </View>
        {/* The same `filter_list` control the project picker's search row carries, so one glyph
            means one thing across the app. This one is WIRED: it opens the sheet below. */}
        <TouchableOpacity
          testID="task-filter-button"
          accessibilityRole="button"
          accessibilityLabel={t('tasks.filters.open')}
          onPress={() => setFilterOpen(true)}
          style={[styles.filterBtn, { borderColor: p.border, backgroundColor: p.surface }]}
        >
          <MaterialIcons name="filter-list" size={20} color={p.accent} />
        </TouchableOpacity>
      </View>

      {/* The filter conditions that used to sit on the page. Same four, same real counts. */}
      <Modal
        visible={filterOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setFilterOpen(false)}
      >
        <Pressable
          testID="task-filter-backdrop"
          style={styles.backdrop}
          accessibilityRole="button"
          accessibilityLabel={t('tasks.filters.close')}
          onPress={() => setFilterOpen(false)}
        >
          <Pressable
            testID="task-filter-sheet"
            style={[styles.sheet, { backgroundColor: p.surface, borderColor: p.border }]}
            onPress={() => {}}
          >
            <Text style={[styles.sheetTitle, { color: p.text }]}>{t('tasks.filters.open')}</Text>
            {FILTERS.map((f) => {
              const active = f === filter;
              return (
                <TouchableOpacity
                  key={f}
                  testID={`task-filter-${f}`}
                  onPress={() => {
                    setFilter(f);
                    // Back to the top of the new selection: keeping a "show more" expansion from
                    // the previous filter would open the next one part-way down for no reason.
                    setLimit(DEFAULT_LIMIT);
                    setFilterOpen(false);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  style={[
                    styles.sheetRow,
                    { borderColor: active ? p.primary : p.border },
                    active && { backgroundColor: p.elevated },
                  ]}
                >
                  <Text style={[styles.sheetRowText, { color: active ? p.accent : p.text }]}>
                    {`${t(`tasks.filters.${f}`)} (${String(counts[f])})`}
                  </Text>
                  {active ? <MaterialIcons name="check" size={18} color={p.accent} /> : null}
                </TouchableOpacity>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>

      <FlatList
        testID="task-list"
        data={visible}
        keyExtractor={(item) => item.id}
        // `flex: 1` — the same fix, and the same bug, as the reports list (2026-08-12). Without it
        // the list sizes to its content inside the flex:1 page, so it has no overflow to scroll and
        // simply draws past the bottom of the window. On a 25-task day that is most of the day's
        // work silently unreachable, and it worsened as things were added above the list.
        style={styles.listFill}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={screen.empty}>{t('tasks.list.empty')}</Text>}
        // Ten cards to open with; the rest on request — see DEFAULT_LIMIT.
        ListFooterComponent={
          matching.length > visible.length ? (
            <TouchableOpacity
              testID="task-show-more"
              accessibilityRole="button"
              accessibilityLabel={t('tasks.list.showMore')}
              onPress={() => setLimit((n) => n + DEFAULT_LIMIT)}
              style={[styles.showMore, { borderColor: p.border }]}
            >
              <Text style={[styles.showMoreText, { color: p.accent }]}>
                {t('tasks.list.showMore')}
              </Text>
            </TouchableOpacity>
          ) : null
        }
        renderItem={renderTask}
      />

      {/* NO VOICE FAB ON THIS SCREEN (PO decision 2026-08-12: "ตัดปุ่มไมโครโฟนออก"). The Site
          Worker's task drawing has one and this screen inherited it; the Site Engineer's
          (03_site_engineer/03_tasks/01_se_tasks) does not, and on a list of cards that each carry
          their own action the floating mic sat over the last card without belonging to any of them.
          <VoiceCommandFab /> (ADR-073) is unchanged and still on the Site Engineer home, which is
          where its own drawing puts it. */}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  insightSlot: { marginTop: spacing.sm, marginBottom: spacing.xs },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  headerInset: {
    paddingHorizontal: spacing.md,
    // Air under the app's TopBar (PO decision 2026-08-12), the same gap the issue board uses. This
    // screen is a full-height list with no page padding of its own, so the Active Project card sat
    // flush against the bar above it and the two read as one block.
    paddingTop: spacing.sm,
  },
  headText: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  phase: {
    flexShrink: 1,
    fontSize: typography.label.fontSize,
    fontFamily: fontFamily.medium,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  outstanding: { fontFamily: fontFamily.semibold, fontSize: typography.label.fontSize },
  filterBtn: {
    width: touchTarget.formInput,
    height: touchTarget.formInput,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    gap: spacing.xs,
    padding: spacing.md,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
  },
  sheetTitle: {
    fontFamily: fontFamily.semibold,
    fontSize: typography.body.fontSize,
    marginBottom: spacing.xs,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: touchTarget.secondaryButton,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  sheetRowText: { fontFamily: fontFamily.medium, fontSize: typography.body.fontSize },
  showMore: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: touchTarget.secondaryButton,
    marginTop: spacing.sm,
    marginHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  showMoreText: { fontFamily: fontFamily.semibold, fontSize: typography.caption.fontSize },
  // Deep enough that the floating voice FAB never covers the last card.
  // `gap` puts air BETWEEN the task cards (PO decision 2026-08-12). <TaskCard /> is full-bleed with a
  // bottom hairline, so consecutive cards met edge to edge and the list read as one banded slab
  // rather than as the separated cards the mockup draws.
  listFill: { flex: 1 },
  list: { paddingBottom: spacing.xl * 3, gap: spacing.xs },
  label: { fontSize: typography.body.fontSize, fontFamily: fontFamily.regular },
  saved: { fontSize: typography.title.fontSize, fontFamily: fontFamily.bold },
  back: { fontFamily: fontFamily.medium, marginTop: spacing.md },
});

// Site Engineer Home — the role's landing "command view".
// Reference mockup: mockup/mobile/03_site_engineer/01_home/01_se_home_dashboard/ (screen.png +
// code.html). The path moved in the 2026-08-11 restructure (`01_dashboard/` → `01_home/
// 01_se_home_dashboard/`, git rename); the drawing itself was also revised in the same commit.
//
// Rendered by (app)/home.tsx for CosRole.SITE_ENGINEER; it lives here rather than under app/ because
// everything in app/ is a route, and this is the Home tab's content, not a route of its own. It is a
// separate file from home.tsx's other role variants because it is the only one on the dark palette
// (§32.7 "Mobile Dark Surfaces") and the only one composing several data sources.
//
// LAYOUT (product-owner decisions 2026-07-25/26):
//   - Project picker at the top, scoped to the projects THIS engineer is a member of
//     (GET /projects/mine → project_members), not the whole tenant. Auto-selects the first.
//   - One consolidated command card: the "Project progress" %, the schedule verdict as a pill, the
//     current phase inline, and a footer showing the selected project's START (start_date) and GOAL
//     (end_date) — the project timeline, not a daily work-hours window.
//   - The mockup's four quick-action tiles (Daily Report · Capture Photo · Safety Check → /inspections
//     · Material Req). Safety Check routes to this role's own "fill a safety/QC checklist" workflow.
//   - Round mic voice FAB (VoiceCommandFab).
//   - Background is a solid tiered dark surface per the design tokens — the ADR-071 blueprint GRID was
//     removed (the tokens specify no grid; §32.7 prohibits blueprint imagery). The progress-bar GLOW
//     (the other half of ADR-071) is kept, by product-owner decision 2026-07-26.
//
// THE 2026-08-11 MOCKUP REVISION, and what of it landed here. That commit changed four things in
// the drawing. One is a restyle and is applied: the severity count moved from the far right of the
// "Active Issues" heading to sit beside the title. The other three are ADDITIONS to the screen, not
// restyles of it, and ADR-085 makes the mockups authoritative for style rather than composition —
// so they are recorded here and not built on a drawing alone:
//   - an "Active Project" bar (accent strip · apartment plate · ACTIVE PROJECT eyebrow · name ·
//     44pt sync_alt switch) in place of the project picker. Swapping the picker for it is a
//     behaviour change, not a paint job: this screen keeps its own local `projectId`, while the
//     switch control in the drawing is the shared picker overlay backed by `projectStore`.
//   - "SEE ALL" links on the Active Issues and Upcoming Tasks headings — new navigation.
//   - a `filter_list` glyph beside each — a filter with no facet defined anywhere in the spec.
// The revised header (10px tracking-widest wordmark, smaller bell and avatar) belongs to the shared
// TopBar, which every role renders; it is not this component's to change.
//
// SEE ALL IS BUILT; THE FILTER GLYPH BESIDE IT IS NOT (2026-08-12). The revision draws both on each
// section heading. SEE ALL has a real destination — the Issues and Tasks tabs, which this role now
// carries — so it is a link to a screen that exists. The `filter_list` glyph next to it has no
// facet: neither screen defines a filter, `issues` has no severity or status control at all (its
// severity is fixed on create), and a control that opens nothing is worse than an absent one.
//
// Driven by REAL data, never mockup placeholders (ห้ามเดา): the schedule word/colour come from spi
// (behind → red, not the mockup's "Ahead of Schedule"), the phase is the derived current phase, and
// the issue rows carry no "AI: 94% • BIM SYNC" chip — no such field exists on issues.

import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { get } from '../api/client';
import {
  getProjectProgress,
  getProjectPhases,
  getMyProjects,
  type ProjectProgress,
  type MyProject,
} from '../api/projects';
import { VoiceCommandFab } from './VoiceCommandFab';
import { QuickActionCard } from './QuickActionCard';
import { ProjectContextBar } from './ProjectContextBar';
import { useProjectStore } from '../store/projectStore';
import { LoadingBoundary } from './LoadingBoundary';
import { phaseName } from '../lib/phaseName';
import { useI18n } from '../i18n';
import {
  currentPhase,
  formatDdMonYyyy,
  hasProgressFigure,
  progressBarWidth,
  scheduleColour,
  selectUpcomingTasks,
  sortIssuesBySeverity,
  taskStartUrgency,
  topSeverityCount,
  urgencyCounts,
  type ActiveIssue as IssueRow,
  type ProjectPhase,
  type ScheduleColour,
  type TaskUrgency,
  type UpcomingTask as TaskRow,
} from '../lib/siteEngineerHome';
import { darkColors, fontFamily, radius, spacing, touchTarget, typography } from '../theme/tokens';

/** Normalise a list endpoint that may return `T[]` or `{ items: T[] }`. */
function asList<T>(res: { items?: T[] } | T[]): T[] {
  return Array.isArray(res) ? res : (res.items ?? []);
}

const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: darkColors.danger,
  HIGH: darkColors.danger,
  MEDIUM: darkColors.warning,
  LOW: darkColors.muted,
};

const STATUS_KEY: Record<NonNullable<ProjectProgress['status']>, string> = {
  ahead: 'home.engineer.ahead',
  on_track: 'home.engineer.onTrack',
  behind: 'home.engineer.behind',
};

// §32.12 Display: the verdict's three-band colour, keyed on the client-side scheduleColour().
const SCHEDULE_COLOR: Record<ScheduleColour, string> = {
  green: darkColors.success,
  amber: darkColors.warning,
  red: darkColors.danger,
};

// Colour of an upcoming task's start date — red once overdue, amber within three days.
const URGENCY_COLOR: Record<TaskUrgency, string> = {
  overdue: darkColors.danger,
  'due-soon': darkColors.warning,
  normal: darkColors.muted,
};

/**
 * A section-header count: "<N> <label>" — the number first and set larger/bolder so it reads apart
 * from the label (mockup parity, e.g. "2 CRITICAL"; PO 2026-07-26). Label arrives already localized.
 */
function CountBadge({
  testID,
  label,
  count,
  colour,
}: {
  testID?: string;
  label: string;
  count: number;
  colour: string;
}) {
  return (
    <Text testID={testID} style={styles.badge}>
      <Text style={[styles.badgeNumber, { color: colour }]}>{count}</Text>
      <Text style={[styles.badgeLabel, { color: colour }]}> {label}</Text>
    </Text>
  );
}

/**
 * How many rows each dashboard section shows before "SEE ALL" is the way to the rest (PO decision
 * 2026-08-12). The dashboard is a summary; five issues was already most of a list.
 */
const SECTION_LIMIT = 3;

/**
 * The revision's "SEE ALL ›" link on a section heading. Accent, per the §20.8 note on the eyebrow.
 *
 * DISABLED WHEN THERE IS NOTHING MORE TO SEE (PO decision 2026-08-12). With three or fewer rows the
 * section already shows everything, so the link would open a list the reader has just finished
 * reading. Dimmed AND `accessibilityState.disabled`, so the fact reaches a screen reader too.
 */
function SeeAll({
  testID,
  onPress,
  enabled,
}: {
  testID: string;
  onPress: () => void;
  enabled: boolean;
}): React.JSX.Element {
  const { t } = useI18n();
  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      disabled={!enabled}
      accessibilityRole="link"
      accessibilityLabel={t('home.engineer.seeAll')}
      accessibilityState={{ disabled: !enabled }}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={[styles.seeAll, !enabled && styles.seeAllDisabled]}
    >
      <Text style={styles.seeAllText}>{t('home.engineer.seeAll')}</Text>
      <MaterialIcons name="chevron-right" size={16} color={darkColors.accent} />
    </TouchableOpacity>
  );
}

export default function SiteEngineerHome() {
  const router = useRouter();
  const { t, formatDate, locale } = useI18n();

  // THE SELECTED PROJECT IS THE STORE'S, not this screen's own state (PO decision 2026-08-12). It was
  // local, chosen from a chip-row picker, which is why every store-backed control on the engineer's
  // other screens — the Active Project bar and both Insight cards — rendered nothing for this role:
  // they read `projectStore` and only the Site Worker ever wrote to it. One source, so the bar on
  // Tasks cannot name a different site than the dashboard is reporting on.
  const projectId = useProjectStore((s) => s.active?.projectId ?? '');
  const [myProjects, setMyProjects] = useState<MyProject[]>([]);
  const [progress, setProgress] = useState<ProjectProgress | null>(null);
  const [issues, setIssues] = useState<IssueRow[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [phases, setPhases] = useState<ProjectPhase[]>([]);
  // Load-step flags → an honest progress % (steps settled / total), per ADR-055 (caller owns
  // progress — the component invents none). The initial load is GET /projects/mine + the selected
  // project's progress + issues + tasks; the % is how many have settled.
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [progressLoaded, setProgressLoaded] = useState(false);
  const [issuesLoaded, setIssuesLoaded] = useState(false);
  const [tasksLoaded, setTasksLoaded] = useState(false);

  // The projects this engineer is a member of (GET /projects/mine). The picker is scoped to these;
  // the first (an ACTIVE one, else the first) is auto-selected so the card loads without a tap.
  useEffect(() => {
    getMyProjects()
      .then(setMyProjects)
      .catch(() => {
        /* offline — keep the last list rather than showing an empty picker */
      })
      .finally(() => setProjectsLoaded(true));
  }, []);
  // NO AUTO-SELECT ANY MORE. It used to pick the first ACTIVE project silently; with selection in
  // the store that job belongs to <SelectProjectSheet />, which the shell now raises for this role
  // the first time it mounts with nothing chosen — the same way the Site Worker has always answered
  // this question. Seeding the store from here instead would race that offer and leave the overlay
  // open over a project it had already chosen.

  const loadProject = useCallback((id: string) => {
    if (!id) return;
    getProjectProgress(id)
      .then(setProgress)
      .catch(() => {
        /* offline — keep the last figure rather than showing a wrong one */
      })
      .finally(() => setProgressLoaded(true));
    getProjectPhases(id)
      .then(setPhases)
      .catch(() => {
        /* offline — keep the last phase rather than showing a wrong one */
      });
    get<{ items?: IssueRow[] } | IssueRow[]>('/site/issues', { project_id: id, status: 'OPEN' })
      .then((res) => setIssues(asList(res)))
      .catch(() => {
        /* offline — keep last */
      })
      .finally(() => setIssuesLoaded(true));
    get<{ items?: TaskRow[] } | TaskRow[]>(`/projects/${id}/tasks`)
      .then((res) => setTasks(asList(res)))
      .catch(() => {
        /* offline — keep last */
      })
      .finally(() => setTasksLoaded(true));
  }, []);

  useEffect(() => loadProject(projectId), [projectId, loadProject]);

  // Honest load progress: 1 step (projects) if the engineer is a member of none, else 4 (projects +
  // the project's progress / issues / tasks). `loading` holds the skeletons until every step settles.
  const projectsEmpty = projectsLoaded && myProjects.length === 0;
  const totalSteps = projectsEmpty ? 1 : 4;
  const doneSteps = [projectsLoaded, progressLoaded, issuesLoaded, tasksLoaded].filter(
    Boolean,
  ).length;
  const loading = doneSteps < totalSteps;
  const loadProgress = Math.round((Math.min(doneSteps, totalSteps) / totalSteps) * 100);

  // Issues most severe first, plus the "worst level present ×N" badge for the section header.
  const sortedIssues = sortIssuesBySeverity(issues);
  const topSev = topSeverityCount(issues);

  // local_tasks has no planned_start column, so this list is online-only and keeps its last value
  // offline rather than falling back to the cache without times.
  const upcoming = selectUpcomingTasks(tasks);
  const now = new Date();
  // Header badge: how many upcoming tasks are overdue to start / start within three days.
  const urgency = urgencyCounts(tasks, now);

  // null is "not computable" (§32.12) — never render it as a 0% bar, which would read as "no work
  // done" rather than "no data".
  const pct = progress?.percentComplete ?? null;
  // §32.12 Display: the verdict word/colour from spi, shown as a filled pill.
  const colour = scheduleColour(progress?.spi);

  // The auto-selected project, shown by name in the card header + used for the START/GOAL footer.
  const selectedProject = myProjects.find((p) => p.project_id === projectId) ?? null;

  // The current construction phase (ADR-070), derived from the phase list — null when the project has
  // no phases (or all are done). The phase name is stored as "Thai (English gloss)"; the dashboard
  // shows the Thai only — drop a trailing "(…)" (display-only; data unchanged, PO 2026-07-26).
  const phase = currentPhase(phases);
  const phaseLabel = phase
    ? `${t('home.engineer.phaseSeq', { seq: phase.seq })}: ${phase.name.replace(/\s*\([^)]*\)\s*$/, '')}`
    : null;

  // The schedule verdict pill — the status word in its three-band colour, filled on a tinted ground.
  const schedulePill =
    progress?.status && colour ? (
      <View
        testID="schedule-status"
        style={[styles.pill, { backgroundColor: `${SCHEDULE_COLOR[colour]}26` }]}
      >
        <Text style={[styles.pillText, { color: SCHEDULE_COLOR[colour] }]}>
          {progress.status === 'on_track'
            ? t('home.engineer.onTrack')
            : t(STATUS_KEY[progress.status], { days: Math.abs(progress.scheduleDaysBehind ?? 0) })}
        </Text>
      </View>
    ) : null;

  // START = project start_date, GOAL = project end_date (the project timeline). Shown only when set.
  const projectDates =
    selectedProject && (selectedProject.start_date || selectedProject.end_date) ? (
      <View testID="project-dates" style={styles.footRow}>
        {selectedProject.start_date ? (
          <Text style={styles.footItem} testID="project-start">
            <Text style={styles.footTime}>{formatDdMonYyyy(selectedProject.start_date)}</Text>
            <Text style={styles.footLabel}> {t('home.engineer.projectStart')}</Text>
          </Text>
        ) : (
          <Text />
        )}
        {selectedProject.end_date ? (
          <Text style={styles.footItem} testID="project-end">
            <Text style={styles.footTime}>{formatDdMonYyyy(selectedProject.end_date)}</Text>
            <Text style={styles.footLabel}> {t('home.engineer.projectEnd')}</Text>
          </Text>
        ) : null}
      </View>
    ) : null;

  return (
    <View style={styles.root}>
      <ScrollView
        testID="site-engineer-home"
        style={styles.screen}
        contentContainerStyle={styles.content}
      >
        {/* The Active Project bar, which is what the restructured mockups draw here (PO decision
          2026-08-12). It replaced a chip-row ProjectPicker: the drawings show the project NAMED with
          a switch control, not a row of codes to choose between, and the same bar now opens every
          working screen for every role. Selection lives in `projectStore` — see the header note. */}
        <ProjectContextBar />

        {/* While the first project's data loads, a widget skeleton stands in for the command card
          (ADR-055); once loaded, the real consolidated card renders. */}
        <LoadingBoundary
          loading={loading}
          variant="widget"
          theme="dark"
          label={t('common.loadingLabel')}
          progress={loadProgress}
          testID="dash-loading-widget"
        >
          <View testID="progress-card" style={styles.card}>
            <View style={styles.cardTopRow}>
              <Text style={styles.cardLabel}>{t('home.engineer.progressTitle')}</Text>
              {schedulePill}
            </View>
            {/* THE PROJECT NAME IS NOT REPEATED HERE (PO decision 2026-08-12). It used to caption
                these figures, from before the screen had an Active Project bar; the bar above now
                names the project in larger type a few pixels away, and stating it twice on one
                screen is the same stutter `headingStutter.spec.ts` guards against elsewhere. */}

            {!hasProgressFigure(pct) ? (
              <Text testID="progress-empty" style={styles.muted}>
                {t('home.engineer.progressEmpty')}
              </Text>
            ) : (
              <>
                <View style={styles.heroRow}>
                  <Text testID="progress-pct" style={styles.hero}>
                    {Math.round(pct)}%
                  </Text>
                  {phaseLabel ? (
                    <Text testID="phase-name" style={styles.phaseInline} numberOfLines={2}>
                      {phaseLabel}
                    </Text>
                  ) : null}
                </View>
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${progressBarWidth(pct)}%` }]} />
                </View>
                {projectDates}
              </>
            )}
          </View>
        </LoadingBoundary>

        {/* The mockup's four quick-action tiles. Each routes to a real screen. */}
        <View style={styles.grid}>
          <QuickActionCard
            testID="qa-daily-report"
            variant="dark"
            icon={<MaterialIcons name="description" size={22} color={darkColors.primary} />}
            label={t('home.engineer.dailyReport')}
            onPress={() => router.push('/report')}
          />
          <QuickActionCard
            testID="qa-photo"
            variant="dark"
            icon={<MaterialIcons name="photo-camera" size={22} color={darkColors.primary} />}
            label={t('home.engineer.capturePhoto')}
            onPress={() => router.push('/report')}
          />
        </View>
        <View style={styles.grid}>
          {/* Safety Check → /inspections: this role's "fill a safety/QC checklist" workflow. */}
          <QuickActionCard
            testID="qa-safety-check"
            variant="dark"
            icon={<MaterialIcons name="health-and-safety" size={22} color={darkColors.primary} />}
            label={t('home.engineer.safetyCheck')}
            onPress={() => router.push('/inspections')}
          />
          <QuickActionCard
            testID="qa-material-request"
            variant="dark"
            icon={<MaterialIcons name="inventory-2" size={22} color={darkColors.primary} />}
            label={t('home.engineer.materialRequest')}
            onPress={() => router.push('/material-request')}
          />
        </View>

        <View style={styles.sectionHead}>
          <View style={styles.sectionHeadLeft}>
            <Text style={styles.sectionTitle}>{t('home.engineer.activeIssues')}</Text>
            {topSev ? (
              <CountBadge
                testID="severity-count"
                label={topSev.severity}
                count={topSev.count}
                colour={SEVERITY_COLOR[topSev.severity] ?? darkColors.muted}
              />
            ) : null}
          </View>
          <SeeAll
            testID="issues-see-all"
            onPress={() => router.push('/issues')}
            enabled={sortedIssues.length > SECTION_LIMIT}
          />
        </View>
        <LoadingBoundary
          loading={loading}
          variant="list"
          theme="dark"
          progress={loadProgress}
          testID="dash-loading-issues"
        >
          {sortedIssues.length === 0 ? (
            <Text testID="issues-empty" style={styles.muted}>
              {t('home.engineer.noIssues')}
            </Text>
          ) : (
            sortedIssues.slice(0, SECTION_LIMIT).map((issue) => (
              <TouchableOpacity
                key={issue.issue_id}
                testID={`issue-${issue.issue_id}`}
                style={[
                  styles.row,
                  { borderLeftColor: SEVERITY_COLOR[issue.severity] ?? darkColors.muted },
                ]}
                onPress={() => router.push('/issues')}
              >
                <View style={styles.rowBody}>
                  <View style={styles.issueHead}>
                    {issue.issue_number ? (
                      <Text testID={`issue-${issue.issue_id}-number`} style={styles.issueNumber}>
                        {issue.issue_number}
                      </Text>
                    ) : null}
                    {/* THE DRAWING OUTLINES THIS CHIP (PO decision 2026-08-12). It was bare
                        coloured text, so on a card that already colours its left edge by the same
                        severity the word read as a label rather than as the badge the mockup
                        draws. Border in the severity's own tone, like the issue board's tags. */}
                    <View
                      style={[
                        styles.chipBox,
                        { borderColor: SEVERITY_COLOR[issue.severity] ?? darkColors.muted },
                      ]}
                    >
                      <Text
                        style={[
                          styles.chip,
                          { color: SEVERITY_COLOR[issue.severity] ?? darkColors.muted },
                        ]}
                      >
                        {issue.severity}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.rowTitle} numberOfLines={2}>
                    {issue.title}
                  </Text>
                </View>
                <View style={styles.chevronBox}>
                  <MaterialIcons name="chevron-right" size={20} color={darkColors.text} />
                </View>
              </TouchableOpacity>
            ))
          )}
        </LoadingBoundary>

        <View style={styles.sectionHead}>
          <View style={styles.sectionHeadLeft}>
            <Text style={styles.sectionTitle}>{t('home.engineer.upcomingTasks')}</Text>
            <View style={styles.urgencyRow}>
              {urgency.overdue > 0 ? (
                <CountBadge
                  testID="overdue-count"
                  label={t('home.engineer.overdueLabel')}
                  count={urgency.overdue}
                  colour={darkColors.danger}
                />
              ) : null}
              {urgency.dueSoon > 0 ? (
                <CountBadge
                  testID="due-soon-count"
                  label={t('home.engineer.dueSoonLabel')}
                  count={urgency.dueSoon}
                  colour={darkColors.warning}
                />
              ) : null}
            </View>
          </View>
          <SeeAll
            testID="tasks-see-all"
            onPress={() => router.push('/tasks')}
            enabled={upcoming.length > SECTION_LIMIT}
          />
        </View>
        <LoadingBoundary
          loading={loading}
          variant="list"
          theme="dark"
          progress={loadProgress}
          testID="dash-loading-tasks"
        >
          {upcoming.length === 0 ? (
            <Text testID="tasks-empty" style={styles.muted}>
              {t('home.engineer.noTasks')}
            </Text>
          ) : (
            upcoming.slice(0, SECTION_LIMIT).map((task) => {
              const taskUrgency = task.planned_start
                ? taskStartUrgency(task.planned_start, now)
                : 'normal';
              return (
                <TouchableOpacity
                  key={task.task_id}
                  testID={`task-${task.task_id}`}
                  // THE LEFT ACCENT CARRIES HOW URGENT THE TASK IS (PO decision 2026-08-12). It was
                  // the same dead hairline on every row, so the section said nothing until each
                  // line was read. `taskStartUrgency` is already computed here for the date's
                  // colour — the strip now states the same verdict where the eye lands first, and
                  // the two can never disagree because they come from one value.
                  style={[styles.row, { borderLeftColor: URGENCY_COLOR[taskUrgency] }]}
                  onPress={() => router.push('/tasks')}
                >
                  <View style={styles.rowBody}>
                    {/* THE PROJECT'S CURRENT PHASE, and it is the project's — not the task's. There
                        is no phase link on a task: `projects.tasks` has task/project/floor/room/BOQ
                        columns and no phase_id, so every card in this section carries the same
                        phase, which is the honest thing it can say (PO decision 2026-08-12). Hidden
                        entirely when no phase is known rather than showing an empty line. */}
                    {/* PHASE AND PROGRESS ON ONE EYEBROW LINE (PO decision 2026-08-12): the phase,
                        then the figure with the word PROGRESS after it. The percentage sat under
                        the task name, three lines from the phase it belongs beside, and a bare
                        number with nothing naming it could be read as anything on the card.
                        The task's own progress: the API has always returned it and this screen
                        dropped it until today. A row without the field shows no figure rather than
                        0%, which would state that nothing has been done. */}
                    {phase === null && typeof task.progress_percent !== 'number' ? null : (
                      <View style={styles.rowEyebrow}>
                        {phase === null ? null : (
                          <Text style={styles.rowPhase} numberOfLines={1}>
                            {t('tasks.list.phase', {
                              seq: String(phase.seq),
                              name: phaseName(phase.name, locale),
                            })}
                          </Text>
                        )}
                        {typeof task.progress_percent === 'number' ? (
                          <Text testID={`task-${task.task_id}-progress`} style={styles.rowProgress}>
                            {t('home.engineer.taskProgress', {
                              pct: String(Math.round(task.progress_percent)),
                            })}
                          </Text>
                        ) : null}
                      </View>
                    )}
                    <Text style={styles.rowTitle} numberOfLines={2}>
                      {task.task_name}
                    </Text>
                    {task.planned_start ? (
                      <Text
                        testID={`task-${task.task_id}-start`}
                        style={[styles.muted, { color: URGENCY_COLOR[taskUrgency] }]}
                      >
                        {t('home.engineer.starts', { date: formatDate(task.planned_start) })}
                      </Text>
                    ) : null}
                  </View>
                  {/* Chevron matching the Active Issues cards (mockup parity). */}
                  <View style={styles.chevronBox}>
                    <MaterialIcons name="chevron-right" size={20} color={darkColors.text} />
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </LoadingBoundary>
      </ScrollView>
      {/* Voice command FAB (ADR-073) — round mic, floats over the content, bottom-right. */}
      <VoiceCommandFab />
    </View>
  );
}

const styles = StyleSheet.create({
  // Solid tiered dark background (design tokens) — no blueprint grid (ADR-071 grid removed 2026-07-26).
  root: { flex: 1, backgroundColor: darkColors.bg },
  screen: { flex: 1, backgroundColor: 'transparent' },
  content: {
    padding: spacing.md,
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
  card: {
    backgroundColor: darkColors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: darkColors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardLabel: {
    fontSize: typography.label.fontSize,
    fontFamily: fontFamily.medium,
    color: darkColors.muted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  // The auto-selected project's name, just under the card title.
  projectName: {
    fontSize: typography.body.fontSize,
    fontFamily: fontFamily.semibold,
    color: darkColors.text,
  },
  // Schedule verdict pill — tinted ground + solid-colour word, full pill radius.
  pill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.xl,
    maxWidth: '60%',
  },
  pillText: {
    fontSize: typography.caption.fontSize,
    fontFamily: fontFamily.bold,
    textAlign: 'right',
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  hero: {
    fontSize: typography.hero.fontSize,
    fontFamily: fontFamily.bold,
    color: darkColors.primary,
  },
  // Current phase, inline to the right of the big %.
  phaseInline: {
    flex: 1,
    textAlign: 'right',
    fontSize: typography.caption.fontSize,
    fontFamily: fontFamily.semibold,
    color: darkColors.text,
  },
  track: {
    height: 8,
    borderRadius: radius.md,
    backgroundColor: darkColors.elevated,
    // No overflow:hidden — it would clip the fill's glow (ADR-071); the fill rounds its own corners.
    marginTop: spacing.xs,
  },
  // Glow on the progress fill (ADR-071 — kept by product-owner decision 2026-07-26).
  fill: {
    height: '100%',
    borderRadius: radius.md,
    backgroundColor: darkColors.primary,
    shadowColor: darkColors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 6,
    elevation: 6,
  },
  // Project-timeline footer "START <start_date> … GOAL <end_date>".
  footRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  footItem: { alignItems: 'baseline' },
  footTime: {
    fontSize: typography.body.fontSize,
    fontFamily: fontFamily.bold,
    color: darkColors.text,
  },
  footLabel: {
    fontSize: typography.label.fontSize,
    fontFamily: fontFamily.medium,
    color: darkColors.muted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  // The count badge sits NEXT TO the title, not at the far edge (2026-08-11 mockup revision, which
  // moved `2 CRITICAL` inside the heading group with an `ml-2`). Pushed to the right margin it read
  // as a separate control rather than as part of the heading it counts. The drawing's right edge
  // carries a SEE ALL link and a filter glyph instead — neither is rendered here; see the header
  // note on why those are additions to the screen rather than a restyle of it.
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  // Title + its count badges, grouped so they read as one heading and the SEE ALL link keeps the
  // right edge to itself.
  sectionHeadLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexShrink: 1 },
  chipBox: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: 1,
  },
  rowEyebrow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' },
  rowPhase: {
    fontSize: 10,
    fontFamily: fontFamily.medium,
    color: darkColors.muted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  rowProgress: {
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
    fontFamily: fontFamily.semibold,
    color: darkColors.accent,
  },
  seeAllDisabled: { opacity: 0.4 },
  seeAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minHeight: touchTarget.iconButton,
    paddingLeft: spacing.xs,
  },
  seeAllText: {
    color: darkColors.accent,
    fontFamily: fontFamily.bold,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  sectionTitle: {
    fontSize: typography.label.fontSize,
    fontFamily: fontFamily.semibold,
    color: darkColors.muted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  badge: { alignItems: 'baseline' },
  badgeLabel: { fontSize: typography.label.fontSize, fontFamily: fontFamily.medium },
  badgeNumber: { fontSize: typography.body.fontSize, fontFamily: fontFamily.bold },
  urgencyRow: { flexDirection: 'row', gap: spacing.sm },
  grid: { flexDirection: 'row', gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: touchTarget.listItem,
    backgroundColor: darkColors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: darkColors.border,
    // Wide enough to read as an accent, per the issue cards on the next screen. Its colour is set
    // per row from the task's urgency.
    borderLeftWidth: 4,
    borderLeftColor: darkColors.border,
    padding: spacing.sm,
    // Rows are SEPARATE CARDS, so they need air between them (PO decision 2026-08-12). The list's
    // own container gap does not reach here — each row is rendered directly, not inside a gapped
    // wrapper — so consecutive rows sat edge to edge and read as one banded block rather than as the
    // individually tappable cards the mockup draws.
    marginBottom: spacing.xs,
  },
  rowBody: { flex: 1, gap: 2 },
  issueHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  issueNumber: {
    fontSize: typography.label.fontSize,
    fontFamily: fontFamily.bold,
    color: darkColors.muted,
  },
  chevronBox: {
    width: 36,
    height: 36,
    borderRadius: radius.lg,
    backgroundColor: darkColors.elevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    fontSize: typography.label.fontSize,
    fontFamily: fontFamily.bold,
    letterSpacing: 0.5,
  },
  rowTitle: {
    fontSize: typography.caption.fontSize,
    fontFamily: fontFamily.semibold,
    color: darkColors.text,
  },
  muted: {
    fontSize: typography.label.fontSize,
    fontFamily: fontFamily.regular,
    color: darkColors.muted,
  },
});

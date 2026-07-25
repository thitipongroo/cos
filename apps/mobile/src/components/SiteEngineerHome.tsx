// Site Engineer Home — the role's landing "command view".
// Reference mockup: mockup/mobile/role_site_engineer_mobile_view/dashboard_site_engineer_mobile_view/ (screen.png + code.html).
//
// Rendered by (app)/home.tsx for CosRole.SITE_ENGINEER; it lives here rather than under app/ because
// everything in app/ is a route, and this is the Home tab's content, not a route of its own. It is a
// separate file from home.tsx's other role variants because it is the only one on the dark palette
// (§32.7 "Mobile Dark Surfaces") and the only one composing four data sources.
//
// Read-first by design: master 3204 gives SITE_ENGINEER report *review*, inspection approval, and
// issue escalation — not authoring. The quick actions therefore route to this role's own workflows;
// the mockup's Daily Report / Safety Check tiles are SITE_WORKER workflows (master 3079) and Material
// Req has no mobile flow at all, so they are not here (product-owner decision 2026-07-16).
//
// Deliberately absent from the mockup, all product-owner decisions of 2026-07-16:
//   - Phase card ("Phase 2: Structural")  — no project-phase entity exists in §10/§11.
//   - Time strip ("07:00 START / 18:00 EOD GOAL") — no shift-start data; and sitting under the % bar
//     it read as though the bar measured time.
//   - Voice FAB — <VoiceNoteButton /> is hold-to-record against a field; a tap-FAB "AI voice command"
//     has no defined target action.
//   - Issue codes (LOG-442) and "Sector A" — no backing field (§11:478 Issue is UUID-keyed).
//   - Blueprint grid background, progress-bar glow, FAB glow, construction/architecture icons —
//     §32.7:622-623 prohibits gradients, glow, and hard-hat/blueprint/gear imagery.
//
// The header avatar (Profile), the schedule verdict's "ตามแผน N%" ratio + three-band colour
// (§32.12 Display), the four-tab dark nav (Home|Issues|Inspections|Reports, in MobileNav), and the
// Material Req quick action are all later product-owner revisions (2026-07-16).

import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { get } from '../api/client';
import { getProjectProgress, getProjectPhases, type ProjectProgress } from '../api/projects';
import { ProjectPicker } from './ProjectPicker';
import { QuickActionCard } from './QuickActionCard';
import { useI18n } from '../i18n';
import {
  currentPhase,
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
import { darkColors, fontFamily, spacing, touchTarget, typography } from '../theme/tokens';

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
 * A section-header count: "<label> <N> <unit>" with the number set larger/bolder so it reads apart
 * from the words (product-owner decision 2026-07-16). Label/unit arrive already localized.
 */
function CountBadge({
  testID,
  label,
  count,
  unit,
  colour,
}: {
  testID?: string;
  label: string;
  count: number;
  unit: string;
  colour: string;
}) {
  return (
    <Text testID={testID} style={styles.badge}>
      <Text style={[styles.badgeLabel, { color: colour }]}>{label} </Text>
      <Text style={[styles.badgeNumber, { color: colour }]}>{count}</Text>
      <Text style={[styles.badgeLabel, { color: colour }]}> {unit}</Text>
    </Text>
  );
}

export default function SiteEngineerHome() {
  const router = useRouter();
  const { t, formatDate } = useI18n();

  const [projectId, setProjectId] = useState('');
  const [progress, setProgress] = useState<ProjectProgress | null>(null);
  const [issues, setIssues] = useState<IssueRow[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [phases, setPhases] = useState<ProjectPhase[]>([]);

  const loadProject = useCallback((id: string) => {
    if (!id) return;
    getProjectProgress(id)
      .then(setProgress)
      .catch(() => {
        /* offline — keep the last figure rather than showing a wrong one */
      });
    getProjectPhases(id)
      .then(setPhases)
      .catch(() => {
        /* offline — keep the last phase rather than showing a wrong one */
      });
    get<{ items?: IssueRow[] } | IssueRow[]>('/site/issues', { project_id: id, status: 'OPEN' })
      .then((res) => setIssues(asList(res)))
      .catch(() => {
        /* offline — keep last */
      });
    get<{ items?: TaskRow[] } | TaskRow[]>(`/projects/${id}/tasks`)
      .then((res) => setTasks(asList(res)))
      .catch(() => {
        /* offline — keep last */
      });
  }, []);

  useEffect(() => loadProject(projectId), [projectId, loadProject]);

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
  // §32.12 Display: the verdict is one line — the status word in its three-band colour, carrying the
  // Earned Schedule day-variance ("ช้ากว่าแผน 21 วัน"). Word/colour from spi; number from days.
  const colour = scheduleColour(progress?.spi);

  // The current construction phase (ADR-070), derived from the phase list — null when the project has
  // no phases (or all are done), in which case the card is absent rather than showing a wrong stage.
  const phase = currentPhase(phases);

  return (
    <ScrollView
      testID="site-engineer-home"
      style={styles.screen}
      contentContainerStyle={styles.content}
    >
      {/* Brand / bell / avatar now live in the shared <TopBar /> (§32.7), rendered by (app)/_layout. */}
      <ProjectPicker selectedId={projectId} onSelect={setProjectId} variant="dark" />

      <View testID="progress-card" style={styles.card}>
        <Text style={styles.cardLabel}>{t('home.engineer.progressTitle')}</Text>
        {!hasProgressFigure(pct) ? (
          <Text testID="progress-empty" style={styles.muted}>
            {t('home.engineer.progressEmpty')}
          </Text>
        ) : (
          <>
            <View style={styles.progressRow}>
              <Text testID="progress-pct" style={styles.hero}>
                {Math.round(pct)}%
              </Text>
              {/* One-line verdict in its three-band colour: the status word carrying the Earned
                  Schedule day-variance ("ช้ากว่าแผน 21 วัน"); on_track shows the word alone. */}
              {progress?.status && colour ? (
                <Text
                  testID="schedule-status"
                  style={[styles.statusText, { color: SCHEDULE_COLOR[colour] }]}
                >
                  {progress.status === 'on_track'
                    ? t('home.engineer.onTrack')
                    : t(STATUS_KEY[progress.status], {
                        days: Math.abs(progress.scheduleDaysBehind ?? 0),
                      })}
                </Text>
              ) : null}
            </View>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${progressBarWidth(pct)}%` }]} />
            </View>
          </>
        )}
      </View>

      {/* Current construction phase (ADR-070) — the mockup's phase card, now backed by real
          project_phases data. Plain surface + text: no blueprint grid, gradient, or glow (§32.7). */}
      {phase ? (
        <View testID="phase-card" style={styles.phaseCard}>
          <Text style={styles.cardLabel}>{t('home.engineer.phaseTitle')}</Text>
          <Text testID="phase-name" style={styles.phaseName}>
            {t('home.engineer.phaseSeq', { seq: phase.seq })}: {phase.name}
          </Text>
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>{t('home.engineer.quickActions')}</Text>
      <View style={styles.grid}>
        <QuickActionCard
          testID="qa-reports"
          variant="dark"
          icon={<MaterialIcons name="description" size={22} color={darkColors.primary} />}
          label={t('home.engineer.reviewReports')}
          onPress={() => router.push('/reports')}
        />
        {/* Inspections is not a tile — it is a bottom-nav tab for this role, so a shortcut to it
            would only duplicate the tab bar (product-owner decision 2026-07-16). */}
        <QuickActionCard
          testID="qa-issues"
          variant="dark"
          icon={<MaterialIcons name="report-problem" size={22} color={darkColors.primary} />}
          label={t('home.engineer.issues')}
          badge={issues.length}
          onPress={() => router.push('/issues')}
        />
      </View>
      <View style={styles.grid}>
        <QuickActionCard
          testID="qa-photo"
          variant="dark"
          icon={<MaterialIcons name="photo-camera" size={22} color={darkColors.primary} />}
          label={t('home.engineer.capturePhoto')}
          onPress={() => router.push('/report')}
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
        <Text style={styles.sectionTitle}>{t('home.engineer.activeIssues')}</Text>
        {/* Worst level present ×N — follows the data rather than the mockup's hard-coded CRITICAL.
            Label is the raw code (HIGH), matching the card's chip; the count is emphasized. */}
        {topSev ? (
          <CountBadge
            testID="severity-count"
            label={topSev.severity}
            count={topSev.count}
            unit={t('home.engineer.unit')}
            colour={SEVERITY_COLOR[topSev.severity] ?? darkColors.muted}
          />
        ) : null}
      </View>
      {sortedIssues.length === 0 ? (
        <Text testID="issues-empty" style={styles.muted}>
          {t('home.engineer.noIssues')}
        </Text>
      ) : (
        sortedIssues.slice(0, 5).map((issue) => (
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
                {/* Human-readable ISS-<year>-<seq> (ADR-069) — the mockup's ID chip; null for
                    pre-existing issues, in which case only the severity chip shows. */}
                {issue.issue_number ? (
                  <Text testID={`issue-${issue.issue_id}-number`} style={styles.issueNumber}>
                    {issue.issue_number}
                  </Text>
                ) : null}
                <Text
                  style={[
                    styles.chip,
                    { color: SEVERITY_COLOR[issue.severity] ?? darkColors.muted },
                  ]}
                >
                  {issue.severity}
                </Text>
              </View>
              <Text style={styles.rowTitle} numberOfLines={2}>
                {issue.title}
              </Text>
            </View>
            {/* Chevron in a filled square, per the mockup (its bg-surface-variant button). */}
            <View style={styles.chevronBox}>
              <MaterialIcons name="chevron-right" size={20} color={darkColors.text} />
            </View>
          </TouchableOpacity>
        ))
      )}

      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{t('home.engineer.upcomingTasks')}</Text>
        {/* Overdue (red) and due-soon (amber) counts, each shown only when non-zero. */}
        <View style={styles.urgencyRow}>
          {urgency.overdue > 0 ? (
            <CountBadge
              testID="overdue-count"
              label={t('home.engineer.overdueLabel')}
              count={urgency.overdue}
              unit={t('home.engineer.unit')}
              colour={darkColors.danger}
            />
          ) : null}
          {urgency.dueSoon > 0 ? (
            <CountBadge
              testID="due-soon-count"
              label={t('home.engineer.dueSoonLabel')}
              count={urgency.dueSoon}
              unit={t('home.engineer.unit')}
              colour={darkColors.warning}
            />
          ) : null}
        </View>
      </View>
      {upcoming.length === 0 ? (
        <Text testID="tasks-empty" style={styles.muted}>
          {t('home.engineer.noTasks')}
        </Text>
      ) : (
        upcoming.map((task) => {
          // planned_start is non-null here (selectUpcomingTasks filters it), so the date and its
          // urgency colour always resolve. Red once the start is past, amber within three days.
          const urgency = task.planned_start ? taskStartUrgency(task.planned_start, now) : 'normal';
          return (
            <View key={task.task_id} testID={`task-${task.task_id}`} style={styles.row}>
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle} numberOfLines={2}>
                  {task.task_name}
                </Text>
                {task.planned_start ? (
                  <Text
                    testID={`task-${task.task_id}-start`}
                    style={[styles.muted, { color: URGENCY_COLOR[urgency] }]}
                  >
                    {t('home.engineer.starts', { date: formatDate(task.planned_start) })}
                  </Text>
                ) : null}
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: darkColors.bg },
  content: {
    padding: spacing.md,
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
  card: {
    backgroundColor: darkColors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: darkColors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  cardLabel: {
    fontSize: typography.label.fontSize,
    fontFamily: fontFamily.medium,
    color: darkColors.muted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  // Phase card — the same flat surface as the progress card (no blueprint bg / glow, §32.7).
  phaseCard: {
    backgroundColor: darkColors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: darkColors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  phaseName: {
    fontSize: typography.body.fontSize,
    fontFamily: fontFamily.semibold,
    color: darkColors.text,
  },
  progressRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  hero: {
    fontSize: typography.hero.fontSize,
    fontFamily: fontFamily.bold,
    color: darkColors.primary,
  },
  statusText: { fontSize: typography.caption.fontSize, fontFamily: fontFamily.semibold },
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: darkColors.elevated,
    overflow: 'hidden',
    marginTop: spacing.xs,
  },
  // Flat fill: §32.7:623 prohibits the glow the mockup puts on this bar.
  fill: { height: '100%', backgroundColor: darkColors.primary },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: {
    fontSize: typography.label.fontSize,
    fontFamily: fontFamily.semibold,
    color: darkColors.muted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  // Section-header count badge — colour applied inline. The number is a size up and bold so it reads
  // apart from the label + unit around it.
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
    borderRadius: 8,
    borderWidth: 1,
    borderColor: darkColors.border,
    borderLeftWidth: 4,
    borderLeftColor: darkColors.border,
    padding: spacing.sm,
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
    borderRadius: 8,
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

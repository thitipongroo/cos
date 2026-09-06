// ExecTasks — the EXECUTIVE half of /tasks.
// Implements mockup/mobile/08_executive/02_tasks/02_ex_tasks.
//
// Two screens share the `tasks` route and branch on role, the way `reports.tsx` already did: the
// field roles get the Site Worker's day list, the executive gets this portfolio roll-up. They are
// the same noun at two altitudes, which is why one route carries both (ADR-098).
//
// WHAT THE DRAWING ASKS FOR AND WHAT IT GETS.
//
//   "12 Overdue CRITICAL"  →  the overdue COUNT is real (`GET /tasks/portfolio-summary`, one query
//                             across the tenant). The word CRITICAL is NOT rendered: `projects.tasks`
//                             has no priority or severity column, so no count here can claim one.
//                             `tasks.tsx` made the same substitution for the Site Worker badge in
//                             2026-08 and says so at its own head. The tile reads "Overdue".
//   "45 Due / 8 Blocked"   →  both real, from the same call. `blocked` is a status the column holds.
//                             The card's "ดูรายละเอียด" control is drawn and goes nowhere: there is
//                             no blocked-task list for a role master §Phase 10 makes READ-ONLY on
//                             mobile, so it carries the "coming soon" note `more.tsx` established
//                             (PO 2026-09-04) and greys out when nothing is blocked. Same for the
//                             critical path's "ดูทั้งหมด ›".
//   AI Risk Alerts          →  the REAL `POST /ai/reports/delay-risk`, drawn as the drawing's FEED
//                             of cards rather than as one panel — see components/ExecRiskAlerts.tsx
//                             for what each card can and cannot carry. It replaced
//                             <ScheduleInsight /> here on 2026-09-05; that component is unchanged
//                             and still draws this report for the field roles on `tasks.tsx`, whose
//                             own mockup asks for a panel.
//   "Critical Path"         →  real, and it is new. `GET /projects/{id}/critical-path` runs a
//                             forward/backward pass over `projects.task_dependencies`, built for
//                             this screen (ADR-097). Before that the section had no source at all.
//
// THE CRITICAL PATH IS PER PROJECT and this screen is a portfolio. It reports on the FIRST of the
// executive's projects and NAMES it, which is the same resolution `more.tsx` reached for its AI
// panel on 2026-08-11: a picker above the section made the screen ask which project before it would
// say anything, and naming the subject does the job the picker was there for.

import { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, Alert } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LoadingBoundary } from './LoadingBoundary';
import { ExecRiskAlerts } from './ExecRiskAlerts';
import { getMyProjects } from '../api/projects';
import {
  getPortfolioCriticalPath,
  getPortfolioTaskSummary,
  type PortfolioCriticalPath,
  type PortfolioCriticalTask,
  type PortfolioTaskSummary,
} from '../api/schedule';
import { useT } from '../i18n';
import type { TranslateFn } from '../i18n';
import { countSettled, loadProgress } from '../lib/loadingState';
import { fontFamily, radius, spacing, touchTarget, typography } from '../theme/tokens';
import { usePalette, useIsDark, type Palette } from '../theme/usePalette';

/** How many critical-path rows the section lists before it stops. The drawing shows two. */
const CRITICAL_PATH_ROWS = 4;

export function ExecTasks(): React.JSX.Element {
  const t = useT();
  const p = usePalette();
  const styles = useMemo(() => makeStyles(p), [p]);
  const loaderTheme = useIsDark() ? 'dark' : 'light';

  const [summary, setSummary] = useState<PortfolioTaskSummary | null>(null);
  const [path, setPath] = useState<PortfolioCriticalPath | null>(null);
  // The ID only. The project NAME had two readers and lost both on 2026-09-07 — the critical-path
  // heading stopped naming a project when the section went tenant-wide, and the risk feed's
  // "Source:" line was removed — so keeping it would be state nothing renders.
  const [projectId, setProjectId] = useState('');
  const [loading, setLoading] = useState(true);
  // Rule 40 — two independent fetches at first paint, counted as each settles. The critical path is
  // a THIRD request but it cannot start until the project list has answered, so it is not one of the
  // steps this bar reports: a percentage that waits on a dependency reads as stuck.
  const [settled, setSettled] = useState(0);
  const LOAD_STEPS = 2;

  useEffect(() => {
    let cancelled = false;
    const step = <T,>(promise: Promise<T>): Promise<T> =>
      countSettled(promise, () => {
        if (!cancelled) setSettled((n) => n + 1);
      });

    const summaryFetch = step(getPortfolioTaskSummary())
      .then((rows) => {
        if (!cancelled) setSummary(rows);
      })
      .catch(() => {
        /* offline — the tiles show em dashes rather than a stale or invented number */
      });

    // THE CRITICAL PATH IS NOW TENANT-WIDE and no longer waits on the project list — the server runs
    // one pass per project and answers once (`GET /tasks/portfolio-critical-path`). The list is still
    // fetched, but only for the AI panel, which is per-project by the gateway's own contract.
    const pathFetch = step(getPortfolioCriticalPath())
      .then((computed) => {
        if (!cancelled) setPath(computed);
      })
      .catch(() => {
        /* offline, or no project has a schedule network yet */
      });

    const projectsFetch = getMyProjects()
      .then((mine) => {
        if (cancelled) return;
        const first = mine[0];
        if (first === undefined) return;
        setProjectId(first.project_id);
      })
      .catch(() => {
        /* offline — the AI panel stays on its idle line */
      });

    void Promise.allSettled([summaryFetch, pathFetch, projectsFetch]).then(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // The endpoint returns critical tasks only, already earliest-first across every project.
  const criticalRows = useMemo(() => (path?.tasks ?? []).slice(0, CRITICAL_PATH_ROWS), [path]);

  const count = (value: number | undefined): string => (value === undefined ? '—' : String(value));

  /** Nothing to detail: the roll-up has not arrived, or it says nothing is blocked. */
  const blockedDetailDisabled = summary === null || summary.blocked_count === 0;

  return (
    <ScrollView
      testID="exec-tasks-screen"
      style={{ backgroundColor: p.bg }}
      contentContainerStyle={styles.page}
    >
      <LoadingBoundary
        loading={loading}
        variant="widget"
        theme={loaderTheme}
        progress={loadProgress(settled, LOAD_STEPS) ?? undefined}
      >
        <View style={styles.stack}>
          {/* KPI tiles — every figure real. See the header for the word the drawing uses that this
              does not. */}
          <View style={styles.tileRow}>
            <View testID="tasks-kpi-overdue" style={[styles.card, styles.tile, styles.tileDanger]}>
              <View style={styles.tileHead}>
                <MaterialIcons name="warning" size={20} color={p.danger} />
                <Text style={styles.eyebrow}>{t('exec.tasks.overdue')}</Text>
              </View>
              <Text style={styles.tileValue}>{count(summary?.overdue_count)}</Text>
              <Text style={styles.tileNote}>{t('exec.tasks.overdueNote')}</Text>
            </View>

            <View testID="tasks-kpi-due" style={[styles.card, styles.tile, styles.tileWarning]}>
              <View style={styles.tileHead}>
                <MaterialIcons name="event" size={20} color={p.warning} />
                <Text style={styles.eyebrow}>{t('exec.tasks.thisWeek')}</Text>
              </View>
              <Text style={styles.tileValue}>{count(summary?.due_this_week_count)}</Text>
              <Text style={styles.tileNote}>{t('exec.tasks.dueNote')}</Text>
            </View>
          </View>

          <View testID="tasks-kpi-blocked" style={[styles.card, styles.blocked]}>
            {/* THE PLATE SITS ON THE LABEL'S LINE and the figure runs along the card's leading edge
                beneath it (PO 2026-09-07). The drawing pairs the count with its unit — "8 Tasks" —
                so the number is not read as a percentage or a currency at a glance. */}
            <View style={styles.blockedText}>
              <View style={styles.blockedHead}>
                <View style={styles.blockedPlate}>
                  <MaterialIcons name="block" size={18} color={p.warning} />
                </View>
                <Text style={styles.eyebrow}>{t('exec.tasks.blocked')}</Text>
              </View>
              <Text style={styles.tileValue}>
                {count(summary?.blocked_count)}
                <Text style={styles.blockedUnit}>{` ${t('exec.tasks.blockedUnit')}`}</Text>
              </Text>
            </View>
            {/* The drawing's "ดูรายละเอียด" control, in place of the "across N projects" line it
                replaced. There is no blocked-task list for this role — master §Phase 10 makes
                EXECUTIVE read-only on mobile — so it says so through the same "coming soon" note
                `more.tsx` uses for every drawn-but-unbuilt action (PO decision 2026-09-04), rather
                than navigating somewhere that would not answer the question.
                DISABLED WHEN THERE IS NOTHING TO DETAIL: the summary has not arrived (offline, or
                still loading) or the count is zero. */}
            <Pressable
              testID="tasks-blocked-detail"
              accessibilityRole="button"
              accessibilityLabel={t('exec.tasks.viewDetail')}
              accessibilityState={{ disabled: blockedDetailDisabled }}
              disabled={blockedDetailDisabled}
              onPress={() => Alert.alert(t('exec.tasks.viewDetail'), t('more.comingSoon'))}
              style={[styles.linkButton, blockedDetailDisabled && styles.linkDisabled]}
            >
              <Text style={styles.linkText}>{t('exec.tasks.viewDetail')}</Text>
            </Pressable>
          </View>

          {/* The REAL delay-risk report, drawn as the drawing's feed of cards. Per project, so it
              names the project it read. */}
          <ExecRiskAlerts projectId={projectId} />

          {/* Critical path — real, and new (ADR-097). */}
          <View style={styles.sectionHead}>
            <View style={styles.sectionHeadLeft}>
              {/* NO PROJECT NAME. The section spans the tenant now, so naming one project here would
                  label a portfolio list with one project's title. Each ROW names its own. */}
              <Text style={styles.sectionLabel}>{t('exec.tasks.criticalPath')}</Text>
            </View>
            {/* The drawing's "ดูทั้งหมด ›". Same answer as the blocked card's control and for the
                same reason: there is no full critical-path screen to reach. Disabled while there is
                no path to show more of. */}
            <Pressable
              testID="tasks-critical-all"
              accessibilityRole="button"
              accessibilityLabel={t('exec.tasks.viewAll')}
              accessibilityState={{ disabled: criticalRows.length === 0 }}
              disabled={criticalRows.length === 0}
              onPress={() => Alert.alert(t('exec.tasks.viewAll'), t('more.comingSoon'))}
              style={[styles.linkButton, criticalRows.length === 0 && styles.linkDisabled]}
            >
              <Text style={styles.linkText}>{t('exec.tasks.viewAll')}</Text>
              <MaterialIcons name="chevron-right" size={16} color={p.primary} />
            </Pressable>
          </View>

          {criticalRows.length === 0 ? (
            <View testID="tasks-critical-empty" style={styles.card}>
              <Text style={styles.emptyText}>{t('exec.tasks.criticalPathEmpty')}</Text>
            </View>
          ) : (
            criticalRows.map((task) => (
              <CriticalRow key={task.task_id} task={task} styles={styles} palette={p} t={t} />
            ))
          )}

          {/* The calendar footnote was removed on 2026-09-07 (PO). `working_day_calendar` is still in
              the payload and still false — the fact is not gone, only the line that repeated it on
              every visit. `docs/api/project.openapi.yaml` and ADR-097 carry it for anyone reading
              the number rather than glancing at it. */}
          {path !== null && path.excluded_task_count > 0 ? (
            <Text testID="tasks-excluded-note" style={styles.footnote}>
              {t('exec.tasks.excludedNote', { count: path.excluded_task_count })}
            </Text>
          ) : null}
        </View>
      </LoadingBoundary>
    </ScrollView>
  );
}

function CriticalRow({
  task,
  styles,
  palette,
  t,
}: {
  task: PortfolioCriticalTask;
  styles: ReturnType<typeof makeStyles>;
  palette: Palette;
  t: TranslateFn;
}): React.JSX.Element {
  const statusColour =
    task.status === 'BLOCKED'
      ? palette.danger
      : task.status === 'IN_PROGRESS'
        ? palette.warning
        : palette.muted;

  return (
    <View testID={`tasks-critical-${task.task_id}`} style={[styles.card, styles.pathRow]}>
      <View style={styles.pathHead}>
        <View style={styles.pathText}>
          {/* The drawing's eyebrow reads "Project Alpha - Zone B". Now that the section spans the
              tenant, the PROJECT is the half of that which this row must carry — the section header
              no longer names one. The zone half has no column and is left out; `work_type`, the
              trade, follows it because the row does carry that. */}
          <Text style={styles.pathTrade} numberOfLines={1}>
            {`${task.project_name} · ${task.work_type}`}
          </Text>
          <Text style={styles.pathName} numberOfLines={2}>
            {task.task_name}
          </Text>
        </View>
        {/* The drawing's round glyph plate. One glyph for every row: the drawing varies it per task
            and nothing on the row says which to pick, so varying it here would be decoration
            pretending to be a classification. */}
        <View style={styles.pathPlate}>
          <MaterialIcons name="engineering" size={18} color={palette.text} />
        </View>
      </View>

      <View style={styles.pathDivider} />

      <View style={styles.pathFoot}>
        <View style={styles.pathFootText}>
          <Text style={styles.pathMeta}>
            {t('exec.tasks.status')}{' '}
            <Text style={{ color: statusColour }}>{t(`exec.tasks.status_${task.status}`)}</Text>
          </Text>
          {/* THE DRAWING'S ASSIGNEE MARK, in place of the date and duration lines removed on
              2026-09-07 (PO). The drawing stacks photographs here; this platform stores
              `assigned_to` and nothing else, so the mark says THAT the task is owned and stops
              there. Nothing is drawn when the column is null — an unassigned critical task is a
              finding, and a generic head would hide it. */}
          {task.assigned_to === null ? null : (
            <View testID={`tasks-critical-${task.task_id}-assignee`} style={styles.pathAssignee}>
              <MaterialIcons name="person" size={14} color={palette.muted} />
            </View>
          )}
        </View>
        {/* The drawing's "ID: TSK-0942" chip. `projects.tasks` has no human-readable code — the key
            is a UUID — so this shows the first block of it, the way a short SHA identifies a commit.
            It is a real, checkable prefix of the row's own id, not an invented ticket number. */}
        <View style={styles.pathIdChip}>
          <Text style={styles.pathIdText}>
            {t('exec.tasks.taskId', { id: task.task_id.slice(0, 8).toUpperCase() })}
          </Text>
        </View>
      </View>
    </View>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    page: { padding: spacing.md, gap: spacing.sm },
    stack: { gap: spacing.sm },

    card: {
      backgroundColor: p.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: p.border,
      padding: spacing.md,
    },

    tileRow: { flexDirection: 'row', gap: spacing.sm },
    tile: { flex: 1, gap: spacing.xs / 2 },
    tileDanger: { borderLeftWidth: 4, borderLeftColor: p.danger },
    tileWarning: { borderLeftWidth: 4, borderLeftColor: p.warning },
    tileHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    tileValue: {
      fontSize: typography.hero.fontSize,
      fontFamily: fontFamily.bold,
      color: p.text,
    },
    tileNote: {
      fontSize: typography.label.fontSize,
      fontFamily: fontFamily.regular,
      color: p.muted,
    },

    blocked: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      borderLeftWidth: 4,
      borderLeftColor: p.warning,
    },
    blockedHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    // A circle, as the drawing draws it — the `999` capsule marker rather than a literal half-width
    // (§32.7, and the ratchet in theme/__tests__/radiusRatchet.spec.ts).
    blockedPlate: {
      width: 32,
      height: 32,
      borderRadius: 999,
      backgroundColor: `${p.warning}1A`,
      alignItems: 'center',
      justifyContent: 'center',
    },
    blockedText: { flex: 1, gap: spacing.xs / 2 },
    // The unit rides inside the figure's own <Text>, so it sits on the number's baseline instead of
    // on a line of its own.
    blockedUnit: {
      fontSize: typography.label.fontSize,
      fontFamily: fontFamily.regular,
      color: p.muted,
    },

    // The drawing's two text links — "ดูรายละเอียด" on the blocked card, "ดูทั้งหมด ›" on the
    // critical-path heading. 44pt tall because a text link is still a tap target.
    linkButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs / 2,
      minHeight: touchTarget.iconButton,
      paddingHorizontal: spacing.xs,
    },
    linkDisabled: { opacity: 0.4 },
    linkText: {
      fontSize: typography.label.fontSize,
      fontFamily: fontFamily.semibold,
      color: p.primary,
    },

    eyebrow: {
      fontSize: typography.label.fontSize,
      fontFamily: fontFamily.semibold,
      color: p.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    sectionHeadLeft: { flexDirection: 'row', alignItems: 'baseline', flex: 1 },
    sectionLabel: {
      fontSize: typography.label.fontSize,
      fontFamily: fontFamily.semibold,
      color: p.text,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginTop: spacing.xs,
    },
    sectionScope: {
      flexShrink: 1,
      fontSize: typography.label.fontSize,
      fontFamily: fontFamily.regular,
      color: p.muted,
      marginLeft: spacing.sm,
    },

    // The drawing's card is a COLUMN — head, divider, foot — not the two-column row this was.
    pathRow: { gap: spacing.xs },
    pathHead: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
    pathText: { flex: 1, gap: 2 },
    // A circle, so the radius is half the width — off the radius scale entirely, which is the one
    // exception .claude/rules/design-tokens.md names alongside square plates. Written as the `999`
    // capsule marker rather than a literal 16: the ratchet in theme/__tests__/radiusRatchet.spec.ts
    // counts hardcoded radii and treats 999 as the documented "make this round" instruction, so a
    // half-of-32 literal here would have raised a count that is only ever allowed to fall.
    // Outlined for the reason recorded on ExecMore's `tilePlate`: this palette's `elevated` is
    // darker than the card it sits on, so a filled plate carrying a neutral glyph reads as nothing.
    pathPlate: {
      borderWidth: 1,
      borderColor: p.border,
      width: 32,
      height: 32,
      borderRadius: 999,
      backgroundColor: p.elevated,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pathDivider: { height: 1, backgroundColor: p.border },
    pathFoot: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    pathFootText: { flex: 1, gap: spacing.xs / 2 },
    // A circle, so the radius is half the width — the `999` capsule marker, per §32.7 and the
    // ratchet in theme/__tests__/radiusRatchet.spec.ts.
    pathAssignee: {
      width: 24,
      height: 24,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.elevated,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // The drawing's chip: `bg-surface-bright` with a faint `outline-variant` edge and the ordinary
    // text ink — a tag that reads as RAISED off the card, not as a hairline outline on it. The fill
    // is `surfaceBright` rather than `elevated` for the reason that token was added: on a dark card
    // `elevated` is the darker of the two and the chip disappeared into the surface.
    pathIdChip: {
      paddingHorizontal: spacing.xs,
      paddingVertical: 2,
      // `radius.md` (4px), the drawing's own `rounded` — a squared tag, not a capsule.
      //
      // THE "EVERY BADGE TAKES xl" RULING DOES NOT GOVERN THIS. That platform ruling in
      // .claude/rules/design-tokens.md is about STATUS PILLS — AT RISK, OVER BUDGET, SECURE,
      // MONITOR — and those keep 12px on every screen in this role. The same rule's own scale puts
      // "chips, inline tags" lower down, and this is an identifier tag: it reports which row you are
      // looking at, not what condition it is in.
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: `${p.border}4D`,
      backgroundColor: p.surfaceBright,
    },
    pathIdText: {
      fontSize: 10,
      fontFamily: fontFamily.medium,
      color: p.text,
      letterSpacing: 0.5,
    },
    pathTrade: {
      fontSize: typography.label.fontSize,
      fontFamily: fontFamily.semibold,
      color: p.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    pathName: {
      fontSize: typography.body.fontSize,
      fontFamily: fontFamily.semibold,
      color: p.text,
    },
    pathMeta: {
      fontSize: typography.label.fontSize,
      fontFamily: fontFamily.regular,
      color: p.muted,
    },

    emptyText: {
      fontSize: typography.body.fontSize,
      fontFamily: fontFamily.regular,
      color: p.muted,
    },
    footnote: {
      fontSize: typography.label.fontSize,
      fontFamily: fontFamily.regular,
      color: p.muted,
      marginTop: spacing.xs / 2,
    },
  });

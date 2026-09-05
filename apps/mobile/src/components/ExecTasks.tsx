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
//   AI Risk Alerts          →  the REAL `POST /ai/reports/delay-risk` through <ScheduleInsight />,
//                             printing the model's own text and its own confidence band. The
//                             drawing's "BIM + Site Logs" source chip is NOT reproduced: BIM is a
//                             Type A stub (spec §32.9) and the panel must not claim to have read a
//                             system this platform does not integrate.
//   "Critical Path"         →  real, and it is new. `GET /projects/{id}/critical-path` runs a
//                             forward/backward pass over `projects.task_dependencies`, built for
//                             this screen (ADR-097). Before that the section had no source at all.
//
// THE CRITICAL PATH IS PER PROJECT and this screen is a portfolio. It reports on the FIRST of the
// executive's projects and NAMES it, which is the same resolution `more.tsx` reached for its AI
// panel on 2026-08-11: a picker above the section made the screen ask which project before it would
// say anything, and naming the subject does the job the picker was there for.

import { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LoadingBoundary } from './LoadingBoundary';
import { ScheduleInsight } from './ScheduleInsight';
import { getMyProjects } from '../api/projects';
import {
  getCriticalPath,
  getPortfolioTaskSummary,
  type CriticalPath,
  type CriticalPathTask,
  type PortfolioTaskSummary,
} from '../api/schedule';
import { useT } from '../i18n';
import type { TranslateFn } from '../i18n';
import { countSettled, loadProgress } from '../lib/loadingState';
import { fontFamily, radius, spacing, typography } from '../theme/tokens';
import { usePalette, useIsDark, type Palette } from '../theme/usePalette';

/** How many critical-path rows the section lists before it stops. The drawing shows two. */
const CRITICAL_PATH_ROWS = 4;

export function ExecTasks(): React.JSX.Element {
  const t = useT();
  const p = usePalette();
  const styles = useMemo(() => makeStyles(p), [p]);
  const loaderTheme = useIsDark() ? 'dark' : 'light';

  const [summary, setSummary] = useState<PortfolioTaskSummary | null>(null);
  const [path, setPath] = useState<CriticalPath | null>(null);
  const [projectId, setProjectId] = useState('');
  const [projectName, setProjectName] = useState<string | undefined>(undefined);
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

    const projectsFetch = step(getMyProjects())
      .then(async (mine) => {
        if (cancelled) return;
        const first = mine[0];
        if (first === undefined) return;
        setProjectId(first.project_id);
        setProjectName(first.project_name);
        const computed = await getCriticalPath(first.project_id);
        if (!cancelled) setPath(computed);
      })
      .catch(() => {
        /* offline, or the project has no schedule network yet */
      });

    void Promise.allSettled([summaryFetch, projectsFetch]).then(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const criticalRows = useMemo(
    () => (path?.tasks ?? []).filter((task) => task.is_critical).slice(0, CRITICAL_PATH_ROWS),
    [path],
  );

  const count = (value: number | undefined): string => (value === undefined ? '—' : String(value));

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
            <View style={styles.blockedPlate}>
              <MaterialIcons name="block" size={22} color={p.warning} />
            </View>
            <View style={styles.blockedText}>
              <Text style={styles.eyebrow}>{t('exec.tasks.blocked')}</Text>
              <Text style={styles.tileValue}>{count(summary?.blocked_count)}</Text>
            </View>
            <Text style={styles.blockedScope}>
              {summary === null
                ? ''
                : t('exec.tasks.acrossProjects', { count: summary.project_count })}
            </Text>
          </View>

          {/* The REAL delay-risk panel. Per project, so it names the project it read. */}
          <Text style={styles.sectionLabel}>{t('exec.tasks.riskAlerts')}</Text>
          <ScheduleInsight projectId={projectId} projectLabel={projectName} />

          {/* Critical path — real, and new (ADR-097). */}
          <View style={styles.sectionHead}>
            <Text style={styles.sectionLabel}>{t('exec.tasks.criticalPath')}</Text>
            {projectName === undefined ? null : (
              <Text style={styles.sectionScope} numberOfLines={1}>
                {projectName}
              </Text>
            )}
          </View>

          {criticalRows.length === 0 ? (
            <View testID="tasks-critical-empty" style={styles.card}>
              <Text style={styles.emptyText}>{t('exec.tasks.criticalPathEmpty')}</Text>
            </View>
          ) : (
            criticalRows.map((task) => (
              <CriticalRow key={task.task_id} task={task} styles={styles} t={t} />
            ))
          )}

          {/* Stated, never assumed: the server reports whether a working calendar was used, and it
              is false, so a reader is told these spans count weekends. */}
          {path === null || path.working_day_calendar ? null : (
            <Text testID="tasks-calendar-note" style={styles.footnote}>
              {t('exec.tasks.calendarNote')}
            </Text>
          )}
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
  t,
}: {
  task: CriticalPathTask;
  styles: ReturnType<typeof makeStyles>;
  t: TranslateFn;
}): React.JSX.Element {
  return (
    <View testID={`tasks-critical-${task.task_id}`} style={[styles.card, styles.pathRow]}>
      <View style={styles.pathText}>
        {/* `work_type` is the trade — the honest classification the row actually carries, and the
            same substitution the Site Worker card makes for the priority the drawing wants. */}
        <Text style={styles.pathTrade}>{task.work_type}</Text>
        <Text style={styles.pathName} numberOfLines={2}>
          {task.task_name}
        </Text>
        <Text style={styles.pathMeta}>
          {t('exec.tasks.window', { start: task.earliest_start, finish: task.earliest_finish })}
        </Text>
      </View>
      <View style={styles.pathBadges}>
        <Text style={styles.pathFloat}>
          {t('exec.tasks.float', { days: task.total_float_days })}
        </Text>
        <Text style={styles.pathDuration}>
          {t('exec.tasks.days', { days: task.duration_days })}
        </Text>
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
    blockedPlate: {
      width: 40,
      height: 40,
      borderRadius: radius.md,
      backgroundColor: p.elevated,
      alignItems: 'center',
      justifyContent: 'center',
    },
    blockedText: { flex: 1, gap: 2 },
    blockedScope: {
      fontSize: typography.label.fontSize,
      fontFamily: fontFamily.regular,
      color: p.muted,
    },

    eyebrow: {
      fontSize: typography.label.fontSize,
      fontFamily: fontFamily.semibold,
      color: p.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
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

    pathRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
    pathText: { flex: 1, gap: 2 },
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
    pathBadges: { alignItems: 'flex-end', gap: 4 },
    pathFloat: {
      fontSize: typography.label.fontSize,
      fontFamily: fontFamily.semibold,
      color: p.danger,
    },
    pathDuration: {
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

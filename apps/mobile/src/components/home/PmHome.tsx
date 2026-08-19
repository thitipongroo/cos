import { useCallback, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Pressable } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import type { Project } from '../../db/database';
import { useCollection } from '../../hooks/useCollection';
import { get } from '../../api/client';
import { refreshProjectsCache } from '../../api/projects';
import { MaterialIcons } from '@expo/vector-icons';
import { useT } from '../../i18n';
import { usePalette } from '../../theme/usePalette';
import { PortfolioInsight } from '../PortfolioInsight';
import {
  getMyProjects,
  getProjectPhases,
  getProjectProgress,
  type MyProject,
} from '../../api/projects';
import {
  currentPhase,
  hasProgressFigure,
  progressBarWidth,
  sortIssuesBySeverity,
  topSeverityCount,
  type ActiveIssue,
  type ProjectPhase,
} from '../../lib/siteEngineerHome';
import { projectStatusTone } from '../../lib/projectStatusTone';
import {
  portfolioTotals,
  portfolioVariance,
  varianceExceedsThreshold,
  settledBudgetRows,
  type ProjectFinance,
} from '../../lib/portfolioFinance';
import { useHomeStyles, Screen, asList, KpiRegion } from './HomeKit';

/** `GET /finance/budget/:projectId` — only the aggregate block the manager Home reads. */
interface PmBudget {
  budget: {
    total_budget_amount: string;
    total_budget_currency: string;
    allocated_amount: string;
    committed_amount: string;
    actual_amount: string;
  };
}

/**
 * How the manager Home's project load ended.
 *
 * `failed` exists so an unanswered request and an empty portfolio cannot render the same sentence —
 * see the catch in `load` for the capture that made the difference visible.
 */
type PmLoadState = 'loading' | 'ready' | 'failed';

/** One row of the manager Home's YOUR PROJECTS list. Both extras are nullable — see §32.12. */
interface PmProjectRow {
  project: MyProject;
  percentComplete: number | null;
  phase: ProjectPhase | null;
}

// ── PROJECT_MANAGER — the manager dashboard (mockup 06_project_manager/01_home) ────────────────
//
// Rebuilt on 2026-08-10 from the corrected mockup set. It was four stacked KPI cards derived from
// master 3202's one-line "home (triage)"; the drawing gives the role two KPI tiles, a blockers card,
// the AI panel and its project list, and this follows it.
//
// COMMITTED SPEND AND PENDING APPROVALS LEFT THIS SCREEN, they were not deleted: the approvals queue
// is drawn on the Procurement tab, which counts the same PENDING_APPROVAL rows, and the money
// figures are the Finance tab's three tiles. Repeating them here would be the same query answered in
// three places.
//
// WHAT EACH TILE ACTUALLY COUNTS:
//   - Active Projects — cached `local_projects` in status ACTIVE, so it survives offline.
//   - Total Variance  — the SERVER'S variance formula over the manager's whole portfolio
//     (lib/portfolioFinance.ts), summed from the same per-project budgets the Finance tab reads.
//     The mockup prints "+1.2%" in green with an upward arrow; positive variance means spend and
//     commitments are ABOVE what was allocated, so the colour here follows the platform's own alert
//     rule instead of the drawing's.
//   - Critical Blockers — open issues at the WORST severity actually present, not a hardcoded
//     "CRITICAL": `topSeverityCount` exists for exactly this, so a portfolio whose worst open issue
//     is HIGH says HIGH rather than claiming a critical one.
//
// THE PER-PROJECT SYNC CHIP IN THE DRAWING IS NOT DRAWN. This app tracks sync state for the device
// (SyncPill / OverlaySyncPill), not per project — there is no per-project sync record to read, so
// the chip shows the project's real STATUS instead, which is what the drawing's third card does.
//
// THIS SCREEN MAKES THREE REQUESTS PER PROJECT (budget · progress · phases) plus one issues query,
// all in parallel and all individually optional — every one of them fails to a placeholder rather
// than to a wrong number. That is the cost of a portfolio view for a role with no portfolio
// endpoint it may call; see finance.tsx for why there is none.
export default function PmHome() {
  const styles = useHomeStyles();
  const p = usePalette();
  const cached = useCollection<Project>('local_projects');
  const router = useRouter();
  const t = useT();

  const [rows, setRows] = useState<PmProjectRow[]>([]);
  const [finance, setFinance] = useState<ProjectFinance[]>([]);
  const [blockers, setBlockers] = useState<ActiveIssue[]>([]);
  const [insightProject, setInsightProject] = useState('');
  const [loading, setLoading] = useState(true);
  // Honest load progress: two independent fetches, counted as each lands (Rule 40).
  const [settled, setSettled] = useState(0);
  const LOAD_STEPS = 2;
  const [projectsState, setProjectsState] = useState<PmLoadState>('loading');
  const activeCount = cached.filter((project) => project.status === 'ACTIVE').length;

  // Cheap ref, not state: it only decides whether the focus hook refetches, and writing it must not
  // re-render the screen it is measuring.
  const loadedOnce = useRef(false);

  const load = useCallback(() => {
    let cancelled = false;
    refreshProjectsCache().catch(() => {
      /* offline — show cached */
    });

    const issuesFetch = get<{ items?: ActiveIssue[] } | ActiveIssue[]>('/site/issues', {
      status: 'OPEN',
    })
      .then((res) => {
        if (!cancelled) setBlockers(asList(res));
      })
      .catch(() => {
        /* offline — keep last */
      });

    const projectsFetch = (async () => {
      const mine = await getMyProjects();
      const [budgets, progress, phases] = await Promise.all([
        Promise.allSettled(
          mine.map((project) => get<PmBudget>(`/finance/budget/${project.project_id}`)),
        ),
        Promise.allSettled(mine.map((project) => getProjectProgress(project.project_id))),
        Promise.allSettled(mine.map((project) => getProjectPhases(project.project_id))),
      ]);
      if (cancelled) return;

      setRows(
        mine.map((project, i) => {
          const progressResult = progress[i];
          const phaseResult = phases[i];
          return {
            project,
            // §32.12: null means "not computable", never zero — a 0% bar would read as "no work
            // done" on a project that simply has no BOQ-linked task.
            percentComplete:
              progressResult !== undefined && progressResult.status === 'fulfilled'
                ? progressResult.value.percentComplete
                : null,
            phase:
              phaseResult !== undefined && phaseResult.status === 'fulfilled'
                ? currentPhase(phaseResult.value)
                : null,
          };
        }),
      );

      // The panel's project, chosen once and never silently: the first of the manager's own, named
      // on the panel's Source line. Only set while it is still empty, so a later refresh cannot
      // move the report out from under someone reading it.
      setInsightProject((current) => (current === '' ? (mine[0]?.project_id ?? '') : current));

      setFinance(settledBudgetRows(mine, budgets));
      loadedOnce.current = true;
      setProjectsState('ready');
    })().catch(() => {
      // THE FIRST VERSION OF THIS SWALLOWED THE FAILURE AND LEFT `rows` EMPTY, which the list below
      // then captioned "You are not a member of any project yet." — a claim about the manager's
      // memberships made from a request that never answered. The very first capture of this screen
      // photographed exactly that: an empty dashboard for a manager who has three projects, while
      // the Finance tab (same call, mounted a minute later) showed all three. A failed load and an
      // empty portfolio must not read the same, and this screen must be able to recover from one.
      if (!cancelled) setProjectsState('failed');
    });

    const step = <T,>(p: Promise<T>): Promise<T> => {
      void p.finally(() => {
        if (!cancelled) setSettled((n) => n + 1);
      });
      return p;
    };
    void Promise.allSettled([step(issuesFetch), step(projectsFetch)]).then(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // ON FOCUS, NOT ON MOUNT. The mount version ran once, immediately after sign-in, and a request
  // that lost that race left the dashboard permanently empty with no way to retry but killing the
  // app. Returning to the tab now retries.
  //
  // It refetches only until the first success: this screen costs three requests per project, and
  // re-running all of them every time the manager taps Home would be paying that repeatedly to fix
  // a case that has already been fixed. A stale-data refresh is a separate question from this bug.
  useFocusEffect(
    useCallback(() => {
      if (loadedOnce.current) return;
      return load();
    }, [load]),
  );

  const variance = useMemo(() => portfolioVariance(portfolioTotals(finance)), [finance]);
  const varianceAlerting = varianceExceedsThreshold(variance);
  const worst = useMemo(() => topSeverityCount(blockers), [blockers]);
  const topBlocker = useMemo(() => sortIssuesBySeverity(blockers)[0] ?? null, [blockers]);

  return (
    <Screen testID="home-screen" scroll>
      {/* NO ROLE HEADING (PO decision 2026-08-11). The drawing carries "PROJECT MANAGER DASHBOARD"
          above the tiles; it is dropped here. It named the screen to someone who had just tapped
          Home from this role's own bar and could read the answer off the tab bar underneath. */}

      <KpiRegion loading={loading} settled={settled} steps={LOAD_STEPS}>
        <View style={styles.kpiRow}>
          {/* Both tiles open something, so both carry the drawing's chevron. In the mockup these two
              are `opacity-0 group-hover:opacity-100` — hover-only, which on a touch screen means
              never — so they are drawn always-on here: an affordance nobody can reveal is not an
              affordance. */}
          <Pressable
            testID="kpi-active-projects"
            accessibilityRole="button"
            accessibilityLabel={t('home.pm.activeProjects')}
            onPress={() => router.push('/projects')}
            style={[styles.pmTile, { borderLeftColor: p.primary }]}
          >
            <View style={styles.pmTileHead}>
              <Text style={styles.pmTileLabel}>{t('home.pm.activeProjects')}</Text>
              <MaterialIcons name="chevron-right" size={16} color={p.muted} />
            </View>
            <View style={styles.pmTileFoot}>
              <Text style={styles.pmTileValue}>{String(activeCount)}</Text>
              <MaterialIcons name="corporate-fare" size={20} color={p.primary} />
            </View>
          </Pressable>

          {/* NO chevron here, and therefore no press (PO decision 2026-08-10). The two go together:
              the rule this screen follows is that a chevron marks a card that opens something, so a
              card that navigates without one is the same defect read from the other side. */}
          <View
            testID="kpi-total-variance"
            style={[styles.pmTile, { borderLeftColor: varianceAlerting ? p.danger : p.success }]}
          >
            <View style={styles.pmTileHead}>
              <Text style={styles.pmTileLabel}>{t('home.pm.totalVariance')}</Text>
            </View>
            <View style={styles.pmTileFoot}>
              <Text
                style={[
                  styles.pmTileValue,
                  { color: varianceAlerting ? p.danger : p.success },
                  // No figure to print: the label says WHICH kind of nothing it is, instead of the
                  // figure shrinking to fit a percentage that was never computed.
                  variance === null && styles.pmTilePlaceholder,
                ]}
              >
                {/* Three different states, three different sentences. A failed load must not say
                    "No allocation" — that is a statement about the manager's budgets, and a request
                    that did not answer supports no statement at all. */}
                {projectsState === 'failed'
                  ? t('home.pm.varianceUnknown')
                  : variance === null
                    ? t('home.pm.varianceUnavailable')
                    : `${variance > 0 ? '+' : ''}${String(variance)}%`}
              </Text>
              <MaterialIcons
                name={varianceAlerting ? 'trending-up' : 'trending-down'}
                size={20}
                color={varianceAlerting ? p.danger : p.success}
              />
            </View>
          </View>
        </View>
      </KpiRegion>

      {/* Critical blockers. The card is only drawn when something is actually blocked — an empty
          red-striped panel reads as an alert in its own right. */}
      {worst !== null && topBlocker !== null ? (
        <Pressable
          testID="pm-blockers"
          accessibilityRole="button"
          accessibilityLabel={topBlocker.title}
          onPress={() => router.push('/issues')}
          style={[styles.pmCard, { borderLeftColor: p.danger }]}
        >
          <View style={styles.pmCardHead}>
            <MaterialIcons name="warning" size={18} color={p.danger} />
            <Text style={[styles.pmCardTitle, styles.pmCardTitleGrow, { color: p.danger }]}>
              {t('home.pm.blockerCount', {
                // Counting numbers, no leading zero — the same rule the PO set for the procurement
                // counters (2026-08-10). "05 HIGH ISSUES" reads as a code; "5" is a quantity.
                count: String(worst.count),
                severity: worst.severity,
              })}
            </Text>
            <MaterialIcons name="chevron-right" size={20} color={p.danger} />
          </View>
          <Text style={styles.pmCardBody} numberOfLines={2}>
            {topBlocker.title}
          </Text>
          <TouchableOpacity
            testID="pm-blockers-manage"
            accessibilityRole="button"
            accessibilityLabel={t('home.pm.manage')}
            onPress={() => router.push('/issues')}
            style={[styles.pmGhostButton, { borderColor: p.danger }]}
          >
            <Text style={[styles.pmGhostButtonText, { color: p.danger }]}>
              {t('home.pm.manage')}
            </Text>
          </TouchableOpacity>
        </Pressable>
      ) : null}

      {!loading && blockers.length === 0 ? (
        <Text testID="pm-no-blockers" style={styles.pmNotice}>
          {t('home.pm.noBlockers')}
        </Text>
      ) : null}

      {/* NO PROJECT PICKER HERE (PO decision 2026-08-11). The drawing has none, and YOUR PROJECTS
          below already lists this manager's projects — a second list of the same names, one to read
          and one to choose from, made the screen ask the same question twice.
          The report endpoint still needs A project, so the panel reports on the first of the
          manager's own projects and SAYS SO on its Source line. That is the same rule the picker
          was there to satisfy: never let one project's findings read as a portfolio-wide statement.
          Which project is not a silent choice — it is named, in words, under the text. */}
      <PortfolioInsight
        projectId={insightProject}
        titleKey="home.pm.analysisTitle"
        icon="memory"
        projectLabel={
          rows.find((row) => row.project.project_id === insightProject)?.project.project_name
        }
      />

      <Text style={styles.eyebrow}>{t('home.pm.yourProjects')}</Text>

      {projectsState === 'failed' ? (
        <Text testID="pm-projects-failed" style={styles.pmNotice}>
          {t('home.pm.projectsUnavailable')}
        </Text>
      ) : null}

      {projectsState === 'ready' && rows.length === 0 ? (
        <Text testID="pm-no-projects" style={styles.pmNotice}>
          {t('home.pm.noProjects')}
        </Text>
      ) : null}

      {rows.map(({ project, percentComplete, phase }) => (
        <Pressable
          key={project.project_id}
          testID={`pm-project-${project.project_id}`}
          accessibilityRole="button"
          accessibilityLabel={project.project_name}
          // That project's own analytics — `/dashboard` takes the id now, so the card opens the
          // project it names instead of dropping the reader on a picker.
          onPress={() =>
            router.push({ pathname: '/dashboard', params: { projectId: project.project_id } })
          }
          style={[styles.pmCard, { borderLeftColor: p.accent }]}
        >
          <View style={styles.pmProjectHead}>
            <View style={styles.pmProjectTitleBlock}>
              <Text style={styles.pmProjectName} numberOfLines={1}>
                {project.project_name}
              </Text>
              <Text style={styles.pmProjectPhase}>
                {phase === null ? t('home.pm.noPhase') : t('home.pm.phase', { phase: phase.name })}
              </Text>
            </View>
            {/* ACTIVE is green (PO question, answered 2026-08-10). The drawing colours the good
                state green and leaves DRAFT grey, and this app's own StatusChip map already puts
                DRAFT on the neutral token — so green here agrees with both rather than inventing a
                third convention. `projectStatusTone` holds the mapping so the two surfaces cannot
                drift. */}
            <View
              style={[
                styles.pmStatusChip,
                projectStatusTone(project.status) === 'success' && { borderColor: p.success },
              ]}
            >
              <Text
                style={[
                  styles.pmStatusText,
                  projectStatusTone(project.status) === 'success' && { color: p.success },
                ]}
              >
                {project.status}
              </Text>
            </View>
            <MaterialIcons name="chevron-right" size={20} color={p.muted} />
          </View>

          <View style={styles.pmProgressRow}>
            <Text style={styles.pmProgressLabel}>{t('home.pm.progress')}</Text>
            <Text style={styles.pmProgressLabel}>
              {hasProgressFigure(percentComplete)
                ? `${String(Math.round(percentComplete))}%`
                : t('home.pm.progressUnavailable')}
            </Text>
          </View>
          {hasProgressFigure(percentComplete) ? (
            <View style={[styles.statTrack, { backgroundColor: p.border }]}>
              <View
                testID={`pm-progress-${project.project_id}`}
                style={[
                  styles.statFill,
                  {
                    width: `${progressBarWidth(percentComplete)}%`,
                    backgroundColor: p.accent,
                  },
                ]}
              />
            </View>
          ) : null}
        </Pressable>
      ))}
    </Screen>
  );
}

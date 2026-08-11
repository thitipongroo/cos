// Home screen — role-aware landing (G-M1; master §Phase 10 role Home specs).
// The bottom-nav gives every role a "Home" tab (see (app)/_layout.tsx), and the spec defines a
// DISTINCT Home per role:
//   SITE_WORKER                 : bento stats + priority tasks                  (master 3076/3202)
//   SITE_ENGINEER               : dashboard — see components/SiteEngineerHome  (§32.12; PO 2026-07-16)
//   EXECUTIVE                   : active projects · budget vs actual · open critical issues (3093)
//   FINANCE                     : pending payment approvals · overdue invoices  (3107)
//   PROCUREMENT_OFFICER/MANAGER : open RFQs · POs awaiting ack · deliveries     (3120)
//   PROJECT_MANAGER             : manager dashboard — KPI tiles · blockers · AI · project list
//                                 (mockup 06_project_manager/01_home, which SUPERSEDES master
//                                  3202's one-line "home (triage)" as of 2026-08-10)
//   others (SAFETY/ADMIN/VIEWER): minimal landing (Home content not enumerated in master)
// Each variant reads from endpoints already proven in the sibling screens (alerts/payments/
// procurement/portfolio) — no new endpoint is introduced. All fetches are offline-safe (cached
// value kept on error), matching the read-only offline behaviour in master 3101/3115/3130.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Pressable, StyleSheet } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { CosRole } from '@cos/types';
import { db } from '../../db/database';
import type { Project } from '../../db/database';
import { localTasks } from '../../db/schema';
import { eq } from 'drizzle-orm';
import { mutate } from '../../api/client';
import { useCollection } from '../../hooks/useCollection';
import type { Task, Attendance } from '../../db/database';
import { shiftProgress } from '../../lib/shiftHours';
import { usePendingCount } from '../../hooks/usePendingCount';
import { get } from '../../api/client';
import { refreshProjectsCache } from '../../api/projects';
import { useAuthStore } from '../../store/authStore';
import { TaskCard } from '../../components/TaskCard';
import { QuickActionsMenu } from '../../components/QuickActionsMenu';
import { MaterialIcons } from '@expo/vector-icons';
import { Alert, ScrollView } from 'react-native';
import { LoadingBoundary } from '../../components/LoadingBoundary';
import SiteEngineerHome from '../../components/SiteEngineerHome';
import TenantAdminHome from '../../components/TenantAdminHome';
import { useT } from '../../i18n';
import { fontFamily, radius, spacing, touchTarget, typography } from '../../theme/tokens';
import { usePalette, useIsDark, type Palette } from '../../theme/usePalette';
import { formatMoney } from '@cos/financial';
import {
  committedSpend,
  openRfqCount,
  urgentRfqCount,
  type SpendRow,
  type DeadlineRow,
} from '../../lib/procurementKpi';
import { ProjectPicker } from '../../components/ProjectPicker';
import { ProcurementInsight } from '../../components/ProcurementInsight';
import { PortfolioInsight } from '../../components/PortfolioInsight';
import { ProjectContextBar } from '../../components/ProjectContextBar';
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
  type ProjectFinance,
} from '../../lib/portfolioFinance';

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

/** The palette-resolved stylesheet. One hook so every home variant reads the same set. */
function useHomeStyles() {
  const p = usePalette();
  return useMemo(() => makeStyles(p), [p]);
}

/**
 * The skeleton palette for this screen's loaders.
 *
 * <LoadingState /> takes an explicit theme rather than reading the store, so a hardcoded "light"
 * here would flash a white skeleton on a dark page before the real content arrives — the same defect
 * as the stylesheet above, one component deeper.
 */
function useLoaderTheme(): 'dark' | 'light' {
  return useIsDark() ? 'dark' : 'light';
}

// ── shared presentational bits ──────────────────────────────────────────────
function KpiCard({ testID, value, label }: { testID: string; value: string; label: string }) {
  const styles = useHomeStyles();
  return (
    <View testID={testID} style={styles.kpi}>
      <Text style={styles.kpiValue}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  );
}

/** How many task cards the Site Worker Home lists before "+ N more" (mockup: three). */
const PRIORITY_TASK_COUNT = 3;

/**
 * A bento stat tile — label + glyph, a big figure with a small unit beside it, and a progress bar.
 *
 * `fraction` scales the bar; the caller decides what it is a fraction OF, because the two tiles
 * measure different things (tasks done out of all tasks; hours worked out of a standard shift).
 */
function StatTile({
  testID,
  label,
  icon,
  value,
  unit,
  fraction,
  barColor,
}: {
  testID: string;
  label: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  value: string;
  unit: string;
  fraction: number;
  barColor: string;
}) {
  const styles = useHomeStyles();
  const p = usePalette();
  return (
    <View testID={testID} style={styles.statTile}>
      <View style={styles.statHead}>
        <Text style={styles.statLabel}>{label}</Text>
        <MaterialIcons name={icon} size={20} color={p.muted} />
      </View>
      <View style={styles.statValueRow}>
        <Text style={styles.statValue}>{value}</Text>
        {unit ? <Text style={styles.statUnit}>{unit}</Text> : null}
      </View>
      <View style={[styles.statTrack, { backgroundColor: p.border }]}>
        <View
          style={[
            styles.statFill,
            {
              width: `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%`,
              backgroundColor: barColor,
            },
          ]}
        />
      </View>
    </View>
  );
}

/**
 * A role Home's page frame.
 *
 * `scroll` is opt-in rather than the default: most role Homes are a screenful of KPI cards, and a
 * ScrollView around content that never overflows changes nothing except how the E2E suite finds it.
 * The Project Manager's Home lists every project it is a member of and does overflow.
 */
function Screen({
  testID,
  scroll = false,
  children,
}: {
  testID: string;
  scroll?: boolean;
  children: React.ReactNode;
}) {
  const styles = useHomeStyles();
  if (scroll) {
    return (
      <ScrollView
        testID={testID}
        style={styles.scrollRoot}
        contentContainerStyle={styles.scrollPage}
      >
        {children}
      </ScrollView>
    );
  }
  return (
    <View testID={testID} style={styles.container}>
      {children}
    </View>
  );
}

/** Normalise a list endpoint that may return `T[]` or `{ items: T[] }`. */
function asList<T>(res: { items?: T[] } | T[]): T[] {
  return Array.isArray(res) ? res : (res.items ?? []);
}

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
function FieldHome() {
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
      <TouchableOpacity
        testID="home-quick-action-fab"
        accessibilityRole="button"
        accessibilityLabel={t('quickActions.title')}
        onPress={() => setQuickActionsOpen(true)}
        style={[styles.fab, { backgroundColor: p.primary }]}
      >
        <MaterialIcons name="add" size={28} color={p.onPrimary} />
      </TouchableOpacity>

      <QuickActionsMenu visible={quickActionsOpen} onClose={() => setQuickActionsOpen(false)} />
    </View>
  );
}

// ── EXECUTIVE — active projects · budget vs actual · open critical issues ─────
interface ExecutiveDashboardRow {
  totalActual: string;
  totalBudget: string;
  overdueInvoiceCount: number;
}

function ExecHome() {
  const styles = useHomeStyles();
  const loaderTheme = useLoaderTheme();
  const projects = useCollection<Project>('local_projects');
  const t = useT();
  const [budget, setBudget] = useState<number | null>(null);
  const [actual, setActual] = useState<number | null>(null);
  const [critical, setCritical] = useState<number | null>(null);
  // First-load flag: true until the remote KPI fetches settle (success OR offline failure), so the
  // loader crossfades to the real values — which stay the offline-safe `—` when a fetch fails.
  const [loading, setLoading] = useState(true);
  const activeCount = projects.filter((p) => p.status === 'ACTIVE').length;

  useEffect(() => {
    refreshProjectsCache().catch(() => {
      /* offline — show cached */
    });
    const execFetch = get<ExecutiveDashboardRow[]>('/analytics/executive')
      .then((rows) => {
        setBudget(rows.reduce((s, r) => s + Number(r.totalBudget), 0));
        setActual(rows.reduce((s, r) => s + Number(r.totalActual), 0));
      })
      .catch(() => {
        /* offline — keep last */
      });
    const issuesFetch = get<{ items?: unknown[]; total?: number }>('/site/issues', {
      severity: 'CRITICAL',
      status: 'OPEN',
    })
      .then((res) => setCritical(res.total ?? asList(res as { items?: unknown[] }).length))
      .catch(() => {
        /* offline — keep last */
      });
    void Promise.allSettled([execFetch, issuesFetch]).then(() => setLoading(false));
  }, []);

  // DESIGN.md §9.5 — one presentation everywhere, and never a bare toLocaleString: that renders
  // 1.234,56 on a German handset and degrades on Android builds with trimmed ICU.
  const money = (n: number | null): string => (n === null ? '—' : formatMoney(n));

  return (
    <Screen testID="home-screen">
      <LoadingBoundary
        loading={loading}
        variant="widget"
        theme={loaderTheme}
        style={styles.kpiRegion}
      >
        <View style={styles.kpiRow}>
          <KpiCard
            testID="kpi-active-projects"
            value={String(activeCount)}
            label={t('home.exec.activeProjects')}
          />
          <KpiCard
            testID="kpi-open-critical"
            value={critical === null ? '—' : String(critical)}
            label={t('home.exec.openCritical')}
          />
        </View>
        <View style={styles.kpiRow}>
          <KpiCard testID="kpi-budget" value={money(budget)} label={t('home.exec.budget')} />
          <KpiCard testID="kpi-actual" value={money(actual)} label={t('home.exec.actual')} />
        </View>
      </LoadingBoundary>
    </Screen>
  );
}

// ── FINANCE — pending payment approvals · overdue invoices ────────────────────
function FinanceHome() {
  const styles = useHomeStyles();
  const loaderTheme = useLoaderTheme();
  const t = useT();
  const [pendingPayments, setPendingPayments] = useState<number | null>(null);
  const [overdueInvoices, setOverdueInvoices] = useState<number | null>(null);
  // First-load flag: true until both remote KPI fetches settle (offline failures included).
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const paymentsFetch = get<{ items?: { status: string }[] } | { status: string }[]>(
      '/finance/payments',
    )
      .then((res) => setPendingPayments(asList(res).filter((p) => p.status === 'PENDING').length))
      .catch(() => {
        /* offline — keep last */
      });
    const execFetch = get<ExecutiveDashboardRow[]>('/analytics/executive')
      .then((rows) => setOverdueInvoices(rows.reduce((s, r) => s + r.overdueInvoiceCount, 0)))
      .catch(() => {
        /* offline — keep last */
      });
    void Promise.allSettled([paymentsFetch, execFetch]).then(() => setLoading(false));
  }, []);

  const n = (v: number | null): string => (v === null ? '—' : String(v));

  return (
    <Screen testID="home-screen">
      <LoadingBoundary
        loading={loading}
        variant="widget"
        theme={loaderTheme}
        style={styles.kpiRegion}
      >
        <View style={styles.kpiRow}>
          <KpiCard
            testID="kpi-pending-payments"
            value={n(pendingPayments)}
            label={t('home.finance.pendingPayments')}
          />
          <KpiCard
            testID="kpi-overdue-invoices"
            value={n(overdueInvoices)}
            label={t('home.finance.overdueInvoices')}
          />
        </View>
      </LoadingBoundary>
    </Screen>
  );
}

// ── PROCUREMENT — open RFQs · POs awaiting ack · deliveries ───────────────────
function ProcurementHome() {
  const styles = useHomeStyles();
  const loaderTheme = useLoaderTheme();
  const t = useT();
  const [openRfqs, setOpenRfqs] = useState<number | null>(null);
  const [urgentRfqs, setUrgentRfqs] = useState<number | null>(null);
  const [awaitingAck, setAwaitingAck] = useState<number | null>(null);
  const [spend, setSpend] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<number | null>(null);
  // The Insights panel's report endpoint is project-scoped, so the dashboard asks which project
  // (PO decision 2026-08-10). Empty until chosen — the panel stays idle rather than picking one.
  const [insightProject, setInsightProject] = useState('');
  // First-load flag: true until all three remote KPI fetches settle (offline failures included).
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // The urgency window IS defined now — `lib/approvalUrgency.ts`, 24 hours — and RFQs carry a real
    // `deadline` column, so "closing soon" is measured rather than approximated by the open count.
    const now = new Date();
    const rfqsFetch = get<{ items?: DeadlineRow[] } | DeadlineRow[]>('/procurement/rfqs')
      .then((res) => {
        const rows = asList(res);
        setOpenRfqs(openRfqCount(rows));
        setUrgentRfqs(urgentRfqCount(rows, now));
      })
      .catch(() => {
        /* offline — keep last */
      });
    // "POs awaiting acknowledgment" = status SENT (sent to vendor, not yet ACKNOWLEDGED).
    // The same response also carries committed spend — summed with decimal.js, never `+` on numbers
    // (lib/procurementKpi.ts), and from ONE request rather than a second round trip.
    const posFetch = get<{ items?: SpendRow[] } | SpendRow[]>('/procurement/purchase-orders')
      .then((res) => {
        const rows = asList(res);
        setAwaitingAck(rows.filter((p) => p.status === 'SENT').length);
        setSpend(formatMoney(committedSpend(rows)));
      })
      .catch(() => {
        /* offline — keep last */
      });
    const deliveriesFetch = get<{ items?: unknown[] } | unknown[]>('/procurement/deliveries')
      .then((res) => setDeliveries(asList(res).length))
      .catch(() => {
        /* offline — keep last */
      });
    void Promise.allSettled([rfqsFetch, posFetch, deliveriesFetch]).then(() => setLoading(false));
  }, []);

  const n = (v: number | null): string => (v === null ? '—' : String(v));

  return (
    <Screen testID="home-screen">
      <LoadingBoundary
        loading={loading}
        variant="widget"
        theme={loaderTheme}
        style={styles.kpiRegion}
      >
        {/* The mockup's full-width spend tile. A dash until the request settles — never a 0, which
            would read as "nothing is committed" rather than "not loaded". */}
        <View style={styles.kpiRow}>
          <KpiCard
            testID="kpi-committed-spend"
            value={spend ?? '—'}
            label={t('home.procurement.committedSpend')}
          />
        </View>
        <View style={styles.kpiRow}>
          <KpiCard
            testID="kpi-open-rfqs"
            value={n(openRfqs)}
            label={t('home.procurement.openRfqs')}
          />
          <KpiCard
            testID="kpi-urgent-rfqs"
            value={n(urgentRfqs)}
            label={t('home.procurement.urgentRfqs')}
          />
        </View>
        <View style={styles.kpiRow}>
          <KpiCard
            testID="kpi-awaiting-ack"
            value={n(awaitingAck)}
            label={t('home.procurement.awaitingAck')}
          />
        </View>
        <View style={styles.kpiRow}>
          <KpiCard
            testID="kpi-deliveries"
            value={n(deliveries)}
            label={t('home.procurement.deliveries')}
          />
        </View>
      </LoadingBoundary>
      <ProjectPicker selectedId={insightProject} onSelect={setInsightProject} />
      <ProcurementInsight projectId={insightProject} />
    </Screen>
  );
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
function PmHome() {
  const styles = useHomeStyles();
  const p = usePalette();
  const loaderTheme = useLoaderTheme();
  const cached = useCollection<Project>('local_projects');
  const router = useRouter();
  const t = useT();

  const [rows, setRows] = useState<PmProjectRow[]>([]);
  const [finance, setFinance] = useState<ProjectFinance[]>([]);
  const [blockers, setBlockers] = useState<ActiveIssue[]>([]);
  const [insightProject, setInsightProject] = useState('');
  const [loading, setLoading] = useState(true);
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

      setFinance(
        mine.flatMap((project, i) => {
          const result = budgets[i];
          // Rejected = 404 (never budgeted) or offline. A zero row would drag the portfolio
          // variance towards a number nobody's data supports.
          if (result === undefined || result.status !== 'fulfilled') return [];
          const b = result.value.budget;
          return [
            {
              projectId: project.project_id,
              projectName: project.project_name,
              projectCode: project.project_code,
              currency: b.total_budget_currency,
              totalBudget: b.total_budget_amount,
              allocated: b.allocated_amount,
              committed: b.committed_amount,
              actual: b.actual_amount,
            },
          ];
        }),
      );
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

    void Promise.allSettled([issuesFetch, projectsFetch]).then(() => {
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

      <LoadingBoundary
        loading={loading}
        variant="widget"
        theme={loaderTheme}
        style={styles.kpiRegion}
      >
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
      </LoadingBoundary>

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

// ── minimal landing for roles whose Home is not enumerated in master ──────────
function MinimalHome() {
  const styles = useHomeStyles();
  const pending = usePendingCount();
  const t = useT();
  return (
    <Screen testID="home-screen">
      <View style={styles.kpiRow}>
        <KpiCard
          testID="pending-sync-count"
          value={String(pending)}
          label={t('home.main.pendingSync')}
        />
      </View>
    </Screen>
  );
}

export default function HomeScreen() {
  const role = useAuthStore((s) => s.role);

  switch (role) {
    case CosRole.EXECUTIVE:
      return <ExecHome />;
    case CosRole.FINANCE:
      return <FinanceHome />;
    case CosRole.PROCUREMENT_OFFICER:
    case CosRole.PROC_MANAGER:
      return <ProcurementHome />;
    case CosRole.PROJECT_MANAGER:
      return <PmHome />;
    case CosRole.SITE_ENGINEER:
      return <SiteEngineerHome />;
    case CosRole.TENANT_ADMIN:
      return <TenantAdminHome />;
    case CosRole.SITE_WORKER:
      return <FieldHome />;
    default:
      return <MinimalHome />;
  }
}

// Palette-driven, like every other screen in the shell (PO decision 2026-08-08). This file was the
// last one still pinned to the LIGHT token set — `colors.bg`, `colors.surface` — which rendered a
// white page under a dark top bar and dark bottom nav. It went unnoticed while no role landed here
// by default; the moment SITE_WORKER regained its Home tab it became the first screen a field worker
// sees. Shapes are unchanged; only the colours now resolve from the user's mode.
const makeStyles = (p: Palette) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: p.bg, padding: spacing.md, gap: spacing.md },
    scrollRoot: { flex: 1, backgroundColor: p.bg },
    scrollPage: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl * 3 },
    kpiRow: { flexDirection: 'row', gap: spacing.md },

    // ── Project Manager Home (mockup 06_project_manager/01_home) ────────────────────────────
    eyebrow: {
      color: p.muted,
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    pmTile: {
      flex: 1,
      justifyContent: 'space-between',
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: p.border,
      borderLeftWidth: 4,
      backgroundColor: p.surface,
    },
    pmTileLabel: {
      color: p.muted,
      fontFamily: fontFamily.medium,
      fontSize: typography.label.fontSize,
    },
    pmTileHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    pmTileFoot: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
    pmTileValue: {
      color: p.text,
      fontFamily: fontFamily.bold,
      fontSize: typography.hero.fontSize,
      lineHeight: typography.hero.lineHeight,
    },
    // A placeholder is a sentence, not a figure — it must not be set at hero size.
    pmTilePlaceholder: {
      color: p.muted,
      fontFamily: fontFamily.medium,
      fontSize: typography.label.fontSize,
      lineHeight: typography.label.lineHeight,
    },
    pmCard: {
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: p.border,
      borderLeftWidth: 4,
      backgroundColor: p.surface,
    },
    pmCardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    pmCardTitleGrow: { flex: 1 },
    pmCardTitle: {
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    pmCardBody: {
      color: p.text,
      fontFamily: fontFamily.regular,
      fontSize: typography.caption.fontSize,
      lineHeight: typography.caption.lineHeight,
    },
    pmGhostButton: {
      alignSelf: 'flex-start',
      minHeight: touchTarget.secondaryButton,
      justifyContent: 'center',
      paddingHorizontal: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1,
    },
    pmGhostButtonText: {
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    pmNotice: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.caption.fontSize,
    },
    pmProjectHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    pmProjectTitleBlock: { flex: 1, gap: spacing.xs / 4 },
    pmProjectName: {
      color: p.text,
      fontFamily: fontFamily.semibold,
      fontSize: typography.body.fontSize,
    },
    pmProjectPhase: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
    },
    pmStatusChip: {
      paddingHorizontal: spacing.xs,
      paddingVertical: 2,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.elevated,
    },
    pmStatusText: {
      color: p.muted,
      fontFamily: fontFamily.medium,
      fontSize: 10,
      letterSpacing: 0.5,
    },
    pmProgressRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
    pmProgressLabel: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
    },
    // ── Site Worker Home (mockup 01_home/01_sw_dashboard) ──────────────────────────────────────
    fieldRoot: { flex: 1, backgroundColor: p.bg },
    fieldPage: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl * 3 },
    statTile: {
      flex: 1,
      minHeight: 120,
      backgroundColor: p.surface,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: p.border,
      padding: spacing.sm,
      justifyContent: 'space-between',
    },
    statHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
    statLabel: {
      flex: 1,
      fontSize: 11,
      fontFamily: fontFamily.medium,
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: p.muted,
    },
    statValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs },
    statValue: { fontSize: typography.hero.fontSize, fontFamily: fontFamily.bold, color: p.text },
    statUnit: {
      fontSize: typography.label.fontSize,
      fontFamily: fontFamily.regular,
      color: p.muted,
    },
    statTrack: { height: 4, borderRadius: 999, overflow: 'hidden' },
    statFill: { height: '100%', borderRadius: 999 },
    insight: {
      padding: spacing.md,
      borderLeftWidth: 4,
      borderTopRightRadius: radius.xl,
      borderBottomRightRadius: radius.xl,
      gap: spacing.xs,
    },
    insightHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    insightTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    insightLabel: {
      fontSize: 11,
      fontFamily: fontFamily.bold,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
    },
    insightConf: {
      fontSize: 10,
      fontFamily: fontFamily.medium,
      paddingHorizontal: spacing.xs,
      paddingVertical: 2,
      borderRadius: radius.md,
      overflow: 'hidden',
    },
    insightBody: { fontSize: typography.body.fontSize, fontFamily: fontFamily.regular },
    insightButton: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      marginTop: spacing.xs,
      minHeight: 40,
      paddingHorizontal: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1,
    },
    insightButtonText: {
      fontSize: typography.label.fontSize,
      fontFamily: fontFamily.semibold,
      textTransform: 'uppercase',
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 44,
    },
    sectionTitle: {
      fontSize: typography.title.fontSize,
      fontFamily: fontFamily.semibold,
      marginTop: spacing.xs,
      // Uppercase (PO decision 2026-08-09), matching how the mockup sets its section headings.
      // Applied as a STYLE, not by uppercasing the message: the Thai string has no case, and
      // `toUpperCase()` in the component would be a no-op there while silently shouting in English.
      textTransform: 'uppercase',
    },
    moreTasks: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
      minHeight: 44,
    },
    moreTasksText: { fontSize: typography.label.fontSize, fontFamily: fontFamily.semibold },
    // 56px round FAB per the DESIGN.md spec, cleared of the bottom nav. Black elevation, never a
    // coloured glow — FAB glow is §32.7-prohibited.
    fab: {
      position: 'absolute',
      right: spacing.md,
      bottom: spacing.xl,
      width: 56,
      height: 56,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.45,
      shadowRadius: 12,
      elevation: 8,
    },
    // Wrapper the LoadingBoundary occupies — reproduces the Screen container's vertical gap so a
    // multi-row KPI region keeps its spacing once the loader crossfades to the real cards.
    kpiRegion: { gap: spacing.md },
    quickRow: { flexDirection: 'row', gap: spacing.md },
    kpi: {
      flex: 1,
      backgroundColor: p.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: p.border,
      padding: spacing.md,
      alignItems: 'center',
      gap: spacing.xs,
    },
    kpiValue: {
      fontSize: typography.hero.fontSize,
      fontFamily: fontFamily.bold,
      // `accent`, not `primary`: on the dark page the field blue is 4.17:1, under the 4.5:1 AA text
      // threshold §20.8 gates on. In light mode the two resolve to the same colour.
      color: p.accent,
    },
    kpiLabel: {
      fontSize: typography.caption.fontSize,
      fontFamily: fontFamily.regular,
      color: p.muted,
      textAlign: 'center',
    },
    message: {
      color: p.text,
      fontFamily: fontFamily.regular,
      fontSize: typography.caption.fontSize,
    },
  });

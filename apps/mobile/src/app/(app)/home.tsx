// Home screen — role-aware landing (G-M1; master §Phase 10 role Home specs).
// The bottom-nav gives every role a "Home" tab (see (app)/_layout.tsx), and the spec defines a
// DISTINCT Home per role:
//   SITE_WORKER                 : bento stats + priority tasks                  (master 3076/3202)
//   SITE_ENGINEER               : dashboard — see components/SiteEngineerHome  (§32.12; PO 2026-07-16)
//   EXECUTIVE                   : active projects · budget vs actual · open critical issues (3093)
//   FINANCE                     : pending payment approvals · overdue invoices  (3107)
//   PROCUREMENT_OFFICER/MANAGER : open RFQs · POs awaiting ack · deliveries     (3120)
//   PROJECT_MANAGER             : triage — active projects · open issues        (3202 + §20.2)
//   others (SAFETY/ADMIN/VIEWER): minimal landing (Home content not enumerated in master)
// Each variant reads from endpoints already proven in the sibling screens (alerts/payments/
// procurement/portfolio) — no new endpoint is introduced. All fetches are offline-safe (cached
// value kept on error), matching the read-only offline behaviour in master 3101/3115/3130.

import { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
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
import { fontFamily, radius, spacing, typography } from '../../theme/tokens';
import { usePalette, useIsDark, type Palette } from '../../theme/usePalette';
import { formatMoney } from '@cos/financial';

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

function Screen({ testID, children }: { testID: string; children: React.ReactNode }) {
  const styles = useHomeStyles();
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
// Implements mockup/mobile/05_site_worker/01_home/01_dashboard, added by the 2026-08-08 restructure
// (527231f) — this role had no Home drawing before it. Product-owner decision the same day: rework
// the screen to the mockup.
//
// WHAT CHANGED AND WHY:
//   - The two KPI cards (open issues, pending sync) gave way to the mockup's two stat tiles, My
//     Tasks and Shift Hours. Neither count is lost: the Issues tab still carries its own list, and
//     sync health is the TopBar's global indicator plus the Sync Queue screen.
//   - The three inline quick-action tiles moved behind the FAB, which is what the mockup's
//     `aria-label="Quick Action"` button opens (see (app)/quick-actions.tsx).
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
// The mockup's task cards show "08:00 - 12:00" and "Sector B". Tasks carry `planned_start` /
// `planned_end` as DATEs and no location column at all, so <TaskCard /> renders what the row really
// has — the same component and the same honesty as the Tasks screen.
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
  const [awaitingAck, setAwaitingAck] = useState<number | null>(null);
  const [deliveries, setDeliveries] = useState<number | null>(null);
  // First-load flag: true until all three remote KPI fetches settle (offline failures included).
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // "RFQs closing soon" ≈ still-open (PUBLISHED) RFQs; exact deadline window is not defined in
    // master 3120, so the open-RFQ count is used as the actionable proxy.
    const rfqsFetch = get<{ items?: { status: string }[] } | { status: string }[]>(
      '/procurement/rfqs',
    )
      .then((res) => setOpenRfqs(asList(res).filter((r) => r.status === 'PUBLISHED').length))
      .catch(() => {
        /* offline — keep last */
      });
    // "POs awaiting acknowledgment" = status SENT (sent to vendor, not yet ACKNOWLEDGED).
    const posFetch = get<{ items?: { status: string }[] } | { status: string }[]>(
      '/procurement/purchase-orders',
    )
      .then((res) => setAwaitingAck(asList(res).filter((p) => p.status === 'SENT').length))
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
        <View style={styles.kpiRow}>
          <KpiCard
            testID="kpi-open-rfqs"
            value={n(openRfqs)}
            label={t('home.procurement.openRfqs')}
          />
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
    </Screen>
  );
}

// ── PROJECT_MANAGER — triage (active projects · open issues) ──────────────────
// master 3202 says "home (triage)" without enumerating KPIs; derived from §20.2 PM needs
// (site blockers / schedule attention) as active-projects + open-issues entry points.
function PmHome() {
  const styles = useHomeStyles();
  const loaderTheme = useLoaderTheme();
  const projects = useCollection<Project>('local_projects');
  const t = useT();
  const [openIssues, setOpenIssues] = useState<number | null>(null);
  // First-load flag: true until the remote open-issues fetch settles (offline failure included).
  const [loading, setLoading] = useState(true);
  const activeCount = projects.filter((p) => p.status === 'ACTIVE').length;

  useEffect(() => {
    refreshProjectsCache().catch(() => {
      /* offline — show cached */
    });
    const issuesFetch = get<{ items?: unknown[]; total?: number }>('/site/issues', {
      status: 'OPEN',
    })
      .then((res) => setOpenIssues(res.total ?? asList(res as { items?: unknown[] }).length))
      .catch(() => {
        /* offline — keep last */
      });
    void Promise.allSettled([issuesFetch]).then(() => setLoading(false));
  }, []);

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
            label={t('home.pm.activeProjects')}
          />
          <KpiCard
            testID="kpi-open-issues"
            value={openIssues === null ? '—' : String(openIssues)}
            label={t('home.pm.openIssues')}
          />
        </View>
      </LoadingBoundary>
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
    kpiRow: { flexDirection: 'row', gap: spacing.md },
    // ── Site Worker Home (mockup 01_home/01_dashboard) ──────────────────────────────────────
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

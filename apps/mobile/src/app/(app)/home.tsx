// Home screen — role-aware landing (G-M1; master §Phase 10 role Home specs).
// The bottom-nav gives every role a "Home" tab (see (app)/_layout.tsx), and the spec defines a
// DISTINCT Home per role:
//   SITE_WORKER                 : KPI + self check-in (offline-first)          (master 3076/3202)
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
import { db, newLocalId } from '../../db/database';
import type { Issue, Project } from '../../db/database';
import { localAttendance } from '../../db/schema';
import { useCollection } from '../../hooks/useCollection';
import { usePendingCount } from '../../hooks/usePendingCount';
import { get } from '../../api/client';
import { getMyWorker, recordCheckIn } from '../../api/workforce';
import { refreshProjectsCache } from '../../api/projects';
import { useAuthStore } from '../../store/authStore';
import { ProjectPicker } from '../../components/ProjectPicker';
import { QuickActionCard } from '../../components/QuickActionCard';
import { LoadingBoundary } from '../../components/LoadingBoundary';
import SiteEngineerHome from '../../components/SiteEngineerHome';
import TenantAdminHome from '../../components/TenantAdminHome';
import { useT } from '../../i18n';
import { fontFamily, radius, spacing, typography } from '../../theme/tokens';
import { screen } from '../../theme/screenStyles';
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

// ── SITE_WORKER — KPI + self check-in ────────────────────────────────────────
function FieldHome() {
  const styles = useHomeStyles();
  const issues = useCollection<Issue>('local_issues');
  const pending = usePendingCount();
  const router = useRouter();
  const t = useT();
  const openIssues = issues.filter((i) => i.status === 'OPEN' || i.status === 'IN_PROGRESS').length;

  const [projectId, setProjectId] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const onCheckIn = async (): Promise<void> => {
    setBusy(true);
    setMessage(null);
    try {
      const worker = await getMyWorker(); // 404 if no worker linked to this user
      const now = new Date().toISOString();
      await recordCheckIn(worker.worker_id, projectId.trim(), now); // offline-queued via mutate()
      await db.insert(localAttendance).values({
        id: newLocalId(),
        logId: '',
        workerId: worker.worker_id,
        projectId: projectId.trim(),
        checkInAt: now,
        checkOutAt: null,
        hoursWorked: null,
        offlineSyncStatus: 'PENDING',
      });
      setMessage(t('home.main.checkedIn'));
    } catch {
      setMessage(t('home.main.checkInError'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen testID="home-screen">
      <View style={styles.kpiRow}>
        <KpiCard
          testID="kpi-open-issues"
          value={String(openIssues)}
          label={t('home.main.openIssues')}
        />
        <KpiCard
          testID="pending-sync-count"
          value={String(pending)}
          label={t('home.main.pendingSync')}
        />
      </View>

      <ProjectPicker selectedId={projectId} onSelect={setProjectId} />
      <TouchableOpacity
        testID="check-in-button"
        style={[styles.checkIn, (busy || !projectId.trim()) && screen.buttonDisabled]}
        onPress={onCheckIn}
        disabled={busy || !projectId.trim()}
      >
        <Text style={screen.primaryButtonText}>{t('home.main.checkIn')}</Text>
      </TouchableOpacity>

      {message ? (
        <Text testID="check-in-status" style={styles.message}>
          {message}
        </Text>
      ) : null}

      <View style={styles.quickRow}>
        <QuickActionCard
          testID="qa-tasks"
          icon="✅"
          label={t('nav.tabs.tasks')}
          onPress={() => router.push('/tasks')}
        />
        <QuickActionCard
          testID="qa-report"
          icon="📝"
          label={t('nav.tabs.report')}
          onPress={() => router.push('/report')}
        />
        <QuickActionCard
          testID="qa-issues"
          icon="⚠️"
          label={t('nav.tabs.issues')}
          badge={openIssues}
          onPress={() => router.push('/issues')}
        />
      </View>
    </Screen>
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
    checkIn: {
      minHeight: 52,
      borderRadius: radius.lg,
      backgroundColor: p.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    message: {
      color: p.text,
      fontFamily: fontFamily.regular,
      fontSize: typography.caption.fontSize,
    },
  });

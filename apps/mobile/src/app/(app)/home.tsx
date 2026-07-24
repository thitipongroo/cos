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

import { useEffect, useState } from 'react';
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
import SiteEngineerHome from '../../components/SiteEngineerHome';
import { useT } from '../../i18n';
import { colors, fontFamily, spacing, typography } from '../../theme/tokens';
import { screen } from '../../theme/screenStyles';

// ── shared presentational bits ──────────────────────────────────────────────
function KpiCard({ testID, value, label }: { testID: string; value: string; label: string }) {
  return (
    <View testID={testID} style={styles.kpi}>
      <Text style={styles.kpiValue}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  );
}

function Screen({
  testID,
  title,
  children,
}: {
  testID: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View testID={testID} style={styles.container}>
      <Text style={screen.heading}>{title}</Text>
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
    <Screen testID="home-screen" title={t('home.main.title')}>
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
  const projects = useCollection<Project>('local_projects');
  const t = useT();
  const [budget, setBudget] = useState<number | null>(null);
  const [actual, setActual] = useState<number | null>(null);
  const [critical, setCritical] = useState<number | null>(null);
  const activeCount = projects.filter((p) => p.status === 'ACTIVE').length;

  useEffect(() => {
    refreshProjectsCache().catch(() => {
      /* offline — show cached */
    });
    get<ExecutiveDashboardRow[]>('/analytics/executive')
      .then((rows) => {
        setBudget(rows.reduce((s, r) => s + Number(r.totalBudget), 0));
        setActual(rows.reduce((s, r) => s + Number(r.totalActual), 0));
      })
      .catch(() => {
        /* offline — keep last */
      });
    get<{ items?: unknown[]; total?: number }>('/site/issues', {
      severity: 'CRITICAL',
      status: 'OPEN',
    })
      .then((res) => setCritical(res.total ?? asList(res as { items?: unknown[] }).length))
      .catch(() => {
        /* offline — keep last */
      });
  }, []);

  const money = (n: number | null): string => (n === null ? '—' : n.toLocaleString());

  return (
    <Screen testID="home-screen" title={t('home.exec.title')}>
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
    </Screen>
  );
}

// ── FINANCE — pending payment approvals · overdue invoices ────────────────────
function FinanceHome() {
  const t = useT();
  const [pendingPayments, setPendingPayments] = useState<number | null>(null);
  const [overdueInvoices, setOverdueInvoices] = useState<number | null>(null);

  useEffect(() => {
    get<{ items?: { status: string }[] } | { status: string }[]>('/finance/payments')
      .then((res) => setPendingPayments(asList(res).filter((p) => p.status === 'PENDING').length))
      .catch(() => {
        /* offline — keep last */
      });
    get<ExecutiveDashboardRow[]>('/analytics/executive')
      .then((rows) => setOverdueInvoices(rows.reduce((s, r) => s + r.overdueInvoiceCount, 0)))
      .catch(() => {
        /* offline — keep last */
      });
  }, []);

  const n = (v: number | null): string => (v === null ? '—' : String(v));

  return (
    <Screen testID="home-screen" title={t('home.finance.title')}>
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
    </Screen>
  );
}

// ── PROCUREMENT — open RFQs · POs awaiting ack · deliveries ───────────────────
function ProcurementHome() {
  const t = useT();
  const [openRfqs, setOpenRfqs] = useState<number | null>(null);
  const [awaitingAck, setAwaitingAck] = useState<number | null>(null);
  const [deliveries, setDeliveries] = useState<number | null>(null);

  useEffect(() => {
    // "RFQs closing soon" ≈ still-open (PUBLISHED) RFQs; exact deadline window is not defined in
    // master 3120, so the open-RFQ count is used as the actionable proxy.
    get<{ items?: { status: string }[] } | { status: string }[]>('/procurement/rfqs')
      .then((res) => setOpenRfqs(asList(res).filter((r) => r.status === 'PUBLISHED').length))
      .catch(() => {
        /* offline — keep last */
      });
    // "POs awaiting acknowledgment" = status SENT (sent to vendor, not yet ACKNOWLEDGED).
    get<{ items?: { status: string }[] } | { status: string }[]>('/procurement/purchase-orders')
      .then((res) => setAwaitingAck(asList(res).filter((p) => p.status === 'SENT').length))
      .catch(() => {
        /* offline — keep last */
      });
    get<{ items?: unknown[] } | unknown[]>('/procurement/deliveries')
      .then((res) => setDeliveries(asList(res).length))
      .catch(() => {
        /* offline — keep last */
      });
  }, []);

  const n = (v: number | null): string => (v === null ? '—' : String(v));

  return (
    <Screen testID="home-screen" title={t('home.procurement.title')}>
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
    </Screen>
  );
}

// ── PROJECT_MANAGER — triage (active projects · open issues) ──────────────────
// master 3202 says "home (triage)" without enumerating KPIs; derived from §20.2 PM needs
// (site blockers / schedule attention) as active-projects + open-issues entry points.
function PmHome() {
  const projects = useCollection<Project>('local_projects');
  const t = useT();
  const [openIssues, setOpenIssues] = useState<number | null>(null);
  const activeCount = projects.filter((p) => p.status === 'ACTIVE').length;

  useEffect(() => {
    refreshProjectsCache().catch(() => {
      /* offline — show cached */
    });
    get<{ items?: unknown[]; total?: number }>('/site/issues', { status: 'OPEN' })
      .then((res) => setOpenIssues(res.total ?? asList(res as { items?: unknown[] }).length))
      .catch(() => {
        /* offline — keep last */
      });
  }, []);

  return (
    <Screen testID="home-screen" title={t('home.pm.title')}>
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
    </Screen>
  );
}

// ── minimal landing for roles whose Home is not enumerated in master ──────────
function MinimalHome() {
  const pending = usePendingCount();
  const t = useT();
  return (
    <Screen testID="home-screen" title={t('home.main.title')}>
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
    case CosRole.SITE_WORKER:
      return <FieldHome />;
    default:
      return <MinimalHome />;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: spacing.md, gap: spacing.md },
  kpiRow: { flexDirection: 'row', gap: spacing.md },
  quickRow: { flexDirection: 'row', gap: spacing.md },
  kpi: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: spacing.md,
    alignItems: 'center',
    gap: spacing.xs,
  },
  kpiValue: {
    fontSize: typography.hero.fontSize,
    fontFamily: fontFamily.bold,
    color: colors.primary,
  },
  kpiLabel: {
    fontSize: typography.caption.fontSize,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  checkIn: {
    minHeight: 52,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  message: {
    color: colors.textPrimary,
    fontFamily: fontFamily.regular,
    fontSize: typography.caption.fontSize,
  },
});

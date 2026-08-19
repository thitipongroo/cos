import { useEffect, useState } from 'react';
import { View } from 'react-native';
import type { Project } from '../../db/database';
import { useCollection } from '../../hooks/useCollection';
import { get } from '../../api/client';
import { refreshProjectsCache } from '../../api/projects';
import { LoadingBoundary } from '../LoadingBoundary';
import { loadProgress } from '../../lib/loadingState';
import { useT } from '../../i18n';
import { Decimal, formatMoney, sumDecimals, toDecimal } from '@cos/financial';
import {
  useHomeStyles,
  useLoaderTheme,
  KpiCard,
  Screen,
  asList,
  type ExecutiveDashboardRow,
} from './HomeKit';

// ── EXECUTIVE — active projects · budget vs actual · open critical issues ─────

export default function ExecHome() {
  const styles = useHomeStyles();
  const loaderTheme = useLoaderTheme();
  const projects = useCollection<Project>('local_projects');
  const t = useT();
  const [budget, setBudget] = useState<Decimal | null>(null);
  const [actual, setActual] = useState<Decimal | null>(null);
  const [critical, setCritical] = useState<number | null>(null);
  // First-load flag: true until the remote KPI fetches settle (success OR offline failure), so the
  // loader crossfades to the real values — which stay the offline-safe `—` when a fetch fails.
  const [loading, setLoading] = useState(true);
  // Honest load progress: two independent fetches, counted as each lands (Rule 40).
  const [settled, setSettled] = useState(0);
  const LOAD_STEPS = 2;
  const activeCount = projects.filter((p) => p.status === 'ACTIVE').length;

  useEffect(() => {
    refreshProjectsCache().catch(() => {
      /* offline — show cached */
    });
    const execFetch = get<ExecutiveDashboardRow[]>('/analytics/executive')
      .then((rows) => {
        // decimal.js, not `+`. QM-3 forbids native float for money, and these are the largest
        // figures in the product — a portfolio's total budget, hundreds of millions of baht, where a
        // double's 2^-53 relative error stops being invisible. lib/portfolioFinance.ts sums the very
        // same class of figure for the PM's Finance screen and says so in its header; this screen was
        // reducing with `s + Number(...)` a few lines away from importing that module's formatter.
        //
        // NOT FIXED HERE, because it cannot be from this endpoint: `/analytics/executive` returns no
        // currency, so a portfolio spanning two of them is still added together. portfolioFinance
        // refuses that (it totals the dominant currency and reports how many projects it left out)
        // and can only do so because `GET /finance/budget/:projectId` carries
        // `total_budget_currency`. Giving the executive figure the same honesty needs the currency on
        // the analytics row.
        setBudget(sumDecimals(rows.map((r) => toDecimal(r.totalBudget))));
        setActual(sumDecimals(rows.map((r) => toDecimal(r.totalActual))));
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
    const step = <T,>(p: Promise<T>): Promise<T> => {
      void p.finally(() => setSettled((n) => n + 1));
      return p;
    };
    void Promise.allSettled([step(execFetch), step(issuesFetch)]).then(() => setLoading(false));
  }, []);

  // DESIGN.md §9.5 — one presentation everywhere, and never a bare toLocaleString: that renders
  // 1.234,56 on a German handset and degrades on Android builds with trimmed ICU.
  const money = (n: Decimal | null): string => (n === null ? '—' : formatMoney(n));

  return (
    <Screen testID="home-screen">
      <LoadingBoundary
        loading={loading}
        variant="widget"
        theme={loaderTheme}
        progress={loadProgress(settled, LOAD_STEPS) ?? undefined}
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

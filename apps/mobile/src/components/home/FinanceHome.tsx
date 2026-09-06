// ── FINANCE — pending payment approvals · overdue invoices ────────────────────
//
// THE OVERDUE-INVOICE TILE READ `0` FOR EVERY TENANT UNTIL 2026-09-06, and it looked like data.
// `GET /analytics/executive` filters `project_id IN ({projectIds})`; its controller turns a missing
// `projectIds` query parameter into an empty array (`analytics.executive.controller.ts` — `ids` is
// `[]`, and `filterVisibleProjectIds([])` keeps it empty), so the endpoint answers `200` with `[]`
// and `reduce` over no rows is zero. Not an em dash, not an error — a confident, wrong number on a
// finance dashboard.
//
// The three EXECUTIVE screens had the same defect and were fixed on 2026-09-05; this one was found
// during that work and fixed a day later, when the product owner asked for it. The rule now lives
// once, in `api/analytics.ts`, which has no parameterless form to call — so a fourth screen cannot
// repeat it.

import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { get } from '../../api/client';
import { getExecutiveDashboard } from '../../api/analytics';
import { getMyProjects } from '../../api/projects';
import { countSettled } from '../../lib/loadingState';
import { useT } from '../../i18n';
import { useHomeStyles, KpiCard, Screen, asList, KpiRegion, countLabel } from './HomeKit';

export default function FinanceHome() {
  const styles = useHomeStyles();
  const t = useT();
  const [pendingPayments, setPendingPayments] = useState<number | null>(null);
  const [overdueInvoices, setOverdueInvoices] = useState<number | null>(null);
  // First-load flag: true until both remote KPI fetches settle (offline failures included).
  const [loading, setLoading] = useState(true);
  // Honest load progress: two independent fetches, counted as each lands (Rule 40).
  const [settled, setSettled] = useState(0);
  const LOAD_STEPS = 2;

  useEffect(() => {
    let cancelled = false;
    const step = <T,>(promise: Promise<T>): Promise<T> =>
      countSettled(promise, () => {
        if (!cancelled) setSettled((n) => n + 1);
      });

    const paymentsFetch = step(
      get<{ items?: { status: string }[] } | { status: string }[]>('/finance/payments'),
    )
      .then((res) => {
        if (!cancelled)
          setPendingPayments(asList(res).filter((p) => p.status === 'PENDING').length);
      })
      .catch(() => {
        /* offline — keep last */
      });

    // TWO REQUESTS, COUNTED AS ONE STEP. The analytics call cannot start until the project list has
    // answered — it needs the ids — so the step is wrapped around the whole chain rather than around
    // the list alone. Counting the list would drive the bar to 100% while this tile was still empty,
    // which is the fabricated-percentage case Rule 40(e) exists to prevent.
    const invoicesFetch = step(
      (async () => {
        const projects = await getMyProjects();
        const rows = await getExecutiveDashboard(projects.map((project) => project.project_id));
        if (!cancelled) {
          setOverdueInvoices(rows.reduce((sum, row) => sum + row.overdueInvoiceCount, 0));
        }
      })(),
    ).catch(() => {
      /* offline — the tile keeps its em dash rather than claiming nothing is overdue */
    });

    void Promise.allSettled([paymentsFetch, invoicesFetch]).then(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Screen testID="home-screen">
      <KpiRegion loading={loading} settled={settled} steps={LOAD_STEPS}>
        <View style={styles.kpiRow}>
          <KpiCard
            testID="kpi-pending-payments"
            value={countLabel(pendingPayments)}
            label={t('home.finance.pendingPayments')}
          />
          <KpiCard
            testID="kpi-overdue-invoices"
            value={countLabel(overdueInvoices)}
            label={t('home.finance.overdueInvoices')}
          />
        </View>
      </KpiRegion>
    </Screen>
  );
}

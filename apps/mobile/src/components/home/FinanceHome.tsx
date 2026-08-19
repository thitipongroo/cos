import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { get } from '../../api/client';
import { useT } from '../../i18n';
import {
  useHomeStyles,
  KpiCard,
  Screen,
  asList,
  type ExecutiveDashboardRow,
  KpiRegion,
  countLabel,
} from './HomeKit';

// ── FINANCE — pending payment approvals · overdue invoices ────────────────────
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
    const step = <T,>(p: Promise<T>): Promise<T> => {
      void p.finally(() => setSettled((n) => n + 1));
      return p;
    };
    void Promise.allSettled([step(paymentsFetch), step(execFetch)]).then(() => setLoading(false));
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

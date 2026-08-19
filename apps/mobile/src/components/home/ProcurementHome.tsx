import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { get } from '../../api/client';
import { LoadingBoundary } from '../LoadingBoundary';
import { loadProgress } from '../../lib/loadingState';
import { useT } from '../../i18n';
import { formatMoney } from '@cos/financial';
import {
  committedSpend,
  openRfqCount,
  urgentRfqCount,
  type SpendRow,
  type DeadlineRow,
} from '../../lib/procurementKpi';
import { ProjectPicker } from '../ProjectPicker';
import { ProcurementInsight } from '../ProcurementInsight';
import { useHomeStyles, useLoaderTheme, KpiCard, Screen, asList } from './HomeKit';

// ── PROCUREMENT — open RFQs · POs awaiting ack · deliveries ───────────────────
export default function ProcurementHome() {
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
  // Honest load progress: three independent fetches, counted as each lands (Rule 40).
  const [settled, setSettled] = useState(0);
  const LOAD_STEPS = 3;

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
    const step = <T,>(p: Promise<T>): Promise<T> => {
      void p.finally(() => setSettled((n) => n + 1));
      return p;
    };
    void Promise.allSettled([step(rfqsFetch), step(posFetch), step(deliveriesFetch)]).then(() =>
      setLoading(false),
    );
  }, []);

  const n = (v: number | null): string => (v === null ? '—' : String(v));

  return (
    <Screen testID="home-screen">
      <LoadingBoundary
        loading={loading}
        variant="widget"
        theme={loaderTheme}
        progress={loadProgress(settled, LOAD_STEPS) ?? undefined}
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

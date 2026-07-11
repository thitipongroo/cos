'use client';

// PM dashboard (spec §20.7.2 — `/analytics/pm/{projectId}`): manpower trend, issues by severity,
// inspection rate, procurement KPIs. Reached from the project detail "แดชบอร์ด/Dashboard" tab
// (ProjectTabs). Session-authenticated via useApi (Bearer token) — tenant + date range are derived
// from the session and the default 90-day window rather than URL query params.
import { use, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useApi } from '../../../../../lib/api/client';
import { defaultDateRange } from '../../../../../lib/format';
import { PMDashboard } from '../../../../../components/analytics/PMDashboard';
import type {
  PmDashboardRow,
  CostTrendRow,
  ProcurementTrendRow,
  SiteTrendRow,
} from '../../../../../components/analytics/PMDashboard';
import { useT } from '../../../../../i18n';

interface PMState {
  site: PmDashboardRow[];
  cost: CostTrendRow[];
  procurement: ProcurementTrendRow[];
  siteTrend: SiteTrendRow[];
}

export default function PmDashboardRoutePage(props: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(props.params);
  const t = useT();
  const api = useApi();
  const { data: session } = useSession();
  const tenantId = session?.user?.tenantId ?? '';

  const [state, setState] = useState<PMState>({
    site: [],
    cost: [],
    procurement: [],
    siteTrend: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) {
      return;
    }
    const qs = new URLSearchParams({ tenantId, dateRange: defaultDateRange() }).toString();
    Promise.all([
      api<PmDashboardRow[]>(`/analytics/pm/${projectId}?${qs}`),
      api<CostTrendRow[]>(`/analytics/projects/${projectId}/cost-trend?${qs}`),
      api<ProcurementTrendRow[]>(`/analytics/projects/${projectId}/procurement-trend?${qs}`),
      api<SiteTrendRow[]>(`/analytics/projects/${projectId}/site-trend?${qs}`),
    ])
      .then(([site, cost, procurement, siteTrend]) =>
        setState({ site, cost, procurement, siteTrend }),
      )
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [projectId, tenantId, api]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-800">{t('pm.tabDashboard')}</h1>
      <PMDashboard
        pmRows={state.site}
        costTrend={state.cost}
        procurementTrend={state.procurement}
        siteTrend={state.siteTrend}
        isLoading={loading}
      />
    </main>
  );
}

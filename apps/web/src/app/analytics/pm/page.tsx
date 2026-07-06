'use client';

import { useEffect, useState, use } from 'react';
import { PMDashboard } from '../../../components/analytics/PMDashboard';
import type {
  PmDashboardRow,
  CostTrendRow,
  ProcurementTrendRow,
  SiteTrendRow,
} from '../../../components/analytics/PMDashboard';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';

interface PageSearchParams {
  projectId?: string;
  tenantId?: string;
  dateRange?: string;
}

interface PMState {
  site: PmDashboardRow[];
  cost: CostTrendRow[];
  procurement: ProcurementTrendRow[];
  siteTrend: SiteTrendRow[];
}

export default function PMDashboardPage(props: { searchParams: Promise<PageSearchParams> }) {
  const searchParams = use(props.searchParams);
  const [state, setState] = useState<PMState>({
    site: [],
    cost: [],
    procurement: [],
    siteTrend: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { projectId = '', tenantId = '', dateRange = '' } = searchParams;

  useEffect(() => {
    if (!projectId || !tenantId || !dateRange) {
      setLoading(false);
      return;
    }

    const qs = new URLSearchParams({ tenantId, dateRange }).toString();

    Promise.all([
      fetch(`${API_BASE}/analytics/pm/${projectId}?${qs}`, { credentials: 'include' }).then((r) =>
        r.json(),
      ),
      fetch(`${API_BASE}/analytics/projects/${projectId}/cost-trend?${qs}`, {
        credentials: 'include',
      }).then((r) => r.json()),
      fetch(`${API_BASE}/analytics/projects/${projectId}/procurement-trend?${qs}`, {
        credentials: 'include',
      }).then((r) => r.json()),
      fetch(`${API_BASE}/analytics/projects/${projectId}/site-trend?${qs}`, {
        credentials: 'include',
      }).then((r) => r.json()),
    ])
      .then(([site, cost, procurement, siteTrend]) => {
        setState({ site, cost, procurement, siteTrend });
      })
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [projectId, tenantId, dateRange]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-800">PM Dashboard</h1>
      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600">
          {error}
        </div>
      )}
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

'use client';

import { useEffect, useState, use } from 'react';
import { ExecutiveDashboard } from '../../../components/analytics/ExecutiveDashboard';
import type { ExecutiveDashboardRow } from '../../../components/analytics/ExecutiveDashboard';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';

interface PageSearchParams {
  tenantId?: string;
  projectIds?: string | string[];
  dateRange?: string;
}

export default function ExecutiveDashboardPage(props: { searchParams: Promise<PageSearchParams> }) {
  const searchParams = use(props.searchParams);
  const [data, setData] = useState<ExecutiveDashboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const tenantId = searchParams.tenantId ?? '';
  const projectIds = searchParams.projectIds ?? [];
  const dateRange = searchParams.dateRange ?? '';

  useEffect(() => {
    if (!tenantId || !dateRange) {
      setLoading(false);
      return;
    }

    const ids = Array.isArray(projectIds) ? projectIds : [projectIds];
    const params = new URLSearchParams({ tenantId, dateRange });
    ids.forEach((id) => params.append('projectIds[]', id));

    fetch(`${API_BASE}/analytics/executive?${params.toString()}`, {
      credentials: 'include',
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<ExecutiveDashboardRow[]>;
      })
      .then(setData)
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [tenantId, String(projectIds), dateRange]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-800">Executive Dashboard</h1>
      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600">
          {error}
        </div>
      )}
      <ExecutiveDashboard data={data} isLoading={loading} />
    </main>
  );
}

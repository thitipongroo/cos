'use client';

import { useMemo } from 'react';
import { useI18n } from '../../i18n';
import { useCriticalIssues, useExecutiveDashboard, useProjects } from '../../lib/api/queries';
import { defaultDateRange, formatMoney } from '../../lib/format';

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-gray-800">{value}</div>
    </div>
  );
}

/**
 * Executive portfolio home (§20.7.1) — KPI summary: active projects, total
 * budget vs actual, open critical issues. Data: GET /analytics/executive
 * (scoped to the tenant's projects) + GET /issues?severity=CRITICAL.
 */
export default function ExecutiveHomePage() {
  const { t, locale } = useI18n();
  const dateRange = useMemo(() => defaultDateRange(), []);

  const projectsQuery = useProjects();
  const projects = projectsQuery.data?.items ?? [];
  const projectIds = useMemo(() => projects.map((p) => p.project_id), [projects]);

  const execQuery = useExecutiveDashboard(projectIds, dateRange);
  const execRows = execQuery.data ?? [];
  const criticalQuery = useCriticalIssues();

  const activeCount = projects.filter((p) => p.status === 'ACTIVE').length;
  const totalBudget = execRows.reduce((sum, r) => sum + Number(r.totalBudget), 0);
  const totalActual = execRows.reduce((sum, r) => sum + Number(r.totalActual), 0);
  const openCritical = criticalQuery.data?.total ?? 0;

  const currency = projects.find((p) => p.budget_currency)?.budget_currency ?? null;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-800">{t('exec.homeTitle')}</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label={t('exec.kpiActiveProjects')} value={String(activeCount)} />
        <KpiCard
          label={t('exec.kpiBudget')}
          value={formatMoney(locale, String(totalBudget), currency)}
        />
        <KpiCard
          label={t('exec.kpiActual')}
          value={formatMoney(locale, String(totalActual), currency)}
        />
        <KpiCard label={t('exec.kpiOpenCritical')} value={String(openCritical)} />
      </div>
    </div>
  );
}

'use client';

import { useMemo } from 'react';
import { DataTable, type Column } from '../../../components/ui/DataTable';
import { StatusChip } from '../../../components/ui/StatusChip';
import { useI18n } from '../../../i18n';
import { useExecutiveDashboard, useProjects } from '../../../lib/api/queries';
import type { ProjectRow } from '../../../lib/api/types';
import { defaultDateRange, formatMoney, formatPercent } from '../../../lib/format';

/**
 * Executive portfolio (§20.7.1) — project list with status chips and a budget
 * variance badge, joining the project list with executive analytics (atRisk /
 * utilizationPct) per project.
 */
export default function PortfolioPage() {
  const { t, locale } = useI18n();
  const dateRange = useMemo(() => defaultDateRange(), []);

  const projectsQuery = useProjects();
  const projects = projectsQuery.data?.items ?? [];
  const projectIds = useMemo(() => projects.map((p) => p.project_id), [projects]);
  const execQuery = useExecutiveDashboard(projectIds, dateRange);

  const execById = useMemo(
    () => new Map((execQuery.data ?? []).map((r) => [r.projectId, r])),
    [execQuery.data],
  );

  const columns: Column<ProjectRow>[] = [
    { headerKey: 'table.code', cell: (p) => p.project_code },
    { headerKey: 'table.project', cell: (p) => p.project_name },
    { headerKey: 'table.status', cell: (p) => <StatusChip status={p.status} /> },
    {
      headerKey: 'table.budget',
      cell: (p) => formatMoney(locale, p.budget_amount, p.budget_currency),
    },
    {
      headerKey: 'table.utilization',
      cell: (p) => {
        const row = execById.get(p.project_id);
        if (!row) {
          return '—';
        }
        const label = formatPercent(locale, row.utilizationPct);
        return (
          <span className={row.atRisk ? 'font-semibold text-red-600' : 'text-gray-700'}>
            {label}
            {row.atRisk && (
              <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">
                {t('exec.atRisk')}
              </span>
            )}
          </span>
        );
      },
    },
  ];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-800">{t('exec.portfolioTitle')}</h1>
      <DataTable
        columns={columns}
        rows={projects}
        rowKey={(p) => p.project_id}
        isLoading={projectsQuery.isLoading}
      />
    </div>
  );
}

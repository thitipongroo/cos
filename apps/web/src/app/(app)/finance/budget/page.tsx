'use client';

import Link from 'next/link';
import { DataTable, type Column } from '../../../../components/ui/DataTable';
import { StatusChip } from '../../../../components/ui/StatusChip';
import { useI18n } from '../../../../i18n';
import { useProjects } from '../../../../lib/api/queries';
import type { ProjectRow } from '../../../../lib/api/types';

/** Budget is project-scoped (§14); this index lets Finance pick a project. */
export default function FinanceBudgetIndexPage() {
  const { t } = useI18n();
  const query = useProjects();

  const columns: Column<ProjectRow>[] = [
    { headerKey: 'table.code', cell: (p) => p.project_code },
    {
      headerKey: 'table.project',
      cell: (p) => (
        <Link href={`/finance/budget/${p.project_id}`} className="text-blue-600 hover:underline">
          {p.project_name}
        </Link>
      ),
    },
    { headerKey: 'table.status', cell: (p) => <StatusChip status={p.status} /> },
  ];

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-gray-800">{t('finance.budgetTitle')}</h1>
      <p className="mb-4 text-sm text-gray-400">{t('finance.selectProject')}</p>
      <DataTable
        columns={columns}
        rows={query.data?.items ?? []}
        rowKey={(p) => p.project_id}
        isLoading={query.isLoading}
      />
    </div>
  );
}

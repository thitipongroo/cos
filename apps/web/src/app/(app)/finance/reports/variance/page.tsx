'use client';

import { DataTable, type Column } from '../../../../../components/ui/DataTable';
import { useI18n } from '../../../../../i18n';
import { useVarianceReport } from '../../../../../lib/api/queries';
import type { VarianceRow } from '../../../../../lib/api/types';
import { formatMoney } from '../../../../../lib/format';

/** Budget variance across all projects (§20.7.4 → GET /finance/reports/variance). */
export default function VarianceReportPage() {
  const { t, locale } = useI18n();
  const query = useVarianceReport();

  const columns: Column<VarianceRow>[] = [
    { headerKey: 'table.project', cell: (v) => v.project_id },
    { headerKey: 'pm.allocated', cell: (v) => formatMoney(locale, v.allocated, null) },
    { headerKey: 'pm.committed', cell: (v) => formatMoney(locale, v.committed, null) },
    { headerKey: 'pm.actual', cell: (v) => formatMoney(locale, v.actual, null) },
    {
      headerKey: 'pm.variance',
      cell: (v) => (
        <span className={v.over_budget ? 'font-medium text-red-600' : 'text-green-700'}>
          {v.variance_percentage}% ·{' '}
          {v.over_budget ? t('finance.overBudget') : t('finance.onBudget')}
        </span>
      ),
    },
  ];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-800">{t('finance.varianceTitle')}</h1>
      <DataTable
        columns={columns}
        rows={query.data ?? []}
        rowKey={(v) => v.project_id}
        isLoading={query.isLoading}
      />
    </div>
  );
}

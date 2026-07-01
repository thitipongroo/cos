'use client';
import { use } from 'react';

import { ProjectTabs } from '../../../../../components/project/ProjectTabs';
import { useI18n } from '../../../../../i18n';
import { useFinanceSummary } from '../../../../../lib/api/queries';
import { formatMoney } from '../../../../../lib/format';

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="mt-1 text-xl font-bold text-gray-800">{value}</div>
    </div>
  );
}

/** PM read-only finance summary for a project (§20.7.2 → Phase 7 read). */
export default function ProjectFinancePage(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params);
  const { id } = params;
  const { t, locale } = useI18n();
  const summaryQuery = useFinanceSummary(id);
  const data = summaryQuery.data;

  return (
    <div>
      <ProjectTabs id={id} />
      <h1 className="mb-6 text-2xl font-bold text-gray-800">{t('pm.financeTitle')}</h1>

      {summaryQuery.isError && <p className="text-sm text-gray-400">{t('pm.noBudget')}</p>}

      {data && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Metric
            label={t('pm.fieldBudget')}
            value={formatMoney(
              locale,
              data.budget.total_budget_amount,
              data.budget.total_budget_currency,
            )}
          />
          <Metric
            label={t('pm.allocated')}
            value={formatMoney(
              locale,
              data.budget.allocated_amount,
              data.budget.total_budget_currency,
            )}
          />
          <Metric
            label={t('pm.committed')}
            value={formatMoney(
              locale,
              data.budget.committed_amount,
              data.budget.total_budget_currency,
            )}
          />
          <Metric
            label={t('pm.actual')}
            value={formatMoney(
              locale,
              data.budget.actual_amount,
              data.budget.total_budget_currency,
            )}
          />
          <Metric label={t('pm.variance')} value={`${data.variance_percentage}%`} />
        </div>
      )}
    </div>
  );
}

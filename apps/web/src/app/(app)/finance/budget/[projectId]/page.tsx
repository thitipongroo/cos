'use client';

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

/** Project budget detail (§20.7.4 → GET /finance/budget/:projectId). */
export default function FinanceBudgetDetailPage({ params }: { params: { projectId: string } }) {
  const { projectId } = params;
  const { t, locale } = useI18n();
  const summaryQuery = useFinanceSummary(projectId);
  const data = summaryQuery.data;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-800">{t('finance.budgetTitle')}</h1>

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

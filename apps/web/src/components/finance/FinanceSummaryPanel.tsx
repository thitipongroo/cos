'use client';

import { useI18n } from '../../i18n';
import { useFinanceSummary } from '../../lib/api/queries';
import { formatMoney } from '../../lib/format';

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="mt-1 text-xl font-bold text-gray-800">{value}</div>
    </div>
  );
}

/**
 * Budget metric grid for one project — the body shared by the two routes that show it:
 * /finance/budget/[projectId] (§20.7.4) and /projects/[id]/finance (§20.7.2).
 *
 * The two routes are deliberate and stay separate: they differ in chrome (the PM view carries
 * ProjectTabs) and in page title. What was duplicated was this render, 61 lines of it, against the
 * same useFinanceSummary query — so a change to how a budget is presented had to be made twice.
 * Extracted 2026-07-21 (ADR-069); note that neither route has a unit or e2e test, so this component
 * is currently covered by nothing but the type checker.
 */
export function FinanceSummaryPanel({ projectId }: { projectId: string }) {
  const { t, locale } = useI18n();
  const summaryQuery = useFinanceSummary(projectId);
  const data = summaryQuery.data;

  // isError and data are rendered independently, not as an if/else, because that is what both
  // pages did: react-query keeps the previous data while a refetch is failing, and in that state
  // the original markup showed the stale grid *and* the error line. An early return on isError
  // would have quietly changed that.
  return (
    <>
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
    </>
  );
}

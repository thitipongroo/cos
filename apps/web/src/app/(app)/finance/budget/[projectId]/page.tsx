'use client';
import { use } from 'react';

import { FinanceSummaryPanel } from '../../../../../components/finance/FinanceSummaryPanel';
import { useI18n } from '../../../../../i18n';
/** Project budget detail (§20.7.4 → GET /finance/budget/:projectId). */
export default function FinanceBudgetDetailPage(props: { params: Promise<{ projectId: string }> }) {
  const params = use(props.params);
  const { projectId } = params;
  const { t } = useI18n();

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-800">{t('finance.budgetTitle')}</h1>

      <FinanceSummaryPanel projectId={projectId} />
    </div>
  );
}

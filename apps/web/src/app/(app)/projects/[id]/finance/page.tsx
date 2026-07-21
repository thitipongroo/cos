'use client';
import { use } from 'react';

import { ProjectTabs } from '../../../../../components/project/ProjectTabs';
import { FinanceSummaryPanel } from '../../../../../components/finance/FinanceSummaryPanel';
import { useI18n } from '../../../../../i18n';
/** PM read-only finance summary for a project (§20.7.2 → Phase 7 read). */
export default function ProjectFinancePage(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params);
  const { id } = params;
  const { t } = useI18n();

  return (
    <div>
      <ProjectTabs id={id} />
      <h1 className="mb-6 text-2xl font-bold text-gray-800">{t('pm.financeTitle')}</h1>

      <FinanceSummaryPanel projectId={id} />
    </div>
  );
}
